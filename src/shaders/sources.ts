/** Host-provided shader corpus. No StarMade shader assets are shipped in this package. */
export let STARMADE_SHADER_SOURCES: Readonly<Record<string, string>> = Object.freeze({});
/** @deprecated Historical name; paths are now supplied by the host. */
export type EmbeddedStarMadeShaderPath = string;

/** Atomically replace the corpus before creating native materials. Existing materials are unchanged. */
export function setStarMadeShaderSources(sources: Readonly<Record<string, string>>): void {
  const next: Record<string, string> = Object.create(null);
  for (const [path, source] of Object.entries(sources)) {
    if (!/^data\/shader\/[^\\\u0000]+$/.test(path) || path.split('/').includes('..') || typeof source !== 'string') {
      throw new Error(`Invalid StarMade shader entry: ${path}`);
    }
    next[path] = source;
  }
  STARMADE_SHADER_SOURCES = Object.freeze(next);
}

/** Load a JSON path-to-source dictionary from an application-owned URL, then register it atomically. */
export async function loadStarMadeShaderSources(url: string, signal?: AbortSignal): Promise<void> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`StarMade shader request failed: HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Expected a StarMade shader dictionary');
  setStarMadeShaderSources(payload as Record<string, string>);
}
