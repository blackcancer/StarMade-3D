import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { releaseInputs } from './release-inputs.mjs';
import assert from 'node:assert/strict';
if(!process.env.STARMADE_DIR)throw Error('STARMADE_DIR required for full release qualification');
const version=JSON.parse(readFileSync('package.json','utf8')).version;
const output=`validation/v${version}`;
const inputs=releaseInputs();const startedAt=new Date().toISOString();
mkdirSync(`${output}/logs`,{recursive:true});
const recipes=[
 ['code',['run','validate:code']], ['game',['run','test:game']], ['gpu',['run','test:render']],
 ['index',['run','test:visual:index']], ['inspection',['run','test:inspection']],
 ['isanth',['run','test:isanth:views']], ['display',['run','test:display']], ['package',['run','test:package']], ['performance',['run','test:performance']], ['runtime-audit',['audit','--omit=dev','--json']]
];
const commands=[];
for(const [name,args] of recipes){
 console.log(`Qualifying ${name}…`);const fd=openSync(`${output}/logs/release-${name}.log`,'w');
 const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{stdio:['ignore',fd,fd],env:{...process.env,STARMADE_RENDER_OUTPUT:output+'/gpu',STARMADE_INDEX_OUTPUT:output+'/index',STARMADE_INSPECTION_OUTPUT:output+'/inspection',STARMADE_ISANTH_OUTPUT:output+'/isanth',STARMADE_DISPLAY_OUTPUT:output+'/display',STARMADE_PACKAGE_OUTPUT:output,STARMADE_PERFORMANCE_OUTPUT:output}});closeSync(fd);
 commands.push({name,exitCode:result.status,error:result.error?.message});
 if(result.status!==0){writeFileSync(output+'/qualification.json',JSON.stringify({ok:false,startedAt,commands,inputs},null,2));throw Error(`${name} failed; see release-${name}.log`);}
 console.log(`${name}: PASS`);
}
assert.deepEqual(releaseInputs(),inputs,'Sources changed during qualification');
writeFileSync(output+'/qualification.json',JSON.stringify({ok:true,version,startedAt,finishedAt:new Date().toISOString(),commands,inputs},null,2)+'\n');
console.log('All release requirements PASS');
