import { segmentFromStarMadeWords, type StarMadeInspectionStreamEvent } from './streaming.js';

const MAX_HEADER = 1024 * 1024;
const WORD_BYTES = 32768 * 4;
/** Framing v1: uint32 LE JSON length, uint32 LE word length, UTF-8 metadata, then uint32 LE words. */
export function encodeStarMadeInspectionFrame(event: StarMadeInspectionStreamEvent): Uint8Array {
  const { kind } = event;
  const metadata = kind === 'segment'
    ? { kind, entityId: event.entityId, headerVersion: event.headerVersion, x: event.segment.x, y: event.segment.y, z: event.segment.z, version: event.segment.version, lastChanged: event.segment.lastChanged }
    : event;
  const header = new TextEncoder().encode(JSON.stringify(metadata));
  if (header.length > MAX_HEADER) throw new Error('Stream metadata exceeds 1 MiB');
  const bytes = new Uint8Array(8 + header.length + (kind === 'segment' ? WORD_BYTES : 0));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, header.length, true); view.setUint32(4, bytes.length - 8 - header.length, true);
  bytes.set(header, 8);
  if (kind === 'segment') {
    event.segment.blocks.forEach((b, i) => {
      view.setUint32(8 + header.length + i * 4, b.type | (b.hp << 13) | (Number(b.active) << 20) | (b.orientation << 21) | ((b.extra ?? 0) << 26), true);
    });
  }
  return bytes;
}

/** Consume bounded frames with backpressure. Missing/truncated completion is always an error. */
export async function* readStarMadeInspectionStream(source: AsyncIterable<Uint8Array>, signal?: AbortSignal): AsyncGenerator<StarMadeInspectionStreamEvent> {
  const iterator = source[Symbol.asyncIterator]();
  let chunk: Uint8Array = new Uint8Array(0);
  let offset = 0, complete = false;
  async function read(size: number): Promise<Uint8Array | undefined> {
    const bytes = new Uint8Array(size);
    let copied = 0;
    while (copied < size) {
      signal?.throwIfAborted();
      if (offset === chunk.length) {
        const next = await iterator.next();
        if (next.done) {
          if (copied) throw new Error('Truncated stream frame');
          return undefined;
        }
        chunk = next.value; offset = 0;
        if (!chunk.length) continue;
      }
      const count = Math.min(size - copied, chunk.length - offset);
      bytes.set(chunk.subarray(offset, offset + count), copied); offset += count; copied += count;
    }
    return bytes;
  }
  try {
    for (;;) {
      const prefix = await read(8);
      if (!prefix) break;
      if (complete) throw new Error('Frame after completion');
      const view = new DataView(prefix.buffer);
      const length = view.getUint32(0, true), wordsLength = view.getUint32(4, true);
      if (!length || length > MAX_HEADER || (wordsLength !== 0 && wordsLength !== WORD_BYTES)) throw new Error('Invalid stream frame size');
      const header = await read(length);
      if (!header) throw new Error('Missing stream metadata');
      const event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(header));
      if (event.kind === 'segment') {
        if (wordsLength !== WORD_BYTES) throw new Error('Missing stream words');
        const bytes = await read(wordsLength);
        if (!bytes) throw new Error('Missing stream payload');
        const words = new Uint32Array(32768), data = new DataView(bytes.buffer);
        for (let i = 0; i < words.length; i++) words[i] = data.getUint32(i * 4, true);
        yield { kind: 'segment', entityId: event.entityId, headerVersion: event.headerVersion, segment: segmentFromStarMadeWords({ ...event, words }) };
      } else {
        if (wordsLength || (event.kind !== 'entity' && event.kind !== 'end')) throw new Error('Invalid stream event');
        if (event.kind === 'end') {
          if (event.status !== 'complete') throw new Error('Incomplete stream');
          complete = true;
        } else yield event;
      }
    }
    signal?.throwIfAborted();
    if (!complete) throw new Error('Stream ended without completion');
    yield { kind: 'end', status: 'complete' };
  } finally {
    await iterator.return?.();
  }
}
