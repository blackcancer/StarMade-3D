import type { InspectionDiagnostic } from './analysis.js';
export interface AssetProgress { readonly loaded: number; readonly total: number | null }
export interface InspectionAssetHandle<T> { readonly value: Promise<T>; release(): void }
export interface InspectionAssetRequest { readonly signal?: AbortSignal; readonly progress?: (progress: AssetProgress) => void }
interface Subscriber<T> { resolve(value: T): void; reject(reason: unknown): void; progress?: (progress: AssetProgress) => void; release(): void }
interface AssetEntry<T> { controller: AbortController; subscribers: Set<Subscriber<T>>; ready: boolean; value?: T; progress: AssetProgress }
const cancelled = () => new DOMException('Asset request released or cancelled', 'AbortError');

/** Cache lifetime is explicit: one acquisition per consumer, exactly one disposal after the last release. */
export class InspectionResourceManager<T> {
  private readonly entries = new Map<string, AssetEntry<T>>();
  private closed = false;
  constructor(
    private readonly load: (key: string, signal: AbortSignal, progress: (value: AssetProgress) => void) => Promise<T>,
    private readonly destroy: (value: T) => void,
    private readonly diagnostic: (diagnostic: InspectionDiagnostic) => void = () => {}
  ) {}
  acquire(key: string, request: InspectionAssetRequest = {}): InspectionAssetHandle<T> {
    if (this.closed) throw new Error('Resource manager disposed');
    if (request.signal?.aborted) return { value: Promise.reject(cancelled()), release() {} };
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { controller: new AbortController(), subscribers: new Set(), ready: false, progress: { loaded: 0, total: null } };
      this.entries.set(key, entry);
      this.start(key, entry);
    }
    const current = entry;
    let released = false;
    let subscriber: Subscriber<T>;
    const release = () => {
      if (released) return;
      released = true;
      request.signal?.removeEventListener('abort', release);
      current.subscribers.delete(subscriber); subscriber.reject(cancelled());
      if (current.subscribers.size === 0) {
        if (this.entries.get(key) === current) this.entries.delete(key);
        current.controller.abort();
        if (current.ready) this.destroy(current.value!);
      }
    };
    const value = new Promise<T>((resolve, reject) => { subscriber = { resolve, reject, progress: request.progress, release }; });
    current.subscribers.add(subscriber!);
    request.signal?.addEventListener('abort', release, { once: true });
    if (current.ready) subscriber!.resolve(current.value!);
    request.progress?.(current.progress);
    return { value, release };
  }
  private start(key: string, entry: AssetEntry<T>): void {
    Promise.resolve().then(() => this.load(key, entry.controller.signal, progress => {
      entry.progress = progress;
      for (const subscriber of entry.subscribers) subscriber.progress?.(progress);
    })).then(value => {
      if (entry.subscribers.size === 0) { this.destroy(value); return; }
      entry.ready = true; entry.value = value;
      for (const subscriber of entry.subscribers) subscriber.resolve(value);
    }, error => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      if (!entry.controller.signal.aborted) this.diagnostic({ code: 'asset-load-failed', message: `${key}: ${String(error)}` });
      for (const subscriber of entry.subscribers) subscriber.reject(error);
    });
  }
  dispose(): void {
    this.closed = true;
    for (const entry of this.entries.values()) for (const subscriber of [...entry.subscribers]) subscriber.release();
    this.entries.clear();
  }
}
