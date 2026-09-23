> Historical development evidence. The 1.0.0 acceptance, supported scope and current limitations are recorded in [the release validation report](v1-validation.md).

# Main visual example: lighting correction and qualification

Version: **0.0.1-dev.20260920.lighting.2**  
Date: 2026-09-20  
Requested entry: **examples/visual-test/index.html**

## Delivered result

This complete source/build archive includes the earlier render.1 and fix2 patches,
restores their missing regression coverage, and corrects defects reproduced in the
main visual example. It is a rendering/interpreting library, not an editor.
No repository was pushed and no game installation was modified.

The main entry and the shipped resources are now exercised together. Native-client
pixel parity is **not** asserted. All screenshots in this report are library renders.

## Reproduction and provenance

The baseline was assembled from the latest supplied `StarMade-3D.zip`, the previous
`StarMade-3D-render-fixes.zip`, and the four delivered fix2 source files. The original
Vite asset selection was restored for the baseline comparison. It is not a claim
about an unobserved deployment or an unprovided later local change.

Reference source: `blackcancer/StarMade-Open`, commit
`decf3a1990f29b9505041f122188bf19489bcf7e`.
Game resources: the supplied `StarMade.zip`, version
`0.204.705#20260219_192621` (read from `version.txt`).
Runtime: Node 22.16.0, Three.js 0.164.1, Chromium 144.0.7559.96,
Xvfb and ANGLE/SwiftShader, WebGL2 with `EXT_color_buffer_float`.

`npm run test:visual:index` starts the **real Vite middleware** and fetches its HTTP
responses. It then executes the actual main HTML/TypeScript entry in a blank browser
page, transporting those exact bytes in memory. This supports managed browsers that
cannot navigate to a local server without changing their policies. Only resource
transport and read-only test access to scene references are instrumented; production
loaders, shaders, geometry, lighting, shadow passes and requestAnimationFrame run.
The test waits for page readiness and all requested file/image loads to finish.
This is not a direct browser-navigation deployment test and does not run StarMade.

## Corrected causes

### 1. Normal-map source precedence discarded material information

The old endpoint selected `_NRM.png.zip` ahead of `_NRM.tga.zip`. The supplied PNGs
for t000/t001 are legacy RGB images: sampling them supplies alpha 255 everywhere.
The native TGA alpha instead carries emission/specular information. Consequently,
ordinary gray armor could enter the fully emissive branch. t002 also differs from its
TGA counterpart; t003 was already using the same data.

The normal endpoint now prefers the TGA material-data variant and converts with
explicit `png32` RGBA8 output. Ordinary color atlas selection is unchanged. The
native source's `TextureLoader.getTexture2DAnyFormat` prefers TGA **when
USE_TGA_NORMAL_MAPS is enabled**. This delivery targets that mode; it does not claim
that every user's native setting is enabled. PNG-only fallback remains supported.

The checker compares every decoded HTTP RGBA byte with the corresponding native TGA
for all four normal sheets. It also reads sampled texels back from the actual GPU
textures, including alpha-zero texels with nonzero RGB. All comparisons pass. For
example, t000 texel (0,0) must remain `[128,128,255,79]`, not have alpha replaced by 255.

### 2. Raw depth was quantized as an eight-bit color

Custom depth shaders write normalized depth directly to red; it was stored in the
default unsigned-byte target. That gives only 256 depth levels, producing unstable
self-shadowing with a bias below one quantization step. Linear magnification filtering
was also inappropriate before the depth comparison.

Directional and projected-source targets now explicitly use floating-point raw depth
and nearest sampling. Three r164 array targets ignore the extra constructor options,
so the texture type is set explicitly on the array texture as well. A GPU oracle
compares an actual rendered depth with an independently projected point: the corrected
value is about 0.405042142 for an expected 0.405042100. The baseline yields 0.403921569.
The actual main scene has 1,546 distinct occupied depth values in the recorded pass,
not an eight-bit staircase. WebGL2 floating-point color attachments are required;
there is no silent lossy fallback.

### 3. The example applied colored-source masks to sunlight

The main page projected three colored, orthographic local-light masks over the whole
cube material. This affected sunlight and already-gathered voxel illumination rather
than independently shadowing the intended source.

The page now binds one directional main-sun shadow pipeline to its full scene. Local
RGB occlusion remains the voxel light transport's responsibility. The older projected-
source API remains explicitly experimental, not a native point-light cubemap system.
Its explicit block-source mode is now independent of 2D versus array storage.

### 4. Ordinary shader meshes were sent to an integer-only depth shader

