# Display Module (479)

The display is a normal block plus a supplemental holographic screen and text.
Drawing only its cube atlas tile omits the native `AbstractTextBox` pass. This
pipeline was introduced in 1.0.1. The expanded behavior described here targets
the updated upstream reference and ships in 1.0.2. See the
[1.0.2 validation report](v1.0.2-validation.md).

## Native source mapping

Reference: StarMade-Open `e5a3b49d86943c4d618cea6512e28fa0b95901df`.

| Stage | Native source | Library |
|---|---|---|
| Persisted text | `ManagerContainer.fromTagStructure` slot 6; `SegmentController.readTextBlockData` | Structural Decoder `manager.texts.entries()` adapter |
| Exact key | `ElementCollection.getIndex4` and signed 16-bit storage coordinates | `starMadeDisplayKey`; decimal strings retain all 64 bits through JSON |
| Parsing | `AbstractTextBox.draw(TextBoxSeg)` | `parseStarMadeDisplayText` |
| Face frames | `AbstractTextBox`: FRONT/BACK/TOP/BOTTOM/RIGHT/LEFT | `starMadeDisplayMatrix` |
| Screen | `screen-gui-` sprite, 256 pixels | Host-supplied native screen texture |
| Font | `FontLibrary.FontSize`, `getUnscaled`, `FontPath` | Host-loaded Monda-Regular; default plain 15px; explicit bold 16/18/20/24/30/40/70/100/300px, black 1px outline, 250/255 glyph fill gain |
| Drawing | `Sprite.draw3D` and `GUITextOverlay` | Transparent, unlit, depth-tested Three.js surfaces |

Storage coordinates are local block centres plus 16. Orientation occupies the
high 16 key bits, so it must not be discarded or converted to a JavaScript number.
The blueprint adapter exposes `displayTexts` for each entity independently.

## Host integration

```ts
import {
  createStarMadeDisplayPanel, starMadeDisplayKey, StarMadeDisplayValues,
} from 'starmade-3d';

// Load the game's font with FontFace before creating a panel.
// background is a shared native screen texture owned by the application.
const values = new StarMadeDisplayValues();
// One snapshot per entity; the application computes and formats these values.
values.set(entity.id, { name: entity.name, power: '12.5 MW', shieldCap: 9000 });
const texts = new Map(entity.displayTexts.map(row => [row.position, row.text]));
const panel = createStarMadeDisplayPanel({
  position: block.position,
  orientation: block.state.orientation,
  text: texts.get(starMadeDisplayKey(block.position, block.state.orientation)),
  background, // blue
  backgrounds: { red, green, yellow, purple }, // shared native textures
  fontFamily: 'StarMadeDisplay',
  createCanvas: () => document.createElement('canvas'),
  values: values.forEntity(entity.id),
});
entityRoot.add(panel.root);

// Per frame: visibility uses world-space distance, including dock transforms.
panel.updateVisibility(camera);
panel.updateTime(deltaSeconds); // native scanline clock: elapsed seconds × 2
// Publish a complete new snapshot, then refresh every panel bound to this entity:
values.set(entity.id, { name: entity.name, power: '13.0 MW', shieldCap: 9000 });
// Refresh host substitutions without replacing the stored text:
panel.update();
// Supply new stored text, or undefined to return to the loading state:
panel.update(newText);
// Releases panel geometry/materials/canvas texture, not the shared background:
panel.dispose();
```

Keep the supplemental layer out of native shadow caster roots. In Isanth it is
attached after constructing the caster snapshot; the physical block continues
to cast shadows. Inspection attaches it to the complete entity transform, binds
picking to the source block, and removes it when the block is filtered out.
Native materials for the cube are still supplied by the normal block renderer.

The screen spans 256 native pixels, scaled by -0.00395 on all three axes, and
uses the source face rotations and 0.51/0.5 offsets. Text begins at an 8-pixel
inset with a 0.1 native-pixel depth separation. Only text is distance-culled
(default 500 world units in the updated source); the screen remains visible. The host owns the camera
and application loop; the panel starts no timers and makes no network requests.

