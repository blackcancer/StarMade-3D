/** @fileoverview Native texture precedence and containment tests; no game assets required. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveBlockTextureAsset } from './block-texture-asset.mjs';

for (const testCase of [
  { title: 'RGBA TGA beats the legacy RGB normal PNG', request: '/Default/256/t000_NRM.png', files: ['t000_NRM.png.zip', 't000_NRM.tga.zip'], expected: 't000_NRM.tga.zip', encoding: 'tga' },
  { title: 'normal PNG remains supported when the pack has no TGA', request: '/Default/256/t000_NRM.png', files: ['t000_NRM.png.zip'], expected: 't000_NRM.png.zip', encoding: 'png' },
  { title: 'a TGA-only normal atlas is available', request: '/Default/256/t003_NRM.png', files: ['t003_NRM.tga.zip'], expected: 't003_NRM.tga.zip', encoding: 'tga' },
  { title: 'color atlases retain PNG selection', request: '/Default/256/t000.png', files: ['t000.png.zip', 't000.tga.zip'], expected: 't000.png.zip', encoding: 'png' },
  { title: 'missing resources do not become blank successful images', request: '/Default/256/missing.png', files: [], expected: null },
  { title: 'path traversal cannot expose a sibling directory', request: '/../other/t000.png', files: [], expected: null },
  { title: 'non-image suffixes are not served', request: '/Default/256/t000.txt', files: ['t000.txt.zip'], expected: null }
]) test(testCase.title, () => {
  const root = mkdtempSync(join(tmpdir(), 'starmade-texture-test-'));
  try {
    const pack = join(root, 'Default/256'); mkdirSync(pack, { recursive: true });
    for (const file of testCase.files) writeFileSync(join(pack, file), 'fixture');
    const result = resolveBlockTextureAsset(root, testCase.request);
    assert.deepEqual(result, testCase.expected ? { path: join(pack, testCase.expected), encoding: testCase.encoding } : null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
