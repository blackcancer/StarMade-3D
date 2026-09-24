import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { sendBlueprintStream } from './blueprint-stream.mjs';

function response(write) { return Object.assign(new EventEmitter(), { destroyed:false, headers:{}, ended:false, setHeader(k,v){this.headers[k]=v}, write, end(){this.ended=true} }); }
test('HTTP drain gates Decoder advancement',async()=>{
 let reads=0;async function* source(){reads++;yield 1;reads++;yield 2;}
 const body=[];const res=response(x=>{body.push(x);return body.length>1});
 const running=sendBlueprintStream(res,source(),n=>new Uint8Array([n]));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,1);assert.equal(res.ended,false);
 res.emit('drain');await running;assert.equal(reads,2);assert.equal(res.ended,true);assert.equal(body.length,2);
 assert.match(res.headers['Content-Type'],/version=1/);
});
test('disconnect cancels waiting drain and closes the source',async()=>{
 let closed=false;async function* source(){try{yield 1;yield 2;}finally{closed=true;}}
 const abort=new AbortController(),res=response(()=>false);
 const running=sendBlueprintStream(res,source(),x=>x,abort.signal);
 await new Promise(resolve=>setImmediate(resolve));abort.abort();
 await assert.rejects(running,{name:'AbortError'});assert.equal(closed,true);
});
test('a destroyed response stops iteration without writing',async()=>{
 let closed=false;async function* source(){try{yield 1;}finally{closed=true;}}
 const res=response(()=>{throw Error('unexpected write')});res.destroyed=true;
 await sendBlueprintStream(res,source(),x=>x);assert.equal(closed,true);
});