## Text contract

Style tags `<style>...</style>` are recognized anywhere and case-insensitively.
Color and font cascade across at most 32 segments. Native rendering stacks each
nonempty segment vertically: this is not inline HTML text flow. One newline after
a closing style tag is skipped. Subsequent newlines remain. Global panel settings
use the last tag that sets each property; each parse resets previous state.

| Property | Aliases and behavior |
|---|---|
| Text color | `c`, `color`; Java integer/hex/octal color |
| Font | `f`, `font`; indices 0–8 → 16,18,20,24,30,40,70,100,300px bold; invalid integer index resets to default plain 15px |
| Offset | `o`, `offset`, `p`, `pos`, `position`; normal:vertical:horizontal, each clamped to ±10 |
| Rotation | `r`, `rot`, `rotation`; degrees x:y:z, or one z angle; native X/Y/Z order; rotates text only, not background |
| Holography | `h`, `holo`, `holographic`; case-insensitive `true`, anything else false |
| Background | `bg`, `background`; red/green/yellow/purple/blue select the host texture; true/false toggle visibility separately |

Malformed numeric styles yield `style error!`. Missing text yields `loading...`.
The native style-only fallback displays its original string; it is retained here.
`[password]` hides its whole segment and all subsequent segments, preserving prior
public segments. Text, callback values and custom variables are never interpreted
as HTML or recursively expanded.

`StarMadeDisplayValues.set(entityId, snapshot)` atomically replaces calculated
values for one entity. Omitted values disappear. `clear(entityId)` removes the
snapshot; sources returned by `forEntity(entityId)` retain the binding. Docked and
nested docked entities use distinct IDs. Strings preserve host formatting/units;
finite numbers and booleans stringify without calculating native gameplay state.
For native-looking states, supply localized strings such as `on` or `docked`.
Duplicate case-insensitive names and non-finite numbers fail atomically.

Indexed tokens append digits: `[shieldHp0]`, not `[shieldHp#0]`. Calculated values
have precedence over the optional `resolveToken` fallback, including empty strings.
Unknown or unavailable ordinary tokens remain literal. The host owns manager
eligibility, formatting and updates. `panel.update()` resolves new snapshots and
only rerasterizes changed content. Application-defined ordinary tokens remain
supported alongside the exported native catalog.

Custom variables use a separate namespace and native limits:

```ts
values.setVariables(entity.id, { fuelLabel: 'READY', _counter: '3' });
// Saved template: [set:fuelLabel=IGNORED][var:fuelLabel][unset:fuelLabel]
panel.update(); // displays READY; does not execute either write
values.clearVariables(entity.id);
```

`setVariables` atomically publishes at most 128 strings per entity, values up to
256 UTF-16 code units, names up to 32 characters matching `[a-z_][a-z0-9_]*`
(case-insensitive). `[var:name]` reads it, defaulting to empty if unset. `set:` and
`unset:` tags are consumed without mutation, matching the native client.
`resolveVariable` is an optional provider fallback. Reading variables refreshes
on `update()` even if the saved template has not changed; this avoids the native
client's parse-time custom-variable cache becoming stale.

Logic commands `[add]`, `[del]`, `[replaceFirst]`, `[replaceAll]`, `[=]`, sensor
outputs and server-side variable mutations belong to the host logic engine.
They are not executed by rendering; the host publishes their resulting text via
`update(text)`. Thus frame rendering cannot mutate the ship or evaluate executable
expressions. This follows the separation between native client `AbstractTextBox`
and server-side display replacement/expression processing.

## Complete native variable catalog

The exported catalog now matches all **56** native enum entries. The integration
test compares names, order, power availability and indexed flags to the pinned
`Replacements.java`. Removed entries are no longer advertised as native; hosts
can still supply them as application-defined placeholders.

