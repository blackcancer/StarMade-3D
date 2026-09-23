import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const normalize = (path) => path.split(sep).join('/');
function walk(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(root, entry.name)) : [join(root, entry.name)]);
}

/** Explicit coverage inventory: every shipped module, including maintained vendor code. */
export function runtimeInventory(root) {
  const source = join(root, 'src');
  return walk(source).filter((path) => /\.(?:ts|js)$/.test(path) && !path.endsWith('.d.ts'))
    .map((path) => normalize(join('src', relative(source, path)))).sort();
}

/** Fail closed for missing reports, missing modules, exclusions, invalid or uncovered counters. */
export function assessCoverage(summary, expected, root) {
  const failures = [];
  if (!summary || !Array.isArray(summary.files) || !summary.files.length) {
    return ['Coverage report is missing or empty'];
  }
  if (!Array.isArray(expected) || !expected.length) return ['Runtime inventory is empty'];
  const files = new Map();
  for (const file of summary.files) {
    const actualPath = normalize(relative(root, resolve(file.path)));
    const candidates = actualPath.startsWith('dist/') && actualPath.endsWith('.js')
      ? [`src/${actualPath.slice(5, -3)}.ts`, `src/${actualPath.slice(5)}`].filter(path => expected.includes(path))
      : [actualPath];
    if (candidates.length !== 1) { failures.push(`Unmapped or ambiguous built module: ${actualPath}`); continue; }
    const path = candidates[0];
    if (files.has(path)) failures.push(`Duplicate coverage module: ${path}`);
    files.set(path, file);
  }
  for (const path of expected) {
    const file = files.get(path);
    if (!file) { failures.push(`Missing runtime module: ${path}`); continue; }
    for (const metric of ['Line', 'Branch', 'Function']) {
      const total = file[`total${metric}Count`];
      const covered = file[`covered${metric}Count`];
      if (!Number.isSafeInteger(total) || !Number.isSafeInteger(covered) || total < 0 || covered < 0 || covered > total) {
        failures.push(`${path}: invalid ${metric.toLowerCase()} counters`);
      } else if (covered !== total) {
        failures.push(`${path}: ${covered}/${total} ${metric.toLowerCase()}s (100% required)`);
      }
    }
    if (file.totalLineCount === 0) failures.push(`${path}: empty line inventory`);
  }
  for (const path of files.keys()) {
    if (!expected.includes(path)) failures.push(`Unexpected module in coverage denominator: ${path}`);
  }
  return failures;
}

export function assertNoCoverageExclusions(root) {
  // Split the marker to avoid this checker flagging its own documentation.
  const marker = /(?:istanbul|c8|v8)\s+ignore|node:coverage\s+(?:disable|ignore)/i;
  return walk(join(root, 'src')).filter((file) => /\.(?:ts|js)$/.test(file))
    .filter((file) => marker.test(readFileSync(file, 'utf8')))
    .map((file) => `Coverage exclusion forbidden in production source: ${normalize(relative(root, file))}`);
}
