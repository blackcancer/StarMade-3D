import { it, expect, vi } from 'vitest';
import { InspectionResourceManager } from '../src/inspection/resources.js';
const turn = () => new Promise(resolve => setTimeout(resolve, 0));
it('shares concurrent loads, reports progress, caches live resources and destroys only on last release', async () => {
  let done!: (value: object) => void; let report!: (p: { loaded: number; total: number | null }) => void;
  const load = vi.fn((_key, _signal, p) => { report = p; return new Promise<object>(resolve => { done = resolve; }); });
  const destroy = vi.fn(); const pool = new InspectionResourceManager(load, destroy);
  const progress = vi.fn(); const a = pool.acquire('texture', { progress }); const b = pool.acquire('texture');
  await turn(); expect(load).toHaveBeenCalledTimes(1); report({ loaded: 4, total: 8 });
  expect(progress).toHaveBeenLastCalledWith({ loaded: 4, total: 8 });
  const asset = {}; done(asset); expect(await a.value).toBe(asset); expect(await b.value).toBe(asset);
  const c = pool.acquire('texture'); expect(await c.value).toBe(asset); expect(load).toHaveBeenCalledTimes(1);
  a.release(); a.release(); b.release(); expect(destroy).not.toHaveBeenCalled();
  c.release(); expect(destroy).toHaveBeenCalledExactlyOnceWith(asset); pool.dispose(); pool.dispose();
  expect(() => pool.acquire('x')).toThrow(/disposed/);
});
it('cancels one consumer without aborting another and disposes late results after all release', async () => {
  let done!: (value: string) => void; let signal!: AbortSignal;
  const destroy = vi.fn(); const pool = new InspectionResourceManager<string>((_key, s) => { signal = s; return new Promise(resolve => { done = resolve; }); }, destroy);
  const abort = new AbortController(); const a = pool.acquire('m', { signal: abort.signal }); const b = pool.acquire('m');
  const rejection = expect(a.value).rejects.toMatchObject({ name: 'AbortError' });
  await turn(); abort.abort(); await rejection; expect(signal.aborted).toBe(false);
  const rejectedB = expect(b.value).rejects.toMatchObject({ name: 'AbortError' }); b.release(); await rejectedB;
  expect(signal.aborted).toBe(true); done('late'); await turn(); expect(destroy).toHaveBeenCalledWith('late');
  const pre = pool.acquire('m', { signal: abort.signal }); await expect(pre.value).rejects.toMatchObject({ name: 'AbortError' }); pre.release();
});
it('keeps retry requests separate from failed handles, diagnoses failures and cancels pending work on dispose', async () => {
  const diagnostic = vi.fn(); let count = 0;
  const pool = new InspectionResourceManager(async () => { if (count++ === 0) throw Error('missing'); return 'ok'; }, vi.fn(), diagnostic);
  const failed = pool.acquire('asset'); await expect(failed.value).rejects.toThrow('missing');
  expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ code: 'asset-load-failed' }));
  const retry = pool.acquire('asset'); failed.release(); expect(await retry.value).toBe('ok'); pool.dispose();
  const noDiagnostic = vi.fn();
  const cancelled = new InspectionResourceManager(async (_key, signal) => { await turn(); if (signal.aborted) throw Error('abort'); return 'x'; }, vi.fn(), noDiagnostic);
  const handle = cancelled.acquire('asset'); const rejection = expect(handle.value).rejects.toMatchObject({ name: 'AbortError' });
  cancelled.dispose(); await rejection; await turn(); await turn(); expect(noDiagnostic).not.toHaveBeenCalled();
  const defaultDiagnostic = new InspectionResourceManager(async () => { throw Error('default'); }, vi.fn());
  const missing = defaultDiagnostic.acquire('x'); await expect(missing.value).rejects.toThrow('default'); missing.release();
});
