#!/usr/bin/env node
/**
 * @fileoverview Executes the actual examples/visual-test/index.html entry with native assets.
 *
 * Starts the real Vite middleware, fetches resources through its HTTP routes, then
 * transports those exact response bytes into a blank Chromium page. This avoids
 * depending on browser navigation policies without replacing the renderer/loader.
 * The only main.ts instrumentation exposes references for read-only assertions.
 * No game resources are written to the report or redistributed.
 *
 * @example
 * STARMADE_DIR=/srv/StarMade xvfb-run -a npm run test:visual:index
 * @remarks Needs Chromium, ImageMagick and unzip, as does the asset middleware.
 */
import { build } from 'esbuild';
import { createServer } from 'vite';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.env.STARMADE_INDEX_OUTPUT ?? join(root, 'artifacts/visual-index'));
const game = process.env.STARMADE_DIR;
const work = await mkdtemp(join(tmpdir(), 'starmade-index-'));
const delay = ms => new Promise(done => setTimeout(done, ms));
const hash = data => createHash('sha256').update(data).digest('hex');
const checks = [], errors = [], consoleMessages = [], browserLog = [];
const report = { ok: false, startedAt: new Date().toISOString(), entry: 'examples/visual-test/index.html',
  transport: 'Exact Vite HTTP response bytes, delivered to a blank CDP page; actual main.ts renderer and RAF loop', checks, errors };
