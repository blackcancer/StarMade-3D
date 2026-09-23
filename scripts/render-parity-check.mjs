#!/usr/bin/env node
/**
 * @fileoverview Reproducible local WebGL2 regression execution with Chromium CDP.
 *
 * Builds the isolated browser fixture, evaluates it in a blank CDP page, runs pixel
 * assertions, writes JSON/PNG evidence and tears down the browser and temporary files.
 * Requires Chromium; on Linux use xvfb-run -a when headless GPU creation is unavailable.
 */
import { build } from 'esbuild';
import { readShaderCorpus } from './shader-corpus.mjs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const useGameAssets = process.argv.includes('--game-assets');
const output = resolve(process.env.STARMADE_RENDER_OUTPUT ?? join(root, useGameAssets ? 'artifacts/render-game-assets' : 'artifacts/render-parity'));
const executable = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium';
const work = await mkdtemp(join(tmpdir(), 'starmade-render-'));
await mkdir(output, { recursive: true });
let browser, socket;
const runtimeErrors = [];
const browserLog = [];
let report = { ok: false, startedAt: new Date().toISOString(), runtimeErrors };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  console.log('Building fixture');
  await build({ absWorkingDir: root, entryPoints: [useGameAssets ? 'tests/browser/gameAssets.ts' : 'tests/browser/renderParity.ts'],
    bundle: true, format: 'iife', platform: 'browser', outfile: join(work, 'fixture.js'), sourcemap: true });
  const bundle = await readFile(join(work, 'fixture.js'), 'utf8');
  const html = '<h1>StarMade WebGL2 probes</h1><canvas></canvas><pre>Running...</pre>';
  const flags = [
    `--user-data-dir=${join(work, 'profile')}`, '--remote-debugging-port=0',
    '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--window-size=900,900', 'about:blank'
  ];
  if (process.getuid?.() === 0) flags.unshift('--no-sandbox');
  if (!process.env.DISPLAY) flags.unshift('--headless=new');
  console.log('Starting Chromium');
  browser = spawn(executable, flags, { stdio: ['ignore', 'pipe', 'pipe'] });
  browser.stdout.on('data', data => browserLog.push(data.toString()));
  browser.stderr.on('data', data => browserLog.push(data.toString()));
  let spawnError;
  browser.on('error', error => { spawnError = error; });
  let port;
  for (let attempt = 0; attempt < 200; attempt++) {
    if (spawnError) throw spawnError;
    if (browser.exitCode !== null) throw new Error(`Chromium exited: ${browser.exitCode}`);
    try { port = (await readFile(join(work, 'profile/DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
    catch { await delay(100); }
  }
  if (!port) throw new Error('Chromium CDP startup timeout');
  const base = `http://127.0.0.1:${port}`;
  console.log('CDP ready', base);
  const info = await (await fetch(`${base}/json/version`)).json();
  report.browser = info.Browser;
  const page = await (await fetch(`${base}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails);
    const entry = pending.get(message.id);
    if (entry) { clearTimeout(entry.timer); pending.delete(message.id);
      message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 60000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  console.log('CDP socket open');
  await send('Runtime.enable'); await send('Page.enable');
  // Evaluate the generated fixture directly. The browser needs no HTTP access,
  // including in managed environments that disable navigation to local servers.
  await send('Runtime.evaluate', { expression: `document.body.innerHTML=${JSON.stringify(html)}` });
  if (useGameAssets) {
    if (!process.env.STARMADE_DIR) throw new Error('STARMADE_DIR is required for real-asset probes');
    const gameRoot = resolve(process.env.STARMADE_DIR);
    const assetRoot = join(gameRoot, 'data/models/lod');
    const resources = {}, manifest = [];
    /**
     * Collects caller-owned LOD resources for isolated, network-free transport.
     * @param {string} directory - Directory below the caller's LOD asset root.
     * @returns {Promise<void>} Resolves after files and hashes are collected.
     * @throws {Error} When a required directory or resource cannot be read.
     * @remarks Symbolic links and unrelated file types are not followed.
     */
    async function collect(directory) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) { await collect(path); continue; }
        if (!entry.isFile() || !/\.(?:png|xml|scene|material)$/i.test(entry.name)) continue;
        const bytes = await readFile(path);
        const name = relative(assetRoot, path).replaceAll('\\', '/');
        resources[`/game/${name}`] = `data:${extname(name).toLowerCase() === '.png' ? 'image/png' : 'text/plain;charset=utf-8'};base64,${bytes.toString('base64')}`;
        manifest.push({ path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
    }
    await collect(assetRoot);
    const config = await readFile(join(gameRoot, 'data/config/mainConfig.xml'), 'utf8');
    report.sourceAssets = { count: manifest.length, mainConfigSha256: createHash('sha256').update(config).digest('hex') };
    await writeFile(join(output, 'asset-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await send('Runtime.evaluate', { expression: `globalThis.gameFixture=${JSON.stringify({ config, resources })}` });
  }
  console.log('Evaluating isolated browser fixture');
  await send('Runtime.evaluate', { expression: `globalThis.testShaderCorpus=${JSON.stringify(readShaderCorpus())}` });
  await send('Runtime.evaluate', { expression: bundle });
  let result;
  for (let attempt = 0; attempt < (useGameAssets ? 600 : 180); attempt++) {
    const value = await send('Runtime.evaluate', { expression: 'window.parityResult', returnByValue: true });
    result = value.result?.value;
    if (result || runtimeErrors.length > 0) break;
    await delay(250);
  }
  console.log('Page result', result?.ok, result?.checks?.length);
  if (!result) throw new Error(`No completed GPU result (${runtimeErrors.length} runtime exceptions)`);
  if (result.contactSheet) {
    await writeFile(join(output, 'lod-contact-sheet.png'), Buffer.from(result.contactSheet.split(',')[1], 'base64'));
    delete result.contactSheet;
  }
  report = { ...report, ...result, ok: result.ok && runtimeErrors.length === 0 };
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(output, 'probe.png'), Buffer.from(screenshot.data, 'base64'));
  await send('Browser.close').catch(() => {});
} catch (error) { report.error = String(error); console.error(error); }
finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await delay(300); }
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(output, 'chromium.log'), browserLog.join(''));
  await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
