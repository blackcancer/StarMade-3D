> Historical development evidence. The 1.0.0 acceptance, supported scope and current limitations are recorded in [the release validation report](v1-validation.md).

> Historical document retained from the input archive. Current measured acceptance and limitations are in [the rendering correction report](render-parity-2026-09-20.md).

# Reprise StarMade-3D — validation du 20 septembre 2026

## Conclusion

**Cette livraison est intermédiaire : les deux critères de réception ne sont pas atteints.** La couverture doit atteindre 100 % des lignes et branches, et le rendu doit correspondre à celui du jeu. Le contrôle à 100 % est effectif, mais reste en échec ; aucune comparaison visuelle au jeu n’a été produite ici.

## Résultats exécutés

| Vérification | Résultat |
|---|---|
| Tests unitaires autonomes | **497 / 497**, dans 20 fichiers ; aucun test ignoré. |
| Tests des outils de validation | **9 / 9** ; aucun test ignoré. |
| Compilation de la bibliothèque | Réussie. |
| TypeScript des sources et tests autonomes | Réussi. |
| Couverture V8 des 33 modules produits | **91.47 % lignes / 90.03 % branches / 94.15 % fonctions**. |
| Seuil exact à 100 % par fichier | **ÉCHEC**, code de sortie 1. |
| Module de génération SMD3 | **100 % lignes, branches et fonctions**. |
| Intégration locale avec le vrai Decoder | Bloquée : checkout SDK voisin absent. Le contrôle refuse de substituer une doublure. |
| TypeScript complet incluant l’intégration | Échec lié à l’absence du package SDK et de ses déclarations ; voir le journal. |
| Tests avec installation StarMade | Non exécutés : installation et assets réels absents. |
| Nouveau workflow GitHub Actions StarMade-3D | Ajouté dans l’archive, non exécuté à distance. |
| Comparaison de rendu GPU / jeu | Non exécutée. |

Compteurs exacts : **9364 / 10237 lignes**, **2376 / 2639 branches**, **595 / 632 fonctions**. Mesure effectuée avec Node 22.16.0. Voir `coverage/native-summary.json`, `coverage/verdict.json`, `coverage/lcov.info` et les journaux de `validation/logs/`.

### Méthode et rectification des mesures intermédiaires

Les premières mesures remappaient les compteurs vers TypeScript et collectaient V8 après chaque fichier. La vérification répétée a montré des lignes de types non exécutables comptées comme manquantes et une fusion instable des instantanés remis à zéro. Elles sont remplacées par le relevé final ci-dessus : JavaScript produit, inventaire exhaustif des sources, **un unique instantané après les 20 fichiers**, arrêt de la collecte ensuite. Deux exécutions consécutives ont donné les mêmes compteurs avant le dernier ajout de commentaire de documentation ; ce commentaire ne modifie pas les branches ou fonctions.

Cette correction ne masque pas les manques : les 33 modules, dont le chargeur OgreMax maintenu dans `src/vendor/`, restent obligatoires. Les fichiers de tests, exemples, outils, dépendances tierces et déclarations `.d.ts` sont exclus du pourcentage de **production**, pas présentés comme couverts. L’outillage possède ses tests séparés. Les fonctions sont aussi exigées à 100 %, afin qu’un taux de lignes flatteur ne valide pas des fonctions jamais appelées.

## Modifications fonctionnelles

### Frontière Decoder 2.0 et SMD3

Les structures conservent `extra` (six bits), `hp`, les cinq bits d’orientation et le bit d’activation **brut**. Les valeurs d’air explicitement fournies ne sont plus normalisées en perdant leurs champs. Une écriture locale hors segment est rejetée avant mutation ; elle ne peut plus aliaser un autre index. Les dimensions du tableau, emplacements absents, bornes int32, alignements et timestamps signés 64 bits sont vérifiés. Le compteur de blocs non aériens reste cohérent lors des remplacements.

La création d’une région unique rejette les mélanges de régions. Le nouveau helper `createStarMadeSmd3RegionsFromBlocks` regroupe une grande entité en fichiers indépendants, avec un timestamp partagé. Les limites autour de -256 et +256 sont testées sur les trois axes. Les segments de type air seuls, mais portant un payload brut non nul, sont conservés même sans `includeEmptySegments`.

Les tests autonomes parcourent notamment les **32 768 positions locales** et les combinaisons de champs bruts. Les tests binaires réels ont été conservés et étendus dans `tests/integration/decoderRoundtrip.decoder.test.ts`, mais n’ont pas pu être exécutés localement.