let server, browser, socket;
function check(name, ok, detail) { checks.push({ name, ok: Boolean(ok), detail }); }
await mkdir(output, { recursive: true });
try {
  if (!game) throw new Error('STARMADE_DIR is required');
  server = await createServer({ configFile: join(root, 'vite.config.ts'), logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false } });
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const manifest = [], resources = {}, atlasChecks = [];
  const urls = ['/starmade-assets/config/mainConfig.xml', '/starmade-assets/shaders.json'];
  /** Enumerates only resources required by the LOD loader, without following links. */
  async function collect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await collect(path);
      else if (entry.isFile() && /\.(png|scene|xml|material|jpg|jpeg)$/i.test(entry.name))
        urls.push('/starmade-assets/models/lod/' + relative(join(game, 'data/models/lod'), path).replaceAll('\\', '/'));
    }
  }
  await collect(join(game, 'data/models/lod'));
  for (const n of ['t000', 't001', 't002', 't003', 'overlays', 't000_NRM', 't001_NRM', 't002_NRM', 't003_NRM'])
    urls.push(`/starmade-assets/textures/block/Default/256/${n}.png`);
  for (const n of ['custom', 'custom_NRM']) urls.push(`/starmade-assets/custom-block-textures/256/${n}.png`);
  const image = (data, input) => execFileSync(process.env.MAGICK_PATH ?? 'magick', [input + ':-', '-depth', '8', 'rgba:-'],
    { input: data, maxBuffer: 128 * 1024 * 1024 });
  for (const url of urls) {
    // Native image comparisons block long enough for Vite to close idle sockets.
    // Do not reuse stale keep-alive connections after these synchronous oracles.
    const response = await fetch(base + url, { headers: { Connection: 'close' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    manifest.push({ url, bytes: bytes.length, sha256: hash(bytes) });
    resources[url] = `data:${response.headers.get('content-type')};base64,${bytes.toString('base64')}`;
    if (/\/t\d{3}_NRM.png$/.test(url)) {
      const name = url.split('/').pop();
      const zip = join(game, 'data/textures/block/Default/256', name.replace('.png', '.tga.zip'));
      const tga = execFileSync('unzip', ['-p', zip], { maxBuffer: 128 * 1024 * 1024 });
      const original = image(tga, 'tga'), served = image(bytes, 'png');
      const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
      check(`HTTP ${name} retains all native RGBA bytes`, original.equals(served), { width, height,
        originalSha256: hash(original), servedSha256: hash(served) });
      // Include material-data pixels at alpha zero and at intermediate/opaque alpha.
      const samples = [];
      for (const desired of [0, 32, 79, 127, 128, 200, 255]) {
        for (let i = 0; i < original.length; i += 4) if (original[i + 3] === desired) {
          samples.push({ x: (i / 4) % width, y: Math.floor(i / 4 / width), rgba: [...original.subarray(i, i + 4)] }); break;
        }
      }
      atlasChecks.push({ layer: Number(name.slice(1, 4)), samples, width, height });
    }
  }
  await writeFile(join(output, 'http-assets.json'), JSON.stringify(manifest, null, 2));
  console.log('Fetched actual middleware resources:', manifest.length);
  const entry = `import {FileLoader,ImageLoader} from 'three';
const assets=globalThis.__ASSETS__;
globalThis.__LOAD_STATE__={pending:0,requests:[],failures:[]};
function resource(url){if(url.startsWith('data:')||url.startsWith('blob:'))return url;
const path=decodeURIComponent(new URL(url,'https://fixture.invalid/').pathname);__LOAD_STATE__.requests.push(path);
if(!assets[path])throw Error('Missing resource '+path);return assets[path];}
const originalFetch=globalThis.fetch;globalThis.fetch=(url,opts)=>originalFetch(resource(typeof url==='string'?url:url.url),opts);
for(const cls of [FileLoader,ImageLoader]){const original=cls.prototype.load;cls.prototype.load=function(url,onLoad,onProgress,onError){
this.manager.setURLModifier(resource);__LOAD_STATE__.pending++;
return original.call(this,url,(...args)=>{__LOAD_STATE__.pending--;onLoad?.(...args);},onProgress,(err)=>{__LOAD_STATE__.pending--;__LOAD_STATE__.failures.push(String(url));onError?.(err);});};}
await import('./examples/visual-test/main.ts');`;
  const exposed = '{showcaseBlockLightSourceInputs,SHOWCASE_BLOCK_LIGHT_SHIFT,whiteLightSurfaceSourceMeshes,slabMeshes,renderer,preview,controls,sunShadowPipeline: typeof sunShadowPipeline !== "undefined" ? sunShadowPipeline : deskPointLightShadowPipeline,texturePack,whiteLightSurfaceCells,whiteLightBlockerWallMeshes,experimentalCubeMaterial,transparentCubeMaterial,lightSourceCubeMaterial,animatedForcefieldMesh}';
  const built = await build({ absWorkingDir: root, stdin: { contents: entry, resolveDir: root, loader: 'js' },
    bundle: true, write: false, format: 'esm', target: 'es2023', outdir: work,
    plugins: [{ name: 'observe-main', setup(b) { b.onLoad({ filter: /examples\/visual-test\/main\.ts$/ }, async ({ path }) => ({
      loader: 'ts', contents: await readFile(path, 'utf8') + `\nglobalThis.__VISUAL_SCENE__=${exposed};` })); } }] });
  const bundle = built.outputFiles.find(f => f.path.endsWith('.js')).text;
  const html = (await readFile(join(root, 'examples/visual-test/index.html'), 'utf8')).replace(/<script\s+type="module"\s+src="\.\/main.ts"><\/script>/, '');
  const css = await readFile(join(root, 'examples/visual-test/style.css'), 'utf8');
  report.sources = { mainSha256: hash(await readFile(join(root, 'examples/visual-test/main.ts'))), indexSha256: hash(html) };
  const flags = [`--user-data-dir=${join(work, 'profile')}`, '--remote-debugging-port=0', '--disable-dev-shm-usage',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--window-size=1400,1000', 'about:blank'];
  if (process.getuid?.() === 0) flags.unshift('--no-sandbox');
  if (!process.env.DISPLAY) flags.unshift('--headless=new');
  browser = spawn(process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', flags, { stdio: ['ignore', 'pipe', 'pipe'] });
  browser.stdout.on('data', b => browserLog.push(String(b))); browser.stderr.on('data', b => browserLog.push(String(b)));
  let spawnError; browser.on('error', e => spawnError = e);
  let port;
  for (let i = 0; i < 200; i++) {
    if (spawnError) throw spawnError;
    if (browser.exitCode !== null) throw Error('Chromium exited');
    try { port = (await readFile(join(work, 'profile/DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); }
  }
  if (!port) throw Error('CDP startup timeout');
  const cdp = `http://127.0.0.1:${port}`;
  report.browser = (await (await fetch(cdp + '/json/version')).json()).Browser;
  const page = (await (await fetch(cdp + '/json/list')).json()).find(p => p.type === 'page');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });
  let nextId = 0; const pending = new Map();
  socket.onmessage = event => {
    const m = JSON.parse(event.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
    if (m.method === 'Runtime.consoleAPICalled') consoleMessages.push({ type: m.params.type,
      text: m.params.args.map(a => a.value ?? a.description ?? '').join(' ') });
    if (m.method === 'Log.entryAdded') consoleMessages.push({ type: m.params.entry.level, text: m.params.entry.text });
    const p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.fail(Error(JSON.stringify(m.error))) : p.done(m.result); }
  };
  const send = (method, params = {}) => new Promise((done, fail) => {
    const id = ++nextId, timer = setTimeout(() => { pending.delete(id); fail(Error('CDP timeout ' + method)); }, 120000);
    pending.set(id, { done, fail, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  await send('Page.bringToFront');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await evaluate(`document.documentElement.innerHTML=${JSON.stringify(html)};let style=document.createElement('style');style.textContent=${JSON.stringify(css)};document.head.append(style);globalThis.__ASSETS__={};`);
  // Capture actual driver errors from the first draw. This deliberately does not mock GL.
  await evaluate(`globalThis.__DRAW_ERRORS__=[];for(const method of ['drawElements','drawArrays']){const original=WebGL2RenderingContext.prototype[method];
WebGL2RenderingContext.prototype[method]=function(...args){const result=original.apply(this,args);const error=this.getError();
if(error&&__DRAW_ERRORS__.length<30)__DRAW_ERRORS__.push({method,error});return result;};}`);
  for (const [url, data] of Object.entries(resources)) await evaluate(`__ASSETS__[${JSON.stringify(url)}]=${JSON.stringify(data)}`);
  await send('Runtime.evaluate', { expression: `globalThis.__START__=new Function('return (async()=>{'+${JSON.stringify(bundle)}+'})()')().catch(e=>{globalThis.__START_ERROR__=String(e.stack);});` });
  let state;
  for (let i = 0; i < 240; i++) {
    state = await evaluate(`({ready:!!globalThis.__VISUAL_SCENE__&&!!window.__STARMADE_3D_READY__,pending:globalThis.__LOAD_STATE__?.pending,error:globalThis.__START_ERROR__})`);
    if (state.error) throw Error(state.error);
    if (state.ready && state.pending === 0) break;
    await delay(250);
  }
  if (!state?.ready || state.pending !== 0) throw Error('Main page/assets did not finish: ' + JSON.stringify(state));
  await delay(500);
  const snapshot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(output, name), Buffer.from(r.data, 'base64')); };
  await snapshot('index.png');
  const gpu = await evaluate(`(()=>{const {renderer,sunShadowPipeline,texturePack}=__VISUAL_SCENE__,gl=renderer.getContext();
const debug=gl.getExtension('WEBGL_debug_renderer_info');
const result={contextLost:gl.isContextLost(),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,floatColorBuffer:!!gl.getExtension('EXT_color_buffer_float'),normalSamples:[]};
const previous=gl.getParameter(gl.FRAMEBUFFER_BINDING),framebuffer=gl.createFramebuffer();
for(const spec of ${JSON.stringify(atlasChecks)}){const t=texturePack.normalLayers.get(spec.layer);const texture=renderer.properties.get(t).__webglTexture;
gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
const status=gl.checkFramebufferStatus(gl.FRAMEBUFFER),samples=spec.samples.map(s=>{const bytes=new Uint8Array(4);gl.readPixels(s.x,s.y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return {...s,actual:[...bytes]};});
result.normalSamples.push({layer:spec.layer,status,samples});}
gl.bindFramebuffer(gl.FRAMEBUFFER,previous);gl.deleteFramebuffer(framebuffer);
const rt=sunShadowPipeline.renderTarget,depth=rt.texture.type===1015?new Float32Array(rt.width*rt.height*4):new Uint8Array(rt.width*rt.height*4);renderer.readRenderTargetPixels(rt,0,0,rt.width,rt.height,depth);
let occupied=0,non8bit=0;const levels=new Set();for(let i=0;i<depth.length;i+=4){const d=depth[i]/(depth instanceof Uint8Array?255:1);if(d>0&&d<1){occupied++;levels.add(d);if(Math.abs(d*255-Math.round(d*255))>0.01)non8bit++;}}
result.shadow={type:rt.texture.type,minFilter:rt.texture.minFilter,magFilter:rt.texture.magFilter,occupied,levels:levels.size,non8bit};
result.shadow.receiverMode=__VISUAL_SCENE__.experimentalCubeMaterial.uniforms.starMadeShadowMapArrayMode.value;
result.drawErrors=__DRAW_ERRORS__;result.load=__LOAD_STATE__;return result;})()`);
  report.gpu = gpu;
  check('Actual main page draws without WebGL errors or a lost context', !gpu.contextLost && gpu.drawErrors.length === 0, gpu.drawErrors);
  check('All requested page assets resolved and decoded', gpu.load.pending === 0 && gpu.load.failures.length === 0, { requests: gpu.load.requests.length, failures: gpu.load.failures });
  for (const atlas of gpu.normalSamples) check(`GPU layer ${atlas.layer} preserves packed material RGBA, including alpha zero`,
    atlas.status === 36053 && atlas.samples.every(s => s.rgba.every((v, i) => v === s.actual[i])), atlas.samples);
  check('Actual shadow map retains sub-8-bit depth resolution', gpu.floatColorBuffer && gpu.shadow.type === 1015 && gpu.shadow.non8bit > 100 && gpu.shadow.levels > 256, gpu.shadow);
  check('Raw shadow depth is not linearly interpolated as color', gpu.shadow.minFilter === 1003 && gpu.shadow.magFilter === 1003, gpu.shadow);
  check('Main sunlight is not modulated by colored block-source projection masks', gpu.shadow.receiverMode === 0, {mode:gpu.shadow.receiverMode});
  const sourcePlacement = await evaluate(`(()=>{const {showcaseBlockLightSourceInputs:sources,SHOWCASE_BLOCK_LIGHT_SHIFT:shift,whiteLightSurfaceSourceMeshes:meshes}=__VISUAL_SCENE__;
return meshes.map((m,i)=>({key:m.key,actual:sources[i].position,expected:m.cube.position.toArray().map((v,j)=>Math.round(v+shift[j]))}));})()`);
  check('Colored lamp voxels match their rendered 3D positions without flattening axes',
    sourcePlacement.length===3 && sourcePlacement.every(s=>s.actual.every((v,i)=>v===s.expected[i])),sourcePlacement);
  const corners = await evaluate(`(()=>{const map=new Map();for(const cell of __VISUAL_SCENE__.whiteLightSurfaceCells){if(cell.gridX<3||cell.gridX>6||cell.gridZ<3||cell.gridZ>6)continue;
const p=cell.geometry.getAttribute('position'),v=cell.geometry.getAttribute('ivert');
for(let i=0;i<v.count;i++){if(((v.getY(i)>>>2)&7)!==2)continue;const key=[p.getX(i)+cell.gridX,p.getZ(i)+cell.gridZ].join(',');const values=[(v.getX(i)>>>16)&31,(v.getX(i)>>>21)&31,(v.getX(i)>>>26)&31,(v.getW(i)>>>15)&31];
if(!map.has(key))map.set(key,[]);map.get(key).push(values);}}const shared=[...map].filter(([k,v])=>v.length>1);return {count:shared.length,mismatches:shared.filter(([k,v])=>v.some(x=>x.join(',')!==v[0].join(',')))};})()`);
  check('Actual adjacent floor faces agree at common geometric corners', corners.count >= 9 && corners.mismatches.length === 0, corners);
  const frames = [];
  for (let i = 0; i < 5; i++) { frames.push(await evaluate(`__VISUAL_SCENE__.experimentalCubeMaterial.uniforms.animationTime.value`)); await delay(550); }
  check('Actual main RAF loop advances native texture frames', new Set(frames).size > 1 && frames.every(f => Number.isInteger(f) && f >= 0 && f < 4), frames);
  await evaluate(`(()=>{const {preview,controls}=__VISUAL_SCENE__;preview.camera.position.set(28,-3,19);controls.target.set(15,-14,0);controls.update();})()`);
  await delay(700); await snapshot('surface.png');
  await evaluate(`(()=>{window.requestAnimationFrame=()=>0;const {preview,controls,slabMeshes}=__VISUAL_SCENE__;const obj=slabMeshes[2].cube;preview.camera.position.copy(obj.position).add({x:2,y:1,z:3});controls.target.copy(obj.position);controls.update();})()`);
  await delay(500);
  await evaluate(`__VISUAL_SCENE__.renderer.render(__VISUAL_SCENE__.preview.scene,__VISUAL_SCENE__.preview.camera)`);
  await snapshot('slabs-close.png');
  report.diagnostics = await evaluate(`window.__STARMADE_3D_DEBUG__.captureDiagnostics()`);
  check('Main entry has no runtime or shader errors', errors.length === 0 && !consoleMessages.some(m => /GL_INVALID|shader error|VALIDATE_STATUS false|context lost/i.test(m.text)), { runtime: errors });
  report.ok = checks.every(c => c.ok);
  await send('Browser.close');
} catch (error) { report.error = String(error.stack ?? error); console.error(report.error); }
finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await delay(300); }
  await server?.close();
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2));
  await writeFile(join(output, 'console.json'), JSON.stringify(consoleMessages, null, 2));
  await writeFile(join(output, 'chromium.log'), browserLog.join(''));
  await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
console.log('Actual index page:', report.ok, checks.map(c => [c.name, c.ok]));
process.exitCode = report.ok ? 0 : 1;
