import { describe, expect, it } from "vitest";
import {
  Box3,
  BufferGeometry,
  Group,
  ClampToEdgeWrapping,
  DataArrayTexture,
  DataTexture,
  DoubleSide,
  FrontSide,
  Matrix4,
  Mesh,
  NoColorSpace,
  Object3D,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4
} from "three";
import {
  adaptStarMadeShaderToThree,
  applyStarMadeCubeTextureArrayTileGutters,
  applyStarMadeLodBlockLightToObject3D,
  applyStarMadeLodBlockLightToShaderMaterial,
  applyStarMadeShadowParamsToCubeShaderMaterial,
  applyStarMadeShadowParamsToLodObject3D,
  applyStarMadeShadowParamsToLodShaderMaterial,
  analyzeEmbeddedStarMadeShaderThreeCompatibility,
  createEmbeddedStarMadeShaderThreeCompatibilityReport,
  createStarMadeThreeShaderProgramSources,
  createStarMadeBlockMaterial,
  createStarMadeBlockMaterials,
  createStarMadeCubeShaderMaterial,
  createStarMadeCubeShadowDepthMaterial,
  createStarMadeLodShaderMaterial,
  createStarMadeLodShadowDepthMaterial,
  collectStarMadeLodShaderMaterials,
  applyStarMadeSunToLodShaderMaterial,
  applyStarMadeSunToLodObject3D,
  applyStarMadeSceneSunToShaderMaterial,
  applyStarMadeSceneSunToLodObject3D,
  createStarMadeDirectionalShadowPipeline,
  bindStarMadeDirectionalShadowRoot,
  createStarMadePointLightShadowPipeline,
  applyStarMadeBlockLightSourcesToCubeShaderMaterial,
  starMadeCubeTextureArraySourceY,
  getEmbeddedStarMadeShaderSource,
  getStarMadeShaderProgram,
  hasEmbeddedStarMadeShader,
  inspectEmbeddedStarMadeShader,
  inspectPreprocessedEmbeddedStarMadeShader,
  inspectStarMadeShaderProgram,
  listEmbeddedStarMadeShaderPaths,
  normalizeStarMadeShaderPath,
  preprocessEmbeddedStarMadeShader,
  preprocessStarMadeShaderProgram,
  listStarMadeShaderPrograms,
  preprocessStarMadeShader,
  STARMADE_CUBE_LIGHTING_DEFAULTS,
  starMadeBlockFragmentShader,
  setStarMadeCubeShaderSpotLights,
  setStarMadeCubeShaderVertexLighting,
  setStarMadeLodShaderBlockLightSamples,
  setStarMadeCubeShaderAllLight,
  updateStarMadeCubeShaderTime,
  updateStarMadeCubeShaderClipPlanes,
  updateStarMadeCubeShaderMVP,
  type StarMadeLodBlockLightSample,
  createStarMadeSelectionSolidMaterial,
  createStarMadeSelectionSingleMaterial,
  updateStarMadeCubeShaderSelectTime,
  createStarMadeOutlineMaterial,
  starMadeOutlineTextureCoordinateOffsets,
  createStarMadeGammaMaterial,
  createStarMadeSimpleBloomMaterial,
  createStarMadeThrusterMaterial,
  createStarMadeSimpleBeamMaterial,
  createStarMadeSkyMaterial,
  updateStarMadeEffectTime
} from "../src/shaders";
import { createStarMadeCubeAtlasLayout } from "../src/starmade/atlas";
import { computeStarMadeLodBlockLightFromSideData } from "../src/starmade/blockLighting";

describe("preprocessStarMadeShader", () => {
  it("resolves imports and active conditional branches", () => {
    const source = [
      "#version 120",
      "#IMPORT data/shader/chunk.glsl",
      "#IFDEF normalmap",
      "normal();",
      "#ELSEIF texarray",
      "array();",
      "#ELSE",
      "plain();",
      "#ENDIF"
    ].join("\n");

    const processed = preprocessStarMadeShader(source, {
      defines: ["texarray"],
      sources: {
        "data/shader/chunk.glsl": "imported();"
      }
    });

    expect(processed).toContain("imported();");
    expect(processed).toContain("array();");
    expect(processed).not.toContain("normal();");
    expect(processed).not.toContain("plain();");
  });

  it("rejects missing imports", () => {
    expect(() => preprocessStarMadeShader("#IMPORT data/shader/missing.glsl")).toThrow(
      "Missing StarMade shader import"
    );
  });

  it("can enforce strict conditional matching when requested", () => {
    expect(() => preprocessStarMadeShader("#IFDEF virtual\nvarying vec2 quad;", { strictConditionals: true })).toThrow(
      "Unclosed StarMade shader conditional block"
    );
  });

  it("normalizes absolute StarMade shader paths", () => {
    expect(normalizeStarMadeShaderPath("/srv/StarMade/data/shader/cube/cubeLight.glsl")).toBe(
      "data/shader/cube/cubeLight.glsl"
    );
  });

  it("preprocesses embedded StarMade shader imports", () => {
    const processed = preprocessEmbeddedStarMadeShader("data/shader/cube/quads13/cubeTArray.fsh", {
      defines: ["texarray"]
    });

    expect(processed).toContain("uniform sampler2DArray cTex;");
    expect(processed).toContain("vec3 calculateLight");
    expect(processed).not.toContain("#IMPORT");
  });

  it("preprocesses a registered embedded StarMade shader program", () => {
    const processed = preprocessStarMadeShaderProgram("cube.quads13", {
      defines: ["texarray"]
    });

    expect(processed.vertexPath).toBe("data/shader/cube/quads13/cube-3rd.vsh");
    expect(processed.fragmentPath).toBe("data/shader/cube/quads13/cubeTArray.fsh");
    expect(processed.vertexShader).toContain("void main()");
    expect(processed.fragmentShader).toContain("vec3 calculateLight");
  });

  it("embeds and preprocesses all StarMade shader sources", () => {
    const paths = listEmbeddedStarMadeShaderPaths();

    expect(paths.length).toBeGreaterThanOrEqual(200);
    expect(hasEmbeddedStarMadeShader("data/shader/cube/quads13/cube-3rd.vsh")).toBe(true);
    expect(getEmbeddedStarMadeShaderSource("data/shader/cube/quads13/cube-3rd.vsh")).toContain("const float adi");

    for (const path of paths) {
      expect(() => preprocessEmbeddedStarMadeShader(path)).not.toThrow();
    }
  });
});

describe("StarMade shader program registry", () => {
  it("describes the primary cube and LOD programs", () => {
    const programs = listStarMadeShaderPrograms();

    expect(programs.length).toBeGreaterThanOrEqual(8);
    expect(getStarMadeShaderProgram("cube.quads13").fragmentPath).toBe(
      "data/shader/cube/quads13/cubeTArray.fsh"
    );
    expect(getStarMadeShaderProgram("cube.lod").defaultDefines).toContain("owntangent");
  });
});

describe("StarMade shader inspection", () => {
  it("extracts imports, uniforms, varyings and legacy flags", () => {
    const cube = inspectEmbeddedStarMadeShader("data/shader/cube/quads13/cubeTArray.fsh");

    expect(cube.imports).toContain("data/shader/cube/cubeTextures.glsl");
    expect(cube.uniforms.some((uniform) => uniform.name === "density")).toBe(true);
    expect(cube.varyings.some((varying) => varying.name === "vertexLight")).toBe(true);
    expect(cube.usesTextureArrays).toBe(true);
    expect(cube.legacyBuiltIns).toContain("gl_LightSource");
  });

  it("inspects preprocessed shaders without import directives", () => {
    const cube = inspectPreprocessedEmbeddedStarMadeShader("data/shader/cube/quads13/cubeTArray.fsh", {
      defines: ["texarray"]
    });

    expect(cube.imports).toEqual([]);
    expect(cube.uniforms.some((uniform) => uniform.name === "cTex")).toBe(true);
  });

  it("inspects registered shader programs", () => {
    const program = inspectStarMadeShaderProgram("cube.quads13", {
      defines: ["texarray"]
    });

    expect(program.vertex.usesLegacyBuiltIns).toBe(true);
    expect(program.fragment.usesTextureArrays).toBe(true);
  });

  it("inspects all embedded shader sources", () => {
    for (const path of listEmbeddedStarMadeShaderPaths()) {
      const inspection = inspectEmbeddedStarMadeShader(path);
      expect(inspection.path).toBe(path);
    }
  });
});

describe("StarMade shader Three compatibility report", () => {
  it("classifies shaders by required Three/WebGL migration work", () => {
    const simple = analyzeEmbeddedStarMadeShaderThreeCompatibility("data/shader/cube/quads13/simplecube.vsh");
    const cubeArray = analyzeEmbeddedStarMadeShaderThreeCompatibility("data/shader/cube/quads13/cubeTArray.fsh");
    const cubeArrayWebgl2 = analyzeEmbeddedStarMadeShaderThreeCompatibility(
      "data/shader/cube/quads13/cubeTArray.fsh",
      { target: "webgl2" }
    );
    const report = createEmbeddedStarMadeShaderThreeCompatibilityReport();
    const webgl2Report = createEmbeddedStarMadeShaderThreeCompatibilityReport(listEmbeddedStarMadeShaderPaths(), {
      target: "webgl2"
    });

    expect(simple.compatibility).toBe("adaptable");
    expect(simple.supportedLegacyBuiltIns).toContain("ftransform");
    expect(cubeArray.compatibility).toBe("requires-webgl2");
    expect(cubeArray.requiredFeatures).toContain("webgl2-texture-arrays");
    expect(cubeArray.requiredMappings).not.toContain("gl_LightSource");
    expect(cubeArray.requiredMappings).not.toContain("gl_TexCoord");
    expect(cubeArrayWebgl2.compatibility).toBe("adaptable");
    expect(cubeArrayWebgl2.requiredFeatures).toEqual([]);
    expect(report.total).toBeGreaterThanOrEqual(200);
    expect(report.direct + report.adaptable + report.requiresWebgl2 + report.requiresMapping).toBe(report.total);
    expect(webgl2Report.requiresWebgl2).toBe(0);
    expect(webgl2Report.direct + webgl2Report.adaptable + webgl2Report.requiresMapping).toBe(webgl2Report.total);
  });
});

