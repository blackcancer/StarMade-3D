> Historical development evidence. The 1.0.0 acceptance, supported scope and current limitations are recorded in [the release validation report](v1-validation.md).

# Travaux restant nécessaires avant réception

Les lots ci-dessous ne sont pas déclarés terminés. Le contrôle strict doit rester à 100 % ; aucune exclusion de production ne doit être ajoutée pour fermer un lot.

## 1. Exécution réelle de l’intégration Decoder

Installer et construire le checkout fixé par `references.lock.json`, puis exécuter le typecheck complet, les round-trips binaires et l’installation propre avec `npm ci`. Les cas incluent les régions négatives/positives, le payload brut des blocs d’air, les réserves `extra`, les erreurs strictes et les données incomplètes. Vérifier la sérialisation de l’exemple visuel contre les modèles enrichis du SDK, y compris les enfants de blueprint : ne pas considérer une simple translation comme preuve d’une transformation complète des entités arrimées.

**Fermeture :** installation propre, SDK réel non modifié, contrat TypeScript complet et suites d’intégration sans échec ni test ignoré.

## 2. Fermeture de la couverture de production

Utiliser le rapport courant, pas un ancien pourcentage. Priorité aux fonctions non exécutées du chargeur OgreMax (chargements, finalisation et erreurs), aux conversions de textures/texture-array et sources lumineuses, puis aux chemins de géométrie, culling et voisinage. Les helpers privés non utilisés doivent être analysés : vérifier qu’ils ne correspondent pas à une fonctionnalité oubliée avant toute suppression. Tester les comportements, erreurs et invariants ; ne pas appeler des branches uniquement pour incrémenter un compteur.

Conserver la séparation entre test unitaire et vraie exécution GPU. Les tests de contexte simulé peuvent valider la gestion des ressources, jamais la correction d’un pilote GLSL ou le résultat visuel. Après toute modification de la collecte, vérifier les compteurs sur deux exécutions identiques. Ne pas revenir à une collecte V8 réinitialisée après chaque fichier.

**Fermeture :** chaque module du runtime à 100 % lignes, branches et fonctions ; inventaire complet ; commande `coverage:check` sortant avec le code 0.

## 3. Réconciliation des pipelines avec StarMade-Open

Traiter `includeLod`, la composition des ombres solaires et ponctuelles, les transformations animées des enfants, les LOD/textures manquants, puis les constantes et espaces d’éclairage. Établir une matrice des orientations et formes, états d’activation, textures par face, transparence, normal/emission maps, resource overlays, transitions LOD, instancing, ombres et animation. Chaque comportement doit être associé à un chemin Java/GLSL au commit fixé, à son implémentation et à une assertion observable.

**Fermeture :** absence d’options silencieusement ignorées, absence de fallback de rendu présenté comme fidèle, tests de chaque chemin pris en charge et compilation GPU réelle des variantes utilisées.

## 4. Réception visuelle

Acquérir des références en jeu avec une scène et des conditions verrouillées. Comparer séparément géométrie/silhouettes, UV/orientations, rendu non éclairé, normales, éclairage, transparence, ombres, LOD et animations. Conserver les assets utilisés ou leurs empreintes, les matrices de caméra et d’entités, le temps d’animation et les paramètres d’affichage. Les tolérances d’une comparaison de pixels ne doivent pas être choisies après observation de l’erreur ; distinguer les écarts de pipeline des variations de rasterisation/antialiasing.

**Fermeture :** preuves GPU et comparaisons approuvées pour cette version du code, sans réutilisation des captures historiques comme nouvelle preuve. Le taux de couverture JavaScript ne ferme pas ce lot.
