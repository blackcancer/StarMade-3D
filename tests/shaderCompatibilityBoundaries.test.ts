import { describe, expect, it } from "vitest";
import { GLSL3, NearestFilter, NoBlending, ShaderMaterial, Texture, Vector2 } from "three";
import { adaptStarMadeShaderToThree } from "../src/shaders/compat";
import { analyzeStarMadeShaderThreeCompatibility } from "../src/shaders/compatibility";
import { inspectStarMadeShaderProgram, inspectStarMadeShaderSource } from "../src/shaders/inspect";
import { getEmbeddedStarMadeShaderSource, preprocessStarMadeShader } from "../src/shaders/preprocess";
import { createStarMadeOutlineMaterial } from "../src/shaders/outlineMaterial";
import { updateStarMadeEffectTime } from "../src/shaders/effectsMaterials";

describe("legacy shader adaptation boundaries", () => {
  it("reports unmappable unindexed uniforms and additional UV channels", () => {
    const source = "gl_LightSource; gl_TexCoord; gl_FrontLightProduct; gl_MultiTexCoord2; gl_MultiTexCoord0; gl_MultiTexCoord1;";
    const adapted = adaptStarMadeShaderToThree(source, {stage:"fragment"});
    expect(adapted.source).toBe(source);
    expect(adapted.warnings).toEqual([
      "gl_MultiTexCoord1 requires an additional Three.js UV attribute mapping",
      "gl_MultiTexCoord2 requires an additional Three.js UV attribute mapping",
      "unindexed gl_LightSource usage requires manual review",
      "unindexed gl_TexCoord usage requires manual review",
      "unsupported fixed-function material, light model or fog usage requires manual review"
    ]);
  });

  it("rejects invalid attribute names and preserves an existing attribute declaration", () => {
    expect(() => adaptStarMadeShaderToThree("gl_Vertex;", {stage:"vertex", vertexAttributeName:"a; discard"}))
      .toThrow("Invalid GLSL attribute name");
    const adapted = adaptStarMadeShaderToThree("attribute vec4 packed;\nvoid main(){gl_Position=gl_Vertex;}",
      {stage:"vertex", vertexAttributeName:"packed"});
    expect(adapted.source).toBe("attribute vec4 packed;\nvoid main(){gl_Position=packed;}");
    expect(adapted.warnings).toEqual([]);
  });

  it("sizes matrix and light arrays for all numeric slots, including indices beyond defaults", () => {
    const adapted = adaptStarMadeShaderToThree("gl_TextureMatrix[12] * gl_TextureMatrix[2]; gl_LightSource[9].diffuse + gl_LightSource[1].diffuse;", {stage:"vertex"});
    expect(adapted.source).toContain("uniform mat4 starMadeTextureMatrices[13];");
    expect(adapted.source).toContain("uniform StarMadeCompatLightSource starMadeLightSources[10];");
    expect(adapted.source).toContain("starMadeTextureMatrices[12] * starMadeTextureMatrices[2]");
    expect(adapted.source).toContain("starMadeLightSources[9].diffuse + starMadeLightSources[1].diffuse");
  });

  it("uses a caller's light count for dynamic indices and retains supplied declarations", () => {
    const dynamic = adaptStarMadeShaderToThree("gl_LightSource[i].position;", {stage:"vertex", lightSourceCount:3});
    expect(dynamic.source).toContain("uniform StarMadeCompatLightSource starMadeLightSources[3];");
    const source = [
      "struct StarMadeCompatLightSource { vec4 position; };",
      "uniform StarMadeCompatLightSource starMadeLightSources[3];",
      "uniform mat4 starMadeTextureMatrices[3];",
      "gl_LightSource[2].position; gl_TextureMatrix[2];"
    ].join("\n");
    const adapted = adaptStarMadeShaderToThree(source, {stage:"vertex"});
    expect(adapted.source).toBe(source.replace("gl_LightSource[2]", "starMadeLightSources[2]")
      .replace("gl_TextureMatrix[2]", "starMadeTextureMatrices[2]"));
  });

  it("classifies extension-only shaders as adaptable and preserves unknown built-in mappings", () => {
    const extension = inspectStarMadeShaderSource("#extension GL_EXT_shader_texture_lod : enable\nvoid main(){}");
    expect(analyzeStarMadeShaderThreeCompatibility(extension)).toMatchObject({path:"", compatibility:"adaptable"});
    const mapping = analyzeStarMadeShaderThreeCompatibility(inspectStarMadeShaderSource("gl_MultiTexCoord3;"));
    expect(mapping.compatibility).toBe("requires-mapping");
    expect(mapping.requiredMappings).toEqual(["gl_MultiTexCoord3"]);
    expect(analyzeStarMadeShaderThreeCompatibility(inspectStarMadeShaderSource("void main(){}")))
      .toMatchObject({path:"", compatibility:"direct", requiredMappings:[], requiredFeatures:[]});
  });

  it("inspects default program defines and accepts an explicit texture-array variant", () => {
    const defaults = inspectStarMadeShaderProgram("cube.quads13");
    const explicit = inspectStarMadeShaderProgram("cube.quads13", {includeDefaultDefines:false, defines:["texarray"]});
    expect(defaults.id).toBe("cube.quads13");
    expect(defaults.fragment.usesTextureArrays).toBe(false);
    expect(explicit.fragment.usesTextureArrays).toBe(true);
    expect(defaults.vertex.imports).toEqual([]);
    expect(explicit.fragment.imports).toEqual([]);
  });

  it("rejects unknown embedded shaders while resolving explicit import source maps", () => {
    expect(() => getEmbeddedStarMadeShaderSource("data/shader/missing.glsl"))
      .toThrow("Unknown embedded StarMade shader source");
    expect(preprocessStarMadeShader('#IMPORT "shared.glsl"\nvoid main(){}', {sources:{"shared.glsl":"uniform float time;"}}))
      .toBe("uniform float time;\nvoid main(){}");
    expect(() => preprocessStarMadeShader("#IMPORT missing.glsl")).toThrow("Missing StarMade shader import");
  });
});

