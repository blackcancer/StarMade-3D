# StarMade-3D

**1.0.0** — TypeScript/ESM library for rendering and inspecting decoded StarMade
creations with Three.js. Independent project by InitSysRev.

It provides native block/LOD rendering adapters, immutable inspection snapshots,
block picking, cuts and isolation, functional connections, recursive docking trees,
static saved rail poses, logical differences and qualified visual exports.
The consuming program owns its UI, colors, renderer, persistence and history.

## Install

Like StarMade-Decoder, the npm-compatible package is attached to the GitHub release:

```sh
npm install https://github.com/blackcancer/StarMade-3D/releases/download/v1.0.0/starmade-3d-1.0.0.tgz three@0.164.1
# TypeScript consumers also need the Three.js declarations:
npm install --save-dev @types/three@0.164.1
```

This is a GitHub-hosted npm tarball, not a claim of publication on npmjs.org.
The supported peer is Three.js `^0.164.1`. Node >=22.16 is required for tooling;
browser native rendering requires WebGL2.

## Inspect without a renderer or game installation

```ts
import { InspectionDocument, inspectEntityHierarchy } from 'starmade-3d';

const document = new InspectionDocument('ship-id', 0, [
  { id: 'hull', blocks: [
    { position: [0, 0, 0], state: { type: 1, hp: 255, orientation: 0, active: false } }
  ] },
  { id: 'turret', parentId: 'hull', blocks: [] }
]);
const core = document.resolve({ entityId: 'hull', position: [0, 0, 0] });
console.log(core?.state, inspectEntityHierarchy(document));
```

Use `blocksFromSegments` for Decoder-shaped segment input, `InspectionHitIndex` for
mesh/LOD/instance picking, and `InspectionScene` for optional per-cell synchronization.
Chunk consumers can use the document/diff contracts with `buildInspectionSegments`.

## Initialize native rendering assets

The package **does not include StarMade shader sources, textures, models or blueprints**.
The host provides resources from its own installation. Before creating native materials:

```ts
import { loadStarMadeShaderSources, createStarMadeCubeShaderMaterial } from 'starmade-3d';
await loadStarMadeShaderSources('/my-assets/shaders.json');
const material = createStarMadeCubeShaderMaterial({ textureLayers: texturePack.layers });
```

See [host-owned assets](docs/assets.md) for the dictionary format, registration,
cancellation and startup errors. Native rendering is qualified against the shader
corpora identified in the validation report; arbitrary future corpora are not guaranteed.

## Documentation

- [API contracts and examples](docs/inspection-api.md)
- [Functional maps and dockings](docs/functional-map.md)
- [Stable API, ownership and supported scope](docs/api-stability.md)
- [1.0.0 validation and limitations](docs/v1-validation.md)
- [Changelog](CHANGELOG.md)
- [External assets and third-party notices](THIRD_PARTY_NOTICES.md)

Static rail transforms are interpreted; rail physics, energy/DPS simulation, blueprint
writing, editor commands and undo/redo are responsibilities of other programs.
Native shader adaptation has documented intentional rendering differences.
The 100% CPU coverage gate is not a claim of pixel parity with the game client.

## Develop and validate

Build the sibling StarMade-Decoder revision pinned in `references.lock.json` first.
Work from this repository with Node 22.16 or later:

```sh
npm ci --ignore-scripts
npm run build
STARMADE_DIR=/path/to/StarMade npm run validate:code
STARMADE_DIR=/path/to/StarMade npm run test:game
STARMADE_DIR=/path/to/StarMade CHROMIUM_PATH=/path/to/chromium npm run test:render
STARMADE_DIR=/path/to/StarMade CHROMIUM_PATH=/path/to/chromium npm run test:visual:index
STARMADE_DIR=/path/to/StarMade CHROMIUM_PATH=/path/to/chromium npm run test:inspection
npm run test:package
npm run test:performance
```

`STARMADE_SHADER_ROOT` can select the external shader directory directly. It is
required for the complete native-material unit suite if `STARMADE_DIR` is absent.
CI fetches the pinned external reference through a repository secret; game-installation
recipes remain a separate release requirement. No missing-asset recipe counts as PASS.

To view examples, run `STARMADE_DIR=/path/to/StarMade npm run dev`, then open
`http://127.0.0.1:8001/inspection.html`, `/isanth.html` or `/`.
The examples read an existing installation; they do not modify game files.
Texture conversion requires ImageMagick (`magick`) and `unzip`.

MIT for the library; game resources retain their own terms. See LICENSE and notices.
