import { it, expect, vi } from 'vitest';
import { STARMADE_SHADER_SOURCES, setStarMadeShaderSources, loadStarMadeShaderSources } from '../src/shaders/sources.js';
it('registers a copied, frozen host corpus atomically and rejects malformed entries', () => {
  const original = STARMADE_SHADER_SOURCES;
  try {
    const source = { 'data/shader/custom.vert': 'void main() {}' };
    setStarMadeShaderSources(source); source['data/shader/custom.vert'] = 'changed';
    expect(STARMADE_SHADER_SOURCES['data/shader/custom.vert']).toBe('void main() {}');
    expect(Object.isFrozen(STARMADE_SHADER_SOURCES)).toBe(true);
    for (const value of [{ 'outside.vert': 'bad' }, { 'data/shader/../outside': 'bad' }, { 'data/shader/file': 4 }, { 'data/shader/folder/../../bad': 'bad' }]) {
      expect(() => setStarMadeShaderSources(value as unknown as Record<string, string>)).toThrow(/Invalid/);
      expect(STARMADE_SHADER_SOURCES['data/shader/custom.vert']).toBe('void main() {}');
    }
    setStarMadeShaderSources({ 'data/shader/empty.h': '' }); expect(STARMADE_SHADER_SOURCES['data/shader/empty.h']).toBe('');
    setStarMadeShaderSources({}); expect(Object.keys(STARMADE_SHADER_SOURCES)).toEqual([]);
  } finally { setStarMadeShaderSources(original); }
});
it('loads caller-owned shader assets, propagates abort and retains the prior corpus on failure', async () => {
  const original = STARMADE_SHADER_SOURCES;
  const request = vi.fn(); vi.stubGlobal('fetch', request);
  try {
    request.mockResolvedValue({ ok: true, json: async () => ({ 'data/shader/custom.frag': 'fragment' }) });
    const signal = new AbortController().signal;
    await loadStarMadeShaderSources('/my-shaders', signal);
    expect(request).toHaveBeenCalledWith('/my-shaders', { signal });
    expect(STARMADE_SHADER_SOURCES['data/shader/custom.frag']).toBe('fragment');
    for (const payload of [null, 4, [], { 'invalid': 'source' }]) {
      request.mockResolvedValue({ ok: true, json: async () => payload });
      await expect(loadStarMadeShaderSources('/invalid')).rejects.toThrow();
      expect(STARMADE_SHADER_SOURCES['data/shader/custom.frag']).toBe('fragment');
    }
    request.mockResolvedValue({ ok: false, status: 404 });
    await expect(loadStarMadeShaderSources('/missing')).rejects.toThrow('HTTP 404');
    request.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    await expect(loadStarMadeShaderSources('/aborted', signal)).rejects.toMatchObject({ name: 'AbortError' });
  } finally { vi.unstubAllGlobals(); setStarMadeShaderSources(original); }
});
