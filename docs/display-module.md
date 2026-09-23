# Display Module (479)

The display is a normal block plus a supplemental holographic screen and text.
Drawing only its cube atlas tile omits the native `AbstractTextBox` pass. This
pipeline is available starting with version 1.0.1.

## Native source mapping

Reference: StarMade-Open `decf3a1990f29b9505041f122188bf19489bcf7e`.

| Stage | Native source | Library |
|---|---|---|
| Persisted text | `ManagerContainer.fromTagStructure` slot 6; `SegmentController.readTextBlockData` | Structural Decoder `manager.texts.entries()` adapter |
| Exact key | `ElementCollection.getIndex4` and signed 16-bit storage coordinates | `starMadeDisplayKey`; decimal strings retain all 64 bits through JSON |
| Parsing | `AbstractTextBox.draw(TextBoxSeg)` | `parseStarMadeDisplayText` |
| Face frames | `AbstractTextBox`: FRONT/BACK/TOP/BOTTOM/RIGHT/LEFT | `starMadeDisplayMatrix` |
| Screen | `screen-gui-` sprite, 256 pixels | Host-supplied native screen texture |
| Font | `FontLibrary.FontSize`, `getUnscaled`, `FontPath` | Host-loaded Monda-Regular; 16/18/20/24/30 pixels, black 1px outline, 250/255 glyph fill gain |
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
  background,
  fontFamily: 'StarMadeDisplay',
  createCanvas: () => document.createElement('canvas'),
  values: values.forEntity(entity.id),
});
entityRoot.add(panel.root);

// Per frame: visibility uses world-space distance, including dock transforms.
panel.updateVisibility(camera);
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
(default 30 world units); the screen remains visible. The host owns the camera
and application loop; the panel starts no timers and makes no network requests.

## Text contract

An initial `<style>...</style>` supports comma-separated `c`/`color`, `f`/`font`
and `o`/`offset`/`p`/`pos`/`position`. Offsets are `normal:vertical:horizontal`.
Colors accept Java-style integer, hex and octal notation. Font indices 0–4 map
to the native sizes. Unknown style fields are ignored. Invalid supported values
produce `style error!`; missing content produces `loading...`, while an empty
string stays empty. Explicit newlines are preserved; text is not parsed as HTML.

`[password]` suppresses all displayed text. Other bracket tokens are resolved from the entity snapshot, then offered to
the optional `resolveToken` callback in lower case, including indexed tokens. Unresolved tokens
remain visible literally; the library does not fabricate energy/shield values or
simulate the native manager state. Callback results are inserted literally,
without interpreting markup or JavaScript. Call `update()` when live values change; unchanged resolved text does not rerasterize.

`StarMadeDisplayValues.set(entityId, snapshot)` atomically replaces an entity’s
complete snapshot: omitted values disappear. `clear(entityId)` removes it. Bound
`forEntity(entityId)` sources continue to read subsequent snapshots. Docked and
nested docked entities use their own IDs. Values can be strings, finite numbers
or booleans; strings preserve exact host units, localization and numeric formatting.
For native-looking status words, supply strings such as `on` or `docked`, not a
boolean. Non-finite numbers and duplicate case-insensitive names are rejected
without changing the previous snapshot. Tokens are case-insensitive; indexed
names append decimal digits directly, e.g. `shieldHp0`, not `shieldHp#0`.
The API also accepts application-defined variables. `name` is the native ship
name token; `shipname` would be an application extension.

Native manager eligibility checks and number formatting belong to the host:
legacy/reactor power, local shields, ship-only speed/cloak/jamming, active reactor
and ammunition availability cannot be inferred from a static blueprint.
No missing value is synthesized as zero. Unknown placeholders stay literal.
`resolveToken` is the fallback for external providers; snapshot values, including
an empty string, take precedence.


## Complete native variable catalog

The exported `STARMADE_DISPLAY_VARIABLES` preserves all 46 native enum entries.
A game integration test compares it against the pinned `Replacements.java`, so
missing or changed entries fail validation. Power availability describes the
native help catalog; it does not replace runtime manager capability checks.

