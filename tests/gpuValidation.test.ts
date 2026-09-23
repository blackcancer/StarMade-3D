import { describe, expect, it, vi } from "vitest";
import {compileStarMadeWebgl2ShaderProgram, createStarMadeThreeShaderProgramSources} from '../src/shaders/gpuValidation';
import {STARMADE_SHADER_PROGRAMS} from '../src/shaders/programs';

/** Tests resource ownership and source preparation, not GPU driver correctness. */
function context(options: {noShader?: number; noProgram?: boolean; failedShader?: number; failedLink?: boolean; nullLogs?: boolean; throwCompile?: number; throwLink?: boolean} = {}) {
  const scripts = new Map<WebGLShader,string>(); const deleted: WebGLShader[] = []; const detached: WebGLShader[] = [];
  const program = {} as WebGLProgram;
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713, LINK_STATUS: 35714,
    createShader: vi.fn((type: number) => options.noShader === type ? null : ({type} as WebGLShader)),
    shaderSource: vi.fn((shader:WebGLShader,source:string) => {scripts.set(shader,source);}),
    compileShader: vi.fn((shader:WebGLShader) => {if (options.throwCompile === (shader as unknown as {type:number}).type) throw new Error('compile wrapper failed');}),
    getShaderParameter: vi.fn((shader:WebGLShader) => options.failedShader !== (shader as unknown as {type:number}).type),
    getShaderInfoLog: vi.fn(() => options.nullLogs ? null : ' shader diagnostic \n'),
    createProgram: vi.fn(() => options.noProgram ? null : program),
    attachShader: vi.fn(), detachShader: vi.fn((_program:WebGLProgram,shader:WebGLShader) => {detached.push(shader);}),
    linkProgram: vi.fn(() => {if (options.throwLink) throw new Error('link wrapper failed');}),
    getProgramParameter: vi.fn(() => !options.failedLink),
    getProgramInfoLog: vi.fn(() => options.nullLogs ? null : ' program diagnostic \n'),
    deleteShader: vi.fn((shader:WebGLShader) => {deleted.push(shader);}), deleteProgram: vi.fn()
  };
  return {gl:gl as unknown as WebGL2RenderingContext, calls:gl, scripts, deleted, detached};
}
const sources = {vertexSource:'void main(){gl_Position=vec4(0.0);}',fragmentSource:'void main(){}'};
describe('WebGL compile orchestration (context double)', () => {
  it('reports trimmed logs without leaking handles and releases successful programs', () => {
    const c=context();
    expect(compileStarMadeWebgl2ShaderProgram(c.gl,sources)).toEqual({ok:true,vertex:{ok:true,log:'shader diagnostic'},fragment:{ok:true,log:'shader diagnostic'},programLog:'program diagnostic'});
    expect(c.deleted).toHaveLength(2); expect(c.detached).toEqual(c.deleted);
    expect(c.calls.deleteProgram).toHaveBeenCalledTimes(1);
  });
  it.each([{noShader:35633},{noShader:35632},{failedShader:35633},{failedShader:35632},{failedLink:true},{noProgram:true}])('reports failure and still cleans up %j', options => {
    const c=context(options); const result=compileStarMadeWebgl2ShaderProgram(c.gl,sources);
    expect(result.ok).toBe(false);
    expect(c.deleted).toHaveLength(options.noShader ? 1 : 2);
    expect(c.detached).toHaveLength(options.noProgram ? 0 : c.deleted.length);
    expect(c.calls.deleteProgram).toHaveBeenCalledTimes(options.noProgram ? 0 : 1);
    expect(Object.keys(result.vertex)).toEqual(['ok','log']);
  });
  it.each([{throwCompile:35633},{throwCompile:35632},{throwLink:true}])('cleans up exceptions at each lifecycle boundary %j', options => {
    const c=context(options);
    expect(() => compileStarMadeWebgl2ShaderProgram(c.gl,sources)).toThrow(/wrapper failed/);
    expect(c.deleted).toHaveLength(options.throwCompile===35633 ? 1 : 2);
    expect(new Set(c.deleted).size).toBe(c.deleted.length);
    expect(c.calls.deleteProgram).toHaveBeenCalledTimes(options.throwLink ? 1 : 0);
  });
  it('normalizes absent diagnostic logs', () => {
    const c=context({nullLogs:true});
    expect(compileStarMadeWebgl2ShaderProgram(c.gl,sources)).toEqual({ok:true,vertex:{ok:true,log:''},fragment:{ok:true,log:''},programLog:''});
  });
  it('injects only undeclared Three built-ins, after the GLSL version and precision header', () => {
    const c=context();
    const vertexSource='#version 300 es\nprecision highp float;\nprecision highp int;\nvoid main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normalMatrix*normal+color+vec3(uv,0.0),1.0);}';
    compileStarMadeWebgl2ShaderProgram(c.gl,{...sources,vertexSource});
    const value=[...c.scripts.values()][0];
    expect(value.startsWith('#version 300 es\nprecision highp float;\nprecision highp int;\nin vec3 position;')).toBe(true);
    for (const [name, declaration] of [['position','in vec3 position;'],['normal','in vec3 normal;'],['color','in vec3 color;'],['uv','in vec2 uv;'],['modelViewMatrix','uniform mat4 modelViewMatrix;'],['projectionMatrix','uniform mat4 projectionMatrix;'],['normalMatrix','uniform mat3 normalMatrix;']]) {
      const c2=context(); const declared=vertexSource.replace('void main()',`${declaration}\nvoid main()`);
      compileStarMadeWebgl2ShaderProgram(c2.gl,{...sources,vertexSource:declared});
      expect([...c2.scripts.values()][0].split(declaration).length-1, name).toBe(1);
    }
    expect([...c.scripts.values()][1]).toBe(sources.fragmentSource);
  });
  it('does not mistake longer identifiers for Three attributes and accepts header-less sources', () => {
    const c=context();const vertexSource='void main(){gl_Position=vec4(position,1.0);}';
    compileStarMadeWebgl2ShaderProgram(c.gl,{...sources,vertexSource});
    expect([...c.scripts.values()][0]).toBe(`in vec3 position;\n${vertexSource}`);
    const d=context();const local='void main(){float normalStrength=1.0; gl_Position=vec4(normalStrength);}';
    compileStarMadeWebgl2ShaderProgram(d.gl,{...sources,vertexSource:local});
    expect([...d.scripts.values()][0]).toBe(local);
  });
  it('prepares every registered source family without assuming all programs use cube patches', () => {
    for(const program of Object.values(STARMADE_SHADER_PROGRAMS)) {
      for(const target of ['webgl1','webgl2'] as const) {
        const pair=createStarMadeThreeShaderProgramSources(program.id,{target,includeDefaultDefines:false});
        expect(pair.id).toBe(program.id); expect(pair.vertexSource.length).toBeGreaterThan(0); expect(pair.fragmentSource.length).toBeGreaterThan(0);
      }
    }
  });
});
