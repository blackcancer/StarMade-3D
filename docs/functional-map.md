# Cartographie fonctionnelle et arrimages

La page `/inspection.html` propose deux vues complémentaires après « Charger Isanth ».

- **Cartographie fonctionnelle** : couleurs et décompte des familles de systèmes, filtre par famille, sélection d’un contrôleur et de ses membres, lignes des connexions enregistrées, isolation des modules sans liaison compatible.
- **Entités et sous-dockings** : arborescence récursive, nombre de blocs propres et avec descendants, parent, mode d’arrimage, coordonnées locales des connecteurs parent/enfant. Cliquer sur une entité l’isole ; « Inclure les sous-dockings » choisit le périmètre. « Tout afficher » rétablit la vue texturée.

La démonstration synthétique contient une coque, une tourelle et un capteur enfant de la tourelle. Elle permet de vérifier les sous-dockings même si le blueprint Isanth installé ne comporte qu’un seul enfant direct.

## Données et conventions

`inspectionBlueprintEntities` adapte structurellement l’arbre du Decoder sans dépendance runtime à son SDK. Il conserve les parents vides, génère des identités de chemin propres au snapshot et transmet les contrôleurs de chaque entité. `inspectEntityHierarchy` fournit profondeur, enfants directs et comptes ; `inspectionSubtree` sélectionne tous les descendants, sans limite de profondeur codée en dur.

Les métadonnées `.meta` fournissent le mode `rail`/`docking`, les connecteurs et la requête de rail brute lorsqu’elle existe. Une absence de métadonnées reste `unknown`/`null`. La hiérarchie provient des dossiers ATTACHED : elle n’est pas déduite de la proximité des géométries. Les coordonnées des connecteurs et de `.logic` utilisent le repère de stockage natif ; leur conversion en centres de blocs retire 16 sur chaque axe.

`inspectionDocumentFromBlueprint` reconstitue les poses statiques enregistrées des rails NORMAL24 et des connecteurs cœur, via `resolveStarMadeRailPose`. Les transformations locales sont composées dans la hiérarchie. Les matrices nommées Matrix4f sont vérifiées avant leur conversion.

Les poses absentes ou non prises en charge utilisent les offsets locaux et produisent un diagnostic `attachment-offset-fallback`. Aucun mouvement ni collision n’est simulé. Les requêtes natives restent disponibles dans `rawRailRequest`. Les identités de chemin ne garantissent pas la correspondance entre deux réimportations réordonnées.

## Règles fonctionnelles

`functionalBlockFromElementInfo` utilise les identifiants `typeName` de BlockConfig et les champs explicites `computer`, `reactorChamber`, `signal`, `lightSource`, `systemBlock` et `controlling`. Les libellés traduits n’interviennent pas dans la classification. Une famille « Autres systèmes » garde les systèmes non couverts par la table native ; les types inconnus sont diagnostiqués.

`functionalControllersFromBlueprint` convertit les coordonnées. `buildFunctionalMap` conserve uniquement les liaisons réellement enregistrées, après contrôle de présence et de type des cibles. Il signale les sources/cibles absentes, les types incohérents et les doublons. Un module demandant un ordinateur reste « sans liaison compatible » tant qu’aucune connexion sauvegardée ne le relie à un contrôleur du type attendu. Ce statut n’est pas une simulation du comportement du jeu.

Aucun regroupement spatial ne fabrique une liaison. Une connexion historique présente dans le blueprint peut donc être affichée même si elle ne correspond pas aux capacités actuelles du BlockConfig. Les volumes énergétiques, DPS, rebonds de logique et états opérationnels ne sont pas calculés.

## Références locales

- StarMade-Open `decf3a1990f29b9505041f122188bf19489bcf7e`, identifiants ElementKeyMap, contrôleurs et rails.
- StarMade-Decoder `4cb21bd72258c87eb8115f90449a8334c34658a6`, `BlueprintFolderParser`, `SmbpmParser` et logique du blueprint.
- Installation `/srv/StarMade/data/config/BlockConfig.xml` et `BlockTypes.properties` pour les données effectives.

Voir [les contrats généraux](inspection-api.md) et [le rapport de qualification](v1-validation.md).
