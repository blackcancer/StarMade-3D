import { inspectEmbeddedStarMadeShader, type StarMadeShaderInspection } from "./inspect.js";
import { listEmbeddedStarMadeShaderPaths } from "./preprocess.js";

export type StarMadeShaderThreeCompatibilityTarget = "webgl1" | "webgl2";

export type StarMadeShaderThreeCompatibility =
  | "direct"
  | "adaptable"
  | "requires-webgl2"
  | "requires-mapping";

export interface StarMadeShaderThreeCompatibilityAnalysis {
  readonly path: string;
  readonly compatibility: StarMadeShaderThreeCompatibility;
  readonly inspection: StarMadeShaderInspection;
  readonly supportedLegacyBuiltIns: readonly string[];
  readonly requiredMappings: readonly string[];
  readonly requiredFeatures: readonly string[];
}

export interface StarMadeShaderThreeCompatibilityReport {
  readonly total: number;
  readonly direct: number;
  readonly adaptable: number;
  readonly requiresWebgl2: number;
  readonly requiresMapping: number;
  readonly shaders: readonly StarMadeShaderThreeCompatibilityAnalysis[];
}

export interface StarMadeShaderThreeCompatibilityOptions {
  readonly target?: StarMadeShaderThreeCompatibilityTarget;
}

const supportedLegacyBuiltIns = new Set([
  "ftransform",
  "gl_Vertex",
  "gl_Normal",
  "gl_Color",
  "gl_MultiTexCoord0",
  "gl_TexCoord",
  "gl_LightSource",
  "gl_TextureMatrix",
  "gl_ModelViewMatrix",
  "gl_ProjectionMatrix",
  "gl_ModelViewProjectionMatrix",
  "gl_NormalMatrix",
  "gl_FragColor",
  "gl_FragCoord",
  "gl_FragDepth",
  "gl_FrontMaterial",
  "gl_LightModel",
  "gl_FrontLightModelProduct",
  "gl_FrontLightProduct",
  "gl_Fog"
]);

export function analyzeStarMadeShaderThreeCompatibility(
  inspection: StarMadeShaderInspection,
  options: StarMadeShaderThreeCompatibilityOptions = {}
): StarMadeShaderThreeCompatibilityAnalysis {
  const supportedBuiltIns = inspection.legacyBuiltIns.filter((name) => supportedLegacyBuiltIns.has(name));
  const requiredMappings = inspection.legacyBuiltIns.filter((name) => !supportedLegacyBuiltIns.has(name));
  const requiredFeatures =
    inspection.usesTextureArrays && options.target !== "webgl2" ? ["webgl2-texture-arrays"] : [];
  let compatibility: StarMadeShaderThreeCompatibility = "direct";

  if (requiredMappings.length > 0) {
    compatibility = "requires-mapping";
  } else if (requiredFeatures.length > 0) {
    compatibility = "requires-webgl2";
  } else if (supportedBuiltIns.length > 0 || inspection.version || inspection.extensions.length > 0) {
    compatibility = "adaptable";
  }

  return {
    path: inspection.path ?? "",
    compatibility,
    inspection,
    supportedLegacyBuiltIns: supportedBuiltIns,
    requiredMappings,
    requiredFeatures
  };
}

export function analyzeEmbeddedStarMadeShaderThreeCompatibility(
  path: string,
  options: StarMadeShaderThreeCompatibilityOptions = {}
): StarMadeShaderThreeCompatibilityAnalysis {
  return analyzeStarMadeShaderThreeCompatibility(inspectEmbeddedStarMadeShader(path), options);
}

export function createEmbeddedStarMadeShaderThreeCompatibilityReport(
  paths: readonly string[] = listEmbeddedStarMadeShaderPaths(),
  options: StarMadeShaderThreeCompatibilityOptions = {}
): StarMadeShaderThreeCompatibilityReport {
  const shaders = paths.map((path) => analyzeEmbeddedStarMadeShaderThreeCompatibility(path, options));

  return {
    total: shaders.length,
    direct: shaders.filter((shader) => shader.compatibility === "direct").length,
    adaptable: shaders.filter((shader) => shader.compatibility === "adaptable").length,
    requiresWebgl2: shaders.filter((shader) => shader.compatibility === "requires-webgl2").length,
    requiresMapping: shaders.filter((shader) => shader.compatibility === "requires-mapping").length,
    shaders
  };
}
