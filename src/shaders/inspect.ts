import { getStarMadeShaderProgram, type StarMadeShaderProgramId } from "./programs.js";
import {
  getEmbeddedStarMadeShaderSource,
  normalizeStarMadeShaderPath,
  preprocessEmbeddedStarMadeShader,
  type StarMadeShaderPreprocessOptions
} from "./preprocess.js";

export interface StarMadeShaderSymbol {
  readonly name: string;
  readonly type: string;
  readonly arraySize?: number;
}

export interface StarMadeShaderInspection {
  readonly path?: string;
  readonly version?: string;
  readonly imports: readonly string[];
  readonly extensions: readonly string[];
  readonly defines: readonly string[];
  readonly conditionalDefines: readonly string[];
  readonly uniforms: readonly StarMadeShaderSymbol[];
  readonly attributes: readonly StarMadeShaderSymbol[];
  readonly varyings: readonly StarMadeShaderSymbol[];
  readonly outputs: readonly StarMadeShaderSymbol[];
  readonly legacyBuiltIns: readonly string[];
  readonly usesLegacyBuiltIns: boolean;
  readonly usesTextureArrays: boolean;
}

export interface StarMadeShaderProgramInspection {
  readonly id: StarMadeShaderProgramId;
  readonly vertex: StarMadeShaderInspection;
  readonly fragment: StarMadeShaderInspection;
}

const importPattern = /^\s*#IMPORT\s+(.+?)\s*$/;
const versionPattern = /^\s*#version\s+(.+?)\s*$/;
const extensionPattern = /^\s*#extension\s+(.+?)\s*$/;
const definePattern = /^\s*#define\s+([A-Za-z_][A-Za-z0-9_]*)\b/;
const conditionalPattern = /^\s*#(?:DELAYED)?(?:IFDEF|ELSEIF)\s+([A-Za-z_][A-Za-z0-9_]*)\b/;
const symbolPattern = /^\s*(uniform|attribute|varying|in|out)\s+([A-Za-z0-9_]+)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*\[\s*([0-9]+)\s*\])?\s*;/;
const legacyBuiltInPattern =
  /\b(?:gl_Vertex|gl_Normal|gl_Color|gl_MultiTexCoord[0-9]*|gl_TexCoord|gl_LightSource|gl_TextureMatrix|gl_ModelViewMatrix|gl_ProjectionMatrix|gl_ModelViewProjectionMatrix|gl_NormalMatrix|gl_FragColor|gl_FragCoord|gl_FragDepth|gl_FrontMaterial|gl_LightModel|gl_FrontLightModelProduct|gl_FrontLightProduct|gl_Fog)\b|ftransform\s*\(/;
const legacyBuiltInTokenPattern =
  /\b(?:gl_Vertex|gl_Normal|gl_Color|gl_MultiTexCoord[0-9]*|gl_TexCoord|gl_LightSource|gl_TextureMatrix|gl_ModelViewMatrix|gl_ProjectionMatrix|gl_ModelViewProjectionMatrix|gl_NormalMatrix|gl_FragColor|gl_FragCoord|gl_FragDepth|gl_FrontMaterial|gl_LightModel|gl_FrontLightModelProduct|gl_FrontLightProduct|gl_Fog)\b|ftransform\s*\(/g;
const textureArrayPattern = /\b(?:sampler2DArray|texture2DArray|shadow2DArray|shadow2DArrayOffset)\b/;

export function inspectStarMadeShaderSource(source: string, path?: string): StarMadeShaderInspection {
  const imports = new Set<string>();
  const extensions = new Set<string>();
  const defines = new Set<string>();
  const conditionalDefines = new Set<string>();
  const uniforms: StarMadeShaderSymbol[] = [];
  const attributes: StarMadeShaderSymbol[] = [];
  const varyings: StarMadeShaderSymbol[] = [];
  const outputs: StarMadeShaderSymbol[] = [];
  let version: string | undefined;

  for (const line of source.split(/\r?\n/)) {
    const versionMatch = line.match(versionPattern);
    const importMatch = line.match(importPattern);
    const extensionMatch = line.match(extensionPattern);
    const defineMatch = line.match(definePattern);
    const conditionalMatch = line.match(conditionalPattern);
    const symbolMatch = line.match(symbolPattern);

    if (versionMatch) {
      version = versionMatch[1];
    }

    if (importMatch) {
      imports.add(normalizeStarMadeShaderPath(importMatch[1].replace(/^["']|["']$/g, "")));
    }

    if (extensionMatch) {
      extensions.add(extensionMatch[1]);
    }

    if (defineMatch) {
      defines.add(defineMatch[1]);
    }

    if (conditionalMatch) {
      conditionalDefines.add(conditionalMatch[1]);
    }

    if (symbolMatch) {
      const symbol = {
        type: symbolMatch[2],
        name: symbolMatch[3],
        arraySize: symbolMatch[4] ? Number(symbolMatch[4]) : undefined
      };

      if (symbolMatch[1] === "uniform") {
        uniforms.push(symbol);
      } else if (symbolMatch[1] === "attribute") {
        attributes.push(symbol);
      } else if (symbolMatch[1] === "varying") {
        varyings.push(symbol);
      } else if (symbolMatch[1] === "out") {
        outputs.push(symbol);
      } else {
        attributes.push(symbol);
      }
    }
  }

  return {
    path,
    version,
    imports: [...imports].sort(),
    extensions: [...extensions].sort(),
    defines: [...defines].sort(),
    conditionalDefines: [...conditionalDefines].sort(),
    uniforms,
    attributes,
    varyings,
    outputs,
    legacyBuiltIns: extractLegacyBuiltIns(source),
    usesLegacyBuiltIns: legacyBuiltInPattern.test(source),
    usesTextureArrays: textureArrayPattern.test(source)
  };
}

export function inspectEmbeddedStarMadeShader(path: string): StarMadeShaderInspection {
  const normalizedPath = normalizeStarMadeShaderPath(path);
  return inspectStarMadeShaderSource(getEmbeddedStarMadeShaderSource(normalizedPath), normalizedPath);
}

export function inspectPreprocessedEmbeddedStarMadeShader(
  path: string,
  options: StarMadeShaderPreprocessOptions = {}
): StarMadeShaderInspection {
  const normalizedPath = normalizeStarMadeShaderPath(path);
  return inspectStarMadeShaderSource(preprocessEmbeddedStarMadeShader(normalizedPath, options), normalizedPath);
}

export function inspectStarMadeShaderProgram(
  id: StarMadeShaderProgramId,
  options: StarMadeShaderPreprocessOptions = {}
): StarMadeShaderProgramInspection {
  const program = getStarMadeShaderProgram(id);
  const defaultDefines = options.includeDefaultDefines === false ? [] : program.defaultDefines;
  const defines = [...defaultDefines, ...(options.defines ?? [])];

  return {
    id,
    vertex: inspectPreprocessedEmbeddedStarMadeShader(program.vertexPath, { ...options, defines }),
    fragment: inspectPreprocessedEmbeddedStarMadeShader(program.fragmentPath, { ...options, defines })
  };
}

function extractLegacyBuiltIns(source: string): readonly string[] {
  const tokens = new Set<string>();

  for (const match of source.matchAll(legacyBuiltInTokenPattern)) {
    tokens.add(match[0].replace(/\s*\($/, ""));
  }

  return [...tokens].sort();
}
