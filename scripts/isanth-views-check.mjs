import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
const out=process.env.STARMADE_ISANTH_OUTPUT ?? 'validation/v1/isanth';await mkdir(out,{recursive:true});
const dir=await mkdtemp('/tmp/starmade-isanth-close-');
const browser=spawn(process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',['--headless=new','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let socket;const errors=[];
try{
 let port;for(let i=0;i<100;i++){try{port=(await readFile(dir+'/DevToolsActivePort','utf8')).split('\n')[0];break}catch{await delay(100)}}
 await writeFile(out+'/endpoint.txt','http://127.0.0.1:'+port);
 const page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(x=>x.type==='page');
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);let id=0;const pending=new Map();
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>reject(Error(method+' timeout')),120000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}))});
 socket.onmessage=async e=>{const m=JSON.parse(e.data);const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}
 if(m.method==='Runtime.exceptionThrown')errors.push(m.params);
 if(m.method==='Fetch.requestPaused'){try{const req=m.params;const body=await send('Fetch.getResponseBody',{requestId:req.requestId});const source=(body.base64Encoded?Buffer.from(body.body,'base64').toString():body.body).replace('new WebGLRenderer({','new WebGLRenderer({ preserveDrawingBuffer: true,')+'\nwindow.__CLOSE_AUDIT__={renderer,scene,camera,controls,segmentRoot,shadowPipeline,isanthBlockLight};\n';await send('Fetch.fulfillRequest',{requestId:req.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/javascript'}],body:Buffer.from(source).toString('base64')});}catch(e){errors.push(String(e))}}
 };
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1400,height:950,deviceScaleFactor:1,mobile:false});await send('Fetch.enable',{patterns:[{urlPattern:'*isanth.ts*',requestStage:'Response'}]});await send('Page.navigate',{url:process.env.STARMADE_ISANTH_URL ?? 'http://127.0.0.1:8001/isanth.html'});
 let ready=false;for(let i=0;i<160;i++){ready=await ev('!!window.__CLOSE_AUDIT__&&!!window.__STARMADE_3D_READY__');if(ready)break;await delay(500)}if(!ready)throw Error('scene not ready');
 await ev('window.requestAnimationFrame=()=>0');await delay(600);
 const views=[['overview',[32,10,35],[0,0,0]],['front',[17,2,20],[11,-1,14]],['slabs',[11,4,-.5],[7,1,-2.5]],['inner',[8,2,-.5],[7,1,-2.5]]];
 for(const [name,pos,target] of views){await ev(`(()=>{const {renderer,scene,camera,controls,shadowPipeline}=__CLOSE_AUDIT__;controls.enableDamping=false;controls.minDistance=.1;camera.position.set(...${JSON.stringify(pos)});controls.target.set(...${JSON.stringify(target)});controls.update();camera.updateMatrixWorld(true);shadowPipeline.render(renderer);renderer.render(scene,camera);})()`);await delay(500);const r=await send('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+name+'.png',Buffer.from(r.data,'base64'));}
 await writeFile(out+'/lights.json',JSON.stringify(await ev(`__CLOSE_AUDIT__.isanthBlockLight.occupied.filter(o=>o.blockDefinition.lightSource||o.blockDefinition.slab>0).map(o=>({name:o.blockDefinition.name,slab:o.blockDefinition.slab,position:o.worldPosition,orientation:o.block.orientation,active:o.block.active}))`),null,2));
 await writeFile(out+'/result.json',JSON.stringify({ok:errors.length===0,errors,readyState:await ev('window.__STARMADE_3D_READY__')},null,2));
 if (errors.length) throw Error('Isanth runtime exceptions');
 // The owned process is stopped in finally: Chrome may close CDP before acknowledging Browser.close.
}catch(e){await writeFile(out+'/error.txt',String(e.stack??e));throw e}finally{socket?.close();const stopped=new Promise(resolve=>browser.once('exit',resolve));browser.kill();await Promise.race([stopped,delay(2000)]);await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{})}
