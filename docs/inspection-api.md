# Inspection et interaction : API et intégration

Contrats stabilisés en version 1.0.0, le 23 septembre 2026. Les exports ci-dessous sont disponibles depuis
`starmade-3d`. La [feuille de route](inspection-roadmap.md) explique le périmètre.
La [recette](v1-validation.md) distingue tests logiques,
couverture et rendu réel.

## Responsabilités

Le Decoder lit et écrit les formats. L’hôte fournit les données décodées, les
identités persistantes, les définitions de blocs et les ressources. Il conserve
sa scène, sa caméra, sa boucle de rendu, son stockage, ses commandes et son
historique. Les nouveaux modules ne modifient pas les fichiers du jeu et ne
créent pas de dépendance runtime au Decoder.

La page `/inspection.html` est une application de recette facultative. Elle
emploie les géométries natives et les vrais modèles LOD. Isanth utilise les
atlas, normal maps et shaders natifs, avec éclairage des blocs recalculé après
filtrage. La petite création de démonstration emploie des matériaux neutres.
`/isanth.html` reste la scène de fidélité des
matériaux, ombres et lumières StarMade.

## Modèle logique et références

```ts
import {
  InspectionDocument, blocksFromSegments, describeInspectionBlock,
  blockReferenceKey
} from 'starmade-3d';

const document = new InspectionDocument('blueprint-persisted-id', 0, [
  { id: 'entity-persisted-id', blocks: blocksFromSegments(decodedSegments) }
]);
const ref = { entityId: 'entity-persisted-id', position: [0, 0, 0] as const };
const block = describeInspectionBlock(document, ref, blockDefinitions);
const damaged = document.query(block => block.state.hp < 128);
const selectionKey = blockReferenceKey(ref);
```

`InspectionDocument` copie et gèle ses entrées. `entity`, `resolve` et `query`
sont utilisables sans renderer, DOM ou installation StarMade. Les coordonnées
sont des entiers locaux à l’entité. Une référence désigne une **cellule**, pas
l’identité historique de la matière qu’elle contient : remplacement et
suppression changent le résultat de `resolve`.

Les champs bruts `type`, `hp`, `orientation`, `active` et `extra` sont conservés.
`active` ne signifie pas uniformément « système activé » pour tous les blocs.
Les types inconnus restent dans le modèle ; leur définition peut être absente.
Les doublons de cellules/entités, coordonnées invalides, cycles et parents
absents sont rejetés. Les états d’air ne font pas partie de l’occupation.

Les adaptateurs `blocksFromSegments` et `segmentsFromBlocks` respectent la
convention native : centre local = origine du segment + indice local − 16,
segment de 32³ cellules. Ils fonctionnent aux frontières et en coordonnées
négatives. `blockCount` n’est pas utilisé pour ignorer des données présentes.
Les identités ne viennent jamais d’un UUID Three.js ou du nom affiché.

## Transformations

Chaque entité peut définir `parentId` et `transform`, une matrice affine 4×4 en
ordre colonne, locale vers parent ; l’identité est utilisée par défaut.
Translations, rotations, échelles et pivots composés en matrice sont supportés.

- `entityWorldMatrix(document, id)` compose tous les ancêtres.
- `convertInspectionPoint(document, point, from, to)` convertit un point sans
  l’arrondir ; `null` désigne l’espace scène. Une inversion singulière est rejetée.
- `inspectionBounds` calcule l’enveloppe des **cellules occupées**, transformées.
- `measureBlockCentres` mesure les centres en espace scène, entre entités incluses.
- `frameInspectionBounds` cadre une caméra perspective ou orthographique et
  retourne la cible à transmettre aux contrôles de l’hôte.

Occupation, enveloppe visuelle exacte des modèles et collision sont distinctes.
Les helpers de mesure et de surbrillance ci-dessus ne prétendent pas calculer
les collisions du jeu.

## Sélection et correspondance avec Three.js

`InspectionHitIndex` associe temporairement des objets à un snapshot logique :

- `bindTriangles(mesh, document, table)` pour les géométries regroupées ;
- `bindInstances(mesh, document, refs)` pour un `InstancedMesh` ;
- `bindBlock(root, document, ref)` pour un modèle LOD ou groupe de meshes ;
- `bind` pour un adaptateur personnalisé ; `unbind` lors du retrait.

`resolve(document, intersection)` retourne l’état brut, la référence, le point
copié en espace scène, la révision et la face connue. La recherche remonte les
parents pour les modèles composés. Les LOD n’obtiennent pas de fausse face cubique :
`face` vaut `null`. Les bindings d’un autre snapshot sont rejetés, même si son
numéro de révision est identique. Une reconstruction doit renouveler les tables.