| Native enum | Placeholder example | Power catalog |
|---|---|---|
| `SHIELD` | `[shield]` | legacy |
| `SHIELD_CAP` | `[shieldCap]` | legacy |
| `SHIELD_PERCENT` | `[shieldPercent]` | legacy |
| `POWER` | `[power]` | legacy |
| `POWER_CAP` | `[powerCap]` | legacy |
| `POWER_PERCENT` | `[powerPercent]` | legacy |
| `POWER_BATTERY` | `[auxPower]` | legacy |
| `POWER_BATTERY_CAP` | `[auxPowerCap]` | legacy |
| `POWER_BATTERY_PERCENT` | `[auxPowerPercent]` | legacy |
| `STRUCTURE_HP` | `[structureHp]` | legacy |
| `STRUCTURE_HP_CAPACITY` | `[structureHpCap]` | legacy |
| `STRUCTURE_HP_PERCENT` | `[structureHpPercent]` | legacy |
| `MASS` | `[mass]` | all |
| `BLOCK_COUNT` | `[blockCount]` | all |
| `SECTOR` | `[sector]` | all |
| `SYSTEM` | `[system]` | all |
| `SYSTEMNAME` | `[systemName]` | all |
| `FACTION` | `[faction]` | all |
| `NAME` | `[name]` | all |
| `DOCKED` | `[docked]` | all |
| `DOCKEDTO` | `[dockedTo]` | all |
| `DOCKEDROOT` | `[dockedRoot]` | all |
| `CLOAKED` | `[cloaked]` | all |
| `JAMMING` | `[jamming]` | all |
| `SPEED` | `[speed]` | all |
| `MAXSPEED` | `[maxSpeed]` | all |
| `TMR` | `[tmr]` | all |
| `REACTORIDACTIVE` | `[activeReactorId]` | reactor |
| `REACTORRECHARGEACTIVE` | `[activeReactorRecharge]` | reactor |
| `REACTORCONSUMPIONACTIVE` | `[activeReactorConsumption]` | reactor |
| `REACTORCONSUMPIONPERCENTACTIVE` | `[activeReactorConsumptionPercent]` | reactor |
| `REACTORHPPERCENTACTIVE` | `[activeReactorHpPercent]` | reactor |
| `REACTORHPACTIVE` | `[activeReactorHp]` | reactor |
| `REACTORMAXHPACTIVE` | `[activeReactorMaxHp]` | reactor |
| `REACTORLEVELACTIVE` | `[activeReactorLevel]` | reactor |
| `REACTORSIZEACTIVE` | `[activeReactorSize]` | reactor |
| `REACTORLEVELX` | `[reactorLevel0]` | reactor |
| `REACTORIDX` | `[reactorId0]` | reactor |
| `REACTORSIZEX` | `[reactorSize0]` | reactor |
| `REACTORHPX` | `[reactorHp0]` | reactor |
| `REACTORMAXHPX` | `[reactorMaxHp0]` | reactor |
| `REACTORPERCENTX` | `[reactorPercent0]` | reactor |
| `TOTALSHIELDHPX` | `[totalShieldHp0]` | reactor |
| `TOTALSHIELDMAXHPX` | `[totalShieldMaxHp0]` | reactor |
| `TOTALSHIELDPERCENTX` | `[totalShieldPercent0]` | reactor |
| `TOTALSHIELDRECHARGE` | `[totalShieldRecharge]` | reactor |
| `TOTALSHIELDUPKEEP` | `[totalShieldUpkeep]` | reactor |
| `SHIELDIDX` | `[shieldId0]` | reactor |
| `SHIELDPERCENTX` | `[shieldPercent0]` | reactor |
| `SHIELDHPX` | `[shieldHp0]` | reactor |
| `SHIELDCAPX` | `[shieldMaxHp0]` | reactor |
| `SHIELDRECHARGEX` | `[shieldRecharge0]` | reactor |
| `SHIELDUPKEEPX` | `[shieldUpkeep0]` | reactor |
| `SHIELDRADIUSX` | `[shieldRadius0]` | reactor |
| `MISSILE_CAPACITY` | `[missileCapacity]` | all |
| `MISSILE_CAPACITY_MAX` | `[missileCapacityMax]` | all |