| Native enum | Placeholder | Power catalog |
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
| `REACTOR_HP` | `[activeReactorHp]` | reactor |
| `REACTOR_HP_CAPACITY` | `[activeReactorMaxHp]` | reactor |
| `REACTOR_HP_PERCENT` | `[activeReactorHpPercent]` | reactor |
| `ARMOR_HP` | `[armorHp]` | all |
| `ARMOR_HP_CAPACITY` | `[armorHpCap]` | all |
| `ARMOR_PERCENT` | `[armorHpPercent]` | all |
| `MASS` | `[mass]` | all |
| `BLOCK_COUNT` | `[blockCount]` | all |
| `SECTOR` | `[sector]` | all |
| `SYSTEM` | `[system]` | all |
| `NAME` | `[name]` | all |
| `DOCKED` | `[docked]` | all |
| `CLOAKED` | `[cloaked]` | all |
| `JAMMING` | `[jamming]` | all |
| `SPEED` | `[speed]` | all |
| `REACTORIDACTIVE` | `[activeReactorId]` | reactor |
| `REACTORRECHARGEACTIVE` | `[activeReactorRecharge]` | reactor |
| `REACTORCONSUMPIONACTIVE` | `[activeReactorConsumption]` | reactor |
| `REACTORCONSUMPIONPERCENTACTIVE` | `[activeReactorConsumptionPercent]` | reactor |
| `REACTORIDX` | `[reactorId0]` | reactor |
| `REACTORSIZEX` | `[reactorSize0]` | reactor |
| `REACTORHPX` | `[reactorHp0]` | reactor |
| `REACTORMAXHPX` | `[reactorHp0]` | reactor |
| `SHIELDIDX` | `[shieldId0]` | reactor |
| `SHIELDPERCENTX` | `[shieldPercent0]` | reactor |
| `SHIELDHPX` | `[shieldHp0]` | reactor |
| `SHIELDCAPX` | `[shieldMaxHp0]` | reactor |
| `SHIELDRADIUSX` | `[shieldRadius0]` | reactor |
| `MISSILE_CAPACITY` | `[missileCapacity]` | all |
| `MISSILE_CAPACITY_MAX` | `[missileCapacityMax]` | all |
| `CANNON_CAPACITY` | `[cannonCapacity]` | all |
| `CANNON_CAPACITY_MAX` | `[cannonCapacityMax]` | all |
| `BEAM_CAPACITY` | `[beamCapacity]` | all |
| `BEAM_CAPACITY_MAX` | `[beamCapacityMax]` | all |

Indexed families accept other decimal indices as well (the native `takesIndex=1000`
is metadata, not a parser limit). The duplicate `reactorHp` declarations are a
native bug: `REACTORHPX` consumes the token before `REACTORMAXHPX`, so native
`[reactorHp0]` represents current HP. No distinct maximum-HP token is declared.
Hosts can expose an explicit extension such as `[reactorMaxHp0]`; it is not
advertised as a native variable. Each source enum is retained in the catalog so
this ambiguity remains inspectable.

## Native pipeline coverage and adaptations

| Native facility | Integration |
|---|---|
| Saved per-entity text and asynchronous missing content | Exact Decoder text keys; `update(text)` replaces loading text when the host obtains it |
| Six orientations and nested docking | Local native face frame composed with the owning entity transform |
| Style aliases, five font sizes, colors, offsets, multiline and password | Parser and panel, with unit and GPU regression cases |
| Every simple/indexed replacement | Entity snapshot API; full catalog checked against native source |
| Dynamic manager calculations and formatting | Host-supplied values, refreshed by `update()` |
| Native screen theme and font resources | Host-owned texture/font, installation-backed examples |
| Text distance and depth, screen background | Separate surfaces; text-only distance cutoff; Three.js frustum culling |
| Mod `TextBoxDrawListener` preDraw/draw/preDrawBackground | Host owns render scheduling and exposed `root`, `text`, `background` meshes; Java callbacks are not executed |
| `Shaderable` time/resolution fields | Native text draw does not bind an animated shader; no fabricated animation |
| Text download request / multiplayer protocol | Host data responsibility; this library makes no game-server requests |

## Deliberate browser adaptations and limits

- Native fonts and backgrounds come from the user's installation, never the package.
  Examples use `screen-gui-blue.png`; hosts can supply another screen variant.
- Canvas glyph rasterization uses the native font and outline but browser metrics
  and antialiasing can differ from Java UnicodeFont. Pixel-identical client output
  is not claimed. Hosts supply suitable fallback fonts for missing glyphs.
- Styles reset offsets on every parse, fixing the native cached-offset carry-over.
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
actual external Monda/screen assets and checks GPU pixels on all six orientations,
text changes, calculated-value publication/cache invalidation, password suppression,
depth occlusion, distance and runtime errors.
The interactive example is `/display.html`. Its cube supports use neutral
materials to make the supplemental screen/text pass easy to inspect. `/isanth.html`
and `/inspection.html` retain the existing native block and LOD materials.

### Development receipt — 2026-09-23

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
