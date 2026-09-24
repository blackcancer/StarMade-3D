import { once } from 'node:events';
/** Host endpoint: no buffering of the complete blueprint; response drain drives Decoder iteration. */
export async function sendBlueprintStream(res, source, encode, signal) {
  res.setHeader('Content-Type', 'application/vnd.starmade.inspection-stream; version=1');
  res.setHeader('Cache-Control', 'no-store');
  for await (const event of source) {
    if (res.destroyed) break;
    if (!res.write(encode(event))) await once(res, 'drain', { signal });
  }
  res.end();
}