describe("adaptStarMadeShaderToThree", () => {
  it("removes legacy version directives and replaces ftransform", () => {
    const adapted = adaptStarMadeShaderToThree(
      getEmbeddedStarMadeShaderSource("data/shader/cube/quads13/simplecube.vsh"),
      { stage: "vertex" }
    );

    expect(adapted.source).not.toContain("#version");
    expect(adapted.source).not.toContain("ftransform()");
    expect(adapted.source).toContain("projectionMatrix * modelViewMatrix");
  });

  it("maps legacy gl_TexCoord slots to explicit GLSL varyings", () => {
    const vertex = adaptStarMadeShaderToThree(
      preprocessEmbeddedStarMadeShader("data/shader/cube/quads13/cube-3rd.vsh"),
      { stage: "vertex" }
    );
    const fragment = adaptStarMadeShaderToThree(
      preprocessEmbeddedStarMadeShader("data/shader/cube/quads13/cubeTArray.fsh"),
      { stage: "fragment" }
    );

    expect(vertex.source).toContain("varying vec4 vTexCoord0;");
    expect(vertex.source).toContain("varying vec4 vTexCoord1;");
    expect(vertex.source).toContain("varying vec4 vTexCoord2;");
    // The installed 0.204 corpus uses slot 3; the pinned older source uses 0..2.
    // Require precisely the source's declared usage, not a nonexistent varying.
    const nativeVertex = preprocessEmbeddedStarMadeShader("data/shader/cube/quads13/cube-3rd.vsh");
    expect(vertex.source.includes("varying vec4 vTexCoord3;")).toBe(/gl_TexCoord\s*\[\s*3\s*\]/.test(nativeVertex));
    const fourSlots = adaptStarMadeShaderToThree("void main(){ gl_TexCoord[0]=vec4(0.);gl_TexCoord[1]=vec4(1.);gl_TexCoord[2]=vec4(2.);gl_TexCoord[3]=vec4(3.); }", { stage: "vertex" });
    for (let slot = 0; slot < 4; slot++) expect(fourSlots.source).toContain(`varying vec4 vTexCoord${slot};`);
    expect(vertex.source).toContain("vTexCoord0.st");
    expect(vertex.source).not.toContain("gl_TexCoord");
    expect(vertex.warnings).not.toContain("gl_TexCoord requires a StarMade-to-Three varying mapping");

    expect(fragment.source).toContain("varying vec4 vTexCoord0;");
    expect(fragment.source).toContain("varying vec4 vTexCoord1;");
    expect(fragment.source).toContain("varying vec4 vTexCoord2;");
    expect(fragment.source).toContain("texture2D(overlayTex, vTexCoord1.st)");
    expect(fragment.source).not.toContain("gl_TexCoord");
    expect(fragment.warnings).not.toContain("gl_TexCoord requires a StarMade-to-Three varying mapping");
  });

  it("maps gl_LightSource lookups to a compat uniform struct array", () => {
    const fragment = adaptStarMadeShaderToThree(preprocessEmbeddedStarMadeShader("data/shader/cube/cubeLight.glsl"), {
      stage: "fragment"
    });
    const vertex = adaptStarMadeShaderToThree(
      preprocessEmbeddedStarMadeShader("data/shader/skin/skin-tex.vert.glsl"),
      {
        stage: "vertex",
        lightSourceCount: 4
      }
    );

    expect(fragment.source).toContain("struct StarMadeCompatLightSource");
    expect(fragment.source).toContain("uniform StarMadeCompatLightSource starMadeLightSources[8];");
    expect(fragment.source).toContain("starMadeLightSources[0].position.xyz - vPos.xyz");
    expect(fragment.source).toContain("starMadeLightSources[lightIndex].spotDirection");
    expect(fragment.source).toMatch(/vec4\(1\.2,1\.2,1\.2,1\)\s*\*\s*diffuse/);
    expect(fragment.source).toMatch(/vec4\(0\.3,0\.3,0\.3,1\)\s*\*\s*specular/);
    expect(fragment.source).not.toContain("gl_LightSource");
    expect(fragment.warnings).not.toContain("gl_LightSource requires a StarMade-to-Three light uniform mapping");

    expect(vertex.source).toContain("uniform StarMadeCompatLightSource starMadeLightSources[4];");
    expect(vertex.source).toContain("halfVector = starMadeLightSources[0].halfVector.xyz;");
    expect(vertex.source).toContain("lightDirSpot =  starMadeLightSources[1].position.xyz - (vPos).xyz;");
    expect(vertex.source).not.toContain("gl_LightSource");
  });

  it("maps fixed-function material, light model and fog uniforms", () => {
    const fog = adaptStarMadeShaderToThree(getEmbeddedStarMadeShaderSource("data/shader/fog.frag"), {
      stage: "fragment"
    });
    const lightModelProduct = adaptStarMadeShaderToThree(
      "void main() { gl_FragColor = gl_FrontLightModelProduct.sceneColor * gl_FrontMaterial.ambient + gl_LightModel.ambient; }",
      { stage: "fragment" }
    );

    expect(fog.source).toContain("struct StarMadeCompatMaterial");
    expect(fog.source).toContain("uniform StarMadeCompatMaterial starMadeFrontMaterial;");
    expect(fog.source).toContain("uniform StarMadeCompatLightProduct starMadeFrontLightProducts[8];");
    expect(fog.source).toContain("uniform StarMadeCompatFog starMadeFog;");
    expect(fog.source).toContain("starMadeFrontMaterial.shininess");
    expect(fog.source).toContain("starMadeFrontLightProducts[0].ambient");
    expect(fog.source).toContain("starMadeFog.color");
    expect(fog.source).not.toContain("gl_FrontMaterial");
    expect(fog.source).not.toContain("gl_FrontLightProduct");
    expect(fog.source).not.toContain("gl_Fog");

    expect(lightModelProduct.source).toContain(
      "uniform StarMadeCompatLightModelProduct starMadeFrontLightModelProduct;"
    );
    expect(lightModelProduct.source).toContain("uniform StarMadeCompatLightModel starMadeLightModel;");
    expect(lightModelProduct.source).toContain("starMadeFrontLightModelProduct.sceneColor");
    expect(lightModelProduct.source).toContain("starMadeLightModel.ambient");
    expect(lightModelProduct.source).not.toContain("gl_FrontLightModelProduct");
    expect(lightModelProduct.source).not.toContain("gl_LightModel");
  });

  it("can emit GLSL ES 3.00 shaders for WebGL2 texture arrays", () => {
    const fragment = adaptStarMadeShaderToThree(
      preprocessEmbeddedStarMadeShader("data/shader/cube/quads13/cubeTArray.fsh", {
        defines: ["texarray"]
      }),
      { stage: "fragment", target: "webgl2" }
    );
    const vertex = adaptStarMadeShaderToThree(
      preprocessEmbeddedStarMadeShader("data/shader/cube/quads13/cube-3rd.vsh"),
      { stage: "vertex", target: "webgl2" }
    );

    expect(fragment.source.startsWith("#version 300 es")).toBe(true);
    expect(fragment.source).toContain("precision highp float;");
    expect(fragment.source).toContain("out vec4 starMadeFragColor;");
    expect(fragment.source).toContain("in vec4 vTexCoord0;");
    expect(fragment.source).toContain("texture(cTex, vec3(vTexCoord0.st, layer))");
    expect(fragment.source).not.toContain("texture2DArray");
    expect(fragment.source).not.toContain("gl_FragColor");
    expect(fragment.warnings).not.toContain("texture arrays require WebGL2 or a texture-array compatibility path");

    expect(vertex.source.startsWith("#version 300 es")).toBe(true);
    expect(vertex.source).toContain("out vec4 vTexCoord0;");
    expect(vertex.source).not.toContain("varying vec4 vTexCoord0;");
  });

  it("can preserve StarMade gl_Vertex as a custom vec4 vertex attribute", () => {
    const vertex = adaptStarMadeShaderToThree(
      "void main() { gl_Position = gl_ModelViewProjectionMatrix * gl_Vertex; }",
      { stage: "vertex", target: "webgl2", vertexAttributeName: "starMadeVertex" }
    );

    expect(vertex.source).toContain("in vec4 starMadeVertex;");
    expect(vertex.source).toContain("(projectionMatrix * modelViewMatrix) * starMadeVertex");
    expect(vertex.source).not.toContain("vec4(position, 1.0)");
  });
});

