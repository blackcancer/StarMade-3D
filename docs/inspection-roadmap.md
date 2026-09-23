# Feuille de route — inspection et interaction StarMade

Consolidation du document fourni par l’utilisateur le 22 septembre 2026.
Statut initial : orientation pour les prochains développements.

Mise en œuvre du 22 septembre 2026 : les API, leurs contrats et les limites
effectives sont décrits dans [inspection-api.md](inspection-api.md), avec une
[recette dédiée](v1-validation.md). Le tableau ci-dessous
conserve les objectifs ; il ne remplace pas cette qualification détaillée.

## Positionnement et responsabilités

Comprendre, comparer et manipuler une création StarMade. Le futur éditeur sera
un consommateur de la bibliothèque. La reproduction du moteur, de la physique,
du réseau et des règles complètes du jeu ne fait pas partie de ce cœur.

| Composant | Responsabilité |
|---|---|
| StarMade-Decoder | Lecture/écriture des formats et préservation des champs inconnus et données non modifiées. |
| StarMade-3D | Représentation, références de blocs, interrogation spatiale, inspection, états visuels et synchronisation du rendu. |
| Application / futur éditeur | Interface, outils de construction, commandes, transactions utilisateur, historique annuler/rétablir, stockage et sauvegarde. |

L’application reste propriétaire de sa scène, caméra, contrôles et boucle de
rendu. Les helpers restent facultatifs. Les données décodées et les fournisseurs
d’assets constituent les entrées : aucun serveur ni chemin d’installation imposé.
Ne pas introduire de dépendance runtime obligatoire au Decoder.

Le texte fourni évoque d’abord des transactions dans une extension d’édition,
puis place explicitement les commandes et l’historique dans l’éditeur. Cette
consolidation retient cette dernière frontière : StarMade-3D peut prévisualiser
et appliquer des changements fournis par l’hôte sans gérer son historique.

## État initial du socle, avant l’implémentation

- `src/geometry/segment.ts` expose `SegmentBlockContext`, `SegmentFaceContext`,
  `isBlockMeshed` et `isFaceVisible`. La génération élimine des faces internes.
- `src/starmade/segmentData.ts` fournit les coordonnées et états bruts des blocs,
  dont les bits réservés `extra` ; les origines de segment sont en coordonnées de blocs.
- `src/starmade/blockLightScene.ts` représente actuellement les entités par leurs
  segments et un décalage de translation. Cela ne constitue pas un contrat de
  transformation hiérarchique complet.
- Les LOD, matériaux de sélection et helpers SMD3 sont disponibles ; ils ne
  constituent pas encore une API commune d’identification et d’inspection.

## Ordre de réalisation retenu

| Étape | Résultat attendu | Critère principal |
|---|---|---|
| 1. Références stables et interrogation | Modèle logique indépendant des meshes ; recherche par type, état et coordonnées ; traduction d’une intersection en bloc et face. | Identité conservée après reconstruction, y compris pour les LOD et le regroupement des meshes. |
| 2. Transformations communes | Hiérarchie d’entités, pivots, rotations et transformations locales ; conversions bloc/segment/entité/scène. | Conversions aller-retour et sélection correctes pour des enfants transformés. |
| 3. Synchronisation incrémentale | Changements de blocs, remplacement de segments et transformations transmis par l’hôte. | Invalidation explicite de la géométrie, du voisinage, de la sélection, des limites et de l’éclairage. |
| 4. Inspection et ressources | Sélection multiple, surbrillance, isolation, coupes XYZ, couches, vues orthographiques, recentrage ; chargements partagés et annulables. | Les faces révélées sont régénérées ; retrait d’une entité sans destruction des ressources encore partagées. |
| 5. Comparaison et analyses descriptives | Différences logiques entre blueprints, inventaires, dimensions, mesures, occupation et relations disponibles. | Résultats utilisables sans contexte graphique ; déplacement d’une entité distingué de sa modification interne. |
| 6. Extensions | Cartographie fonctionnelle, annotations versionnées, états/animations déterministes, catalogue d’assets, aperçus et exports. | Contrats et limites documentés ; règles fonctionnelles vérifiées et rattachées à une version du jeu. |

Cet ordre reprend la conclusion du document : préparer les fondations de
l’inspection avant la comparaison et les extensions d’édition. Les premiers
usages visés restent l’identification des blocs, les coupes/isolation et la
comparaison des créations.

La gestion des ressources et les diagnostics doivent être prévus dans les
contrats dès la première étape, même si le gestionnaire commun arrive ensuite.
Chaque incrément doit préparer ses consommateurs avant de figer son API.

## Premier périmètre concret

Définir une référence de cellule composée d’une identité d’entité stable et de
coordonnées locales entières. Ne pas employer le nom affiché, l’UUID Three.js ou
le numéro de triangle comme identité persistante. Une reconstruction conserve
la référence ; une suppression ou un remplacement change ce qu’elle résout.
La révision du document permet de détecter les résultats devenus obsolètes.

Prévoir une interrogation retournant l’entité, la référence, le type, la
définition lorsqu’elle existe, l’orientation et l’état brut. L’adaptateur Three.js
ajoute le point d’intersection, son espace et la face lorsqu’elle est identifiable.
Un triangle de LOD ne doit pas recevoir arbitrairement un numéro de face cubique.
Les tables temporaires intersection → référence sont reconstruites avec le mesh.

La première recette doit couvrir : deux entités aux mêmes coordonnées locales,
segments négatifs et frontières de segments, blocs inconnus, états bruts préservés,
géométries opaques/translucides/LOD, reconstruction et résultats d’intersection
obsolètes. La recherche logique doit fonctionner sans renderer WebGL.

## Invariants transversaux

- Une coupe ou une isolation ne modifie pas les données du blueprint. Un plan
  de clipping seul ne restitue pas les faces éliminées par le maillage.
- L’invalidation de l’éclairage peut dépasser le segment et ses voisins immédiats.
- Distinguer occupation d’une cellule, forme visuelle et forme de collision.
- Les relations de systèmes viennent des données disponibles ; la proximité
  géométrique ne prouve pas l’appartenance à un contrôleur.
- Diagnostics structurés pour assets absents, blocs inconnus, possibilités non
  prises en charge et représentations de remplacement.
- Chargement avec progression, annulation et règles explicites de propriété,
  partage du cache et libération des ressources CPU/GPU.
- Les annotations s’ancrent à une référence et une version du blueprint.
- Comparaison sur les données logiques, indépendante des triangles et du
  découpage physique des fichiers ; appariement ambigu d’entités signalé.
- Exports glTF/GLB qualifiés avec rapport de conservation/dégradation ; aucune
  promesse implicite de conservation des shaders StarMade.

## Exigences de livraison

Préserver les API existantes et prévoir une migration explicite si nécessaire.
Maintenir 100 % lignes et branches par module de production, avec rapport et
seuil bloquant, ainsi que le seuil de fonctions existant. Aucun changement
d’exclusion ou d’oracle destiné à masquer une dette.

La couverture JavaScript ne démontre pas la justesse du rendu. Chaque fonction
d’interaction ou d’inspection exige des assertions observables et une recette
visuelle adaptée, avec caméra et état reproductibles. Maintenir les régressions
de rendu issues des captures utilisateur ; les écarts volontaires au natif
restent documentés dans les rapports de correction.

L’ancienne [feuille de fidélité du pipeline](https://github.com/blackcancer/StarMade-3D/blob/main/docs/pipeline-fidelity-roadmap.md) reste
une référence historique de rendu. La présente feuille organise l’évolution
fonctionnelle, sans déclarer closes les limites de fidélité restantes.