`InspectionSelection` gère une sélection multiple de cellules ; `reconcile`
retire les cellules supprimées. `createInspectionHighlight` dessine leurs
contours de cellule sans modifier les matériaux partagés. L’hôte choisit si les
cellules masquées restent sélectionnées et si leur contour doit être affiché.

## Synchronisation et invalidation

```ts
const next = document.apply(document.revision, [
  { kind: 'block', ref, state: { ...document.resolve(ref)!.state, hp: 100 } }
]);
const invalidation = view.sync(next); // view est une InspectionScene
if (invalidation.lighting) {
  // L’hôte recalcule/réapplique son éclairage sur toute la scène concernée.
}
```

`apply` produit un nouveau snapshot et vérifie la révision attendue. Une liste
peut modifier/supprimer des blocs, remplacer/ajouter une entité (`kind: 'entity'`)
ou la supprimer (`kind: 'remove'`). Remplacer les segments d’une entité consiste
à fournir ses nouveaux blocs via l’adaptateur de segments. Le modèle reste
indépendant du format de sauvegarde et n’implémente pas l’historique de l’éditeur.

`InspectionScene` est un synchroniseur facultatif **par cellule**. Sa factory
synchrone reçoit le document, le bloc et toutes les cellules visibles. Elle
retourne un objet centré sur la cellule et une fonction `dispose` libérant ses
seules ressources propres. Précharger les ressources asynchrones avant `sync`.

Les modifications reconstruisent les cellules concernées et leurs 26 voisines.
Les changements de transformation mettent à jour les matrices sans reconstruire
la géométrie. Un changement de filtre reconstruit l’occupation visible. Les
constructions sont préparées avant remplacement ; un échec de factory conserve
la scène précédente et libère les résultats déjà préparés. La factory ne doit
pas muter les anciens objets ni la map d’occupation reçue.

Le résultat liste `geometry`, `transforms`, `lighting` et `bounds`. L’éclairage
est invalidé conservativement à l’échelle de la scène : sa propagation ne se
limite pas au voisinage géométrique. **Le recalcul d’éclairage reste un travail
explicite du consommateur**, avec les helpers natifs existants ou son propre
moteur. Ce synchroniseur n’intercepte pas les matériaux ou callbacks de l’hôte.

Un consommateur par segments peut utiliser `compareInspectionDocuments` et
`buildInspectionSegments` pour son propre ordonnancement des lots. La page de
recette reconstruit les segments visibles ; elle n’est pas un benchmark du
synchroniseur par cellule.

## Coupes natives et géométries regroupées

`inspectionPredicate({ entities, cells, min, max })` compose isolation et plages
inclusives de centres locaux. Avec les trois axes de `min`/`max`, on obtient des
coupes XYZ et des couches. Ces filtres n’altèrent jamais les données du blueprint.

`buildInspectionSegments(document, entityId, predicate, options)` retire les
cellules masquées **avant** le calcul de visibilité, puis utilise le générateur
natif de cubes, dalles et pentes. Les faces cachées devenues visibles sont donc
réellement recréées, y compris entre deux segments. Le résultat contient les
passes opaques/translucides et leurs origines.

`inspectionSegmentTriangles(geometry, entityId, origin)` construit la table de
sélection depuis les indices de blocs encodés, pas depuis les centroïdes. Le
consommateur applique la matrice d’entité au parent du mesh. Les coordonnées de
segment sont déjà incluses dans la géométrie. Les modèles LOD se chargent avec
les fonctions natives existantes et se lient par `bindBlock`. L’option native
`isBlockMeshed` permet d’éviter de dessiner un cube lorsque son modèle est chargé.

## Ressources, annulation et diagnostics

`InspectionResourceManager<T>` reçoit `load(key, signal, progress)`,
`destroy(value)` et un callback facultatif de diagnostic. `acquire` retourne
`{ value: Promise<T>, release() }`. Chaque consommateur conserve son handle :

- les acquisitions simultanées d’une clé partagent un chargement ;
- une annulation/libération ne coupe pas les autres consommateurs ;
- la dernière libération annule le chargement ou détruit la ressource prête ;
- un résultat tardif d’un chargeur qui ignore l’annulation est détruit ;
- une erreur est diagnostiquée et une acquisition suivante peut réessayer ;
- `dispose` ferme le gestionnaire et libère les acquisitions restantes.

