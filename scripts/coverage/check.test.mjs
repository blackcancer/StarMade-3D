import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { assessCoverage } from './check.mjs';
const root = resolve('.');
const expected = ['src/main.ts'];
const valid = () => ({ files: [{path: resolve('dist/main.js'), totalLineCount: 10, coveredLineCount: 10,
  totalBranchCount: 2, coveredBranchCount: 2, totalFunctionCount: 1, coveredFunctionCount: 1}] });
test('accepts exact 100% counters, without rounding', () => {
  assert.deepEqual(assessCoverage(valid(), expected, root), []);
  const summary = valid(); summary.files[0].totalLineCount = 100000;
  summary.files[0].coveredLineCount = 99999;
  assert.match(assessCoverage(summary, expected, root).join(), /100% required/);
});
test('rejects absent/empty reports and inventory', () => {
  for (const report of [null, {}, {files: []}]) assert.notEqual(assessCoverage(report, expected, root).length, 0);
  assert.notEqual(assessCoverage(valid(), [], root).length, 0);
});
test('rejects missing or duplicate modules and denominator pollution', () => {
  assert.match(assessCoverage(valid(), [...expected, 'src/unimported.ts'], root).join(), /Missing runtime/);
  const summary = valid(); summary.files.push(summary.files[0]);
  assert.match(assessCoverage(summary, expected, root).join(), /Duplicate/);
  summary.files[1] = {...summary.files[0], path: resolve('node_modules/ignored.js')};
  assert.match(assessCoverage(summary, expected, root).join(), /Unexpected module/);
});
test('rejects uncovered branches/functions, negative, fractional and invalid counters', () => {
  for (const metric of ['Line', 'Branch', 'Function']) {
    for (const covered of [0, -1, NaN, Infinity, 0.5, 999]) {
      const summary = valid(); summary.files[0][`covered${metric}Count`] = covered;
      assert.notEqual(assessCoverage(summary, expected, root).length, 0);
    }
  }
  const summary = valid(); summary.files[0].totalLineCount = 0; summary.files[0].coveredLineCount = 0;
  assert.match(assessCoverage(summary, expected, root).join(), /empty line/);
});

test('maps every emitted module back to exactly one source, without hiding omissions', () => {
  const root = process.cwd();
  const file = {path: `${root}/dist/one.js`, totalLineCount: 1, coveredLineCount: 1,
    totalBranchCount: 1, coveredBranchCount: 1, totalFunctionCount: 1, coveredFunctionCount: 1};
  assert.deepEqual(assessCoverage({files:[file]}, ['src/one.ts'], root), []);
  assert.ok(assessCoverage({files:[file]}, ['src/one.ts', 'src/two.ts'], root).some(x => x.includes('Missing')));
  assert.ok(assessCoverage({files:[file]}, ['src/one.ts', 'src/one.js'], root).some(x => x.includes('ambiguous')));
  assert.ok(assessCoverage({files:[file]}, ['src/two.ts'], root).some(x => x.includes('Unmapped')));
});
