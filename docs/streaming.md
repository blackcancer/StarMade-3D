# Progressive blueprint loading

StarMade-Decoder 2.1.0 supplies `streamBlueprintFolder`, `streamSment` and
`streamSmd3`. StarMade-3D consumes the folder/archive event contract structurally:
Decoder remains a host-side dependency and is not bundled into browser code.

```ts
import { registerAllFactories, streamBlueprintFolder } from 'starmade-decoder';
import { streamStarMadeInspection } from 'starmade-3d';

registerAllFactories();
const controller = new AbortController();
for await (const event of streamStarMadeInspection(
  streamBlueprintFolder('/path/to/ship', { signal: controller.signal }),
  controller.signal,
)) {
  if (event.kind === 'entity') registerEntity(event.node);
  if (event.kind === 'segment') await renderSegment(event.entityId, event.segment);
  if (event.kind === 'end') markComplete();
}
```

The callback names above belong to the consuming application. Awaiting segment
work before advancing applies backpressure. A consumer must handle rejected
iteration: Decoder `partial`, `error`, `cancelled`, missing completion, duplicate
entities and invalid parent ordering are errors, never successful loads. Breaking
iteration closes the source; supply the same AbortSignal to Decoder for pending
file operations. The adapter retains entity metadata, not segment geometry.

`segmentFromStarMadeWords` also accepts a loose `streamSmd3` segment. The host
supplies that file's entity identity and transform. Canonical 32-bit words retain
type, HP, activation, orientation and reserved bits. Zero words become sparse air
slots; only nonzero words allocate block objects. The resulting segment is detached
from the input array, so the host can release or transfer it. Origins use native
32-block alignment; native version and lastChanged are retained when supplied.

Docking hierarchy, saved rail requests, controllers and Display texts use the
existing inspection metadata projection. Use `inspectionDocumentFromBlueprint`
when resolving saved rail matrices; streaming does not invent new docking poses.

## Browser transport

`encodeStarMadeInspectionFrame(event)` and `readStarMadeInspectionStream(chunks,
signal?)` carry projected inspection events without dense JSON block arrays. The
version-1 frame has an eight-byte prefix: little-endian uint32 JSON byte length
and word byte length, followed by UTF-8 metadata and, for segments, 32,768
little-endian uint32 words. Metadata is limited to 1 MiB per frame. Segment words
occupy 128 KiB; entity/end events have no word payload. This is an application
transport, not a new StarMade file format. Serve it with Content-Type
`application/vnd.starmade.inspection-stream; version=1`.

The reader handles arbitrary network chunk boundaries, rejects truncated frames
and requires an explicit successful end followed by EOF. Early return closes the
upstream iterator. Connect fetch to the AbortSignal too, so a pending network read
can be interrupted. Use the built-in encoder for trusted projected Decoder events;
this protocol is not a lossless file-editing serialization.

The Vite endpoint `/starmade-assets/blueprints/isanth.stream` uses Decoder on demand
and waits for HTTP drain. Isanth displays an initial cube preview as each segment
arrives and repairs shared boundary faces for touching segments. The completed
scene then applies the existing lighting, native LOD models, shadows and Display
passes. The loading indicator distinguishes this preview from the final scene.
The previous JSON endpoint remains for compatibility and comparison.

## Scope and validation

The demo retains loaded segments for the final lighting/LOD build. Streaming bounds
in-flight decoding and transport allocations; it does not make total scene memory
constant or guarantee a higher steady-state frame rate. Final lighting still needs
whole-scene occupancy. The initial preview uses cube geometry for LOD blocks.

Unit tests cover canonical bits, sparse air, cancellation, backpressure, hierarchy,
framing fragmentation, payload bounds and explicit terminal errors. Game integration
compares all 3,200 Isanth blocks and both entities, docking, controllers and Display
texts against eager decoding. Absent reserved bits are canonically zero.
The browser acceptance recipe asserts four segments, less than 600 KiB transferred,
a visible preview before stream completion, and four final views without exceptions.
Measured results are recorded in `validation/streaming/`.

### Historical streaming-only receipt — 2026-09-24