`reactorMaxHp` is now distinct from `reactorHp`; the old collision is fixed upstream.
The native help text describes `totalShieldHp`, `totalShieldMaxHp` and
`totalShieldPercent` without indices, but their actual enum entries still have
`takesIndex=1000`. The catalog reflects executable source: append an index to
these three names. Their factories aggregate all shields and ignore that index.
Power flags describe the help catalog; the host still owns actual capability checks.

## Shared shader compatibility after the upstream update

The current native cube corpus introduces `#DYNAMIC_CUBE_*` directives. The
preprocessor expands these for the five 2D slots already exposed by the material
API (0,1,2,3,7). Arbitrary additional 2D sheets are not newly supported here.
WebGL2 calls explicitly cast integer layer indices to the float helper arguments.
The native blended alpha-discard threshold is now 0.2 (formerly 0.01). Tests assert
the new source behavior and retain GPU alpha/normal-map checks; these expectations
were changed because the pinned executable native source changed, not to suppress
a failed rendering test. Texture-array paths remain covered as well.

## Native pipeline coverage and adaptations

| Native facility | Integration |
|---|---|
| Saved per-entity text and asynchronous missing content | Exact Decoder text keys; `update(text)` replaces loading text when the host obtains it |
| Six orientations and nested docking | Local native face frame composed with the owning entity transform |
| Style aliases, nine explicit font sizes, colors, offsets, multiline and password | Parser and panel, with unit and GPU regression cases |
| Every simple/indexed replacement | Entity snapshot API; full catalog checked against native source |
| Dynamic manager calculations and formatting | Host-supplied values, refreshed by `update()` |
| Native screen theme and font resources | Host-owned texture/font, installation-backed examples |
| Text distance and depth, screen background | Separate surfaces; text-only distance cutoff; Three.js frustum culling |
| Mod `TextBoxDrawListener` preDraw/draw/preDrawBackground | Host owns render scheduling and exposed `root`, `text`, `background` meshes; Java callbacks are not executed |
| `Shaderable` time and scanline shader | External native scanline fragment adapted to Three.js, applied to text and background; `updateTime(seconds)` drives its clock |
| Text download request / multiplayer protocol | Host data responsibility; this library makes no game-server requests |

## Deliberate browser adaptations and limits

- The native fragment is loaded externally; its `rand` helper is namespaced to
  avoid a Three.js collision. Texture sampling uses the canvas text texture rather
  than the native glyph atlas, so scanline phase/color fringing is not pixel-identical.
- The native `FontLibrary` resolves MEDIUM to plain Monda 15px. Explicit font
  indices use bold Monda and retain the configured font's outline, despite the
  Java helper names containing `NoOutline`.


- Native fonts and backgrounds come from the user's installation, never the package.
  Examples load all five `screen-gui-{color}.png` variants. Missing requested visible
  backgrounds fail explicitly rather than substituting a wrong color.
- Canvas glyph rasterization uses the native font and outline but browser metrics
  and antialiasing can differ from Java UnicodeFont. Pixel-identical client output
  is not claimed. Hosts supply suitable fallback fonts for missing glyphs.
- Styles reset offsets and rotation on every parse, now also fixed upstream.
- Unavailable live substitutions remain named rather than showing native internal
  substitution markers. No game network request is made for missing text.
- Logical text dimensions are limited to 4096×4096 pixels and 16,384 characters;
  excess content fails explicitly. Rasterization is at 2× resolution. Updated
  canvases release old immutable WebGL2 texture storage before reupload.
- The application determines how many panels to instantiate; there is no global
  scene singleton or imposed 1,200-panel native draw-list limit.

## Validation