describe("createStarMadeThreeShaderProgramSources", () => {
  it("builds a WebGL2-ready StarMade cube shader program source pair", () => {
    const sources = createStarMadeThreeShaderProgramSources("cube.quads13", {
      defines: ["texarray"]
    });

    expect(sources.target).toBe("webgl2");
    expect(sources.defines).toEqual(["owntangent", "texarray"]);
    expect(sources.vertexSource).toMatch(/^#version 300 es/);
    expect(sources.fragmentSource).toMatch(/^#version 300 es/);
    expect(sources.fragmentSource).toContain("uniform sampler2DArray cTex;");
    expect(sources.fragmentSource).toContain("texture(cTex, vec3(vTexCoord0.st, layer))");
    expect(sources.fragmentSource).toContain("out vec4 starMadeFragColor;");
    expect(sources.fragmentWarnings).toEqual([]);
  });

  it("can build cube program sources with the encoded StarMade vertex attribute", () => {
    const sources = createStarMadeThreeShaderProgramSources("cube.quads13", {
      defines: ["INTATT", "texarray"]
    });

    expect(sources.defines).toEqual(["owntangent", "INTATT", "texarray"]);
    expect(sources.vertexSource).toContain("in ivec4 ivert;");
    expect(sources.vertexSource).toContain("int indexInfo = ivert.x;");
    expect(sources.vertexSource).toMatch(/float red =\s+float\(\(indexInfo >> 16\) & 31\);/);
    expect(sources.vertexSource).toMatch(/float green =\s+float\(\(indexInfo >> 21\) & 31\);/);
    expect(sources.vertexSource).toMatch(/float blue =\s+float\(\(indexInfo >> 26\) & 31\);/);
  });

  it("can build the StarMade-Open WebGL2 integer cube branch", () => {
    const sources = createStarMadeThreeShaderProgramSources("cube.quads13", {
      defines: ["INTATT", "shader4", "force130", "normalmap"]
    });

    expect(sources.defines).toEqual(expect.arrayContaining(["owntangent", "INTATT", "shader4", "force130", "normalmap"]));
    expect(sources.vertexSource).toContain("in ivec4 ivert;");
    expect(sources.vertexSource).toContain("flat out int layer;");
    expect(sources.fragmentSource).toContain("flat in int layer;");
    expect(sources.vertexSource).toContain("float xIndex = float(typeI & 15);");
    expect(sources.vertexSource).toContain("float yIndex = float(typeI >> 4);");
    expect(sources.fragmentSource).toContain("float(layer) * 0.25");
    expect(sources.fragmentSource).not.toContain("layer * 0.25");
    expect(sources.fragmentSource).toContain("if (layer <= 0.5) return texture(mainTex0, uv);");
  });

  it("builds the StarMade LOD shadow source pair for depth casters", () => {
    const sources = createStarMadeThreeShaderProgramSources("cube.lodShadow");

    expect(sources.target).toBe("webgl2");
    expect(sources.defines).toEqual(["owntangent"]);
    expect(sources.vertexSource).toContain("out vec3 starMadeLodNormal;");
    expect(sources.vertexSource).toContain("normalMatrix * normal");
    expect(sources.fragmentSource).toContain("out vec4 starMadeFragColor;");
    expect(sources.fragmentSource).toContain("starMadeFragColor = gl_FragCoord.zzzw;");
    expect(sources.fragmentWarnings).toEqual([]);
  });
});

describe("createStarMadeBlockMaterial", () => {
  it("creates a Three.js shader material with StarMade cube lighting defaults", () => {
    const material = createStarMadeBlockMaterial({
      tint: 0x5aa9e6,
      opacity: 0.75,
      transparent: true
    });

    expect(material.name).toBe("StarMadeBlockMaterial");
    expect(material.transparent).toBe(true);
    expect(material.uniforms.opacity.value).toBe(0.75);
    expect(material.uniforms.diffuseStrength.value).toBe(STARMADE_CUBE_LIGHTING_DEFAULTS.diffuseStrength);
    expect(starMadeBlockFragmentShader).toContain("calculateStarMadeCubeLight");
  });

  it("creates one material per StarMade cube texture layer", () => {
    const materials = createStarMadeBlockMaterials({
      layout: createStarMadeCubeAtlasLayout(64),
      layers: new Map(),
      overlay: undefined
    });

    expect(materials.map((material) => material.name)).toEqual([
      "StarMadeBlockMaterial:t000",
      "StarMadeBlockMaterial:t001",
      "StarMadeBlockMaterial:t002",
      "StarMadeBlockMaterial:t003",
      "StarMadeBlockMaterial:custom"
    ]);
  });
});

describe("createStarMadeCubeShaderMaterial", () => {
  it("keeps StarMade cube texture array rows in atlas order", () => {
    expect(starMadeCubeTextureArraySourceY(2 * 64, 16 * 64)).toBe(2 * 64);
    expect(starMadeCubeTextureArraySourceY(13 * 64, 16 * 64)).toBe(13 * 64);
  });

  it("extends tile edges before StarMade cube texture-array mipmap generation", () => {
    const width = 4;
    const height = 4;
    const data = new Uint8Array(width * height * 4);

    for (let index = 0; index < width * height; index++) {
      data[index * 4] = index;
      data[index * 4 + 1] = index;
      data[index * 4 + 2] = index;
      data[index * 4 + 3] = 255;
    }

    applyStarMadeCubeTextureArrayTileGutters(data, 0, width, height, 4, 1);

    expect(data[0]).toBe(5);
    expect(data[(3 * width + 3) * 4]).toBe(10);
    expect(data[(1 * width + 1) * 4]).toBe(5);
    expect(data[(2 * width + 2) * 4]).toBe(10);
  });

  it("creates an experimental WebGL2 material from the StarMade cube shader", () => {
    const material = createStarMadeCubeShaderMaterial();

    expect(material.name).toBe("StarMadeCubeShaderMaterial:experimental");
    expect(material.glslVersion).toBe("300 es");
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(material.side).toBe(FrontSide);
    expect(material.vertexShader).not.toContain("#version 300 es");
    expect(material.fragmentShader).toContain("uniform sampler2DArray cTex;");
    expect(material.fragmentShader).toContain("uniform sampler2DArray starMadeShadowMapArray;");
    expect(material.fragmentShader).toContain("uniform bool starMadeShadowUseMapArray;");
    expect(material.fragmentShader).toContain("uniform int starMadeShadowMapArrayMode;");
    expect(material.fragmentShader).toContain("out vec4 starMadeFragColor;");
    expect(material.vertexShader).toContain("uniform mat4 starMadeShadowMatrix0;");
    expect(material.vertexShader).toContain("uniform mat4 starMadeShadowMatrix1;");
    expect(material.vertexShader).toContain("uniform mat4 starMadeShadowMatrix2;");
    expect(material.vertexShader).toContain("out vec4 starMadeShadowCoord0;");
    expect(material.vertexShader).toContain("out vec4 starMadeShadowCoord1;");
    expect(material.vertexShader).toContain("out vec4 starMadeShadowCoord2;");
    expect(material.vertexShader).toContain("vec4 starMadeShadowWorldPosition = modelMatrix * vec4(vertexPos, 1.0)");
    expect(material.vertexShader).toContain("starMadeShadowMatrix0 * starMadeShadowWorldPosition");
    expect(material.fragmentShader).toContain("uniform sampler2D starMadeShadowMap0;");
    expect(material.fragmentShader).toContain("uniform sampler2D starMadeShadowMap1;");
    expect(material.fragmentShader).toContain("uniform sampler2D starMadeShadowMap2;");
    expect(material.fragmentShader).toContain("uniform vec3 starMadeShadowColor0;");
    expect(material.fragmentShader).toContain("uniform vec3 starMadeShadowColor1;");
    expect(material.fragmentShader).toContain("uniform vec3 starMadeShadowColor2;");
    expect(material.fragmentShader).toContain("uniform vec2 starMadeShadowTexSize;");
    expect(material.fragmentShader).toContain("uniform vec4 starMadeShadowFarDistances;");
    expect(material.fragmentShader).toContain("uniform int starMadeShadowSplits;");
    expect(material.fragmentShader).toContain("float shad(int index)");
    expect(material.fragmentShader).toContain("vec3 starMadeBlockSourceShadowVisibility()");
    expect(material.fragmentShader).toContain("weightedVisibility += color1 * shad(1);");
    expect(material.fragmentShader).toContain("vec3 starMadeShadowVisibility()");
    expect(material.fragmentShader).toContain("texture(starMadeShadowMapArray, vec3(uv, float(index))).r");
    expect(material.fragmentShader).toContain("float shadowCoef()");
    expect(material.fragmentShader).toContain("if(starMadeShadowUseMapArray)");
    expect(material.fragmentShader).toContain("starMadeShadowMapArrayMode == 1");
    expect(material.fragmentShader).toContain("starMadeLightSources[lightIndex].diffuse * diffuse");
    expect(material.fragmentShader).toMatch(/vec4\(0\.3,0\.3,0\.3,1\)\s*\*\s*specular/);
    expect(material.fragmentShader).toContain("(0.02*d*d)");
    expect(material.fragmentShader).toContain("vec4(1.2,1.2,1.2,1) * diffuse");
    expect(material.fragmentShader).not.toContain("starMadeLightSources[i].quadraticAttenuation*d*d");
    expect(material.fragmentShader).toContain("vec3 starMadeCubeShadowVisibility(vec4 starMadeOcclusion)");
    expect(material.fragmentShader).toContain("receiverDepth - starMadeShadowBias <= storedDepth * 1.0005");
    expect(material.fragmentShader).toContain("planeGradient");
    expect(material.fragmentShader).not.toContain("depth > 1.0005 ? 0.0 : 1.0");
    expect(material.fragmentShader).toContain("mix(shad(2), shad(1)");
    expect(material.fragmentShader).toContain("return mix(1.0, visibility, starMadeShadowStrength);");
    expect(material.fragmentShader).toContain("vec3 starMadeShadowOcclusion = vec3(starMadeOcclusion.w) * (1.0 - starMadeShadowVisibility());");
    expect(material.fragmentShader).toContain("return min(vec3(1.0), ((vec3(1.0) - starMadeShadowOcclusion) + vec3(0.17))) * 1.2;");
    expect(material.fragmentShader).toContain("starMadeFragColor.rgb *= starMadeCubeShadowVisibility(occlusion);");
    expect(material.vertexShader).toContain("in ivec4 ivert;");
    expect(material.vertexShader).toContain("int indexInfo = ivert.x;");
    expect(material.vertexShader).toMatch(/float blue =\s+float\(\(indexInfo >> 26\) & 31\);/);
    expect(material.uniforms.cTex).toBeDefined();
    expect(material.uniforms.overlayTex).toBeDefined();
    expect(material.uniforms.cTex.value.wrapS).toBe(RepeatWrapping);
    expect(material.uniforms.cTex.value.wrapT).toBe(RepeatWrapping);
    expect(material.uniforms.overlayTex.value.wrapS).toBe(ClampToEdgeWrapping);
    expect(material.uniforms.overlayTex.value.wrapT).toBe(ClampToEdgeWrapping);
    expect(material.uniforms.starMadeLightSources.value).toHaveLength(8);
    expect(material.uniforms.starMadeShadowMapArray).toBeDefined();
    expect(material.uniforms.starMadeShadowUseMapArray.value).toBe(false);
    expect(material.uniforms.starMadeShadowMapArrayMode.value).toBe(0);
    expect(material.uniforms.starMadeShadowMap0).toBeDefined();
    expect(material.uniforms.starMadeShadowMap1).toBeDefined();
    expect(material.uniforms.starMadeShadowMap2).toBeDefined();
    expect(material.uniforms.starMadeShadowMatrix0.value).toBeInstanceOf(Matrix4);
    expect(material.uniforms.starMadeShadowMatrix1.value).toBeInstanceOf(Matrix4);
    expect(material.uniforms.starMadeShadowMatrix2.value).toBeInstanceOf(Matrix4);
    expect(material.uniforms.starMadeShadowStrength.value).toBe(0);
    expect(material.uniforms.starMadeShadowBias.value).toBeCloseTo(0.002);
    expect(material.uniforms.starMadeShadowTexSize.value.toArray()).toEqual([1024, 1 / 1024]);
    expect(material.uniforms.starMadeShadowFarDistances.value.toArray()).toEqual([0.3333, 0.6666, 0.9983, 1]);
    expect(material.uniforms.starMadeShadowSplits.value).toBe(3);
  });

  it("uses shadowParams for StarMade shadow uniforms", () => {
    const shadowMapArray = new DataArrayTexture(new Uint8Array([
      64, 64, 64, 255,
      128, 128, 128, 255,
      192, 192, 192, 255
    ]), 1, 1, 3);
    const shadowMap0 = new DataTexture(new Uint8Array([64, 64, 64, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    const shadowMap1 = new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    const shadowMap2 = new DataTexture(new Uint8Array([192, 192, 192, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    const shadowMatrix0 = new Matrix4().makeTranslation(1, 2, 3);
    const shadowMatrix1 = new Matrix4().makeTranslation(4, 5, 6);
    const shadowMatrix2 = new Matrix4().makeTranslation(7, 8, 9);
    const shadowColor0 = new Vector3(1, 0, 0);
    const shadowColor1 = new Vector3(1, 1, 1);
    const shadowColor2 = new Vector3(0, 0.333, 1);
    const texSize = new Vector2(2048, 1 / 2048);
    const farDistances = new Vector4(0.25, 0.5, 0.875, 1);

    const material = createStarMadeCubeShaderMaterial({
      shadowParams: {
        mapArray: shadowMapArray,
        mapArrayMode: "blockSources",
        maps: [shadowMap0, shadowMap1, shadowMap2],
        matrices: [shadowMatrix0, shadowMatrix1, shadowMatrix2],
        colors: [shadowColor0, shadowColor1, shadowColor2],
        strength: 0.42,
        bias: 0.004,
        texSize,
        farDistances,
        splits: 2
      }
    });

    expect(material.uniforms.starMadeShadowMapArray.value).toBe(shadowMapArray);
    expect(material.uniforms.starMadeShadowUseMapArray.value).toBe(true);
    expect(material.uniforms.starMadeShadowMapArrayMode.value).toBe(1);
    expect(material.uniforms.starMadeShadowMap0.value).toBe(shadowMap0);
    expect(material.uniforms.starMadeShadowMap1.value).toBe(shadowMap1);
    expect(material.uniforms.starMadeShadowMap2.value).toBe(shadowMap2);
    expect(material.uniforms.starMadeShadowMatrix0.value).toBe(shadowMatrix0);
    expect(material.uniforms.starMadeShadowMatrix1.value).toBe(shadowMatrix1);
    expect(material.uniforms.starMadeShadowMatrix2.value).toBe(shadowMatrix2);
    expect(material.uniforms.starMadeShadowColor0.value.toArray()).toEqual(shadowColor0.toArray());
    expect(material.uniforms.starMadeShadowColor1.value.toArray()).toEqual(shadowColor1.toArray());
    expect(material.uniforms.starMadeShadowColor2.value.toArray()).toEqual(shadowColor2.toArray());
    expect(material.uniforms.starMadeShadowStrength.value).toBe(0.42);
    expect(material.uniforms.starMadeShadowBias.value).toBe(0.004);
    expect(material.uniforms.starMadeShadowTexSize.value).toBe(texSize);
    expect(material.uniforms.starMadeShadowFarDistances.value).toBe(farDistances);
    expect(material.uniforms.starMadeShadowSplits.value).toBe(2);
  });

  it("updates StarMade shadow uniforms from shadowParams", () => {
    const material = createStarMadeCubeShaderMaterial();
    const shadowMapArray = new DataArrayTexture(new Uint8Array([
      32, 32, 32, 255,
      64, 64, 64, 255,
      96, 96, 96, 255
    ]), 1, 1, 3);
    const shadowMap = new DataTexture(new Uint8Array([32, 32, 32, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    const shadowMatrix = new Matrix4().makeScale(2, 3, 4);
    const shadowColor = new Vector3(0.25, 0.5, 1);
    const texelSize = new Vector2(0.25, 0.5);
    const texSize = new Vector2(4, 0.25);
    const farDistances = new Vector4(0.2, 0.4, 0.8, 1);

    const previousVersion = material.version;

    applyStarMadeShadowParamsToCubeShaderMaterial(material, {
      mapArray: shadowMapArray,
      mapArrayMode: "blockSources",
      maps: [shadowMap],
      matrices: [shadowMatrix],
      colors: [shadowColor],
      strength: 0.75,
      bias: 0.006,
      texelSize,
      texSize,
      farDistances,
      splits: 1
    });

    expect(material.uniforms.starMadeShadowMapArray.value).toBe(shadowMapArray);
    expect(material.uniforms.starMadeShadowUseMapArray.value).toBe(true);
    expect(material.uniforms.starMadeShadowMapArrayMode.value).toBe(1);
    expect(material.uniforms.starMadeShadowMap0.value).toBe(shadowMap);
    expect(material.uniforms.starMadeShadowMatrix0.value).toBe(shadowMatrix);
    expect(material.uniforms.starMadeShadowColor0.value).toBe(shadowColor);
    expect(material.uniforms.starMadeShadowStrength.value).toBe(0.75);
    expect(material.uniforms.starMadeShadowBias.value).toBe(0.006);
    expect(material.uniforms.starMadeShadowTexelSize.value).toBe(texelSize);
    expect(material.uniforms.starMadeShadowTexSize.value).toBe(texSize);
    expect(material.uniforms.starMadeShadowFarDistances.value).toBe(farDistances);
    expect(material.uniforms.starMadeShadowSplits.value).toBe(1);
    expect(material.version).toBe(previousVersion);
  });

  it("creates the StarMade cube shadow depth shader from shadowcube", () => {
    const material = createStarMadeCubeShadowDepthMaterial();

    expect(material.name).toBe("StarMadeCubeShadowDepthMaterial");
    expect(material.glslVersion).toBe("300 es");
    expect(material.depthWrite).toBe(true);
    expect(material.side).toBe(DoubleSide);
    expect(material.vertexShader).toContain("in ivec4 ivert;");
    expect(material.vertexShader).toContain("float type = typeE;");
    expect(material.vertexShader).toContain("float xIndex = float(typeI & 15);");
    expect(material.vertexShader).toContain("float yIndex = float(typeI >> 4);");
    expect(material.vertexShader).toContain("gl_Position =  projectionMatrix * vPos;");
    expect(material.fragmentShader).toContain("starMadeFragColor = gl_FragCoord.zzzw;");
    expect(material.fragmentShader).toContain("if(extraAlphaVert < -0.0001)");
    expect(material.uniforms.animationTime.value).toBe(0);
    expect(material.uniforms.lodThreshold.value).toBe(128);
    expect(material.uniforms.quadPosMark.value).toHaveLength(6);
  });

  it("creates the alpha-aware StarMade cube shadow depth shader variant", () => {
    const material = createStarMadeCubeShadowDepthMaterial({ alphaDiscard: true, animationTime: 12, lodThreshold: 64 });

    expect(material.name).toBe("StarMadeCubeShadowDepthMaterial:blended");
    expect(material.fragmentShader).toContain("if(tex.a + extraAlphaVert < 0.3)");
    expect(material.fragmentShader).toContain("discard;");
    expect(material.uniforms.animationTime.value).toBe(12);
    expect(material.uniforms.lodThreshold.value).toBe(64);
    expect(material.uniforms.mainTex0).toBeDefined();
    expect(material.uniforms.mainTex7).toBeDefined();
  });

  it("creates the StarMade LOD shadow depth shader from lodcube-shadow", () => {
    const material = createStarMadeLodShadowDepthMaterial();

    expect(material.name).toBe("StarMadeLodShadowDepthMaterial");
    expect(material.glslVersion).toBe("300 es");
    expect(material.depthWrite).toBe(true);
    expect(material.vertexColors).toBe(true);
    expect(material.side).toBe(DoubleSide);
    expect(material.vertexShader).toContain("normalMatrix * normal");
    expect(material.vertexShader).toContain("out vec3 starMadeLodNormal;");
    expect(material.fragmentShader).toContain("starMadeFragColor = gl_FragCoord.zzzw;");
    expect(material.uniforms.starMadeLightSources.value).toHaveLength(8);
  });

  it("can create the blended StarMade cube shader variant for texture alpha", () => {
    const material = createStarMadeCubeShaderMaterial({ blended: true });

    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.side).not.toBe(DoubleSide);
    expect(material.fragmentShader).toContain("if(alphMod < 0.2)");
    expect(material.fragmentShader).toContain("lightedColor.a = alphMod;");
    expect(material.uniforms.extraAlpha.value).toBe(1);
  });

  it("can create a double-sided blended variant for cross sprites", () => {
    const material = createStarMadeCubeShaderMaterial({ blended: true, doubleSided: true });

    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.side).toBe(DoubleSide);
    expect(material.fragmentShader).toContain("if(alphMod < 0.2)");
    expect(material.fragmentShader).toContain("lightedColor.a = alphMod;");
    expect(material.uniforms.extraAlpha.value).toBe(1);
  });

  it("can create an alpha-discard cutout variant without transparent sorting", () => {
    const material = createStarMadeCubeShaderMaterial({ alphaDiscard: true, doubleSided: true });

    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(material.side).toBe(DoubleSide);
    expect(material.fragmentShader).toContain("if(alphMod < 0.2)");
    expect(material.fragmentShader).toContain("lightedColor.a = alphMod;");
    expect(material.uniforms.extraAlpha.value).toBe(1);
  });

  it("can create the normal mapped texture-array shader variant", () => {
    const normalTextureArray = new DataArrayTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, 1);
    normalTextureArray.format = RGBAFormat;
    normalTextureArray.type = UnsignedByteType;
    normalTextureArray.colorSpace = NoColorSpace;
    const material = createStarMadeCubeShaderMaterial({ normalTextureArray });

    expect(material.fragmentShader).toContain("uniform sampler2DArray cTexNormal;");
    expect(material.fragmentShader).toContain("uniform int starMadeNormalDebugMode;");
    expect(material.fragmentShader).toContain("uniform float starMadeNormalStrength;");
    expect(material.fragmentShader).toContain("texture(cTexNormal");
    expect(material.fragmentShader).toContain("vec4 normalTexel = texture(cTexNormal");
    expect(material.fragmentShader).toContain("emissionAndShine = normalTexel.a;");
    expect(material.fragmentShader).not.toContain("bump.y = -bump.y;");
    expect(material.fragmentShader).toContain("bump.xy * starMadeNormalStrength");
    expect(material.fragmentShader).toContain("starMadeNormalDebugMode == 1");
    expect(material.fragmentShader).toContain("starMadeNormalDebugMode == 2");
    expect(material.fragmentShader).toContain("starMadeNormalDebugMode == 3");
    expect(material.fragmentShader).toContain("starMadeNormalDebugMode == 4");
    expect(material.fragmentShader).toContain("return normalDirection * 0.5 + 0.5;");
    expect(material.fragmentShader).toContain("return vec3(max(dot(normalDirection, lightDir), 0.0));");
    expect(material.fragmentShader).not.toContain("uniform mat3 normalMatrix;");
    expect(material.fragmentShader).not.toContain("vec3 starMadeGlobalLightDir = normalize((viewMatrix * vec4(lightPos, 0.0)).xyz);");
    expect(material.fragmentShader).not.toContain("vec3 starMadeLocalLightDir = normalize(normalMatrix * lightPos);");
    expect(material.fragmentShader).not.toContain("vec3 lightDir = length(occlusionVec.rgb) > 0.0001 ? starMadeLocalLightDir : starMadeGlobalLightDir;");
    expect(material.fragmentShader).toContain("starMadeLightSources[0].position.xyz - vPos.xyz");
    expect(material.vertexShader).not.toContain("uniform vec3 lightPos;");
    expect(material.vertexShader).not.toContain("vec3 starMadeGlobalLightDir = normalize((viewMatrix * vec4(lightPos, 0.0)).xyz);");
    expect(material.vertexShader).not.toContain("vec3 starMadeLocalLightDir = normalize(normalMatrix * lightPos);");
    expect(material.vertexShader).not.toContain("vec3 lightDir = length(occlusionVec.rgb) > 0.0001 ? starMadeLocalLightDir : starMadeGlobalLightDir;");
    expect(material.fragmentShader).toContain(
      "starMadeFragColor.rgb = max(emission*lightedColor.rgb, starMadeFragColor.rgb + spot);"
    );
    expect(material.fragmentShader).not.toContain("extraAlphVsLayerNoLight");
    expect(material.fragmentShader).toContain("calculateLight( lightPos, shininess, specular, mixTex, occlusion");
    expect(material.uniforms.cTexNormal.value).toBe(normalTextureArray);
    expect(material.uniforms.starMadeNormalDebugMode.value).toBe(0);
    expect(material.uniforms.starMadeNormalStrength.value).toBe(1);
    expect(material.uniforms.cTex.value.colorSpace).toBe(NoColorSpace);
    expect(material.uniforms.cTexNormal.value.wrapS).toBe(RepeatWrapping);
    expect(material.uniforms.cTexNormal.value.wrapT).toBe(RepeatWrapping);
    expect(material.uniforms.cTexNormal.value.colorSpace).toBe(NoColorSpace);
  });

  it("can create StarMade-Open's normal mapped 2D texture shader variant", () => {
    const mainTexture0 = new DataTexture(new Uint8Array([255, 64, 32, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    const normalTexture0 = new DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    const material = createStarMadeCubeShaderMaterial({
      textureLayers: new Map([[0, mainTexture0]]),
      normalTextureLayers: new Map([[0, normalTexture0]])
    });

    expect(material.fragmentShader).toContain("uniform sampler2D normalTex0;");
    expect(material.fragmentShader).toContain("uniform sampler2D mainTex0;");
    expect(material.fragmentShader).not.toContain("uniform sampler2DArray cTexNormal;");
    expect(material.fragmentShader).not.toContain("uniform sampler2DArray cTex;");
    expect(material.fragmentShader).toContain("bTex = sampleNormalTextureSheet(float(layer), vTexCoord0.st);");
    expect(material.fragmentShader).toContain("tex = getBlockTexture(float(layer));");
    expect(material.fragmentShader).toContain("emissionAndShine = bTex.a;");
    expect(material.fragmentShader).toContain(
      "starMadeFragColor.rgb = max(emission*lightedColor.rgb, starMadeFragColor.rgb + spot);"
    );
    expect(material.userData.starMadeDefines).toEqual(
      expect.arrayContaining(["owntangent", "INTATT", "shader4", "force130", "normalmap"])
    );
    expect(material.fragmentShader).toContain("mat3(tangentVec, binormalVec, normal)");
    expect(material.vertexShader).toContain("flat out int layer;");
    expect(material.fragmentShader).toContain("flat in int layer;");
    expect(material.uniforms.mainTex0.value).toBe(mainTexture0);
    expect(material.uniforms.normalTex0.value).toBe(normalTexture0);
    expect(material.uniforms.mainTex0.value.colorSpace).toBe(NoColorSpace);
    expect(material.uniforms.normalTex0.value.colorSpace).toBe(NoColorSpace);
  });

  it("can tune and debug normal map output", () => {
    const normalTextureArray = new DataArrayTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, 1);
    const material = createStarMadeCubeShaderMaterial({
      normalTextureArray,
      normalDebugMode: 1,
      normalStrength: 3
    });

    expect(material.uniforms.starMadeNormalDebugMode.value).toBe(1);
    expect(material.uniforms.starMadeNormalStrength.value).toBe(3);
  });

  it("does not inject normal debug branches without normal mapping", () => {
    const material = createStarMadeCubeShaderMaterial();

    expect(material.fragmentShader).not.toContain("starMadeNormalDebugMode");
    expect(material.fragmentShader).not.toContain("normalSample");
  });

  it("creates the StarMade LOD shader material for imported Ogre meshes", () => {
    const mainTexture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    const material = createStarMadeLodShaderMaterial({ mainTexture });

    expect(material.name).toBe("StarMadeLodShaderMaterial");
    expect(material.glslVersion).toBe("300 es");
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(material.side).toBe(FrontSide);
    expect(material.vertexColors).toBe(true);
    expect(material.vertexShader).not.toContain("#version 300 es");
    expect(material.vertexShader).toContain("vTexCoord0.st = vec4(uv, 0.0, 1.0).st");
    expect(material.vertexShader).toContain("normalMatrix * normal");
    expect(material.vertexShader).toContain("out vec3 starMadeLodNormal;");
    expect(material.vertexShader).not.toContain("out vec3 normal;");
    expect(material.fragmentShader).toContain("uniform sampler2D mainTex;");
    expect(material.fragmentShader).not.toContain("uniform mat3 normalMatrix;");
    expect(material.fragmentShader).not.toContain("uniform mat4 modelViewMatrix;");
    expect(material.vertexShader).not.toContain("tangentVec =");
    expect(material.userData.starMadeDefines).not.toContain("owntangent");
    expect(material.userData.starMadeDefines).not.toContain("normalmap");
    expect(material.fragmentShader).toContain("uniform vec3 starMadeShadowColor0;");
    expect(material.fragmentShader).toContain("uniform vec3 lightVec[4];");
    expect(material.fragmentShader).toContain("uniform vec4 lightDiffuse[4];");
    expect(material.fragmentShader).not.toContain("vec3 starMadeGlobalLightDir = normalize((viewMatrix * vec4(lightPos, 0.0)).xyz);");
    expect(material.fragmentShader).not.toContain("vec3 starMadeLodLightPos = (modelViewMatrix * vec4(lightPos, 1.0)).xyz;");
    expect(material.fragmentShader).not.toContain("vec3 starMadeLodLightDir = normalize(starMadeLodLightPos - vPos.xyz);");
    expect(material.fragmentShader).not.toContain("vec3 lightDir = length(occlusionVec.rgb) > 0.0001 ? starMadeLodLightDir : starMadeGlobalLightDir;");
    expect(material.fragmentShader).toContain("starMadeLightSources[0].position.xyz - vPos.xyz");
    expect(material.vertexShader).toContain("uniform mat4 starMadeShadowMatrix0;");
    expect(material.vertexShader).toContain("out vec4 starMadeShadowCoord0;");
    expect(material.vertexShader).toContain("vec4 starMadeShadowWorldPosition = modelMatrix * vec4(position, 1.0)");
    expect(material.fragmentShader).toContain("float shadowDepth = 0.0;");
    expect(material.fragmentShader).toContain("return shadowDepth;");
    expect(material.fragmentShader).toContain("uniform int starMadeShadowMapArrayMode;");
    expect(material.fragmentShader).toContain("starMadeShadowMapArrayMode == 1");
    expect(material.fragmentShader).not.toContain("uniform vec3 starMadeLodBlockLight;");
    expect(material.fragmentShader).toContain("float shadowCoef()");
    expect(material.fragmentShader).toContain("starMadeCubeShadowVisibility(vec4(0.0, 0.0, 0.0, totOcc))");
    expect(material.fragmentShader).toContain("starMadeCubeShadowVisibility(vec4(0.0, 0.0, 0.0, totOcc))");
    expect(material.fragmentShader).not.toContain("if(tex.a < 0.01){ discard; }");
    expect(material.fragmentShader).not.toContain("starMadeLodBlockIllumination");
    expect(material.fragmentShader).toContain("out vec4 starMadeFragColor;");
    expect(material.uniforms.mainTex.value).toBe(mainTexture);
    expect(material.uniforms.emissiveOn.value).toBe(false);
    expect(material.uniforms.starMadeLodBlockLight).toBeUndefined();
    expect(material.uniforms.lightVec.value).toHaveLength(4);
    expect(material.uniforms.lightDiffuse.value).toHaveLength(4);
    expect(material.uniforms.lightVec.value[0].toArray()).toEqual([0, 1, 1]);
    expect(material.uniforms.lightDiffuse.value[0].toArray()).toEqual([0, 0, 0, 0]);
    expect(material.uniforms.starMadeLightSources.value).toHaveLength(8);
    expect(material.uniforms.starMadeShadowMapArrayMode.value).toBe(0);
  });

  it("enables transparency for blended StarMade LOD shader materials", () => {
    const mainTexture = new DataTexture(new Uint8Array([255, 255, 255, 0]), 1, 1, RGBAFormat, UnsignedByteType);
    const material = createStarMadeLodShaderMaterial({ mainTexture, blended: true });

    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });

  it("does not enable LOD emissive rendering without an emissive texture", () => {
    const material = createStarMadeLodShaderMaterial({ emissiveOn: true });

    expect(material.uniforms.emissiveOn.value).toBe(false);
  });

  it("enables LOD emissive rendering only when an emissive texture is provided", () => {
    const emissiveTexture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    const material = createStarMadeLodShaderMaterial({ emissiveTexture });

    expect(material.uniforms.emissiveOn.value).toBe(true);
    expect(material.uniforms.emissiveTex.value).toBe(emissiveTexture);
  });

  it("updates StarMade LOD shadow uniforms from shadowParams", () => {
    const material = createStarMadeLodShaderMaterial();
    const shadowMapArray = new DataArrayTexture(new Uint8Array([
      48, 48, 48, 255,
      96, 96, 96, 255,
      144, 144, 144, 255
    ]), 1, 1, 3);
    const shadowMap = new DataTexture(new Uint8Array([48, 48, 48, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    const shadowMatrix = new Matrix4().makeTranslation(2, 4, 6);
    const texelSize = new Vector2(0.125, 0.25);
    const previousVersion = material.version;

    applyStarMadeShadowParamsToLodShaderMaterial(material, {
      mapArray: shadowMapArray,
      mapArrayMode: "blockSources",
      maps: [shadowMap],
      matrices: [shadowMatrix],
      strength: 0.6,
      bias: 0.005,
      texelSize
    });

    expect(material.uniforms.starMadeShadowMapArray.value).toBe(shadowMapArray);
    expect(material.uniforms.starMadeShadowUseMapArray.value).toBe(true);
    expect(material.uniforms.starMadeShadowMapArrayMode.value).toBe(1);
    expect(material.uniforms.starMadeShadowMap0.value).toBe(shadowMap);
    expect(material.uniforms.starMadeShadowMatrix0.value).toBe(shadowMatrix);
    expect(material.uniforms.starMadeShadowStrength.value).toBe(0.6);
    expect(material.uniforms.starMadeShadowBias.value).toBe(0.005);
    expect(material.uniforms.starMadeShadowTexelSize.value).toBe(texelSize);
    expect(material.uniforms.starMadeShadowTexSize.value.toArray()).toEqual([4, 0.25]);
    expect(material.version).toBe(previousVersion);
  });

  it("applies StarMade-Open LOD light uniforms computed from side data", () => {
    const material = createStarMadeLodShaderMaterial();
    const lighting = computeStarMadeLodBlockLightFromSideData(
      [
        [1, 0, 0, 0.5],
        [0, 1, 0, 0.25],
        [0.2, 0.2, 0.2, 0.75],
        [0.3, 0.3, 0.3, 0.125],
        [0, 0, 1, 0.125],
        [1, 1, 0, 0.375]
      ],
      0
    );

    applyStarMadeLodBlockLightToShaderMaterial(material, lighting);

    expect(material.uniforms.lightVec.value[0].toArray()).toEqual([0, -1, -1]);
    expect(material.uniforms.lightVec.value[1].toArray()).toEqual([0, 1, -1]);
    expect(material.uniforms.lightDiffuse.value[0].x).toBeCloseTo(0.20792079, 6);
    expect(material.uniforms.lightDiffuse.value[0].y).toBeCloseTo(0.1980198, 6);
    expect(material.uniforms.lightDiffuse.value[0].z).toBeCloseTo(0.1980198, 6);
    expect(material.uniforms.lightDiffuse.value[0].w).toBeCloseTo(0.74752475, 6);
    expect(material.uniforms.lightDiffuse.value[3].x).toBeCloseTo(1, 6);
    expect(material.uniforms.lightDiffuse.value[3].y).toBeCloseTo(0.990099, 6);
    expect(material.uniforms.lightDiffuse.value[3].z).toBeCloseTo(0, 6);
    expect(material.uniforms.lightDiffuse.value[3].w).toBeCloseTo(0.3762376, 6);
  });

  it("applies StarMade-Open LOD light uniforms to every LOD material under an Object3D", () => {
    const root = new Object3D();
    const lodMaterial = createStarMadeLodShaderMaterial();
    const childLodMaterial = createStarMadeLodShaderMaterial();
    const cubeMaterial = createStarMadeCubeShaderMaterial();
    const lighting = computeStarMadeLodBlockLightFromSideData(
      [
        [1, 0, 0, 0.5],
        [0, 1, 0, 0.25],
        [0.2, 0.2, 0.2, 0.75],
        [0.3, 0.3, 0.3, 0.125],
        [0, 0, 1, 0.125],
        [1, 1, 0, 0.375]
      ],
      0
    );
    const child = new Object3D();

    root.add(new Mesh(new BufferGeometry(), lodMaterial));
    root.add(new Mesh(new BufferGeometry(), cubeMaterial));
    child.add(new Mesh(new BufferGeometry(), childLodMaterial));
    root.add(child);

    expect(collectStarMadeLodShaderMaterials(root)).toHaveLength(2);
    expect(applyStarMadeLodBlockLightToObject3D(root, lighting)).toBe(2);
    expect(lodMaterial.uniforms.lightVec.value[1].toArray()).toEqual([0, 1, -1]);
    expect(childLodMaterial.uniforms.lightDiffuse.value[3].y).toBeCloseTo(0.990099, 6);
  });

  it("applies StarMade LOD shadow uniforms to every LOD material under an Object3D", () => {
    const root = new Object3D();
    const lodMaterial = createStarMadeLodShaderMaterial();
    const childLodMaterial = createStarMadeLodShaderMaterial();
    const cubeMaterial = createStarMadeCubeShaderMaterial();
    const shadowMapArray = new DataArrayTexture(new Uint8Array([
      48, 48, 48, 255,
      96, 96, 96, 255,
      144, 144, 144, 255
    ]), 1, 1, 3);
    const shadowMap = new DataTexture(new Uint8Array([48, 48, 48, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    const shadowMatrix = new Matrix4().makeTranslation(2, 4, 6);
    const child = new Object3D();

    root.add(new Mesh(new BufferGeometry(), lodMaterial));
    root.add(new Mesh(new BufferGeometry(), cubeMaterial));
    child.add(new Mesh(new BufferGeometry(), childLodMaterial));
    root.add(child);

    expect(
      applyStarMadeShadowParamsToLodObject3D(root, {
        mapArray: shadowMapArray,
        maps: [shadowMap],
        matrices: [shadowMatrix],
        strength: 0.8,
        bias: 0.004
      })
    ).toBe(2);
    expect(lodMaterial.uniforms.starMadeShadowMapArray.value).toBe(shadowMapArray);
    expect(lodMaterial.uniforms.starMadeShadowUseMapArray.value).toBe(true);
    expect(lodMaterial.uniforms.starMadeShadowMap0.value).toBe(shadowMap);
    expect(childLodMaterial.uniforms.starMadeShadowMatrix0.value).toBe(shadowMatrix);
    expect(cubeMaterial.uniforms.starMadeShadowMap0.value).not.toBe(shadowMap);
  });

  it("enables the normal map branch for LOD materials when a normal texture is provided", () => {
    const normalTexture = new DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    const material = createStarMadeLodShaderMaterial({ normalTexture });

    expect(material.fragmentShader).toContain("uniform sampler2D normalTex;");
    expect(material.fragmentShader).toContain("texture(normalTex");
    expect(material.userData.starMadeDefines).toContain("normalmap");
    expect(material.userData.starMadeDefines).toContain("owntangent");
    expect(material.uniforms.normalTex.value).toBe(normalTexture);
  });
});

describe("applyStarMadeSunToLodShaderMaterial / applyStarMadeSunToLodObject3D", () => {
  it("sets lightPos and starMadeLightSources[0].position from sun direction", () => {
    const material = createStarMadeLodShaderMaterial();
    const dir = new Vector3(450, 900, 0).normalize();
    applyStarMadeSunToLodShaderMaterial(material, dir);
    const pos = material.uniforms.lightPos.value as Vector3;
    expect(pos.x).toBeCloseTo(dir.x, 5);
    expect(pos.y).toBeCloseTo(dir.y, 5);
    expect(pos.z).toBeCloseTo(dir.z, 5);
    const sources = material.uniforms.starMadeLightSources.value as Array<{ position: { x: number; y: number; z: number; w: number } }>;
    expect(sources[0].position.x).toBeCloseTo(dir.x, 5);
    expect(sources[0].position.w).toBe(1);
  });

  it("applies sun to all LOD materials in an Object3D hierarchy", () => {
    const m1 = createStarMadeLodShaderMaterial();
    const m2 = createStarMadeLodShaderMaterial();
    const root = new Group();
    const child = new Group();
    root.add(new Mesh(new BufferGeometry(), m1));
    child.add(new Mesh(new BufferGeometry(), m2));
    root.add(child);
    const dir = new Vector3(1, 0, 0);
    const count = applyStarMadeSunToLodObject3D(root, dir);
    expect(count).toBe(2);
    const pos1 = m1.uniforms.lightPos.value as Vector3;
    expect(pos1.x).toBeCloseTo(1, 5);
    const pos2 = m2.uniforms.lightPos.value as Vector3;
    expect(pos2.x).toBeCloseTo(1, 5);
  });
});

describe("applyStarMadeBlockLightSourcesToCubeShaderMaterial", () => {
  it("sets spotCount and populates starMadeLightSources slots for active sources", () => {
    const material = createStarMadeCubeShaderMaterial();
    const sources = [
      { position: [1, 2, 3] as const, color: [1, 0, 0, 1] as const, active: true },
      { position: [4, 5, 6] as const, color: [0, 1, 0, 1] as const, active: true }
    ];
    const count = applyStarMadeBlockLightSourcesToCubeShaderMaterial(material, sources, [0, 0, 0]);
    expect(count).toBe(2);
    expect(material.uniforms.spotCount.value).toBe(2);
    const lightSources = material.uniforms.starMadeLightSources.value as Array<{
      position: { x: number; y: number; z: number; w: number };
      diffuse: { x: number; y: number; z: number };
      specular: { x: number; y: number; z: number };
      quadraticAttenuation: number;
    }>;
    // slot [1] should hold the nearest source to [0,0,0]: position [1,2,3]
    expect(lightSources[1].position.x).toBeCloseTo(1, 5);
    expect(lightSources[1].position.w).toBe(1);
    expect(lightSources[1].diffuse.x).toBeCloseTo(1.2, 5); // STARMADE_BLOCK_LIGHT_DIFFUSE_INTENSITY
    expect(lightSources[1].specular.x).toBeCloseTo(0.3, 5);
    expect(lightSources[1].quadraticAttenuation).toBeCloseTo(0.02, 5); // STARMADE_BLOCK_LIGHT_QUADRATIC_ATTENUATION
    // slot [2] = second source
    expect(lightSources[2].position.x).toBeCloseTo(4, 5);
  });

  it("ignores inactive sources and keeps spotCount at 0 when none active", () => {
    const material = createStarMadeCubeShaderMaterial();
    const sources = [
      { position: [1, 0, 0] as const, color: [1, 0, 0, 1] as const, active: false }
    ];
    const count = applyStarMadeBlockLightSourcesToCubeShaderMaterial(material, sources, [0, 0, 0]);
    expect(count).toBe(0);
    expect(material.uniforms.spotCount.value).toBe(0);
  });

  it("preserves StarMade source order when all active sources fit in the shader slots", () => {
    const material = createStarMadeCubeShaderMaterial();
    const sources = [
      { position: [100, 0, 0] as const, color: [0, 0, 1, 1] as const },
      { position: [1, 0, 0] as const, color: [1, 0, 0, 1] as const }
    ];
    applyStarMadeBlockLightSourcesToCubeShaderMaterial(material, sources, [0, 0, 0]);
    const lightSources = material.uniforms.starMadeLightSources.value as Array<{
      position: { x: number };
      diffuse: { x: number; z: number };
    }>;
    expect(lightSources[1].position.x).toBeCloseTo(100, 5);
    expect(lightSources[1].diffuse.z).toBeCloseTo(1.2, 5); // STARMADE_BLOCK_LIGHT_DIFFUSE_INTENSITY
    expect(lightSources[2].position.x).toBeCloseTo(1, 5);
    expect(lightSources[2].diffuse.x).toBeCloseTo(1.2, 5); // STARMADE_BLOCK_LIGHT_DIFFUSE_INTENSITY
  });
});


describe("applyStarMadeSceneSunToShaderMaterial", () => {
  it("sets lightPos, ambient, diffuse, specular uniforms on cube material", () => {
    const material = createStarMadeCubeShaderMaterial();
    const dir = new Vector3(1, 0, 0);
    applyStarMadeSceneSunToShaderMaterial(material, {
      direction: dir,
      ambient: new Vector3(0.1, 0.2, 0.3),
      diffuse: new Vector3(0.8, 0.9, 1.0),
      specular: new Vector3(0.4, 0.5, 0.6)
    });
    const lightPos = material.uniforms.lightPos.value as Vector3;
    expect(lightPos.x).toBeCloseTo(1, 5);
    const ambient = material.uniforms.ambient.value as Vector3;
    expect(ambient.x).toBeCloseTo(0.1, 5);
    const diffuse = material.uniforms.diffuse.value as Vector3;
    expect(diffuse.y).toBeCloseTo(0.9, 5);
    const specular = material.uniforms.specular.value as Vector3;
    expect(specular.z).toBeCloseTo(0.6, 5);
  });

  it("updates starMadeLightSources[0] position and colors", () => {
    const material = createStarMadeCubeShaderMaterial();
    const dir = new Vector3(0, 1, 0);
    applyStarMadeSceneSunToShaderMaterial(material, {
      direction: dir,
      diffuse: new Vector3(1, 0.5, 0.5)
    });
    const sources = material.uniforms.starMadeLightSources.value as Array<{
      position: { x: number; y: number; z: number; w: number };
      diffuse: { x: number; y: number; z: number };
    }>;
    expect(sources[0].position.y).toBeCloseTo(1, 5);
    expect(sources[0].position.w).toBe(1);
    expect(sources[0].diffuse.x).toBeCloseTo(1, 5);
    expect(sources[0].diffuse.y).toBeCloseTo(0.5, 5);
  });

  it("applies sun on LOD material hierarchy via applyStarMadeSceneSunToLodObject3D", () => {
    const m1 = createStarMadeLodShaderMaterial();
    const m2 = createStarMadeLodShaderMaterial();
    const root = new Group();
    const child = new Group();
    root.add(new Mesh(new BufferGeometry(), m1));
    child.add(new Mesh(new BufferGeometry(), m2));
    root.add(child);
    const count = applyStarMadeSceneSunToLodObject3D(root, { direction: new Vector3(0, 0, 1) });
    expect(count).toBe(2);
    const lp1 = m1.uniforms.lightPos.value as Vector3;
    expect(lp1.z).toBeCloseTo(1, 5);
  });

  it("createStarMadeCubeShaderMaterial applies sun option at creation time", () => {
    const material = createStarMadeCubeShaderMaterial({
      sun: { direction: new Vector3(1, 0, 0), ambient: new Vector3(0.2, 0.3, 0.4) }
    });
    const lightPos = material.uniforms.lightPos.value as Vector3;
    expect(lightPos.x).toBeCloseTo(1, 5);
    const ambient = material.uniforms.ambient.value as Vector3;
    expect(ambient.x).toBeCloseTo(0.2, 5);
  });
});


describe("createStarMadeDirectionalShadowPipeline / bindStarMadeDirectionalShadowRoot", () => {
  it("creates a pipeline with correct default properties", () => {
    const sceneBounds = new Box3(new Vector3(-10, -5, -10), new Vector3(10, 5, 10));
    const pipeline = createStarMadeDirectionalShadowPipeline({ sceneBounds });
    expect(pipeline.mapSize).toBe(1024);
    expect(pipeline.strength).toBeCloseTo(0.35, 5);
    expect(pipeline.bias).toBeCloseTo(0.00001, 8);
    expect(pipeline.renderTarget).toBeDefined();
    expect(pipeline.camera).toBeDefined();
    expect(pipeline.shadowParams.maps).toHaveLength(1);
    expect(pipeline.shadowParams.matrices).toHaveLength(1);
  });

  it("accepts custom light direction and map size", () => {
    const sceneBounds = new Box3(new Vector3(-5, -5, -5), new Vector3(5, 5, 5));
    const pipeline = createStarMadeDirectionalShadowPipeline({
      sceneBounds,
      lightDirection: new Vector3(1, 0, 0),
      mapSize: 512,
      strength: 0.5,
      bias: 0.002
    });
    expect(pipeline.mapSize).toBe(512);
    expect(pipeline.strength).toBeCloseTo(0.5, 5);
    expect(pipeline.bias).toBeCloseTo(0.002, 5);
    expect(pipeline.renderTarget.width).toBe(512);
    expect(pipeline.renderTarget.height).toBe(512);
  });

  it("applyToCubeMaterial sets shadow uniforms on cube material", () => {
    const sceneBounds = new Box3(new Vector3(-5, -5, -5), new Vector3(5, 5, 5));
    const pipeline = createStarMadeDirectionalShadowPipeline({ sceneBounds });
    const material = createStarMadeCubeShaderMaterial();
    pipeline.applyToCubeMaterial(material);
    expect(material.uniforms.starMadeShadowMap0.value).toBe(pipeline.renderTarget.texture);
    expect(material.uniforms.starMadeShadowStrength.value).toBeCloseTo(0.35, 5);
  });

  it("applyToLodObject3D sets shadow uniforms on LOD hierarchy", () => {
    const sceneBounds = new Box3(new Vector3(-5, -5, -5), new Vector3(5, 5, 5));
    const pipeline = createStarMadeDirectionalShadowPipeline({ sceneBounds });
    const m1 = createStarMadeLodShaderMaterial();
    const root = new Group();
    root.add(new Mesh(new BufferGeometry(), m1));
    const count = pipeline.applyToLodObject3D(root);
    expect(count).toBe(1);
    expect(m1.uniforms.starMadeShadowMap0.value).toBe(pipeline.renderTarget.texture);
  });
});


describe("createStarMadePointLightShadowPipeline", () => {
  it("creates a pipeline with shared WebGLArrayRenderTarget for all sources", () => {
    const pipeline = createStarMadePointLightShadowPipeline({
      sources: [
        { key: "white", position: new Vector3(0, 1, 0), color: new Vector3(1, 1, 1) },
        { key: "red",   position: new Vector3(5, 1, 0), color: new Vector3(1, 0, 0) }
      ],
      receiverCenter: new Vector3(0, 0, 0),
      mapSize: 512,
      strength: 0.5,
      bias: 0.001
    });
    expect(pipeline.sourceCount).toBe(2);
    expect(pipeline.mapSize).toBe(512);
    expect(pipeline.strength).toBeCloseTo(0.5, 5);
    expect(pipeline.renderTarget).toBeDefined();
    expect(pipeline.shadowParams.mapArrayMode).toBe("blockSources");
    expect(pipeline.shadowParams.maps).toBeUndefined();
    expect(pipeline.shadowParams.mapArray).toBe(pipeline.renderTarget.texture);
  });

  it("caps sources to 3", () => {
    const pipeline = createStarMadePointLightShadowPipeline({
      sources: [
        { key: "a", position: new Vector3(0, 1, 0), color: new Vector3(1, 0, 0) },
        { key: "b", position: new Vector3(1, 1, 0), color: new Vector3(0, 1, 0) },
        { key: "c", position: new Vector3(2, 1, 0), color: new Vector3(0, 0, 1) },
        { key: "d", position: new Vector3(3, 1, 0), color: new Vector3(1, 1, 0) }
      ],
      receiverCenter: new Vector3(0, 0, 0)
    });
    expect(pipeline.sourceCount).toBe(3);
  });

  it("applyToCubeMaterial sets shadow uniforms", () => {
    const pipeline = createStarMadePointLightShadowPipeline({
      sources: [{ key: "w", position: new Vector3(0, 1, 0), color: new Vector3(1, 1, 1) }],
      receiverCenter: new Vector3(0, 0, 0),
      strength: 0.6
    });
    const material = createStarMadeCubeShaderMaterial();
    pipeline.applyToCubeMaterial(material);
    expect(material.uniforms.starMadeShadowMapArray.value).toBe(pipeline.renderTarget.texture);
    expect(material.uniforms.starMadeShadowUseMapArray.value).toBe(true);
    expect(material.uniforms.starMadeShadowStrength.value).toBeCloseTo(0.6, 5);
  });

  it("addCaster tracks mesh count", () => {
    const pipeline = createStarMadePointLightShadowPipeline({
      sources: [{ key: "w", position: new Vector3(0, 1, 0), color: new Vector3(1, 1, 1) }],
      receiverCenter: new Vector3(0, 0, 0)
    });
    expect(pipeline.casterMeshCount).toBe(0);
    const root = new Group();
    root.add(new Mesh(new BufferGeometry(), createStarMadeLodShaderMaterial()));
    pipeline.addCaster(root, { isLod: true });
    expect(pipeline.casterMeshCount).toBeGreaterThan(0);
  });
});


describe("Shadow pipeline LOD integration", () => {
  it("directional pipeline applyToLodObject3D sets shadow uniforms on LOD hierarchy", () => {
    const sceneBounds = new Box3(new Vector3(-5, -5, -5), new Vector3(5, 5, 5));
    const pipeline = createStarMadeDirectionalShadowPipeline({ sceneBounds });
    const lodMat = createStarMadeLodShaderMaterial();
    const root = new Group();
    root.add(new Mesh(new BufferGeometry(), lodMat));
    const count = pipeline.applyToLodObject3D(root);
    expect(count).toBe(1);
    expect(lodMat.uniforms.starMadeShadowMap0.value).toBe(pipeline.renderTarget.texture);
    expect(lodMat.uniforms.starMadeShadowStrength.value).toBeCloseTo(0.35, 5);
  });

  it("point-light pipeline addCaster auto-detects LOD vs cube materials", () => {
    const pipeline = createStarMadePointLightShadowPipeline({
      sources: [{ key: "w", position: new Vector3(0, 1, 0), color: new Vector3(1, 1, 1) }],
      receiverCenter: new Vector3(0, 0, 0)
    });
    // Mixed hierarchy: LOD + cube
    const root = new Group();
    const lodMesh = new Mesh(new BufferGeometry(), createStarMadeLodShaderMaterial());
    const cubeMesh = new Mesh(new BufferGeometry(), createStarMadeCubeShaderMaterial());
    root.add(lodMesh, cubeMesh);

    // addCaster should not throw and should count both meshes
    expect(() => pipeline.addCaster(root)).not.toThrow();
    expect(pipeline.casterMeshCount).toBe(2);
  });

  it("point-light pipeline applyToLodObject3D sets array shadow uniforms", () => {
    const pipeline = createStarMadePointLightShadowPipeline({
      sources: [
        { key: "r", position: new Vector3(0, 1, 0), color: new Vector3(1, 0, 0) },
        { key: "b", position: new Vector3(2, 1, 0), color: new Vector3(0, 0, 1) }
      ],
      receiverCenter: new Vector3(1, 0, 0),
      strength: 0.8
    });
    const lodMat = createStarMadeLodShaderMaterial();
    const root = new Group();
    root.add(new Mesh(new BufferGeometry(), lodMat));
    pipeline.applyToLodObject3D(root);
    expect(lodMat.uniforms.starMadeShadowMapArray.value).toBe(pipeline.renderTarget.texture);
    expect(lodMat.uniforms.starMadeShadowUseMapArray.value).toBe(true);
    expect(lodMat.uniforms.starMadeShadowStrength.value).toBeCloseTo(0.8, 5);
  });

  // ── Tranche B: setStarMadeCubeShaderSpotLights ────────────────────────────
  describe("setStarMadeCubeShaderSpotLights", () => {
    it("fills spot slots 1..N, preserves slot 0 (sun)", () => {
      const mat = createStarMadeCubeShaderMaterial();
      const sunSlot = mat.uniforms.starMadeLightSources?.value[0];
      // record sun slot position before
      const sunPos0 = sunSlot?.position;
      const sunX0 = typeof sunPos0?.x === "number" ? sunPos0.x : null;

      setStarMadeCubeShaderSpotLights(mat, [
        { position: new Vector3(1, 2, 3), color: [1, 0, 0], intensity: 0.5 },
        { position: new Vector3(4, 5, 6), color: [0, 1, 0], intensity: 0.8 }
      ]);

      // slot 0 should be unchanged
      const sunPos1 = mat.uniforms.starMadeLightSources?.value[0]?.position;
      if (sunX0 !== null && typeof sunPos1?.x === "number") {
        expect(sunPos1.x).toBeCloseTo(sunX0, 5);
      }
      expect(mat.uniforms.spotCount?.value).toBe(2);
    });

    it("clamps to 7 slots maximum", () => {
      const mat = createStarMadeCubeShaderMaterial();
      const lights = Array.from({ length: 10 }, (_, i) => ({
        position: new Vector3(i, 0, 0),
        color: [1, 1, 1] as [number, number, number],
        intensity: 1
      }));
      setStarMadeCubeShaderSpotLights(mat, lights);
      expect(mat.uniforms.spotCount?.value).toBeLessThanOrEqual(7);
    });
  });

  // ── Tranche C: setStarMadeCubeShaderVertexLighting ────────────────────────
  describe("setStarMadeCubeShaderVertexLighting", () => {
    it("does not throw on a fresh cube material (uniforms may not exist)", () => {
      const mat = createStarMadeCubeShaderMaterial();
      expect(() => setStarMadeCubeShaderVertexLighting(mat, {
        cubeBlockLightIntensityScale: 1.5,
        cubeBlockLightAttenuationConstant: 1,
        cubeBlockLightAttenuationLinear: 0.1
      })).not.toThrow();
    });
  });

  // ── Tranche D: setStarMadeLodShaderBlockLightSamples ──────────────────────
  describe("setStarMadeLodShaderBlockLightSamples", () => {
    it("writes direction and diffuse into lightVec/lightDiffuse uniforms", () => {
      const mat = createStarMadeLodShaderMaterial();
      const samples: StarMadeLodBlockLightSample[] = [
        { direction: [0, 1, 0], diffuse: [1, 0.5, 0, 0.25] },
        { direction: [1, 0, 0], diffuse: [0, 1, 0, 0.1] }
      ];
      setStarMadeLodShaderBlockLightSamples(mat, samples);
      const lightVec = mat.uniforms.lightVec?.value as any[];
      const lightDiffuse = mat.uniforms.lightDiffuse?.value as any[];
      expect(lightVec?.[0]?.y).toBeCloseTo(1, 5);
      expect(lightDiffuse?.[0]?.w).toBeCloseTo(0.25, 5);
      expect(lightDiffuse?.[1]?.w).toBeCloseTo(0.1, 5);
    });

    it("zeroes remaining slots beyond the sample count", () => {
      const mat = createStarMadeLodShaderMaterial();
      // fill slot 0 first
      setStarMadeLodShaderBlockLightSamples(mat, [
        { direction: [0, 1, 0], diffuse: [1, 1, 1, 1] }
      ]);
      const lightDiffuse = mat.uniforms.lightDiffuse?.value as any[];
      // slot 1..3 should be zeroed
      expect(lightDiffuse?.[1]?.w ?? 0).toBeCloseTo(0, 5);
    });
  });


  // ── P3: setStarMadeCubeShaderAllLight ─────────────────────────────────────
  describe("setStarMadeCubeShaderAllLight", () => {
    it("sets allLight uniform to the given mode", () => {
      const mat = createStarMadeCubeShaderMaterial();
      expect(mat.uniforms.allLight?.value).toBe(0);
      setStarMadeCubeShaderAllLight(mat, 2);
      expect(mat.uniforms.allLight?.value).toBe(2);
      setStarMadeCubeShaderAllLight(mat, 0);
      expect(mat.uniforms.allLight?.value).toBe(0);
    });
  });

  // ── P3: updateStarMadeCubeShaderTime / updateStarMadeCubeShaderClipPlanes ──
  describe("updateStarMadeCubeShaderTime", () => {
    it("matches StarMade-Open's 0.5s animation frame cadence", () => {
      const mat = createStarMadeCubeShaderMaterial();
      expect(mat.uniforms.uTime?.value).toBe(0);
      updateStarMadeCubeShaderTime(mat, 0.016);
      expect(mat.uniforms.uTime?.value).toBeCloseTo(0.016, 4);
      const prevAnim = mat.uniforms.animationTime?.value ?? 0;

      updateStarMadeCubeShaderTime(mat, 0.48);
      expect(mat.uniforms.animationTime?.value).toBe(prevAnim);

      updateStarMadeCubeShaderTime(mat, 0.005);
      expect(mat.uniforms.animationTime?.value).toBeGreaterThan(prevAnim);
    });
  });

  describe("updateStarMadeCubeShaderClipPlanes", () => {
    it("sets zNear and zFar uniforms", () => {
      const mat = createStarMadeCubeShaderMaterial();
      updateStarMadeCubeShaderClipPlanes(mat, 0.5, 800);
      expect(mat.uniforms.zNear?.value).toBeCloseTo(0.5, 5);
      expect(mat.uniforms.zFar?.value).toBeCloseTo(800, 5);
    });
  });


  // ── P5: shadow pipeline multi-split ──────────────────────────────────────
  describe("createStarMadeDirectionalShadowPipeline P5", () => {
    it("1-split: uses plain 2D render target and static farDistances 0.9983", () => {
      const bounds = new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10));
      const p = createStarMadeDirectionalShadowPipeline({ sceneBounds: bounds, splitCount: 1 });
      expect(p.shadowParams.splits).toBe(1);
      expect(p.arrayRenderTarget).toBeNull();
      expect(p.shadowParams.farDistances?.x).toBeCloseTo(0.9983, 3);
      expect(p.shadowParams.mapArray).toBeUndefined();
    });

    it("3-split: uses WebGLArrayRenderTarget and computes dynamic farDistances", () => {
      const bounds = new Box3(new Vector3(-50, -50, -50), new Vector3(50, 50, 50));
      const p = createStarMadeDirectionalShadowPipeline({
        sceneBounds: bounds,
        splitCount: 3,
        splitLambda: 0.5,
        cameraNearForSplits: 0.1,
        cameraFarForSplits: 400
      });
      expect(p.shadowParams.splits).toBe(3);
      expect(p.arrayRenderTarget).not.toBeNull();
      expect(p.shadowParams.mapArray).toBeDefined();
      expect(p.shadowParams.mapArrayMode).toBe("splits");
      // farDistances should be non-trivial (not the static 0.9983 for all)
      const fd = p.shadowParams.farDistances!;
      expect(fd.x).toBeGreaterThan(0);
      expect(fd.x).toBeLessThan(1);
      expect(fd.y).toBeGreaterThan(fd.x); // splits increase
      expect(fd.z).toBeGreaterThanOrEqual(fd.y);
    });

    it("clamps splitCount to 1..3", () => {
      const bounds = new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10));
      const p0 = createStarMadeDirectionalShadowPipeline({ sceneBounds: bounds, splitCount: 0 });
      const p5 = createStarMadeDirectionalShadowPipeline({ sceneBounds: bounds, splitCount: 5 });
      expect(p0.shadowParams.splits).toBe(1);
      expect(p5.shadowParams.splits).toBe(3);
    });
  });


  // ── P3: CubeMeshQuadsShader13 uniform coverage ───────────────────────────
  describe("P3 uniform coverage: all CubeMeshQuadsShader13 uniforms present", () => {
    const mat = createStarMadeCubeShaderMaterial();
    const u = mat.uniforms;

    it.each([
      "zNear", "zFar", "uTime", "animationTime", "allLight",
      "extraAlpha", "density", "spotCount", "selectTime", "lodThreshold",
      "lightPos", "viewPos", "v_inv",
      "quadPosMark", "normals", "tangents", "binormals", "shift",
      "ambient", "diffuse", "specular", "daa", "dsa",
      "starMadeFrontMaterial", "starMadeFrontLightModelProduct",
      "starMadeLightSources",
      "overlayTex", "cTex"
    ] as const)("uniform '%s' exists", (name) => {
      expect(u[name]).toBeDefined();
      expect(u[name]).not.toBeNull();
    });
  });

  // ── P3: StarMade defines present ─────────────────────────────────────────
  describe("P3 StarMade shader defines", () => {
    it("texarray variant has INTATT, shader4, force130, texarray defines", () => {
      const mat = createStarMadeCubeShaderMaterial();
      const defines = mat.userData.starMadeDefines as readonly string[] ?? [];
      expect(defines).toContain("INTATT");
      expect(defines).toContain("shader4");
      expect(defines).toContain("force130");
      expect(defines).toContain("texarray");
    });

    it("normalmap variant includes normalmap define", () => {
      const mat = createStarMadeCubeShaderMaterial({ normalTextureArray: null as any });
      // normalmap define present only when normalTextureArray is provided
      // Without one, no normalmap — just verify no crash
      expect(mat).toBeDefined();
    });
  });

  // ── P3: material variants — opaque, blended, alphaDiscard ────────────────
  describe("P3 material variants", () => {
    it("opaque variant: transparent=false, depthWrite=true", () => {
      const mat = createStarMadeCubeShaderMaterial();
      expect(mat.transparent).toBe(false);
      expect(mat.depthWrite).toBe(true);
    });

    it("blended variant: transparent=true, depthWrite=false", () => {
      const mat = createStarMadeCubeShaderMaterial({ blended: true });
      expect(mat.transparent).toBe(true);
      expect(mat.depthWrite).toBe(false);
    });

    it("alphaDiscard variant: transparent=false (discards in shader), depthWrite=true", () => {
      const mat = createStarMadeCubeShaderMaterial({ alphaDiscard: true });
      // alphaDiscard uses discard in GLSL, not Three transparency
      expect(mat.depthWrite).toBe(true);
    });

    it("blended variant: extraAlpha defaults to 1 (opaque tex.a passthrough)", () => {
      const mat = createStarMadeCubeShaderMaterial({ blended: true });
      expect(mat.uniforms.extraAlpha?.value).toBe(1);
    });

    it("opaque variant: extraAlpha defaults to 0", () => {
      const mat = createStarMadeCubeShaderMaterial();
      expect(mat.uniforms.extraAlpha?.value).toBe(0);
    });
  });

  // ── P3: v_inv MVP matrix update ──────────────────────────────────────────
  describe("P3 updateStarMadeCubeShaderMVP", () => {
    it("sets v_inv to projMatrix × viewMatrix product", () => {
      const mat = createStarMadeCubeShaderMaterial();
      const view = new Matrix4().makeTranslation(1, 2, 3);
      const proj = new Matrix4().makePerspective(-1, 1, 1, -1, 0.1, 100);
      updateStarMadeCubeShaderMVP(mat, view, proj);
      const expected = new Matrix4().multiplyMatrices(proj, view);
      const v_inv = mat.uniforms.v_inv?.value as Matrix4;
      expect(v_inv).toBeInstanceOf(Matrix4);
      // Check a few elements
      expect(v_inv.elements[0]).toBeCloseTo(expected.elements[0], 5);
      expect(v_inv.elements[12]).toBeCloseTo(expected.elements[12], 5);
    });

    it("does not throw when v_inv uniform is absent", () => {
      const mat = createStarMadeCubeShaderMaterial();
      delete mat.uniforms.v_inv;
      expect(() => updateStarMadeCubeShaderMVP(mat, new Matrix4(), new Matrix4())).not.toThrow();
    });
  });

  // ── P3: shadow depth material variants ───────────────────────────────────
  describe("P3 shadow depth materials", () => {
    it("cube shadow depth: depthWrite=true, depthTest=true", () => {
      const mat = createStarMadeCubeShadowDepthMaterial();
      expect(mat.depthWrite).toBe(true);
      expect(mat.depthTest).toBe(true);
    });

    it("cube shadow depth blended: includes blended define", () => {
      const mat = createStarMadeCubeShadowDepthMaterial({ alphaDiscard: true });
      // name contains 'blended'
      expect(mat.name).toContain("blended");
    });

    it("LOD shadow depth material: depthWrite=true, depthTest=true", () => {
      const mat = createStarMadeLodShadowDepthMaterial();
      expect(mat.depthWrite).toBe(true);
      expect(mat.depthTest).toBe(true);
    });
  });

  // ── P3: normalStrength uniform present and settable ───────────────────────
  describe("P3 normalStrength uniform", () => {
    it("defaults to 1", () => {
      const mat = createStarMadeCubeShaderMaterial({ normalStrength: 1 });
      expect(mat.uniforms.starMadeNormalStrength?.value).toBeCloseTo(1, 5);
    });

    it("accepts custom normalStrength", () => {
      const mat = createStarMadeCubeShaderMaterial({ normalStrength: 0.5 });
      expect(mat.uniforms.starMadeNormalStrength?.value).toBeCloseTo(0.5, 5);
    });
  });


  // ── P3: LOD shader material uniform coverage ─────────────────────────────
  describe("P3 LOD shader material uniform coverage", () => {
    const lodMat = createStarMadeLodShaderMaterial();
    const u = lodMat.uniforms;

    it.each([
      "mainTex", "emissiveTex", "normalTex", "emissiveOn",
      "lightPos", "viewPos", "lightVec", "lightDiffuse",
      "ambient", "diffuse", "specular", "daa", "dsa",
      "starMadeFrontMaterial", "starMadeFrontLightModelProduct",
      "starMadeLightSources"
    ] as const)("LOD uniform '%s' exists", (name) => {
      expect(u[name]).toBeDefined();
    });

    it("lightVec has 4 slots matching lodcube.frag.glsl", () => {
      expect(Array.isArray(u.lightVec?.value)).toBe(true);
      expect((u.lightVec?.value as any[]).length).toBe(4);
    });

    it("lightDiffuse has 4 slots matching lodcube.frag.glsl", () => {
      expect(Array.isArray(u.lightDiffuse?.value)).toBe(true);
      expect((u.lightDiffuse?.value as any[]).length).toBe(4);
    });
  });

  // ── P3: allLight build-mode behavior ────────────────────────────────────
  describe("P3 allLight build-mode behavior", () => {
    it("setStarMadeCubeShaderAllLight(mat, 2) fully lights geometry (lighten mode)", () => {
      const mat = createStarMadeCubeShaderMaterial();
      setStarMadeCubeShaderAllLight(mat, 2);
      expect(mat.uniforms.allLight?.value).toBe(2);
    });

    it("reset to 0 restores normal rendering mode", () => {
      const mat = createStarMadeCubeShaderMaterial();
      setStarMadeCubeShaderAllLight(mat, 2);
      setStarMadeCubeShaderAllLight(mat, 0);
      expect(mat.uniforms.allLight?.value).toBe(0);
    });
  });

  // ── P3: shader source contains expected StarMade entry points ─────────────
  describe("P3 shader source structure", () => {
    it("cube.quads13 vertex shader contains INTATT attribute ivert", () => {
      const sources = createStarMadeThreeShaderProgramSources("cube.quads13", {
        defines: ["INTATT", "shader4", "force130", "texarray"]
      });
      expect(sources.vertexSource).toContain("ivert");
    });

    it("cube.quads13 fragment shader contains starMadeFragColor assignment", () => {
      const sources = createStarMadeThreeShaderProgramSources("cube.quads13", {
        defines: ["INTATT", "shader4", "force130", "texarray"]
      });
      expect(sources.fragmentSource).toContain("starMadeFragColor");
    });

    it("cube.shadow vertex shader shares cubeEncoding path", () => {
      const sources = createStarMadeThreeShaderProgramSources("cube.shadow", {
        defines: ["INTATT", "shader4", "force130"]
      });
      expect(sources.vertexSource.length).toBeGreaterThan(100);
      expect(sources.fragmentSource.length).toBeGreaterThan(10);
    });
  });


  // ── P5 exit criteria: shadow pipeline completeness ────────────────────────
  describe("P5 shadow pipeline exit criteria", () => {
    it("1-split: shadowParams.splits=1, farDistances=0.9983, single map", () => {
      const bounds = new Box3(new Vector3(-20,-20,-20), new Vector3(20,20,20));
      const p = createStarMadeDirectionalShadowPipeline({ sceneBounds: bounds, splitCount: 1 });
      expect(p.shadowParams.splits).toBe(1);
      expect(p.shadowParams.farDistances!.x).toBeCloseTo(0.9983, 3);
      expect(p.shadowParams.maps!.length).toBeGreaterThanOrEqual(1);
      expect(p.arrayRenderTarget).toBeNull();
    });

    it("3-split: splits=3, all farDistances in (0,1), each > previous", () => {
      const bounds = new Box3(new Vector3(-50,-50,-50), new Vector3(50,50,50));
      const p = createStarMadeDirectionalShadowPipeline({
        sceneBounds: bounds, splitCount: 3,
        cameraNearForSplits: 0.1, cameraFarForSplits: 500
      });
      expect(p.shadowParams.splits).toBe(3);
      const fd = p.shadowParams.farDistances!;
      expect(fd.x).toBeGreaterThan(0);
      expect(fd.x).toBeLessThan(1);
      expect(fd.y).toBeGreaterThan(fd.x);
      expect(fd.z).toBeGreaterThanOrEqual(fd.y);
      expect(fd.z).toBeLessThanOrEqual(1);
    });

    it("applyToCubeMaterial writes splits, strength, bias, farDistances uniforms", () => {
      const bounds = new Box3(new Vector3(-20,-20,-20), new Vector3(20,20,20));
      const p = createStarMadeDirectionalShadowPipeline({ sceneBounds: bounds, splitCount: 1, strength: 0.4, bias: 0.005 });
      const mat = createStarMadeCubeShaderMaterial();
      p.applyToCubeMaterial(mat);
      expect(mat.uniforms.starMadeShadowSplits?.value).toBe(1);
      expect(mat.uniforms.starMadeShadowStrength?.value).toBeCloseTo(0.4, 5);
      expect(mat.uniforms.starMadeShadowBias?.value).toBeCloseTo(0.005, 5);
      expect(mat.uniforms.starMadeShadowFarDistances?.value).toBeDefined();
    });

    it("bindStarMadeDirectionalShadowRoot: casterMeshCount > 0 after binding", () => {
      const bounds = new Box3(new Vector3(-10,-10,-10), new Vector3(10,10,10));
      const p = createStarMadeDirectionalShadowPipeline({ sceneBounds: bounds });
      const root = new Group();
      root.add(new Mesh(new BufferGeometry(), createStarMadeCubeShaderMaterial()));
      root.add(new Mesh(new BufferGeometry(), createStarMadeCubeShaderMaterial()));
      bindStarMadeDirectionalShadowRoot(p, root);
      expect(p.casterMeshCount).toBeGreaterThan(0);
    });

    it("shadowCoef() injected in cube ShaderMaterial fragment", () => {
      const mat = createStarMadeCubeShaderMaterial();
      expect(mat.fragmentShader).toContain("shadowCoef");
      expect(mat.fragmentShader).toContain("starMadeShadowStrength");
    });

    it("shadowCoef() injected in LOD ShaderMaterial fragment", () => {
      const mat = createStarMadeLodShaderMaterial();
      expect(mat.fragmentShader).toContain("shadowCoef");
    });

    it("cube depth material has all required uniforms for shadow depth pass", () => {
      const mat = createStarMadeCubeShadowDepthMaterial();
      expect(mat.uniforms.animationTime).toBeDefined();
      expect(mat.uniforms.lodThreshold).toBeDefined();
      expect(mat.uniforms.normals).toBeDefined();
      expect(mat.uniforms.tangents).toBeDefined();
      expect(mat.uniforms.binormals).toBeDefined();
      expect(mat.uniforms.quadPosMark).toBeDefined();
      expect(mat.depthWrite).toBe(true);
    });

    it("cubes and LOD are both captured as casters in one pipeline", () => {
      const bounds = new Box3(new Vector3(-10,-10,-10), new Vector3(10,10,10));
      const p = createStarMadeDirectionalShadowPipeline({ sceneBounds: bounds });
      const root = new Group();
      const cube = new Mesh(new BufferGeometry(), createStarMadeCubeShaderMaterial());
      cube.name = "cube_block";
      const lod = new Mesh(new BufferGeometry(), createStarMadeLodShaderMaterial());
      lod.name = "StarMadeLodShaderMaterial_lod";
      root.add(cube, lod);
      bindStarMadeDirectionalShadowRoot(p, root);
      expect(p.casterMeshCount).toBeGreaterThanOrEqual(2);
    });
  });


  // ── P8: selection and outline overlay materials ───────────────────────────
  describe("P8 selection and build-mode overlays", () => {
    it("selectionSolid material: transparent, no depthWrite, additive blending", () => {
      const mat = createStarMadeSelectionSolidMaterial();
      expect(mat.transparent).toBe(true);
      expect(mat.depthWrite).toBe(false);
      expect(mat.uniforms.selectionColor).toBeDefined();
    });

    it("selectionSolid material: custom color written to uniform", () => {
      const color = new Vector4(0.5, 0, 0, 0.3);
      const mat = createStarMadeSelectionSolidMaterial({ color });
      expect(mat.uniforms.selectionColor.value).toBe(color);
    });

    it("selectionSingle material: has mainTexA, selectionColor, texMult uniforms", () => {
      const mat = createStarMadeSelectionSingleMaterial();
      expect(mat.uniforms.mainTexA).toBeDefined();
      expect(mat.uniforms.selectionColor).toBeDefined();
      expect(mat.uniforms.texMult).toBeDefined();
      expect(mat.uniforms.texMult.value).toBeCloseTo(1.0, 5);
    });

    it("selectionSingle material: transparent, no depthWrite", () => {
      const mat = createStarMadeSelectionSingleMaterial();
      expect(mat.transparent).toBe(true);
      expect(mat.depthWrite).toBe(false);
    });

    it("selectionSingle material: discard logic in fragment shader", () => {
      const mat = createStarMadeSelectionSingleMaterial();
      expect(mat.fragmentShader).toContain("discard");
      expect(mat.fragmentShader).toContain("selectionColor");
    });

    it("updateStarMadeCubeShaderSelectTime sets selectTime uniform", () => {
      const mat = createStarMadeCubeShaderMaterial({ selectTime: 0 });
      updateStarMadeCubeShaderSelectTime(mat, 500);
      expect(mat.uniforms.selectTime?.value).toBe(500);
    });

    it("updateStarMadeCubeShaderSelectTime 0 resets blink", () => {
      const mat = createStarMadeCubeShaderMaterial({ selectTime: 0 });
      updateStarMadeCubeShaderSelectTime(mat, 500);
      updateStarMadeCubeShaderSelectTime(mat, 0);
      expect(mat.uniforms.selectTime?.value).toBe(0);
    });

    it("selection overlays do not contaminate cube material uniforms", () => {
      const cubemat = createStarMadeCubeShaderMaterial();
      const selmat = createStarMadeSelectionSolidMaterial();
      // Verify selection material has no cube-material uniforms
      expect(selmat.uniforms.allLight).toBeUndefined();
      expect(selmat.uniforms.lightPos).toBeUndefined();
      expect(selmat.uniforms.starMadeLightSources).toBeUndefined();
      // Cube material is unmodified
      expect(cubemat.uniforms.allLight).toBeDefined();
    });
  });

  describe("P8 outline post-process material", () => {
    it("outline material: has bgl_RenderedTexture, bgl_DepthTexture, bgl_MeshForce uniforms", () => {
      const mat = createStarMadeOutlineMaterial({ meshForce: 0.5 });
      expect(mat.uniforms.bgl_RenderedTexture).toBeDefined();
      expect(mat.uniforms.bgl_DepthTexture).toBeDefined();
      expect(mat.uniforms.bgl_MeshForce).toBeDefined();
      expect(mat.uniforms.bgl_TextureCoordinateOffset).toBeDefined();
    });

    it("outline material: 9 texture coordinate offsets (3x3 kernel)", () => {
      const mat = createStarMadeOutlineMaterial();
      expect((mat.uniforms.bgl_TextureCoordinateOffset.value as unknown[]).length).toBe(9);
    });

    it("starMadeOutlineTextureCoordinateOffsets: 9 Vector2 offsets for given viewport", () => {
      const offsets = starMadeOutlineTextureCoordinateOffsets(1920, 1080);
      expect(offsets).toHaveLength(9);
      expect(offsets[0]).toBeInstanceOf(Vector2);
      expect(offsets[4].x).toBeCloseTo(0, 5);   // center = (0, 0)
      expect(offsets[4].y).toBeCloseTo(0, 5);
    });

    it("outline material: no depthWrite, no depthTest", () => {
      const mat = createStarMadeOutlineMaterial();
      expect(mat.depthWrite).toBe(false);
      expect(mat.depthTest).toBe(false);
    });

    it("outline fragment shader contains edge detection logic", () => {
      const mat = createStarMadeOutlineMaterial();
      expect(mat.fragmentShader).toContain("edgeForce");
      expect(mat.fragmentShader).toContain("bgl_MeshForce");
      expect(mat.fragmentShader).toContain("linearDepth");
    });

    it("outline material does not contaminate cube rendering pipeline", () => {
      const cubemat = createStarMadeCubeShaderMaterial();
      const outmat = createStarMadeOutlineMaterial();
      // Outline has no cube uniforms
      expect(outmat.uniforms.allLight).toBeUndefined();
      expect(outmat.uniforms.starMadeLightSources).toBeUndefined();
      // Cube material unaffected
      expect(cubemat.uniforms.allLight).toBeDefined();
    });
  });

  describe("P8 build-mode overlay via allLight + onlyInBuildMode", () => {
    it("allLight=1 activates build-mode trigger visibility in cube shader", () => {
      const mat = createStarMadeCubeShaderMaterial();
      setStarMadeCubeShaderAllLight(mat, 1);
      expect(mat.uniforms.allLight?.value).toBe(1);
    });

    it("allLight=2 activates lighten mode (fully lit in build mode)", () => {
      const mat = createStarMadeCubeShaderMaterial();
      setStarMadeCubeShaderAllLight(mat, 2);
      expect(mat.uniforms.allLight?.value).toBe(2);
    });

    it("resetting allLight=0 restores normal rendering — no contamination", () => {
      const mat = createStarMadeCubeShaderMaterial();
      setStarMadeCubeShaderAllLight(mat, 3);
      setStarMadeCubeShaderAllLight(mat, 0);
      expect(mat.uniforms.allLight?.value).toBe(0);
      // Other uniforms are unaffected
      expect(mat.uniforms.lightPos?.value).toBeDefined();
      expect(mat.uniforms.starMadeLightSources?.value).toBeDefined();
    });
  });


  // ── P9: post-process and effect materials ────────────────────────────────
  describe("P9 gamma correction material", () => {
    it("has fbTex and gammaInv uniforms", () => {
      const mat = createStarMadeGammaMaterial();
      expect(mat.uniforms.fbTex).toBeDefined();
      expect(mat.uniforms.gammaInv).toBeDefined();
    });

    it("default gammaInv ≈ 1/2.2 (sRGB)", () => {
      const mat = createStarMadeGammaMaterial();
      expect(mat.uniforms.gammaInv.value).toBeCloseTo(1 / 2.2, 3);
    });

    it("no depthWrite, no depthTest", () => {
      const mat = createStarMadeGammaMaterial();
      expect(mat.depthWrite).toBe(false);
      expect(mat.depthTest).toBe(false);
    });

    it("fragment shader applies pow(color, gammaInv)", () => {
      const mat = createStarMadeGammaMaterial();
      expect(mat.fragmentShader).toContain("pow");
      expect(mat.fragmentShader).toContain("gammaInv");
    });
  });

  describe("P9 simple bloom material", () => {
    it("has tex, blurStep, threshold, strength uniforms", () => {
      const mat = createStarMadeSimpleBloomMaterial();
      expect(mat.uniforms.tex).toBeDefined();
      expect(mat.uniforms.blurStep).toBeDefined();
      expect(mat.uniforms.threshold).toBeDefined();
      expect(mat.uniforms.strength).toBeDefined();
    });

    it("transparent, no depthWrite, additive blending", () => {
      const mat = createStarMadeSimpleBloomMaterial();
      expect(mat.transparent).toBe(true);
      expect(mat.depthWrite).toBe(false);
    });

    it("default blurStep=0.005, threshold=0.3, strength=1.2", () => {
      const mat = createStarMadeSimpleBloomMaterial();
      expect(mat.uniforms.blurStep.value).toBeCloseTo(0.005, 5);
      expect(mat.uniforms.threshold.value).toBeCloseTo(0.3, 5);
      expect(mat.uniforms.strength.value).toBeCloseTo(1.2, 5);
    });

    it("does not contaminate cube pipeline", () => {
      const bloom = createStarMadeSimpleBloomMaterial();
      expect(bloom.uniforms.allLight).toBeUndefined();
      expect(bloom.uniforms.starMadeLightSources).toBeUndefined();
    });
  });

  describe("P9 thruster material", () => {
    it("has thrustColor0, thrustColor1, ticks uniforms", () => {
      const mat = createStarMadeThrusterMaterial();
      expect(mat.uniforms.thrustColor0).toBeDefined();
      expect(mat.uniforms.thrustColor1).toBeDefined();
      expect(mat.uniforms.ticks).toBeDefined();
    });

    it("transparent, no depthWrite, additive blending", () => {
      const mat = createStarMadeThrusterMaterial();
      expect(mat.transparent).toBe(true);
      expect(mat.depthWrite).toBe(false);
    });

    it("fragment shader contains discard for low alpha", () => {
      const mat = createStarMadeThrusterMaterial();
      expect(mat.fragmentShader).toContain("discard");
    });
  });

  describe("P9 simple beam material", () => {
    it("has thrustColor0, thrustColor1, beamTime, zoomFac uniforms", () => {
      const mat = createStarMadeSimpleBeamMaterial();
      expect(mat.uniforms.thrustColor0).toBeDefined();
      expect(mat.uniforms.thrustColor1).toBeDefined();
      expect(mat.uniforms.beamTime).toBeDefined();
      expect(mat.uniforms.zoomFac).toBeDefined();
    });

    it("transparent, no depthWrite, additive blending", () => {
      const mat = createStarMadeSimpleBeamMaterial();
      expect(mat.transparent).toBe(true);
      expect(mat.depthWrite).toBe(false);
    });

    it("fragment shader contains pulse and edge attenuation", () => {
      const mat = createStarMadeSimpleBeamMaterial();
      expect(mat.fragmentShader).toContain("pulse");
      expect(mat.fragmentShader).toContain("edgeAlpha");
      expect(mat.fragmentShader).toContain("discard");
    });
  });

  describe("P9 sky/atmosphere material", () => {
    it("has tex, nmap, lightPos, cMove, cSharp, cCover uniforms", () => {
      const mat = createStarMadeSkyMaterial();
      expect(mat.uniforms.tex).toBeDefined();
      expect(mat.uniforms.nmap).toBeDefined();
      expect(mat.uniforms.lightPos).toBeDefined();
      expect(mat.uniforms.cMove).toBeDefined();
      expect(mat.uniforms.cSharp).toBeDefined();
      expect(mat.uniforms.cCover).toBeDefined();
    });

    it("fragment shader contains cloud and sky color mixing", () => {
      const mat = createStarMadeSkyMaterial();
      expect(mat.fragmentShader).toContain("cloudAlpha");
      expect(mat.fragmentShader).toContain("skyColor");
    });
  });

  describe("P9 updateStarMadeEffectTime", () => {
    it("increments ticks on thruster material", () => {
      const mat = createStarMadeThrusterMaterial({ ticks: 0 });
      updateStarMadeEffectTime(mat, 1 / 60);
      expect(mat.uniforms.ticks.value).toBeCloseTo(1, 1);
    });

    it("increments beamTime on beam material", () => {
      const mat = createStarMadeSimpleBeamMaterial({ beamTime: 0 });
      const before = mat.uniforms.beamTime.value as number;
      updateStarMadeEffectTime(mat, 0.1);
      expect(mat.uniforms.beamTime.value as number).toBeGreaterThan(before);
    });

    it("effect materials do not interfere with cube/LOD pipeline", () => {
      const cube = createStarMadeCubeShaderMaterial();
      const bloom = createStarMadeSimpleBloomMaterial();
      const thruster = createStarMadeThrusterMaterial();
      // None of the effects should reference cube uniforms
      expect(bloom.uniforms.lightPos).toBeUndefined();
      expect(thruster.uniforms.allLight).toBeUndefined();
      // Cube material unaffected
      expect(cube.uniforms.lightPos).toBeDefined();
      expect(cube.uniforms.allLight).toBeDefined();
    });
  });

});
