import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const output = process.env.STARMADE_LOD_OUTPUT ?? 'validation/blueprint-lod';
const url = process.env.STARMADE_LOD_URL ?? 'http://127.0.0.1:8001/isanth-lod.html';
await mkdir(output, { recursive: true });
const profile = await mkdtemp('/tmp/starmade-blueprint-lod-');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], requests = [], pending = new Map(), views = [];
let socket, nextId = 0, browserError;
const browser = spawn(process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', [
  // Disposable test profile: avoid waiting for an unavailable desktop keyring.
  '--password-store=basic', '--use-mock-keychain',
  '--headless=new', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore' });
browser.once('error', error => { browserError = error; });

try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (browserError) throw browserError;
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
    catch { await delay(100); }
  }
  assert.ok(port, 'Chromium debugging endpoint did not start');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = pages.find(value => value.type === 'page');
  assert.ok(page, 'Chromium page missing');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`${method} timeout`)); }, 30000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  socket.onmessage = event => {
    const message = JSON.parse(event.data), operation = pending.get(message.id);
    if (operation) {
      clearTimeout(operation.timer); pending.delete(message.id);
      if (message.error) operation.reject(Error(JSON.stringify(message.error)));
      else operation.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push({ kind: 'exception', detail: message.params });
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push({ kind: 'console', detail: message.params });
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
    if (message.method === 'Network.loadingFailed') errors.push({ kind: 'network', detail: message.params });
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) errors.push({ kind: 'http', detail: message.params.response });
  };
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
  const navigationStart = performance.now();
  await send('Page.navigate', { url });
  let ready;
  for (let attempt = 0; attempt < 160; attempt++) {
    ready = await evaluate('window.__STARMADE_LOD_READY__');
    if (ready) break;
    if (errors.length) throw Error(`LOD loading failed: ${JSON.stringify(errors)}`);
    await delay(250);
  }
  const navigationToReadyMs = performance.now() - navigationStart;
  assert.ok(ready, 'LOD scene did not become ready');
  assert.equal(ready.source, 'sidecar');
  assert.equal(ready.level, 2);
  assert.ok(Number.isFinite(ready.firstVisibleMs) && ready.firstVisibleMs > 0 && ready.firstVisibleMs < 8000,
    `LOD first-visible budget exceeded: ${ready.firstVisibleMs} ms`);
  assert.ok(Number.isSafeInteger(ready.bytes) && ready.bytes > 0 && ready.bytes < 512 * 1024,
    `LOD transfer budget exceeded: ${ready.bytes} bytes`);
  assert.ok(Number.isSafeInteger(ready.triangles) && ready.triangles > 0, 'LOD has no triangles');
  assert.ok(Number.isSafeInteger(ready.drawCalls) && ready.drawCalls > 0, 'LOD has no draw calls');
  assert.ok(Number.isSafeInteger(ready.entities) && ready.entities >= 2, 'Isanth docking hierarchy missing');
  assert.ok(ready.cache?.regions > 0, 'Sidecar cache receipts missing');
  const forbidden = requests.filter(request => {
    const pathname = new URL(request).pathname;
    return pathname.startsWith('/starmade-assets/') && pathname !== '/starmade-assets/blueprints/isanth.lod.json';
  });
  assert.deepEqual(forbidden, [], 'LOD requested native textures, shaders or configuration');
  await evaluate('window.__STARMADE_LOD_VIEW__.renderer.setAnimationLoop(null); window.requestAnimationFrame = () => 0');
  await delay(100);
  const center = await evaluate('window.__STARMADE_LOD_VIEW__.controls.target.toArray()');
  const offsets = [
    ['overview', [32, 10, 35]], ['opposite', [-32, 10, -35]],
    ['side', [-32, 5, 20]], ['top', [0, 45, 0.1]]
  ];
  for (const [name, offset] of offsets) {
    const position = center.map((value, axis) => value + offset[axis]);
    const metrics = await evaluate(`(() => {
      const { renderer, scene, camera, controls } = window.__STARMADE_LOD_VIEW__;
      controls.enableDamping = false;
      camera.position.set(...${JSON.stringify(position)});
      controls.target.set(...${JSON.stringify(center)});
      controls.update(); camera.updateMatrixWorld(true);
      renderer.render(scene, camera);
      return { triangles: renderer.info.render.triangles, drawCalls: renderer.info.render.calls,
        position: camera.position.toArray(), target: controls.target.toArray(),
        image: renderer.domElement.toDataURL('image/png') };
    })()`);
    assert.ok(metrics.triangles > 0 && metrics.drawCalls > 0, `Empty rendered LOD view: ${name}`);
    assert.ok(metrics.image.startsWith('data:image/png;base64,'), 'Canvas capture failed');
    await writeFile(join(output, `${name}.png`), Buffer.from(metrics.image.slice('data:image/png;base64,'.length), 'base64'));
    const { image, ...measured } = metrics;
    views.push({ name, ...measured });
  }
  assert.deepEqual(errors, [], 'Browser reported LOD errors');
  await writeFile(join(output, 'result.json'), JSON.stringify({ ok: true, url, navigationToReadyMs, ready, requests, views, errors }, null, 2));
  console.log(JSON.stringify({ ok: true, ...ready, navigationToReadyMs, views: views.length, output }, null, 2));
} catch (error) {
  await writeFile(join(output, 'result.json'), JSON.stringify({ ok: false, url, error: String(error.stack ?? error), errors, requests, views }, null, 2));
  throw error;
} finally {
  for (const operation of pending.values()) clearTimeout(operation.timer);
  socket?.close();
  if (browser.exitCode === null && !browserError) {
    const stopped = new Promise(resolve => browser.once('exit', resolve));
    browser.kill(); await Promise.race([stopped, delay(2000)]);
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
