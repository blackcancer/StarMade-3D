# Third-party components and external assets

The TypeScript/JavaScript library and the maintained OgreMax XML loader (Blackcancer,
2025) are distributed under the MIT license. Three.js is a peer dependency and is
licensed separately under MIT; see its installed LICENSE file.

StarMade is a product of Schine GmbH. This project is an independent interoperability
and inspection library, not the StarMade game or an official Schine release.
The game installation, texture packs, meshes, blueprints and the native GLSL corpus
are **not included** in the npm package or source release. The host supplies them
from its installation subject to their original terms. This project's MIT license
does not grant rights to those assets.

The compatibility implementation was checked against StarMade-Open commit
`decf3a1990f29b9505041f122188bf19489bcf7e`. Reference sources remain external;
`references.lock.json` records the corresponding Decoder and game-source revisions.
Do not use the removed pre-v1 shader embedding workflow to publish a native corpus.
