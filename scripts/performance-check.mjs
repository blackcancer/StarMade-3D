import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import assert from 'node:assert/strict';
import { Group } from 'three';
import { InspectionDocument, InspectionScene, blockDefinitionFromConfig, buildInspectionSegments } from '../dist/index.js';
const measures=[];
function measure(name,limitMs,action) { const start=performance.now();const result=action();const ms=performance.now()-start; measures.push({name,ms,limitMs,ok:ms<=limitMs});assert(ms<=limitMs,`${name}: ${ms} > ${limitMs} ms`); return result; }
const definitions=new Map([[1,blockDefinitionFromConfig({id:1,name:'Hull',textureIds:[1]})]]);
for (const side of [16,32,64]) {
  const blocks=Array.from({length:side**3},(_,i)=>({position:[i%side,Math.floor(i/side)%side,Math.floor(i/(side*side))],state:{type:1,hp:100,orientation:0,active:false}}));
  const doc=measure(`document ${blocks.length} cells`,5000,()=>new InspectionDocument('performance',0,[{id:'hull',blocks}]));
  measure(`10000 indexed lookups in ${blocks.length}`,1000,()=>{for(let i=0;i<10000;i++)assert(doc.resolve({entityId:'hull',position:blocks[i%blocks.length].position}));});
  const ref={entityId:'hull',position:blocks[Math.floor(blocks.length/2)].position};
  measure(`snapshot edit in ${blocks.length}`,5000,()=>doc.apply(0,[{kind:'block',ref,state:{...blocks[0].state,hp:99}}]));
  const geometry=measure(`native segment meshing ${blocks.length}`,15000,()=>buildInspectionSegments(doc,'hull',undefined,{blockDefinitions:definitions}));
  assert(geometry.reduce((n,g)=>n+g.batches.opaque.getIndex().count,0)>0);
  geometry.forEach(g=>{g.batches.opaque.dispose();g.batches.blended.dispose()});
  if(side===16) {
    let disposed=0;const view=new InspectionScene(()=>({object:new Group(),dispose(){disposed++}}));
    measure('per-cell scene initial 4096',5000,()=>view.sync(doc));
    const next=doc.apply(0,[{kind:'block',ref,state:{...blocks[0].state,hp:99}}]);
    const change=measure('per-cell scene incremental 4096',1000,()=>view.sync(next));
    assert(change.geometry.length<=27);view.dispose();assert.equal(disposed,blocks.length+change.geometry.length);
  }
}
const report={ok:true,node:process.version,cpu:cpus()[0].model,scope:'CPU logical documents, native segment meshing and per-cell sync; no GPU FPS claim',peakRssBytes:process.resourceUsage().maxRSS*1024,measures};
assert(report.peakRssBytes<1536*1024*1024,'Peak RSS exceeds 1.5 GiB');mkdirSync('validation/v1',{recursive:true});writeFileSync('validation/v1/performance.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
