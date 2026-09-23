# StarMade-3D 1.0.0

TypeScript/ESM library for rendering and inspecting decoded StarMade creations.

- Cube/slab/wedge and LOD rendering adapters, with qualified lighting fixes.
- Logical block references, selection, cuts, inspection and comparison.
- Saved functional connections, recursive docking trees and static saved rail poses.
- Host-owned asset loading, cancellation/disposal, PNG and qualified glTF/GLB export.
- No editor, persistence engine or gameplay simulation: these belong to consumers.

The npm-compatible tarball is attached to this release, following StarMade-Decoder:

```sh
npm install https://github.com/blackcancer/StarMade-3D/releases/download/v1.0.0/starmade-3d-1.0.0.tgz three@0.164.1
```

Game shaders and assets are not included. Configure the external shader corpus
before creating native materials; see docs/assets.md. Three.js ^0.164.1 is a peer.
Measured results and supported limitations are in docs/v1-validation.md.
No claim of native-client pixel equivalence or npmjs.org publication is made.
