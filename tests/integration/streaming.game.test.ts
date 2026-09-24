import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createServer } from 'vite';
import { expect, it } from 'vitest';
import { parseBlueprintFolder, registerAllFactories, streamBlueprintFolder } from 'starmade-decoder';
import { inspectionBlueprintEntities, blocksFromSegments, streamStarMadeInspection, readStarMadeInspectionStream } from '../../src/index.js';
import { requireStarMadeDirectory } from '../helpers/gameInstallation';

it('streams the real blueprint with identical blocks, docking, controllers and display texts', async () => {
  const game = requireStarMadeDirectory(); registerAllFactories();
  const eager = inspectionBlueprintEntities(parseBlueprintFolder(resolve(game,'blueprints/Isanth Type-PNR-25-B')).root,'eager');
  const nodes = []; const blocks = new Map<string, ReturnType<typeof blocksFromSegments>>(); let count = 0;
  for await(const event of streamStarMadeInspection(streamBlueprintFolder(resolve(game,'blueprints/Isanth Type-PNR-25-B')))) {
    if(event.kind==='entity') nodes.push(event.node);
    if(event.kind==='segment') { count++; blocks.set(event.entityId,[...(blocks.get(event.entityId)??[]),...blocksFromSegments([event.segment])]); }
  }
  expect(count).toBe(4);expect(nodes).toHaveLength(eager.length);
  nodes.forEach((node,i)=>{
    expect({offset:node.offset,localOffset:node.localOffset,docking:node.docking,controllers:node.controllers,displayTexts:node.displayTexts})
      .toEqual({offset:eager[i].offset,localOffset:eager[i].localOffset,docking:eager[i].docking,controllers:eager[i].controllers,displayTexts:eager[i].displayTexts});
    expect(blocks.get(node.id)).toEqual(blocksFromSegments(eager[i].segments).map(block => ({ ...block, state: { ...block.state, extra: block.state.extra ?? 0 } })));
  });
},20_000);

it('serves a complete binary stream under 600 KiB without duplicate root segments', async () => {
  requireStarMadeDirectory();
  const server=await createServer({configFile:resolve('vite.config.ts'),logLevel:'silent',server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false,watch:null}});
  try {
    await server.listen();const {port}=server.httpServer!.address() as AddressInfo;
    const response=await fetch(`http://127.0.0.1:${port}/starmade-assets/blueprints/isanth.stream`);
    expect(response.status).toBe(200);expect(response.headers.get('content-type')).toContain('version=1');
    let bytes=0,segments=0,blocks=0,entities=0,done=false;
    async function* chunks(){for await(const chunk of response.body! as unknown as AsyncIterable<Uint8Array>){bytes+=chunk.length;yield chunk;}}
    for await(const event of readStarMadeInspectionStream(chunks())){
      if(event.kind==='entity')entities++;
      if(event.kind==='segment'){segments++;blocks+=event.segment.blockCount!;expect(event.segment.lastChanged).toMatch(/^\d+$/);}
      if(event.kind==='end')done=true;
    }
    expect({segments,blocks,entities,done}).toEqual({segments:4,blocks:3200,entities:2,done:true});expect(bytes).toBeLessThan(600*1024);
  } finally {await server.close();}
},20_000);
