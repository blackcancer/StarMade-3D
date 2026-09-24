import { describe, it, expect } from 'vitest';
import { segmentFromStarMadeWords, streamStarMadeInspection, type StarMadeBlueprintStreamEvent, type StarMadeStreamEntity } from '../src/inspection/streaming.js';
import { encodeStarMadeInspectionFrame, readStarMadeInspectionStream } from '../src/inspection/streamTransport.js';
import type { StarMadeInspectionStreamEvent } from '../src/inspection/streaming.js';

async function* sequence<T>(items: readonly T[]) { yield* items; }
async function collect<T>(items: AsyncIterable<T>) { const result: T[] = []; for await (const item of items) result.push(item); return result; }
const root: StarMadeStreamEntity = { kind: 'entity', path: 'ship', parentPath: null, name: 'ship', offset: { x: 1, y: 2, z: 3 } };
const end = { kind: 'end', status: 'complete', diagnostics: [] } as const;
const words = new Uint32Array(32768); words[0] = (479 | (127 << 13) | (1 << 20) | (31 << 21) | (63 << 26)) >>> 0; words[31] = 1; words[33] = 1 << 13;
const segment = { kind: 'segment', entityPath: 'ship', x: 0, y: -32, z: 32, headerVersion: 3, version: 7, lastChanged: 9007199254740993n, words } as const;

describe('Decoder streaming adapter', () => {
  it('preserves canonical bits, coordinates and sparse air without retaining transferred words', () => {
    const input = { ...segment, words: words.slice() }, result = segmentFromStarMadeWords(input);
    input.words.fill(0);
    expect(result.blocks[0]).toEqual({ type: 479, hp: 127, active: true, orientation: 31, extra: 63 });
    expect(result.blocks[33]).toEqual({ type: 0, hp: 1, active: false, orientation: 0, extra: 0 });
    expect(Object.keys(result.blocks)).toHaveLength(3); expect(result.blockCount).toBe(2);
    expect([result.x, result.y, result.z]).toEqual([0, -32, 32]);
  });
  it('rejects malformed arrays and unaligned coordinates', () => {
    for (const patch of [{ words: [] }, { words: new Uint32Array(1) }, { x: 1 }, { y: 1.5 }, { z: Infinity }]) {
      expect(() => segmentFromStarMadeWords({ ...segment, ...patch } as never)).toThrow('Invalid compact segment');
    }
  });
  it('keeps metadata, hierarchy and segment order with demand-driven cancellation', async () => {
    const child = { ...root, path: 'ship/child', parentPath: 'ship', name: 'ATTACHED_0' };
    const parent = { ...root, meta: { childTransforms: [{ name: 'ATTACHED_0', mode: 'docking' as const, offset: root.offset! }], railChildren: [] } };
    const controller = new AbortController();
    const events = await collect(streamStarMadeInspection(sequence([parent, segment, child, { ...segment, entityPath: child.path }, end]), controller.signal));
    expect(events.map(e => e.kind)).toEqual(['entity','segment','entity','segment','end']);
    const node = (events[2] as Extract<StarMadeInspectionStreamEvent, { kind: 'entity' }>).node;
    expect(node.id).toBe(child.path); expect(node.parentId).toBe('ship'); expect(node.offset).toEqual([2,4,6]); expect(node.docking?.mode).toBe('docking');
    let reads = 0, closed = false;
    async function* source() { try { reads++; yield root; reads++; yield segment; } finally { closed = true; } }
    for await (const _event of streamStarMadeInspection(source())) break;
    expect(reads).toBe(1); expect(closed).toBe(true);
  });
  it('rejects invalid ordering, non-complete outcomes and premature EOF', async () => {
    const invalid: StarMadeBlueprintStreamEvent[][] = [
      [root,root], [{ ...root, path: '' }], [root, { ...root,path:'other' }],
      [{ ...root,parentPath:'absent' }], [segment], [root], [end,root],
      ...(['partial','error','cancelled'] as const).map(status => [{ ...end,status }])
    ];
    for (const events of invalid) await expect(collect(streamStarMadeInspection(sequence(events)))).rejects.toThrow();
  });
  it('honours abort before an event and at EOF', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(collect(streamStarMadeInspection(sequence([root]), controller.signal))).rejects.toThrow();
    await expect(collect(streamStarMadeInspection(sequence([]), controller.signal))).rejects.toThrow();
  });
});

