import { it, expect } from 'vitest';
import { MeshBasicMaterial } from 'three';
import { STARMADE_SHADER_SOURCES, setStarMadeShaderSources } from '../src/index.js';
import { bindStarMadeDisplayScanline } from '../src/viewer/displayScanline.js';
it('requires host shader assets rather than silently omitting native holography',()=>{
 const saved=STARMADE_SHADER_SOURCES;setStarMadeShaderSources({});
 try {expect(()=>bindStarMadeDisplayScanline(new MeshBasicMaterial())).toThrow('scanline');}
 finally {setStarMadeShaderSources(saved);}
});
