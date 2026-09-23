# Host-owned assets in 1.0.0

No shaders, textures, models or blueprints from the game are distributed in the
library. Logical inspection and standard Three.js helpers work without an installation.
Native shader material factories require initialization before their first call:

```ts
import { loadStarMadeShaderSources, createStarMadeCubeShaderMaterial } from 'starmade-3d';
await loadStarMadeShaderSources('/my-assets/shaders.json', abortController.signal);
const material = createStarMadeCubeShaderMaterial(options);
```

The JSON response is a dictionary mapping `data/shader/...` paths to source strings,
including transitive `#IMPORT` files. Empty include files are valid. A failed fetch,
invalid dictionary or aborted request retains the previous corpus. Applications can
also call `setStarMadeShaderSources(dictionary)` with files read through their own
filesystem/provider. No server, fetch at import time or installation path is imposed.

The registry is shared within one module instance. Configure it during application
startup. Replacing it affects subsequently created materials, not existing materials.
Applications using concurrent shader versions should supply separate module instances
or preprocessed shader sources; changing a shared registry during scene creation is
not a supported isolation mechanism.

For local development only, the example Vite server reads `STARMADE_DIR/data/shader`
and serves `/starmade-assets/shaders.json`. Restrict access to your assets to users
entitled to use them. `STARMADE_SHADER_ROOT` selects an alternate corpus for tests.
The source tree and npm tarball contain the loader, not a generated native dictionary.

The historical `*EmbeddedStarMadeShader*` helper names are retained as compatibility
aliases for access to the registered corpus. They no longer imply bundled game data.
Calling a native material factory before registration raises a missing-source error.
