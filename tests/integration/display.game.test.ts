import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { STARMADE_DISPLAY_VARIABLES } from '../../src/index.js';

it('covers every Replacements.Type declaration from the pinned StarMade-Open source, including native collisions', () => {
  const lock = JSON.parse(readFileSync('references.lock.json', 'utf8'));
  const root = process.env.STARMADE_OPEN_DIR ?? resolve(lock.gameSource.directory);
  const source = readFileSync(resolve(root, 'src/main/java/org/schema/game/client/view/textbox/Replacements.java'), 'utf8');
  const entries = [...source.matchAll(/\b([A-Z][A-Z_]+)\("([^"]+)", REPLACE_AVAILABILITY_(\w+), (1000, )?new RFactory/g)]
    .map(([, id, token, availability, indexed]) => ({ id, token, power: { ALL: 'all', OLD_POWER: 'legacy', NEW_POWER: 'reactor' }[availability], indexed: Boolean(indexed) }));
  expect(entries).toHaveLength(46);
  expect(STARMADE_DISPLAY_VARIABLES).toEqual(entries);
});