Run `npm run validate:code` with the native shader corpus configured. The display
unit cases cover saved keys and adapter data, style aliases/errors, all face
frames, nested transforms, substitutions, distance, raster updates and ownership.

With `STARMADE_DIR` and `CHROMIUM_PATH` configured, `npm run test:display` loads
actual external Monda/screen/scanline assets and checks GPU pixels on all six orientations,
text changes, calculated-value publication/cache invalidation, password suppression,
depth occlusion, cascade colors, rotations, background variants, animated versus
painted mode, distance and runtime/shader errors.
The interactive example is `/display.html`. Its cube supports use neutral
materials to make the supplemental screen/text pass easy to inspect. `/isanth.html`
and `/inspection.html` retain the existing native block and LOD materials.

### Updated upstream development receipt — 2026-09-23

**Global local qualification: PASS.** The previous dirty-Decoder reference block
is resolved by pinning Decoder **2.0.1**, commit
`ed9d3becdb139eaf665c27a23c6ef3ef60d687d9`, in the reference lock, npm lock and CI.
Its compiled package is consumed through the existing local development link.
StarMade-Open is pinned to `e5a3b49d86943c4d618cea6512e28fa0b95901df`; source hashes
cover the Display parser, segments, variables, fonts, settings and scanline shader.
Both reference checks passed before full qualification.

All ten qualification recipes passed during development with Decoder 2.0.1:

| Check | Measured result |
|---|---|
| Code | TypeScript, 40 tooling tests, 779 unit tests, 4 real Decoder integration tests passed |
| Runtime coverage | 100% lines, branches and functions for each of 50 modules; unchanged blocking gate |
| Native integration | 14 tests passed, including the two Display source contracts |
| General GPU | 41 checks passed |
| Actual index example | 17 checks passed |
| Inspection example | 20 checks passed |
| Isanth | Four rendered views, ready, no runtime exceptions |
| Display GPU | 14 checks passed, including cascade styles, backgrounds, rotation, scanlines and distance |
| Packed-package consumption | Runtime exports, TypeScript types and shared Three.js passed |
| CPU performance budgets | Passed |
| Runtime dependency audit | Passed |

Full logs and source fingerprints: `validation/display-decoder-2.0.1/qualification.json`.
Coverage details: `coverage/REPORT.md`. No exclusions or reduced thresholds were
introduced. Reproduce the full run with the installation and browser configured:

```sh
STARMADE_QUALIFICATION_OUTPUT=validation/display-decoder-2.0.1 npm run release:qualify
```

The separate output directory preserves the published 1.0.1 qualification records.
The final versioned release is qualified separately in
[the 1.0.2 report](v1.0.2-validation.md); the existing 1.0.1 package is unchanged. Historical upstream CI evidence in the lock is
not used as a substitute for these current local integration results.

### Historical 1.0.1 development receipt — 2026-09-23

- `npm run validate:code`: typecheck, 40 tooling tests, 773 unit tests and 4
  real-Decoder integration tests passed. Blocking coverage: 100% lines, branches
  and functions for each of the 49 runtime modules, with no display exclusions.
- `npm run references:check -- --require-open`: both pinned checkouts verified.
- `npm run test:game`: 13 passed, including all 46 native variable declarations.
- `npm run test:display`: 12 GPU assertions passed with installation-owned font
  and screen assets; no WebGL errors. Reports/screenshots: `validation/display/`.
- Inspection browser recipe: 20 checks passed (`validation/display-inspection/`).
- Isanth four-view recipe: ready, no runtime exceptions
  (`validation/display-isanth/`); this is not a pixel-identical native-client claim.
- Packed-package consumer: runtime exports, typed values/panel options, shared
  Three.js and absence of bundled shader corpus verified
  (`validation/display-package/package.json`). The final 1.0.1 qualification is documented in `v1.0.1-validation.md`.

The Isanth capture recipe now terminates its own browser process after collecting
results, rather than requiring a `Browser.close` CDP acknowledgment that some
Chrome versions never send. All rendering/error assertions remain unchanged.
