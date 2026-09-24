# Changelog

## 1.1.0 — 2026-09-24

- Add persistent per-SMD3 blueprint LOD sidecars, levels 1/2/4, greedy face merging, averaged local colors and simplified self-emission.
- Add a separate Node cache API with source/dependency hashes, incremental reuse, atomic manifests, cancellation and collision protection.
- Preserve attachment hierarchy/poses in cached previews; show the cache before Isanth streaming and provide a dedicated texture-free LOD example.
- Document companion folder naming, invalidation, generation commands and approximation limits; add CPU, cache and browser regressions.

- Prepare Isanth preview/final shaders asynchronously and initialize texture uploads across frames, with separate loading diagnostics and reproducible opt-out comparisons.

- Integrate Decoder 2.1.0 demand-driven blueprint streams with sparse segment conversion and preserved inspection metadata.
- Add bounded binary framing, cancellation and strict completion handling for browser transport.
- Load Isanth progressively, repair arriving segment boundaries, and retain the existing final lighting/LOD/Display passes.
- Test real blueprint parity and qualify progressive loading in the Isanth browser recipe.

## 1.0.2 — 2026-09-23

- Update the pinned development/integration reference and CI checkout to StarMade-Decoder 2.0.1 (`ed9d3bec`).
- Align Display with StarMade-Open e5a3b49d: cascading segments, nine explicit font sizes, bounded offsets, text rotation, 500-unit default text distance, five backgrounds and external native scanline animation.
- Update the complete variable catalog to 56 entries, including corrected reactorMaxHp and new reactor/shield/navigation variables.
- Add entity-scoped custom variable snapshots; consume client-side set/unset tags without mutating gameplay state.
- Pin and check the updated native rendering sources; support their dynamic cube-texture directives and retain documented material sheet-slot limits.
- Extend unit, source-contract and GPU regression coverage for the updated Display pipeline.

## 1.0.1 — 2026-09-23

- Add entity-scoped calculated display values (`StarMadeDisplayValues`) and the complete 46-entry StarMade-Open variable catalog, including indexed reactor/shield families and documented native token collision.
- Restore Display Module (479) holographic screens and text, using host-owned screen textures and the native Monda font.
- Preserve orientation-bearing saved text keys through the blueprint adapter, including docked entities.
- Support native style headers, multiline text, all six face frames, dynamic host substitutions, password masking and text draw distance.
- Reallocate resized Canvas textures for Three.js r164/WebGL2 and release owned GPU resources without disposing shared assets.
- Add a display demonstration and GPU regressions for all orientations, text updates and depth occlusion.

- Fix browser shutdown in the Isanth acceptance recipe and qualify Display rendering as a release requirement.

## 1.0.0 — 2026-09-23

### Added

- Immutable inspection documents, stable cell references, transformed entity hierarchies, picking, selection and measurements.
- Incremental visual synchronization, native cut-face reconstruction, resource ownership and cancellation.
- Logical comparisons, annotations, deterministic timeline sampling, asset inventory, PNG and qualified glTF/GLB exports.
- Functional categories and saved controller links, recursive docking identification and subtree isolation.
- Static saved NORMAL24 rail poses, rigid Matrix4f conversion and explicit fallback diagnostics.
- External shader registration/loading, independent npm-package consumption and CPU performance budgets.
- CI code/coverage, package-consumer and software-WebGL qualification.

### Fixed

- Tangential-shadow speckles, receiver-plane filtering and oblique shadow contours.
- Fractional slab lighting coordinates and partial-cell interior light sampling without transmission through closed faces.
- Misplaced example lighting caused by axis remapping.
- Directional LOD illumination and emission-mask handling; intentional differences from native shaders documented.
- Preserve segment version/timestamp metadata when exposing recursive blueprint inspection.

### Distribution and migration

- Package name is `starmade-3d`, version `1.0.0`, delivered as an npm tarball attached to GitHub Releases.
- Ogre loader progress callbacks receive an Event with `loaded`, `total`, and `lengthComputable`, matching the Three.js contract; replace pre-v1 `(loaded, total)` callbacks.
- Three.js `^0.164.1` is a peer dependency; no runtime Decoder dependency.
- Native game shaders are no longer embedded. Initialize host-owned shader sources before creating native materials; see `docs/assets.md`.
- Legacy helpers containing `Embedded` in their name now access the registered external corpus.
- No editor application, save writer, gameplay simulation or rail physics is included.
- Current-pose glTF exports and arbitrary affine voxel-lighting limits are explicit API contracts.


## 0.0.1-dev.20260920.lighting.2

- Correct main-example normal-map source precedence and retain packed material alpha.
- Use nearest-sampled floating-point raw shadow depth, including Three r164 array targets.
- Keep mixed ordinary-shader casters out of the packed-integer cube depth path.
- Match native face-clamping order and RGBA gain; reuse geometric-corner sampling in the example.
- Separate main-sun shadows from experimental colored-source masks.
- Restore the shared native animation clock in the main RAF loop.
- Add exact-page HTTP/GPU regression execution and retain strict per-module coverage gates.


## 0.0.1-dev.20260920.render.1 — rendering corrections

- Restore native positional sun upload, spot coefficients, conditional shadow gain,
  normal-map orientation, animation cadence and raw texture-array sampling.
- Remove invented lighting and emissive/overlay fallbacks; keep preview-only extras opt-in.
- Keep CPU normals consistent with packed GPU normals without changing mesh winding.
- Detach cloned LOD lighting values and preserve per-draw callbacks.
- Keep static Ogre geometry unskinned and ignore XML-commented LOD declarations.
- Add numerical WebGL2 regressions and actual-installation LOD drawing checks.
- Require exact 100% runtime line/branch/function coverage with the existing gate.
- Record missing full SDK integration and native client screenshot comparison explicitly.

# Journal des modifications

## 0.0.1-dev.20260920 — livraison intermédiaire

- Références verrouillées : Decoder 2.0.0 et blackcancer/StarMade-Open ; contrôle read-only du checkout, de sa révision et de ses fichiers.
- Conservation des champs bruts v7, écritures de segments validées et atomiques, payload brut des blocs d’air préservé.
- Rejet des régions mélangées et ajout de `createStarMadeSmd3RegionsFromBlocks` et `starMadeSmd3RegionKey`.
- Plusieurs racines d’ombres directionnelles, transformations des parents, restauration de l’état après erreur, retour correct des texture-arrays vers des maps 2D.
- Préparation GLSL sans déclarations doublées ; nettoyage des ressources du précontrôle en cas d’échec.
- Tests unitaires / Decoder / installation réelle séparés, régressions et collecte V8 unique avec seuil exact à 100 % par module.
- Scripts portables de lancement des suites, chemins d’assets configurables et workflow CI avec le vrai SDK construit.

**Non terminé :** couverture globale à 100 %, exécution locale de l’intégration SDK, fermeture des écarts de rendu et comparaison au jeu. Voir le rapport de validation ; cette version n’est pas une release qualifiée.
