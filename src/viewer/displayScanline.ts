import type { MeshBasicMaterial } from 'three';
import { STARMADE_SHADER_SOURCES } from '../shaders/sources.js';

/** Adapt the host-owned native GLSL 1.20 fragment to Three's mapped material pass. */
export function bindStarMadeDisplayScanline(material: MeshBasicMaterial) {
  const native = STARMADE_SHADER_SOURCES['data/shader/scanline/scanline.frag.glsl'];
  if (!native) throw Error('Missing native display scanline shader source');
  const source = native.replace(/^\s*#version[^\n]*/m,'')
    .replace(/varying\s+vec4\s+tCol\s*;/,'const vec4 tCol = vec4(1.0);')
    .replace(/gl_TexCoord\[0\]/g,'vec4(vMapUv,0.0,1.0)')
    .replace(/\brand\b/g,'starMadeDisplayRand')
    .replace(/gl_FragColor/g,'smDisplayColor')
    .replace(/void\s+main\s*\(\s*\)\s*\{/, 'vec4 starMadeDisplayScanline() { vec4 smDisplayColor;')
    .replace(/}\s*$/, 'return smDisplayColor; }');
  const uniforms = { uTime:{value:0}, smDisplayHolographic:{value:true}, uDiffuseTexture:{value:material.map} };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', source+'\nuniform bool smDisplayHolographic;\nvoid main() {')
      .replace('#include <map_fragment>', 'if (smDisplayHolographic) { diffuseColor *= starMadeDisplayScanline(); } else {\n#include <map_fragment>\n}');
  };
  material.customProgramCacheKey = () => 'starmade-display-scanline:'+source;
  return uniforms;
}
