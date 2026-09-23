import { afterAll } from 'vitest';
import { takeCoverage, stopCoverage } from 'node:v8';
import { readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// One single-fork Vitest process runs the explicitly enumerated unit files.
// Flushing after EACH file resets V8 counters and produces overlapping fragments
// that Node's line reporter can merge inconsistently. Flush once at the end,
// then stop so an implicit exit flush cannot add a second, reset fragment.
const root = fileURLToPath(new URL('../../', import.meta.url));
const expected = readdirSync(join(root, 'tests')).filter(name => name.endsWith('.test.ts')).length;
const key = Symbol.for('starmade.coverage.completedUnitFiles');
process[key] ??= 0;
afterAll(() => {
  process[key]++;
  if (process[key] === expected) {
    takeCoverage();
    stopCoverage();
    writeFileSync(join(root, 'coverage/flush-verification.json'), JSON.stringify({expectedFiles:expected, completedFiles:process[key], flushes:1},null,2)+'\n');
  }
});
