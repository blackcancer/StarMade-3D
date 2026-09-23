#!/usr/bin/env node
// Real browser acceptance of the public inspection example, including native Isanth data.
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const output = resolve(process.env.STARMADE_INSPECTION_OUTPUT ?? 'artifacts/inspection');
await mkdir(output, { recursive: true });
const work = await mkdtemp(join(tmpdir(), 'starmade-inspection-'));
const report = { ok: false, checks: [], errors: [] };
let browser, socket, server;
const delay = ms => new Promise(r => setTimeout(r, ms));
function check(name, value, detail) { report.checks.push({ name, ok: Boolean(value), detail }); if (!value) throw Error(name + ': ' + JSON.stringify(detail)); }
try {
  server = await createServer({ configFile: resolve('vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } }); await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const log = [];
  browser = spawn(process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', ['--headless=new', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=0', `--user-data-dir=${join(work, 'profile')}`, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
  browser.stderr.on('data', b => log.push(String(b))); browser.on('error', error => report.errors.push(String(error)));
  let port;
  for (let i = 0; i < 100; i++) { try { port = (await readFile(join(work, 'profile/DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); } }
  if (!port) throw Error('Browser startup: ' + log.join(''));
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });
  let serial = 0; const pending = new Map();
  socket.onmessage = event => {
    const m = JSON.parse(event.data);
    if (m.method === 'Runtime.exceptionThrown') report.errors.push(m.params.exceptionDetails);
    const p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.fail(Error(JSON.stringify(m.error))) : p.done(m.result); }
  };
  const send = (method, params = {}) => new Promise((done, fail) => { const id = ++serial; const timer = setTimeout(() => { pending.delete(id); fail(Error('CDP timeout ' + method)); }, 60000); pending.set(id, { done, fail, timer }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: base + '/inspection.html' });
  async function waitFor(expression) { for (let i = 0; i < 180; i++) { if (await evaluate(expression)) return; await delay(250); } throw Error('Timeout: ' + expression); }
  await waitFor('!!globalThis.__INSPECTION_DEMO__');
  const snapshot = async name => { await delay(200); const r = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(output, name), Buffer.from(r.data, 'base64')); };
  const start = await evaluate(`({cells:__INSPECTION_DEMO__.document.query().length,entities:__INSPECTION_DEMO__.document.entities.length,triangles:__INSPECTION_DEMO__.renderer.info.render.triangles})`);
  check('fixture renders three nested transformed entities', start.cells === 93 && start.entities === 3 && start.triangles > 0, start);
  await snapshot('fixture.png');
  check('sub-docking is identified at depth two', await evaluate(`document.querySelector('[data-entity-id="turret/sensor"]').dataset.depth==='2'`));
  await evaluate(`document.querySelector('[data-entity-id="turret"]').click()`);
  check('isolating a parent includes its sub-docking', await evaluate(`__INSPECTION_DEMO__.filter.entities.has('turret/sensor') && __INSPECTION_DEMO__.filter.entities.size===2 && document.getElementById('entity-info').textContent.includes('1 docking(s)')`));
  await evaluate(`document.getElementById('descendants').checked=false;document.querySelector('[data-entity-id="turret"]').click()`);
  check('parent isolation can exclude its sub-docking', await evaluate(`__INSPECTION_DEMO__.filter.entities.size===1 && __INSPECTION_DEMO__.group.children[2].children.length===0`));
  await evaluate(`document.getElementById('descendants').checked=true;document.getElementById('reset').click()`);

  // A real pointer click must resolve a triangle to the correct raw block state.
  const target = await evaluate(`(()=>{const d=__INSPECTION_DEMO__;const box=d.renderer.domElement.getBoundingClientRect();const mesh=d.group.children[0].children[0];const p=mesh.geometry.getAttribute('position');let point;for(let i=0;i<p.count;i++){const v=new d.camera.position.constructor().fromBufferAttribute(p,i);if(v.x===3.5&&v.y===0.5&&v.z===2.5){point=v;break;}}point.addScalar(-.05).applyMatrix4(mesh.matrixWorld).project(d.camera);return {x:box.left+(point.x+1)*box.width/2,y:box.top+(1-point.y)*box.height/2};})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...target });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...target });
  check('pointer raycast resolves a stable block reference', await evaluate('__INSPECTION_DEMO__.selection.values().length===1'));
  await evaluate(`document.getElementById('change').click();document.getElementById('compare').click()`);
  check('host change increments revision and logical diff reports one block', await evaluate('__INSPECTION_DEMO__.document.revision===1 && __INSPECTION_DEMO__.diff.blocks.length===1 && __INSPECTION_DEMO__.diff.entities.length===0'));
  await evaluate(`document.getElementById('type').value='3';document.getElementById('search').click();document.getElementById('isolate').click()`);
  check('search and isolation preserve transformed turret references', await evaluate('__INSPECTION_DEMO__.selection.values().length===3 && __INSPECTION_DEMO__.group.children[0].children.length===0 && __INSPECTION_DEMO__.group.children[1].children.length>0'));
  await snapshot('isolation.png');
  await evaluate(`document.getElementById('reset').click();document.getElementById('cut').value='0';document.getElementById('cut').dispatchEvent(new Event('input'));document.getElementById('orthographic').click()`);
  check('cut geometry excludes removed cells and has the newly exposed X face', await evaluate(`(()=>{const g=__INSPECTION_DEMO__.group.children[0].children[0].geometry;const p=g.getAttribute('position');const n=g.getAttribute('normal');let cutFace=false;for(let i=0;i<p.count;i++){if(p.getX(i)>.5001)return false;if(p.getX(i)===.5&&n.getX(i)===1)cutFace=true;}return cutFace&&__INSPECTION_DEMO__.camera.isOrthographicCamera;})()`));
  await snapshot('cut-orthographic.png');
  const exported = await evaluate(`(async()=>{const {exportInspectionGltf,captureInspectionPreview}=await import('/@fs'+${JSON.stringify(resolve('src/index.ts'))});const d=__INSPECTION_DEMO__;const result=await exportInspectionGltf(d.group,{binary:true});const png=captureInspectionPreview(d.renderer,d.scene,d.camera);return {magic:new DataView(result.asset).getUint32(0,true),size:result.asset.byteLength,diagnostics:result.diagnostics,png:png.startsWith('data:image/png;base64,')};})()`);
  check('browser exports a real GLB and a PNG', exported.magic === 0x46546c67 && exported.size > 1000 && exported.png, exported);
  await evaluate(`document.getElementById('isanth').click()`); await waitFor(`__INSPECTION_DEMO__.document.id==='isanth'`);
  const isanth = await evaluate(`({cells:__INSPECTION_DEMO__.document.query().length,entities:__INSPECTION_DEMO__.document.entities.length,status:document.getElementById('status').textContent})`);
  check('actual Isanth blueprint imports without losing raw occupied blocks', isanth.cells === 3200 && isanth.entities > 0, isanth);
  const lodCheck = await evaluate(`(()=>{const d=__INSPECTION_DEMO__;const lods=d.group.children.flatMap(root=>root.children).filter(o=>o.name.startsWith('lod:'));let lights=0;d.scene.traverse(o=>{if(o.isLight)lights++});let object;lods[0].traverse(o=>{if(o.isMesh&&!object)object=o});const hit=d.hits.resolve(d.document,{object,distance:1,point:d.camera.position.clone()});return {lods:lods.length,lights,hit:hit&&{face:hit.face,type:hit.state.type,entity:hit.ref.entityId}};})()`);
  check('all 199 LODs bind to logical blocks without duplicating asset lights', lodCheck.lods===199 && lodCheck.lights===2 && lodCheck.hit?.face===null, lodCheck);
  const textures = await evaluate(`(()=>{const d=__INSPECTION_DEMO__;let cube=0,lod=0,mapped=0;const sizes=[];d.group.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m.uniforms?.mainTex0){cube++;sizes.push(m.uniforms.mainTex0.value.image.width,m.uniforms.normalTex0.value.image.width);}if(m.uniforms?.mainTex){lod++;if(m.uniforms.mainTex.value.image.width>1)mapped++;}}});return {cube,lod,mapped,sizes,gpuTextures:d.renderer.info.memory.textures};})()`);
  check('Isanth uses full-resolution native cube and LOD textures', textures.cube>0 && textures.lod>0 && textures.mapped===textures.lod && textures.sizes.every(n=>n>=256), textures);
  await snapshot('isanth.png');
  await evaluate(`document.getElementById('cut').value='0';document.getElementById('cut').dispatchEvent(new Event('input'))`);
  await snapshot('isanth-cut.png');
  const cutTextures = await evaluate(`(()=>{const d=__INSPECTION_DEMO__;let native=0;d.group.traverse(o=>{if(o.isMesh&&o.material.uniforms?.mainTex0?.value.image.width>=256)native++;});return {native,gpuTextures:d.renderer.info.memory.textures,glError:d.renderer.getContext().getError()};})()`);
  check('cut keeps native textures and releases replaced GPU textures', cutTextures.native>0 && cutTextures.gpuTextures<=textures.gpuTextures+20 && cutTextures.glError===0, cutTextures);
  await evaluate(`document.getElementById('reset').click()`);
  const functional = await evaluate(`(()=>{const d=__INSPECTION_DEMO__;const m=d.functionalMap;return {systems:m.systems.length,links:m.relations.length,unlinked:m.unlinked.length,diagnostics:m.diagnostics,categories:[...m.categories].map(([id,refs])=>[id,refs.length]),nodes:d.blueprintNodes.map(n=>({id:n.id,parent:n.parentId,docking:n.docking}))};})()`);
  check('saved Isanth controllers and connections match the blueprint', functional.systems===4 && functional.links===160 && functional.diagnostics.length===0, functional);
  check('Isanth rail attachment identifies both connector cells', functional.nodes.length===2 && functional.nodes[1].parent===functional.nodes[0].id && functional.nodes[1].docking.mode==='rail' && JSON.stringify(functional.nodes[1].docking.parentConnector)==='[-9,-3,-2]' && JSON.stringify(functional.nodes[1].docking.childConnector)==='[0,0,-1]');
  await evaluate(`document.getElementById('functional').click()`);
  await snapshot('isanth-functional.png');
  check('functional view uses category colors and saved relation geometry', await evaluate(`(()=>{const d=__INSPECTION_DEMO__;let colors=0;d.group.traverse(o=>{if(o.isMesh&&o.material.isMeshBasicMaterial&&o.geometry.getAttribute('color'))colors++});return colors>0&&d.scene.children.some(o=>o.isLineSegments&&o.geometry.getAttribute('position').count>0)})()`));
  await evaluate(`document.getElementById('system').value='2';document.getElementById('system').dispatchEvent(new Event('change'))`);
  await snapshot('isanth-controller.png');
  check('selecting a saved controller isolates its 69 members and controller', await evaluate(`(()=>{const d=__INSPECTION_DEMO__;const refs=new Set();d.group.traverse(o=>{if(!o.isMesh)return;const g=o.geometry,ix=g.getIndex();if(g.getAttribute('ivert'))for(let i=0;i<ix.count;i+=3){const h=d.hits.resolve(d.document,{object:o,faceIndex:i/3,point:d.camera.position.clone(),distance:1});if(h)refs.add(JSON.stringify(h.ref));}});return refs.size===70;})()`));
  await evaluate(`document.getElementById('reset').click();document.querySelector('[data-entity-id="isanth/0/0"]').click()`);
  check('dock isolation identifies the parent and excludes hull geometry', await evaluate(`__INSPECTION_DEMO__.filter.entities.size===1 && __INSPECTION_DEMO__.group.children[0].children.length===0 && document.getElementById('entity-info').textContent.includes('Parent : isanth/0')`));
  await snapshot('isanth-docking.png');
  await evaluate(`document.getElementById('reset').click()`);
  check('returning from mapping restores native textures', await evaluate(`(()=>{let found=false;__INSPECTION_DEMO__.group.traverse(o=>{if(o.isMesh&&o.material.uniforms?.mainTex0?.value.image.width>=256)found=true});return found;})()`));
  check('no WebGL context loss or JavaScript exception', await evaluate('!__INSPECTION_DEMO__.renderer.getContext().isContextLost()') && report.errors.length === 0, report.errors);
  report.ok = true;
} catch (error) { report.errors.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2));
  socket?.close(); if (browser) { const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill('SIGTERM'); await Promise.race([stopped, delay(2000)]); }
  await server?.close(); await rm(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  console.log(JSON.stringify(report, null, 2));
}