Les callbacks de notification doivent rester synchrones et ne pas lever
d’exception. Le cache ne conserve pas les ressources sans propriétaire. Une
scène qui partage des textures libère ses handles plutôt que ces textures.
Le chargeur natif Ogre ne fournit pas d’interruption réseau complète : dans la
recette, une réponse devenue obsolète est ignorée et ses prototypes sont libérés.

## Analyses, comparaison et extensions

`inspectDocument` donne l’inventaire par type, les comptes d’activation **brute**,
le nombre de cellules, les limites et les diagnostics de types inconnus.
`describeInspectionBlock` ajoute l’entité et la définition lorsqu’elle est connue.

`compareInspectionDocuments` compare les états logiques de cellules et distingue
les entités ajoutées, supprimées ou transformées. Le déplacement d’une entité
ne produit pas une modification de tous ses blocs. L’absence de `extra` équivaut
à zéro. L’appariement utilise uniquement les identités fournies : **il ne devine
pas la correspondance de deux listes d’entités indépendantes**. L’importateur
doit établir cet appariement ou signaler son ambiguïté avant comparaison. Les
identités `isanth/0`, etc. de la recette sont locales à cet import de démonstration.

`inspectRelations` valide les extrémités des relations fournies ;
`createInspectionRelationOverlay` les affiche entre entités transformées.
`inspectFunctionalSystems` exige une version du jeu et une source pour le
fournisseur de règles. Aucun système fonctionnel n’est inventé à partir de la
proximité et aucune simulation énergétique/physique n’est incluse.

`InspectionAnnotation` contient identité, document, révision, référence et texte.
`resolveInspectionAnnotation` distingue résultat résolu, absent, obsolète ou
étranger. Persistance et édition des annotations appartiennent à l’application.
`sampleInspectionTimeline` échantillonne des états/keyframes par pas, avec temps
explicite et boucle optionnelle, sans horloge globale ni simulation.
`inspectionAssetCatalog` expose les définitions, textures, modèles et émetteurs.

## Aperçus et exports

`captureInspectionPreview` rend le viewport de l’hôte puis retourne un PNG et
restaure sa cible de rendu. Le navigateur doit autoriser la lecture du canvas.
`exportInspectionGltf(root, { binary })` produit un glTF ou GLB du snapshot visuel.
Les attributs entiers privés des shaders natifs sont retirés de la copie, car
ils ne constituent pas des attributs glTF portables. La géométrie de l’hôte reste
intacte. Les attributs portables, matrices et matériaux standards sont conservés.

Les `ShaderMaterial` sont refusés par défaut. `nativeShaders: 'approximate'`
autorise explicitement un matériau neutre, avec diagnostic pour chaque perte.
Les animations sont exportées dans leur pose courante, avec diagnostic si des
pistes étaient présentes. La vue de recette affiche explicitement « GLB simplifié » pour cette approximation.
Ces exports ne remplacent pas les fichiers StarMade et ne promettent pas de
reproduire les shaders, éclairages précalculés ou règles du jeu.

## Rejouer la qualification

```sh
npm run validate:code
STARMADE_DIR=/srv/StarMade npm run test:game
STARMADE_DIR=/srv/StarMade CHROMIUM_PATH=/path/to/chromium npm run test:render
STARMADE_DIR=/srv/StarMade CHROMIUM_PATH=/path/to/chromium node scripts/inspection-check.mjs
```

Node >= 22.16 est requis. Le dernier script démarre et arrête son propre Vite et
Chromium, exécute de vrais clics, charge Isanth, exporte et capture les résultats.
`STARMADE_INSPECTION_OUTPUT` choisit son dossier de preuves. La couverture impose
100 % lignes, branches et fonctions par module de production, sans ajouter
d’exclusion. Les shaders GLSL et les exemples ont une recette distincte.

## Cartographie et sous-dockings

Les helpers `functionalBlockFromElementInfo`, `functionalControllersFromBlueprint`,
`buildFunctionalMap`, `inspectionBlueprintEntities`, `inspectEntityHierarchy` et
`inspectionSubtree` ajoutent la lecture des connexions sauvegardées et des arbres
d’entités attachées. Voir [functional-map.md](functional-map.md) pour les sources,
les repères et la distinction entre offset d’attachement et pose physique du rail.
La page d’inspection permet de filtrer les systèmes, leurs membres et les
sous-arbres d’arrimage tout en conservant une vue texturée séparée.

Les matériaux natifs nécessitent désormais le [chargement préalable des shaders externes](assets.md). Le corpus StarMade ne fait pas partie du paquet.
