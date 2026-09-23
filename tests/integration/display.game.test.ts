import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { STARMADE_DISPLAY_VARIABLES, parseStarMadeDisplayText } from '../../src/index.js';

it('covers every Replacements.Type declaration from the pinned StarMade-Open source, including corrected reactor names', () => {
  const lock = JSON.parse(readFileSync('references.lock.json', 'utf8'));
  const root = process.env.STARMADE_OPEN_DIR ?? resolve(lock.gameSource.directory);
  const source = readFileSync(resolve(root, 'src/main/java/org/schema/game/client/view/textbox/Replacements.java'), 'utf8');
  const entries = [...source.matchAll(/\b([A-Z][A-Z_]+)\("([^"]+)", REPLACE_AVAILABILITY_(\w+), (1000, )?new RFactory/g)]
    .map(([, id, token, availability, indexed]) => ({ id, token, power: { ALL: 'all', OLD_POWER: 'legacy', NEW_POWER: 'reactor' }[availability], indexed: Boolean(indexed) }));
  expect(entries).toHaveLength(56);
  expect(STARMADE_DISPLAY_VARIABLES).toEqual(entries);
});


it('tracks native display bounds, default font and all explicit font indices',()=>{
  const lock=JSON.parse(readFileSync('references.lock.json','utf8'));
  const root=process.env.STARMADE_OPEN_DIR ?? resolve(lock.gameSource.directory);
  const native=readFileSync(resolve(root,'src/main/java/org/schema/game/client/view/textbox/AbstractTextBox.java'),'utf8');
  expect(native).toContain('MAX_OFFSET = 10.0f');expect(native).toContain('MAX_STYLED_SEGMENTS = 32');
  for(const size of [16,18,20,24,30,40,70,100,300])expect(native).toContain('Arial'+size);
  expect(parseStarMadeDisplayText('<style>o=20:0:-20</style>X').offset).toEqual([10,0,-10]);
  const settings=readFileSync(resolve(root,'src/main/java/org/schema/schine/graphicsengine/core/settings/EngineSettings.java'),'utf8');
  expect(settings).toMatch(/MAX_DISPLAY_MODULE_TEXT_DRAW_DISTANCE\([^\n]*, 500, new StaticStates/);
  const fonts=readFileSync(resolve(root,'src/main/java/org/schema/schine/graphicsengine/forms/font/FontLibrary.java'),'utf8');
  expect(fonts).toContain('midFont = getBlenderProMedium17()');
  expect(fonts).toMatch(/boldBlenderProMedium17 = deriveFont\(boldBlenderProMedium17, 15,/);
  expect(parseStarMadeDisplayText('default').fontSize).toBe(15);
});
