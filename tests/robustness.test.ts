import { describe, expect, it } from "vitest";
import { createBlockCubeGeometry } from "../src/geometry/cube";
import {
  adaptStarMadeShaderToThree,
  createEmbeddedStarMadeShaderThreeCompatibilityReport,
  listEmbeddedStarMadeShaderPaths,
  normalizeStarMadeShaderPath,
  preprocessEmbeddedStarMadeShader,
  preprocessStarMadeShader
} from "../src/shaders";
import { createStarMadeCubeAtlasLayout, tileIdToUvRect } from "../src/starmade/atlas";
import { cubeTextureUrl } from "../src/textures";

const trackedLegacyBuiltIns =
  /\b(?:gl_Vertex|gl_Normal|gl_MultiTexCoord[0-9]*|gl_TexCoord|gl_LightSource|gl_TextureMatrix|gl_ModelViewMatrix|gl_ProjectionMatrix|gl_ModelViewProjectionMatrix|gl_NormalMatrix|gl_FrontMaterial|gl_LightModel|gl_FrontLightModelProduct|gl_FrontLightProduct|gl_Fog)\b|ftransform\s*\(/;
const legacyTextureFunctionCalls =
  /\b(?:texture2DArray|shadow2DArrayOffset|shadow2DArray|texture2DLod|texture2D|textureCube)\s*\(/;
const textureArraySyntax = /\b(?:sampler2DArray|texture2DArray|shadow2DArray|shadow2DArrayOffset)\b/;

function shaderStageFromPath(path: string, source: string): "vertex" | "fragment" {
  if (/(?:\.vsh|\.vert|\.vs)(?:\.glsl)?$/i.test(path)) {
    return "vertex";
  }

  if (/\b(?:gl_Vertex|gl_Normal|gl_MultiTexCoord[0-9]*|gl_ModelViewMatrix|gl_NormalMatrix|ftransform\s*\()/.test(source)) {
    return "vertex";
  }

  return "fragment";
}

function stripGlslComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("shader preprocessing robustness", () => {
  it("rejects unsafe or ambiguous shader paths", () => {
    expect(() => normalizeStarMadeShaderPath("")).toThrow("Invalid StarMade shader path");
    expect(() => normalizeStarMadeShaderPath("../outside.glsl")).toThrow("Invalid StarMade shader path");
    expect(() => normalizeStarMadeShaderPath("data/shader/../outside.glsl")).toThrow(
      "Invalid StarMade shader path"
    );
    expect(() => normalizeStarMadeShaderPath("data/shader//cube.glsl")).toThrow("Invalid StarMade shader path");
  });

  it("does not resolve imports hidden behind inactive conditionals", () => {
    const processed = preprocessStarMadeShader(
      ["#IFDEF missing_define", "#IMPORT data/shader/not-present.glsl", "#ELSE", "active();", "#ENDIF"].join("\n"),
      {
        sources: {}
      }
    );

    expect(processed).toBe("active();");
  });

  it("rejects circular imports", () => {
    expect(() =>
      preprocessStarMadeShader("#IMPORT data/shader/a.glsl", {
        sources: {
          "data/shader/a.glsl": "#IMPORT data/shader/b.glsl",
          "data/shader/b.glsl": "#IMPORT data/shader/a.glsl"
        }
      })
    ).toThrow("Circular StarMade shader import");
  });

  it("rejects malformed conditional directives", () => {
    expect(() => preprocessStarMadeShader("#IFDEF")).toThrow("#IFDEF requires a define name");
    expect(() => preprocessStarMadeShader("#ELSE")).toThrow("#ELSE without matching #IFDEF");
    expect(() => preprocessStarMadeShader("#IFDEF a\n#ELSEIF")).toThrow("#ELSEIF requires a define name");
  });
});

describe("shader compatibility robustness", () => {
  it("keeps embedded shader paths normalized and rooted under data/shader", () => {
    for (const path of listEmbeddedStarMadeShaderPaths()) {
      expect(path).toMatch(/^data\/shader\//);
      expect(path).not.toContain("..");
      expect(path).not.toContain("\\");
      expect(normalizeStarMadeShaderPath(path)).toBe(path);
    }
  });

  it("adapts all embedded shaders without leaving tracked legacy mapping tokens", () => {
    for (const path of listEmbeddedStarMadeShaderPaths()) {
      const preprocessed = preprocessEmbeddedStarMadeShader(path);
      const adapted = adaptStarMadeShaderToThree(preprocessed, {
        stage: shaderStageFromPath(path, preprocessed)
      });

      expect(stripGlslComments(adapted.source), path).not.toMatch(trackedLegacyBuiltIns);
      expect(adapted.warnings.filter((warning) => warning.includes("manual review")), path).toEqual([]);
    }
  });

  it("rewrites texture-array shaders for the WebGL2 GLSL dialect", () => {
    for (const path of listEmbeddedStarMadeShaderPaths()) {
      const preprocessed = preprocessEmbeddedStarMadeShader(path);

      if (!textureArraySyntax.test(preprocessed)) {
        continue;
      }

      const adapted = adaptStarMadeShaderToThree(preprocessed, {
        stage: shaderStageFromPath(path, preprocessed),
        target: "webgl2"
      });

      expect(adapted.source, path).toMatch(/^#version 300 es/);
      expect(stripGlslComments(adapted.source), path).not.toMatch(legacyTextureFunctionCalls);
      expect(adapted.warnings, path).not.toContain("texture arrays require WebGL2 or a texture-array compatibility path");
    }
  });

  it("keeps the compatibility report internally consistent", () => {
    const report = createEmbeddedStarMadeShaderThreeCompatibilityReport();
    const webgl2Report = createEmbeddedStarMadeShaderThreeCompatibilityReport(listEmbeddedStarMadeShaderPaths(), {
      target: "webgl2"
    });

    expect(report.total).toBe(listEmbeddedStarMadeShaderPaths().length);
    expect(report.direct + report.adaptable + report.requiresWebgl2 + report.requiresMapping).toBe(report.total);
    expect(report.requiresMapping).toBe(0);
    expect(report.requiresWebgl2).toBe(22);
    expect(webgl2Report.requiresMapping).toBe(0);
    expect(webgl2Report.requiresWebgl2).toBe(0);
  });
});

describe("atlas and geometry robustness", () => {
  it("rejects invalid atlas dimensions and unsafe UV insets", () => {
    expect(() => tileIdToUvRect(0, { columns: 0, rows: 16 })).toThrow("atlas.columns");
    expect(() => tileIdToUvRect(0, { columns: 16, rows: 0 })).toThrow("atlas.rows");
    expect(() => tileIdToUvRect(0, { columns: 16, rows: 16, uvInset: -0.001 })).toThrow("atlas.uvInset");
    expect(() => tileIdToUvRect(0, { columns: 16, rows: 16, uvInset: 0.04 })).toThrow("atlas.uvInset");
  });

  it("creates finite UVs and valid material groups for all StarMade cube layers", () => {
    const layout = createStarMadeCubeAtlasLayout(64);
    const textureIds = {
      front: layout.layers[0]!.textureIdOffset,
      back: layout.layers[1]!.textureIdOffset,
      top: layout.layers[2]!.textureIdOffset,
      bottom: layout.layers[3]!.textureIdOffset,
      right: layout.layers[4]!.textureIdOffset,
      left: layout.layers[0]!.textureIdOffset + 255
    };
    const geometry = createBlockCubeGeometry({ starMadeAtlasLayout: layout, textures: textureIds });
    const uv = geometry.getAttribute("uv");

    for (let index = 0; index < uv.count; index++) {
      expect(Number.isFinite(uv.getX(index))).toBe(true);
      expect(Number.isFinite(uv.getY(index))).toBe(true);
      expect(uv.getX(index)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(index)).toBeLessThanOrEqual(1);
      expect(uv.getY(index)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(index)).toBeLessThanOrEqual(1);
    }

    expect(geometry.groups).toHaveLength(6);
    for (const group of geometry.groups) {
      expect(group.materialIndex).toBeGreaterThanOrEqual(0);
      expect(group.materialIndex).toBeLessThan(layout.layers.length);
      expect(group.count).toBe(6);
    }
  });
});

describe("texture URL robustness", () => {
  it("encodes texture pack names and keeps generated URLs relative to the configured base", () => {
    expect(cubeTextureUrl("/assets///", "Pack With / Slash", 64, "t000")).toBe(
      "/assets/Pack%20With%20%2F%20Slash/64/t000.png"
    );
  });
});