describe("effect material boundary behavior", () => {
  it("uses the supplied render textures and viewport for all nine outline samples", () => {
    const rendered = new Texture();
    const depth = new Texture();
    const material = createStarMadeOutlineMaterial({renderedTexture:rendered, depthTexture:depth,
      viewportSize:new Vector2(4, 2), meshForce:0});
    expect(material.uniforms.bgl_RenderedTexture.value).toBe(rendered);
    expect(material.uniforms.bgl_DepthTexture.value).toBe(depth);
    expect(material.uniforms.bgl_MeshForce.value).toBe(0);
    expect(material.uniforms.bgl_TextureCoordinateOffset.value.map((v:Vector2) => v.toArray())).toEqual([
      [-.25,-.5],[0,-.5],[.25,-.5],[-.25,0],[0,0],[.25,0],[-.25,.5],[0,.5],[.25,.5]
    ]);
    expect([rendered.minFilter, rendered.magFilter]).toEqual([NearestFilter, NearestFilter]);
    expect([material.depthTest, material.depthWrite, material.blending, material.glslVersion]).toEqual([false,false,NoBlending,GLSL3]);
    material.dispose(); rendered.dispose(); depth.dispose();
  });

  it("advances each effect clock at its own rate and leaves unrelated uniforms unchanged", () => {
    const material = new ShaderMaterial({uniforms:{ticks:{value:10}, beamTime:{value:2}, cMove:{value:.5}, untouched:{value:7}}});
    updateStarMadeEffectTime(material, 2);
    expect(Object.fromEntries(Object.entries(material.uniforms).map(([key, uniform]) => [key,uniform.value])))
      .toEqual({ticks:130, beamTime:4, cMove:.52, untouched:7});
    material.dispose();
  });
});