Node 22.16.0, Decoder 2.1.0 (`e84ef38e`), local Isanth installation and Chromium
software WebGL2. TypeScript passed; 788 unit, 4 Decoder, 16 game integration and
43 tooling tests passed. The per-file gate measured 100% lines, branches and
functions on all 52 runtime modules, without exclusions or weaker thresholds.
The independently installed package passed runtime streaming/framing and typed API
consumption with shared Three.js. Four final Isanth views passed without exceptions.

These counts precede the addition of blueprint LODs. Current package qualification
is recorded in the [1.1.0 validation report](v1.1.0-validation.md).

The binary response was 530,709 bytes versus the prior 9,696,234-byte uncompressed
JSON response (94.5% smaller). This compares raw payload sizes, not compressed
network bandwidth. In the browser receipt, after textures/configuration loaded,
the first segment arrived at 39.6 ms, the first preview render returned at
5,203.7 ms, and stream consumption including preview rendering finished at
6,596 ms. These are one local software-renderer run, not production latency or
FPS guarantees. Initial shader compilation remains substantial. The transport
avoids duplicate root segments and allocates block objects only for nonzero words.

Evidence: `coverage/REPORT.md`, `validation/streaming/package.json`, and
`validation/streaming/isanth-final/result.json` with four screenshots. The endpoint
was initially unavailable because the running service retained the old Decoder
module. Restarting StarMade-3D loaded 2.1.0; a preview initialization-order issue was
also fixed before the successful browser acceptance run.

## Shader and texture preparation experiment

Isanth calls Three.js `compileAsync(scene, camera)` before its first preview and
again after final LOD/Display assembly. Identical material programs remain cached
by Three.js. Native GLSL sources, sampling quality, lighting and shadows are
unchanged. The loading indicator gets a frame before driver work starts.

The atlas textures are initialized once with `renderer.initTexture`, yielding an
animation frame between textures. This moves the large upload/mipmap initialization
out of the first draw and allows the browser to service other work between calls.
Each texture call can still block; this is not a worker or fully asynchronous GPU
upload. Final shadow-map preparation is not included in scene `compileAsync` and
can still stall its first pass.

Both preparations are enabled by default. For repeatable comparisons, use:

- `isanth.html?shaderWarmup=0&textureWarmup=0`: original first-draw path.
- `isanth.html?shaderWarmup=1&textureWarmup=0`: shader preparation alone.
- `isanth.html`: shader preparation and distributed texture initialization.

`window.__STARMADE_SHADER_PREPARATION__` reports extension support, compilation
launch/wait times, program counts, texture call times/dimensions, first preview and
final render calls, first shadow call and the longest 16-ms timer gap during the
preview load. These measure CPU-side API calls and wall-clock scheduling, not
isolated GPU execution times. `firstVisibleMs` remains the time at which the first
preview render call returns, not a compositor presentation timestamp.

The Chromium/SwiftShader test environment does not expose
`KHR_parallel_shader_compile`; real GPU/browser results may differ. In the initial
A/B run, precompilation alone did not materially change the first preview delay
(4.912 s vs 4.914 s). Initializing the 11 textures between frames reduced the first
preview draw call from 4.731 s to 0.030 s and the longest timer gap from 4.882 s to
0.782 s, while first preview latency remained about 4.896 s. Texture calls totalled
about 4.65 s. The improvement is responsiveness during preparation, not faster
steady-state rendering or elimination of loading work.

All four final views were pixel-identical between the baseline, shader-only and
combined modes (`compare -metric AE`: zero differing pixels per image). Evidence
and repeat runs are under `validation/shader-warmup/`; `pixel-parity.json` records
the image comparisons. The browser recipe also rejects console shader errors and
checks both preparation phases and all 11 texture initializations when enabled.

A second fresh-profile pair confirmed the result: baseline first preview draw
4,794 ms and maximum preview timer gap 4,925 ms; default preparation draw 28 ms
and gap 1,025 ms. First preview latency was 4,939 ms versus 5,018 ms: no first-image
speedup is claimed. All 11 atlases were 4096×4096. The first final shadow call still
took about 2,246 ms in both modes and remains a separate optimization opportunity.
The repeated four-view comparison also had zero differing pixels.