### Ombres et état du renderer

Le binding directionnel accepte plusieurs groupes d’émetteurs au lieu de conserver seulement le dernier. Les racines dupliquées sont dédupliquées. Les transformations mondiales des racines, y compris celles de leurs parents, sont reprises pour les passes d’ombres. Les états du renderer (cible, couleur/alpha de fond, auto-clear, XR) sont restaurés après erreur par des blocs `finally`, pour les pipelines directionnel et ponctuel.

Une mise à jour des paramètres d’ombres avec des maps 2D désactive correctement l’ancien mode texture-array. Des changements partiels de biais ou d’intensité ne réinitialisent pas ce mode sans demande explicite.

### Précontrôle GLSL

Le compilateur de validation n’injecte plus une seconde déclaration pour un attribut ou uniforme déjà déclaré. Il ne prend plus un identifiant plus long pour un attribut Three.js. Les ressources shader/programme sont libérées lorsque l’allocation du programme échoue ou qu’un wrapper de contexte lève une exception pendant compilation ou liaison. Les tests vérifient le cycle de vie avec une **doublure de contexte**, pas un pilote GPU.

### Tests et environnement

Les tests dépendant des fichiers du jeu ont été déplacés dans une suite explicite, sans `skip` opportuniste. L’absence du vrai Decoder ou de `STARMADE_DIR` échoue clairement. Des régressions ont été ajoutées pour les LOD, le parsing OgreMax, les ombres, les scènes de prévisualisation et les données de segments. La configuration des assets et de régénération des shaders ne suppose plus le chemin privé `/srv/StarMade`.

## Références réellement vérifiées

Le manifeste du Decoder **2.0.0**, commit `4cb21bd72258c87eb8115f90449a8334c34658a6`, a été lu via GitHub, ainsi que les contrats `BlockState`, `Smd3Parser`, `Smd3Writer` et les exports. Le writer v7 impose le LZ4 little-endian, les régions homogènes et la conservation des valeurs brutes d’air. StarMade-Open est fixé au commit `decf3a1990f29b9505041f122188bf19489bcf7e`, dépôt **blackcancer/StarMade-Open**. Le layout de `SegmentData4Byte.java` et `cube/quads13/cubeEncoding.glsl` ont été consultés ; leurs empreintes Git sont verrouillées.

Le run CI amont du Decoder `35503442853` est réussi. Son artefact Node 22 (`10602903175`) a été récupéré ; son SHA-256 et le commit dans `validation/commit.txt` correspondent à `references.lock.json`. **Ces rapports prouvent la validation du Decoder en amont, pas l’intégration locale de StarMade-3D.** Ils ne contiennent pas un SDK installable avec ses dépendances, ni les captures de référence du jeu.

`package-lock.json` a été actualisé avec les métadonnées exactes du package SDK 2.0.0. Le workflow construit ce checkout avant l’installation du projet ; cette installation et ce nouveau workflow restent à exécuter dans un environnement disposant du réseau. Aucun push n’a été effectué : la livraison est l’archive modifiée.

## Écarts empêchant une déclaration de parité visuelle

Le chargement asynchrone OgreMax, certains chemins de textures et d’éclairage et plusieurs branches géométriques restent sous les seuils. Les options existantes `includeLod` des passes d’ombres ne sont pas encore appliquées ; le helper unifié applique les uniforms directionnels, sans combinaison démontrée avec les ombres ponctuelles. Les animations internes des enfants des objets clonés nécessitent encore une validation dédiée, au-delà des transformations des racines corrigées ici. Le chargement LOD peut conserver un prototype après timeout de texture : cela ne doit pas être considéré comme une réception visuelle réussie.

Les constantes d’éclairage portant des ajustements d’intensité dans le code restent à comparer aux sources Java/GLSL et au jeu. La prévisualisation simplifiée n’est pas un oracle de fidélité. Il manque un jeu de références acquis en jeu avec assets, caméra, exposition, gamma, filtrage, qualité d’ombres, animation et environnement fixés. Un simple canvas non noir ou un shader lié avec succès n’est pas un test d’égalité du rendu.

Les preuves de fermeture et priorités figurent dans `next-validation-work.md`. Les anciens fichiers du dossier `artifacts/` sont conservés comme historique explicitement étiqueté, sans les réutiliser comme résultats actuels.
