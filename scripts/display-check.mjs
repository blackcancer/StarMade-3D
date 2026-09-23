#!/usr/bin/env node
// GPU acceptance of the public Display Module example and installation-owned assets.
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const output = resolve(process.env.STARMADE_DISPLAY_OUTPUT ?? 'artifacts/display');
await mkdir(output, { recursive: true });
const work = await mkdtemp(join(tmpdir(), 'starmade-display-'));
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
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') report.errors.push(m.params.args.map(arg=>arg.value ?? arg.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') report.errors.push(m.params.exceptionDetails);
    const p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.fail(Error(JSON.stringify(m.error))) : p.done(m.result); }
  };
  const send = (method, params = {}) => new Promise((done, fail) => { const id = ++serial; const timer = setTimeout(() => { pending.delete(id); fail(Error('CDP timeout ' + method)); }, 60000); pending.set(id, { done, fail, timer }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', {url:base+'/display.html'});
  for(let i=0;i<180;i++){if(report.errors.length)throw Error('Display initialization failed');if(await evaluate('!!window.__DISPLAY__'))break;await delay(250);}
  check('native font and six display panels loaded',await evaluate('!!window.__DISPLAY__ && __DISPLAY__.panels.length===6 && document.fonts.check(\'16px "StarMadeDisplay"\')'));
  await evaluate(`window.pixelCount=()=>{const {renderer}=__DISPLAY__,gl=renderer.getContext(),a=new Uint8Array(400*400*4);gl.readPixels(500,275,400,400,gl.RGBA,gl.UNSIGNED_BYTE,a);let red=0;for(let i=0;i<a.length;i+=4)if(a[i]>150&&a[i]>a[i+1]*2&&a[i]>a[i+2]*2)red++;return red;}`);
  for(let orientation=0;orientation<6;orientation++){
    const result=await evaluate(`(()=>{const d=__DISPLAY__,panel=d.panels[${orientation}];d.scene.children.forEach(o=>o.visible=o===panel.root);panel.update('<style>c=#ff0000,f=4</style>DISPLAY 479\\nNative text');d.focus(${orientation});return {before:d.renderer.getContext().getError(),red:pixelCount(),error:d.renderer.getContext().getError(),width:panel.texture.image.width,canvas:[d.renderer.domElement.width,d.renderer.domElement.height],texture:[panel.texture.image.width,panel.texture.image.height]};})()`);
    const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'orientation-'+orientation+'.png'),Buffer.from(shot.data,'base64'));
    check('GPU text readable on native orientation '+orientation,result.red>40&&result.before===0&&result.error===0,result);
  }
  await evaluate(`__DISPLAY__.scene.children.forEach(o=>o.visible=o===__DISPLAY__.panels[0].root);__DISPLAY__.focus(0)`);
  const screenshot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'display-front.png'),Buffer.from(screenshot.data,'base64'));
  const depth=await evaluate(`(()=>{const d=__DISPLAY__,panel=d.panels[0],blocker=d.scene.children.find(o=>o.isMesh);blocker.visible=true;blocker.position.copy(d.camera.position).addScaledVector(d.camera.getWorldDirection(blocker.up),1.3);blocker.scale.set(1.4,1.4,1.4);d.draw();return pixelCount();})()`);
  check('opaque geometry occludes holographic text',depth===0,depth);
  await evaluate(`__DISPLAY__.scene.children.filter(o=>o.isMesh).forEach(o=>o.visible=false)`);
  const mutation=await evaluate(`(()=>{const d=__DISPLAY__,p=d.panels[0];p.update('[password] secret');d.draw();const hidden=pixelCount();p.update('<style>c=#ff0000,f=4</style>RESTORED');d.draw();return {hidden,visible:pixelCount()};})()`);
  check('text changes refresh GPU texture and password content stays hidden',mutation.hidden===0&&mutation.visible>40,mutation);
  const supplied=await evaluate(`(()=>{const d=__DISPLAY__,p=d.panels[0];p.update('<style>c=#ff0000,f=4</style>[power]');d.values.set('demo',{power:'WWWW'});p.update();d.renderer.render(d.scene,d.camera);const first=pixelCount(),version=p.texture.version;d.values.set('demo',{power:'WWWW'});const unchanged=!p.update()&&version===p.texture.version;d.values.set('demo',{power:''});p.update();d.renderer.render(d.scene,d.camera);return {first,empty:pixelCount(),unchanged,error:d.renderer.getContext().getError()};})()`);
  check('calculated values API updates GPU text without changing stored template',supplied.first>40&&supplied.empty===0&&supplied.unchanged&&supplied.error===0,supplied);
  const styles=await evaluate(`(()=>{const d=__DISPLAY__,p=d.panels[0];p.update('<style>h=false,bg=red,f=4,c=#ff0000</style>RED<style>c=#00ff00</style>GREEN');d.focus(0);const gl=d.renderer.getContext(),a=new Uint8Array(400*400*4);gl.readPixels(500,275,400,400,gl.RGBA,gl.UNSIGNED_BYTE,a);let green=0;for(let i=0;i<a.length;i+=4)if(a[i+1]>150&&a[i+1]>a[i]*2&&a[i+1]>a[i+2]*2)green++;const red=pixelCount(),screen=p.background.material.map.image.src;p.update('<style>bg=false,r=10:20:30,f=5</style>ROTATED');d.renderer.render(d.scene,d.camera);return {red,green,screen,hidden:!p.background.visible,rotation:p.text.parent.rotation.toArray().slice(0,3),error:gl.getError()};})()`);
  check('cascading colors, themed background and text-only rotation reach GPU',styles.red>40&&styles.green>40&&styles.screen.includes('screen-gui-red')&&styles.hidden&&Math.abs(styles.rotation[2]-Math.PI/6)<1e-6&&styles.error===0,styles);
  const animation=await evaluate(`(()=>{const d=__DISPLAY__,p=d.panels[0],gl=d.renderer.getContext();const sample=()=>{d.renderer.render(d.scene,d.camera);const a=new Uint8Array(400*400*4);gl.readPixels(500,275,400,400,gl.RGBA,gl.UNSIGNED_BYTE,a);return Array.from(a).reduce((sum,v)=>sum+v,0)};p.update('<style>h=true,f=4</style>ANIMATED');const first=sample();p.updateTime(.13);const second=sample();p.update('<style>h=false,f=4</style>PAINTED');const painted=sample();p.updateTime(.19);return {animated:first!==second,stable:painted===sample(),error:gl.getError()};})()`);
  check('native scanlines animate and painted mode remains stable',animation.animated&&animation.stable&&animation.error===0,animation);
  const distance=await evaluate(`(()=>{const d=__DISPLAY__,p=d.panels[0];d.camera.position.set(0,0,600);d.draw();return {text:p.text.visible,background:p.background.visible};})()`);
  check('native text distance culls text independently from screen',!distance.text&&distance.background,distance);
  check('no browser runtime exceptions',report.errors.length===0,report.errors);
  report.ok=true;
} catch (error) { report.errors.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2));
  socket?.close(); if (browser) { const stopped = new Promise(resolve => browser.once('exit', resolve)); browser.kill('SIGTERM'); await Promise.race([stopped, delay(2000)]); }
  await server?.close(); await rm(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  console.log(JSON.stringify(report, null, 2));
}
