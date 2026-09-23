import { mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { assessCoverage, assertNoCoverageExclusions, runtimeInventory } from './check.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const check = !process.argv.includes('--report-only');
const version = process.versions.node.split('.').map(Number);
if (version[0] < 22 || (version[0] === 22 && version[1] < 16)) {
  throw new Error('Coverage requires Node >=22.16.0 (public native V8 coverage reporters)');
}
function run(args) {
  const env = { ...process.env };
  delete env.NODE_V8_COVERAGE;
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
// dist is generated only; remove stale modules so the measured inventory is exact.
rmSync(join(root, 'dist'), { force: true, recursive: true });
if (run(['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json']) !== 0) process.exit(1);
rmSync(join(root, 'coverage'), { force: true, recursive: true });
mkdirSync(join(root, 'coverage'), { recursive: true });
const testStatus = run([
  '--test', '--experimental-test-coverage',
  `--test-coverage-include=${join(root, 'dist').replaceAll('\\', '/')}/**/*.js`,
  '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=./scripts/coverage/json-reporter.mjs', '--test-reporter-destination=coverage/native-summary.json',
  '--test-reporter=lcov', '--test-reporter-destination=coverage/lcov.info',
  'scripts/coverage/suite.cjs'
]);
let summary;
try { summary = JSON.parse(readFileSync(join(root, 'coverage/native-summary.json'), 'utf8')); }
catch { summary = null; }
let collection;
try { collection = JSON.parse(readFileSync(join(root, 'coverage/flush-verification.json'), 'utf8')); }
catch { collection = null; }
const expectedFiles = readdirSync(join(root, 'tests')).filter(name => name.endsWith('.test.ts')).length;
const collectionValid = collection?.flushes === 1 && collection?.completedFiles === expectedFiles && collection?.expectedFiles === expectedFiles && expectedFiles > 0;
const inventory = runtimeInventory(root);
const failures = [
  ...(testStatus ? ['Tests failed; coverage cannot qualify the package'] : []),
  ...(!collectionValid ? ['Incomplete or repeated V8 collection; coverage cannot qualify the package'] : []),
  ...assessCoverage(summary, inventory, root),
  ...assertNoCoverageExclusions(root)
];
const verdict = {
  schemaVersion: 1,
  measuredAt: new Date().toISOString(),
  nodeVersion: process.versions.node,
  scope: 'All src/**/*.ts and src/**/*.js runtime modules including maintained vendor code. Native V8 counters measure the emitted JavaScript (dist); every source module must map one-to-one to a measured built module. Non-executable TypeScript types and .d.ts declarations are not line targets.',
  exclusions: ['third-party node_modules', 'tests', 'tooling', 'examples', 'type-only .d.ts declarations'],
  note: 'GLSL string content is not GPU branch coverage. Game visual parity is a separate qualification.',
  required: { lines: 100, branches: 100, functions: 100 },
  testsPassed: testStatus === 0,
  collection,
  qualified: failures.length === 0,
  inventory,
  totals: summary?.totals ?? null,
  failures
};
writeFileSync(join(root, 'coverage/verdict.json'), JSON.stringify(verdict, null, 2) + '\n');
const rows = (summary?.files ?? []).map((f) => `| ${relative(root, f.path).replaceAll('\\', '/')} | ${f.coveredLineCount}/${f.totalLineCount} | ${f.coveredBranchCount}/${f.totalBranchCount} | ${f.coveredFunctionCount}/${f.totalFunctionCount} |`);
writeFileSync(join(root, 'coverage/REPORT.md'), [
  '# Runtime coverage', '', `Node ${process.versions.node}; generated ${verdict.measuredAt}.`, '',
  `**100% gate: ${verdict.qualified ? 'PASS' : 'FAIL'}**. Tests: ${verdict.testsPassed ? 'PASS' : 'FAIL'}.`, '',
  verdict.scope, '', verdict.note, '',
  '| Runtime module | Lines | V8 branches | Functions |', '|---|---:|---:|---:|', ...rows, '',
  '## Remaining failures', '', ...failures.map((f) => `- ${f}`), ''
].join('\n'));
console.log(`\nCoverage gate: ${verdict.qualified ? 'PASS' : 'FAIL'} (${failures.length} failures). See coverage/REPORT.md.`);
process.exitCode = testStatus || (check && failures.length > 0 ? 1 : 0);
