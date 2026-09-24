import { prepareBlueprintLod } from './lod/prepare.mjs';
const input=process.argv[2];
if(!input||!process.env.STARMADE_DIR)throw Error('Usage: STARMADE_DIR=/path/to/StarMade npm run lod:prepare -- /path/to/blueprint-or-region.smd3');
const start=performance.now();
const result=await prepareBlueprintLod(input,{starmadeRoot:process.env.STARMADE_DIR});
console.log(JSON.stringify({ok:true,ms:performance.now()-start,entities:result.entities.length,cache:result.cache,levels:[1,2,4].map(cellSize=>({cellSize,triangles:result.regions.filter(r=>r.cellSize===cellSize).reduce((n,r)=>n+r.mesh.triangleCount,0)}))},null,2));
