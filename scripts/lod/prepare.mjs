import { createHash } from 'node:crypto';
import { readFile, readdir, lstat, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, basename, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Color, SRGBColorSpace } from 'three';
import { readStarMadeLodCache, buildStarMadeLodCache } from '../../dist/node/lodCache.js';
import { createStarMadeBlueprintLod } from '../../dist/geometry/blueprintLod.js';
import { streamStarMadeInspection, segmentFromStarMadeWords } from '../../dist/inspection/streaming.js';
import { inspectionDocumentFromBlueprint } from '../../dist/inspection/blueprint.js';
import { blockDefinitionFromElementInfo } from '../../dist/starmade/blockConfig.js';

const hash = data => createHash('sha256').update(data).digest('hex');
const generator = 'starmade-blueprint-lod/1/average-linear-color/steps-1-2-4';
async function regularFile(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw Error(`Expected regular source file: ${path}`);
  return readFile(path);
}
async function optionalFile(path) {
  try { return await regularFile(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function listSources(input) {
  const root = resolve(input), info = await lstat(root);
  if (info.isSymbolicLink()) throw Error('LOD sources cannot be symlinks');
  if (info.isFile()) {
    if (!root.endsWith('.smd3')) throw Error('Expected SMD3 file or blueprint directory');
    return { root, loose: true, sources: [{ path: root, entityPath: basename(root), regionPath: basename(root) }], metadata: [] };
  }
  const sources = [], metadata = [];
  async function visit(directory, entityPath) {
    if ((await lstat(directory)).isSymbolicLink()) throw Error('LOD sources cannot be symlinks');
    const entries = await readdir(directory, { withFileTypes: true });
    for (const name of ['header.smbph','meta.smbpm','logic.smbpl','modmappings.smbmm']) {
      const path = join(directory,name); metadata.push([relative(root,path), await optionalFile(path)]);
    }
    const data = join(directory,'DATA');
    try {
      if ((await lstat(data)).isSymbolicLink()) throw Error('LOD DATA cannot be a symlink');
      for (const name of (await readdir(data)).filter(n=>n.endsWith('.smd3')).sort()) {
        sources.push({ path:join(data,name), entityPath, regionPath:`${entityPath}/DATA/${name}` });
      }
    } catch(error) { if(error.code!=='ENOENT') throw error; }
    for (const entry of entries.filter(e=>/^ATTACHED_\d+$/.test(e.name)).sort((a,b)=>Number(a.name.slice(9))-Number(b.name.slice(9)))) {
      await visit(join(directory,entry.name),`${entityPath}/${entry.name}`);
    }
  }
  await visit(root,basename(root));
  if (!sources.length) throw Error('No SMD3 regions in blueprint');
  return { root,loose:false,sources,metadata };
}
async function assets(starmadeRoot) {
  const root=resolve(starmadeRoot), config=[];
  for(const file of ['data/config/BlockConfig.xml','data/config/BlockTypes.properties','customBlockConfig/BlockConfigImport.xml','data/IcoVectors.bin']) config.push([file,await optionalFile(join(root,file))]);
  const atlases=[];
  for(const layer of [0,1,2,3,7]) {
    const names=layer===7 ? ['customBlockTextures/64/custom.png','data/textures/customTemplates/64/custom.png'] : [`data/textures/block/Default/64/t00${layer}.png`];
    let bytes=null, path, archived=false;
    for(const name of names) {path=join(root,name);bytes=await optionalFile(path);if(bytes)break;path+='.zip';bytes=await optionalFile(path);if(bytes){archived=true;break;}}
    if(!bytes)throw Error(`Missing local LOD color atlas ${layer}`);
    atlases.push({layer,path,bytes,archived});
  }
  const fingerprint=hash(JSON.stringify([config.map(([name,bytes])=>[name,bytes?hash(bytes):null]),atlases.map(a=>[a.layer,a.archived,hash(a.bytes)])]));
  return {root,atlases,fingerprint};
}
async function snapshot(input,starmadeRoot) {
  const listing=await listSources(input), resource=await assets(starmadeRoot);
  for(const source of listing.sources) source.fingerprint=hash(await regularFile(source.path));
  const metadataKey=hash(JSON.stringify(listing.metadata.map(([name,data])=>[name,data===null?null:hash(data)])));
  for(const source of listing.sources) source.configurationKey=hash(JSON.stringify([generator,resource.fingerprint,metadataKey,source.regionPath,listing.sources.filter(s=>s.entityPath===source.entityPath && s.path!==source.path).map(s=>[s.regionPath,s.fingerprint])]));
  return {...listing,resource,identity:hash(JSON.stringify([resource.fingerprint,metadataKey,listing.sources.map(s=>[s.regionPath,s.fingerprint])]))};
}
async function palette(resource) {
  const {BlockConfig,SMToolConfig}=await import('starmade-decoder');
  const blockConfig=BlockConfig.load(SMToolConfig.fromData({starmadeDir:resource.root,worldDir:'world0'}));
  const colors=new Map();
  for(const atlas of resource.atlases) {
    // Average in linear light, keeping only one RGB texel per native atlas tile.
    let atlasBytes=atlas.bytes;
    if(atlas.archived) {
      const temporary=await mkdtemp(join(tmpdir(),'starmade-lod-atlas-'));
      try {
        const archive=join(temporary,'atlas.png.zip');
        await writeFile(archive,atlas.bytes);
        atlasBytes=execFileSync('unzip',['-p',archive],{maxBuffer:32*1024*1024});
      } finally {await rm(temporary,{recursive:true,force:true});}
    }
    const data=execFileSync('magick',['png:-','-alpha','remove','-colorspace','RGB','-scale','16x16!','-colorspace','sRGB','-depth','8','rgb:-'],{input:atlasBytes,maxBuffer:1024*1024});
    if(data.length!==768)throw Error('Invalid reduced atlas');
    for(let tile=0;tile<256;tile++) colors.set(atlas.layer*256+tile,new Color().setRGB(data[tile*3]/255,data[tile*3+1]/255,data[tile*3+2]/255,SRGBColorSpace).toArray());
  }
  const table=new Map(),definitions=new Map();
  for(const info of blockConfig.elementInfo) {
    const def=blockDefinitionFromElementInfo(info); definitions.set(def.id,def);
    const sides=Object.values(def.textures).map(id=>colors.get(Math.abs(id))??[.25,.25,.25]);
    const color=[0,1,2].map(i=>Math.round(sides.reduce((n,c)=>n+c[i],0)/sides.length*255)/255);
    const emission=def.lightSource ? def.lightSourceColor.slice(0,3).map(v=>Math.max(0,Math.min(1,v))) : [0,0,0];
    table.set(def.id,{color,emission,group:JSON.stringify([color,emission,def.transparent])});
  }
  return {lookup:type=>table.get(type),definitions};
}
async function decode(state) {
  const {registerAllFactories,streamBlueprintFolder,streamSmd3,readIcoSideNormals}=await import('starmade-decoder');
  registerAllFactories();
  const sideNormals=readIcoSideNormals(await regularFile(join(state.resource.root,'data/IcoVectors.bin')));
  const records=[], nodes=[];
  async function* events() {
    if(state.loose) {
      yield {kind:'entity',path:basename(state.root),parentPath:null,name:basename(state.root)};
      for await(const e of streamSmd3(state.root,{sideNormals})) {
        if(e.kind==='segment'){const raw={...e,entityPath:basename(state.root),regionPath:basename(state.root)};records.push(raw);yield raw;}
        else yield e;
      }
    } else for await(const e of streamBlueprintFolder(state.root,{segmentOptions:{sideNormals}})) {if(e.kind==='segment')records.push(e);yield e;}
  }
  for await(const event of streamStarMadeInspection(events())) if(event.kind==='entity')nodes.push(event.node);
  for(const record of records) record.fingerprint=hash(new Uint8Array(record.words.buffer,record.words.byteOffset,record.words.byteLength));
  return {records,nodes};
}
function documentFromCaches(state,caches) {
  const nodes=new Map(), regions=[];
  for(let i=0;i<caches.length;i++) {
    const cache=caches[i],source=state.sources[i];
    for(const entry of cache.entries) {
      const value=JSON.parse(new TextDecoder().decode(entry.payload));
      if(entry.key==='metadata') for(const node of value)nodes.set(node.id,node);
      else regions.push({entityId:source.entityPath,sourceName:basename(source.path),...value});
    }
  }
  return {schema:1,generator,entities:[...nodes.values()],regions,cache:{regions:caches.length,reused:caches.reduce((n,c)=>n+(c.reused??c.entries.length),0),built:caches.reduce((n,c)=>n+(c.built??0),0)}};
}
/** Read-only warm path hashes sources/resources, never decodes SMD3, parses BlockConfig or decodes PNG images. */
export async function readBlueprintLod(input,{starmadeRoot}) {
  const state=await snapshot(input,starmadeRoot), caches=[];
  for(const source of state.sources) {
    const cache=await readStarMadeLodCache({sourcePath:source.path,configurationKey:source.configurationKey});
    if(!cache || cache.sourceFingerprint!==source.fingerprint)return undefined;
    caches.push(cache);
  }
  if((await snapshot(input,starmadeRoot)).identity!==state.identity)return undefined;
  return documentFromCaches(state,caches);
}
/** Explicit generation: write only managed sidecar directories, never StarMade source files. */
export async function prepareBlueprintLod(input,{starmadeRoot}) {
  const state=await snapshot(input,starmadeRoot), visual=await palette(state.resource), decoded=await decode(state), records=decoded.records, caches=[];
  const transformed=inspectionDocumentFromBlueprint(decoded.nodes,visual.definitions,'lod');
  const nodes=decoded.nodes.map(node=>({...node,transform:transformed.document.entity(node.id).transform,diagnostics:transformed.diagnostics.filter(d=>d.entityId===node.id)}));
  if((await snapshot(input,starmadeRoot)).identity!==state.identity)throw Error('LOD sources changed during decoding');
  const segments=new Map(records.map(r=>[r,segmentFromStarMadeWords(r)]));
  for(const source of state.sources) {
    const own=records.filter(r=>r.regionPath===source.regionPath), entries=[];
    for(const record of own) {
      const neighbors=records.filter(r=>r!==record&&r.entityPath===record.entityPath&&Math.abs(r.x-record.x)+Math.abs(r.y-record.y)+Math.abs(r.z-record.z)===32);
      const dependencyKey=hash(JSON.stringify([record.fingerprint,neighbors.map(n=>[n.x,n.y,n.z,n.fingerprint])]));
      for(const cellSize of [1,2,4]) entries.push({key:`${record.x},${record.y},${record.z}/lod${cellSize}`,dependencyKey,build:async()=>new TextEncoder().encode(JSON.stringify({cellSize,origin:[record.x,record.y,record.z],mesh:createStarMadeBlueprintLod({segments:[segments.get(record)],neighborSegments:neighbors.map(n=>segments.get(n)),cellSize,palette:visual.lookup})}))});
    }
    entries.push({key:'metadata',dependencyKey:state.identity,build:async()=>new TextEncoder().encode(JSON.stringify(nodes))});
    if((await snapshot(input,starmadeRoot)).identity!==state.identity)throw Error('LOD sources changed during generation');
    caches.push(await buildStarMadeLodCache({sourcePath:source.path,configurationKey:source.configurationKey,expectedSourceFingerprint:source.fingerprint,segments:entries}));
  }
  if((await snapshot(input,starmadeRoot)).identity!==state.identity)throw Error('LOD sources changed before publication');
  return documentFromCaches(state,caches);
}