The caster classifier treated any ShaderMaterial as a packed StarMade cube. Logic/
effect meshes with ordinary float positions then produced GL_INVALID_OPERATION
(vertex attribute type mismatch) and failed to cast a shadow. The classifier now
recognizes the named cube/LOD material families and routes other shaders to generic
position-based depth. Both the mixed actual page and an isolated GPU regression run
without those driver errors. Generic depth does not interpret arbitrary user-shader
alpha or vertex displacement.

### 5. The example maintained a divergent light sampler

The main example's handwritten per-face buffer loop and exponential display curve
are replaced by `applyStarMadeBlockLightToEncodedCubeGeometry`. Actual geometric
corners, source face metadata, angled faces and translated coordinates share the same
production path. Adjacent floor corner values are compared in the real scene.

Native `Occlusion.setLightFromAirBlock` clamps each gathered RGB channel to one before
sharing face values. The library now follows that ordering instead of letting a very
bright neighbor dominate an average. `CenterVertex.getAverage` applies LIGHT_SCALE
(1.28) to RGBA; occlusion now receives the same gain as RGB before quantization. An
explicit caller-provided occlusion floor is applied afterwards. Independent unit
oracles cover saturated neighbors, shared corners and the expected packed RGBA.

The prior close-slab and duplicate-triangle-corner fixes are included and tested on
all three axes. No arbitrary light floor or replacement color is added.

### 6. The main RAF loop bypassed the native clock

The page no longer computes animation from `performance.now()/180`. It calls the
shared native clock for its materials. The clock retains the strict 0.5-second
threshold and accumulated delay. Actual main-page frames advance; the strict
boundary behavior and animated depth synchronization are also unit-tested.

## Executed results

| Check | Corrected delivery | Baseline comparison |
|---|---:|---:|
| Build | Pass | Not used as a visual oracle |
| Typecheck: source + unit tests | Pass | — |
| Typecheck: source + browser tests | Pass | — |
| Typecheck: source + actual main example | Pass | — |
| Autonomous unit tests | 703 / 703 | Earlier patch/test expectations reconciled |
| Tooling tests | 40 / 40 | — |
| Actual main entry checks | 16 / 16 | 8 failures / 16 |
| Independent GPU checks | 27 / 27 | 3 failures / 27 |
| Actual native LOD models loaded and drawn | 95 / 95 | — |
| Runtime lines | 10,291 / 10,291 (100%) | — |
| Runtime branches | 3,219 / 3,219 (100%) | — |
| Runtime functions | 677 / 677 (100%) | — |

Coverage is exact per module across **34 source runtime modules**, including the
maintained OgreMax loader. Native V8 counters measure emitted JavaScript, with the
existing one-to-one source/module inventory gate. No coverage exclusion or threshold
was relaxed. Non-executable TypeScript types are not line targets; GLSL text is not
claimed as instrumented GPU branch coverage. Actual GPU checks are separate.

The main-page log retains two transient Three.js image-not-yet-ready warnings during
LOD initialization. All image loads finish before the acceptance captures. There are
no recorded draw errors, shader failures, lost contexts or JavaScript exceptions in
the corrected main run. These warnings are not hidden or counted as shader success.

## Evidence

Current results are under `validation/lighting/`: `coverage-verdict.json`,
`main-after/result.json`, `main-before/result.json`, `gpu-after/result.json`,
`gpu-before/result.json`, and `lod-after/result.json`. The main directories include
screenshots and HTTP resource hashes. `logs/` contains the executed command outputs.
`source-files.json` fingerprints the delivered source/configuration/build inputs.

`coverage/REPORT.md` and `coverage/native-summary.json` retain detailed counters.
The screenshots are before/after library comparisons at the same camera, not native
client reference images. Test scaffolding and the unmodified threshold checker are
shipped for reruns; game resources and node_modules are not redistributed.

## Deployment and remaining acceptance boundary

Replace the complete project, rebuild, stop/restart the development server with
`STARMADE_DIR` set, and force a browser reload. The Vite middleware change is part of
the fix; copying only `dist` does not change an old server's asset selection.

```sh
npm run build
STARMADE_DIR=/srv/StarMade npm run dev
# Separate verification:
STARMADE_DIR=/srv/StarMade xvfb-run -a npm run test:visual:index
npm run coverage:check
```

The full Decoder integration/ZIP/XML workflows and Isanth end-to-end page were not
rerun in this lighting lot; the pinned Decoder checkout is absent locally. No test
claim includes a mocked replacement SDK. The main index does not need that checkout.
Full native-client image parity still needs matching camera, game settings, scene and
animation state. The main page also contains synthetic showcase lighting fixtures;
passing it is not exhaustive qualification of every world/rail/shape combination.