async function frames() { return (await collect(streamStarMadeInspection(sequence([root,segment,end])))).map(encodeStarMadeInspectionFrame); }
function raw(header: unknown, payload = new Uint8Array(0)) {
  const json = new TextEncoder().encode(JSON.stringify(header)), b = new Uint8Array(8 + json.length + payload.length);
  const v = new DataView(b.buffer); v.setUint32(0,json.length,true); v.setUint32(4,payload.length,true); b.set(json,8); b.set(payload,8+json.length); return b;
}

describe('binary stream framing', () => {
  it('round-trips metadata and unsigned words across fragmented/empty network chunks', async () => {
    const input = await frames(), chunks: Uint8Array[] = [new Uint8Array(0)];
    for (const f of input) for (let i=0;i<f.length;i+=131) chunks.push(f.subarray(i,i+131));
    const events = await collect(readStarMadeInspectionStream(sequence(chunks),new AbortController().signal));
    expect(events.map(e => e.kind)).toEqual(['entity','segment','end']);
    expect(events[1]).toEqual((await collect(streamStarMadeInspection(sequence([root,segment,end]))))[1]);
    expect(input.reduce((n,b)=>n+b.length,0)).toBeLessThan(133000);
  });
  it('supports legacy blocks without extra and adjacent frames in one network chunk', async () => {
    const block = { type:1,hp:2,active:false,orientation:3 };
    const f=encodeStarMadeInspectionFrame({kind:'segment',entityId:'ship',headerVersion:3,segment:{x:0,y:0,z:0,blocks:[block]}});
    const e=encodeStarMadeInspectionFrame({kind:'end',status:'complete'}), joined=new Uint8Array(f.length+e.length);joined.set(f);joined.set(e,f.length);
    const result=await collect(readStarMadeInspectionStream(sequence([joined])));
    expect((result[0] as Extract<StarMadeInspectionStreamEvent,{kind:'segment'}>).segment.blocks[0]).toEqual({...block,extra:0});
  });
  it('bounds metadata allocations and rejects truncated/invalid frames', async () => {
    expect(()=>encodeStarMadeInspectionFrame({kind:'entity',node:{name:'x'.repeat(1024*1024)} as never})).toThrow('1 MiB');
    const fs=await frames();
    const emptyHeader=new Uint8Array(8), oversized=new Uint8Array(8), badWords=new Uint8Array(8);
    new DataView(oversized.buffer).setUint32(0,1024*1024+1,true);
    new DataView(badWords.buffer).setUint32(0,1,true); new DataView(badWords.buffer).setUint32(4,1,true);
    const invalid=[[],[fs[0]],[fs[0].subarray(0,2)],[fs[0].subarray(0,8)],[fs[0].subarray(0,10)],
      [fs[2],fs[0]],[emptyHeader],[oversized],[badWords],
      [raw({kind:'segment'})],[raw({kind:'unknown'})],[raw({kind:'end',status:'partial'})],
      [raw({kind:'entity'},new Uint8Array(131072))],
      [fs[1].subarray(0,fs[1].length-131072)],[fs[1].subarray(0,fs[1].length-1)]];
    for (const chunks of invalid) await expect(collect(readStarMadeInspectionStream(sequence(chunks)))).rejects.toThrow();
  });
  it('cancels its upstream on early return and handles iterators without return', async () => {
    let closed=false;const input=await frames();
    async function* source(){try{yield* input;}finally{closed=true;}}
    for await(const _event of readStarMadeInspectionStream(source()))break;
    expect(closed).toBe(true);
    let i=0;
    await collect(readStarMadeInspectionStream({[Symbol.asyncIterator](){return {next:async()=> i<input.length ? {done:false as const,value:input[i++]}:{done:true as const,value:undefined}};}}));
    const controller=new AbortController();controller.abort();
    await expect(collect(readStarMadeInspectionStream(sequence(input),controller.signal))).rejects.toThrow();
    const later=new AbortController();
    async function* cancelled(){yield input[2];later.abort();}
    await expect(collect(readStarMadeInspectionStream(cancelled(),later.signal))).rejects.toThrow();
  });
});
