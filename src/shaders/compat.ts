export type StarMadeShaderStage = "vertex" | "fragment";
export type StarMadeShaderThreeCompatTarget = "webgl1" | "webgl2";

export interface StarMadeShaderThreeCompatOptions {
  readonly stage: StarMadeShaderStage;
  readonly lightSourceCount?: number;
  readonly target?: StarMadeShaderThreeCompatTarget;
  readonly vertexAttributeName?: string;
}

export interface StarMadeShaderThreeCompatResult {
  readonly source: string;
  readonly warnings: readonly string[];
}

const unsupportedVersionPattern = /^\s*#version\s+.+$/gm;
const extensionPattern = /^\s*#extension\s+.+$/gm;
const texCoordPattern = /\bgl_TexCoord\s*\[\s*([0-9]+)\s*\]/g;
const lightSourcePattern = /\bgl_LightSource\s*\[\s*([^\]]+)\s*\]/g;
const frontLightProductPattern = /\bgl_FrontLightProduct\s*\[\s*([^\]]+)\s*\]/g;
const multiTexCoordPattern = /\bgl_MultiTexCoord([0-9]+)\b/g;
const textureMatrixPattern = /\bgl_TextureMatrix\s*\[\s*([^\]]+)\s*\]/g;
const defaultLightSourceCount = 8;
const defaultTextureMatrixCount = 8;
const textureArrayPattern = /\b(?:sampler2DArray|texture2DArray|shadow2DArray|shadow2DArrayOffset)\b/;
const lightSourceDeclaration = [
  "struct StarMadeCompatLightSource {",
  "  vec4 ambient;",
  "  vec4 diffuse;",
  "  vec4 specular;",
  "  vec4 position;",
  "  vec4 halfVector;",
  "  vec3 spotDirection;",
  "  float spotExponent;",
  "  float spotCutoff;",
  "  float spotCosCutoff;",
  "  float constantAttenuation;",
  "  float linearAttenuation;",
  "  float quadraticAttenuation;",
  "};"
].join("\n");
const materialDeclaration = [
  "struct StarMadeCompatMaterial {",
  "  vec4 emission;",
  "  vec4 ambient;",
  "  vec4 diffuse;",
  "  vec4 specular;",
  "  float shininess;",
  "};"
].join("\n");
const lightModelDeclaration = [
  "struct StarMadeCompatLightModel {",
  "  vec4 ambient;",
  "};"
].join("\n");
const lightModelProductDeclaration = [
  "struct StarMadeCompatLightModelProduct {",
  "  vec4 sceneColor;",
  "};"
].join("\n");
const lightProductDeclaration = [
  "struct StarMadeCompatLightProduct {",
  "  vec4 ambient;",
  "  vec4 diffuse;",
  "  vec4 specular;",
  "};"
].join("\n");
const fogDeclaration = [
  "struct StarMadeCompatFog {",
  "  vec4 color;",
  "  float density;",
  "  float start;",
  "  float end;",
  "  float scale;",
  "};"
].join("\n");

export function adaptStarMadeShaderToThree(
  source: string,
  options: StarMadeShaderThreeCompatOptions
): StarMadeShaderThreeCompatResult {
  const warnings = new Set<string>();
  const target = options.target ?? "webgl1";
  let adapted = source.replace(unsupportedVersionPattern, "").replace(extensionPattern, "");
  adapted = stripUniformInitializers(adapted);
  adapted = applyKnownStarMadeShaderFixes(adapted);
  const texCoordSlots = extractTexCoordSlots(adapted);
  const lightSourceSlots = extractLightSourceSlots(adapted);
  const textureMatrixSlots = extractTextureMatrixSlots(adapted);
  const usesLightSource = /\bgl_LightSource\s*\[/.test(adapted);
  const usesTextureMatrix = /\bgl_TextureMatrix\s*\[/.test(adapted);
  const usesMaterial = /\bgl_FrontMaterial\b/.test(adapted);
  const usesLightModel = /\bgl_LightModel\b/.test(adapted);
  const usesLightModelProduct = /\bgl_FrontLightModelProduct\b/.test(adapted);
  const usesLightProduct = /\bgl_FrontLightProduct\s*\[/.test(adapted);
  const usesFog = /\bgl_Fog\b/.test(adapted);
  const vertexExpression =
    options.stage === "vertex" && options.vertexAttributeName
      ? validatedAttributeName(options.vertexAttributeName)
      : "vec4(position, 1.0)";

  adapted = adapted.replace(/\bftransform\s*\(\s*\)/g, `projectionMatrix * modelViewMatrix * ${vertexExpression}`);
  adapted = adapted.replace(texCoordPattern, (_, slot: string) => `vTexCoord${slot}`);
  adapted = adapted.replace(lightSourcePattern, (_, index: string) => `starMadeLightSources[${index.trim()}]`);
  adapted = adapted.replace(frontLightProductPattern, (_, index: string) => `starMadeFrontLightProducts[${index.trim()}]`);
  adapted = adapted.replace(textureMatrixPattern, (_, index: string) => `starMadeTextureMatrices[${index.trim()}]`);
  adapted = adapted
    .replace(/\bgl_ModelViewProjectionMatrix\b/g, "(projectionMatrix * modelViewMatrix)")
    .replace(/\bgl_ModelViewMatrix\b/g, "modelViewMatrix")
    .replace(/\bgl_ProjectionMatrix\b/g, "projectionMatrix")
    .replace(/\bgl_NormalMatrix\b/g, "normalMatrix")
    .replace(/\bgl_FrontMaterial\b/g, "starMadeFrontMaterial")
    .replace(/\bgl_LightModel\b/g, "starMadeLightModel")
    .replace(/\bgl_FrontLightModelProduct\b/g, "starMadeFrontLightModelProduct")
    .replace(/\bgl_Fog\b/g, "starMadeFog");

  if (options.stage === "vertex") {
    adapted = adapted
      .replace(/\bgl_Vertex\b/g, vertexExpression)
      .replace(/\bgl_Normal\b/g, "normal")
      .replace(/\bgl_Color\b/g, "vec4(color, 1.0)")
      .replace(/\bgl_MultiTexCoord0\b/g, "vec4(uv, 0.0, 1.0)");

    if (options.vertexAttributeName) {
      adapted = declareVertexAttribute(adapted, validatedAttributeName(options.vertexAttributeName));
    }
  }

  if (usesLightSource) {
    adapted = declareLightSources(adapted, lightSourceSlots, options.lightSourceCount);
  }

  if (usesTextureMatrix) {
    adapted = declareTextureMatrices(adapted, textureMatrixSlots);
  }

  adapted = declareFixedFunctionUniforms(adapted, {
    usesFog,
    usesLightModel,
    usesLightModelProduct,
    usesLightProduct,
    usesMaterial
  });

  adapted = declareTexCoordVaryings(adapted, texCoordSlots);
  adapted = declareMissingTextureUniforms(adapted);

  if (target === "webgl2") {
    adapted = adaptShaderToGlsl300Es(adapted, options.stage);
  }

  if (/\bgl_LightSource\b/.test(adapted)) {
    warnings.add("unindexed gl_LightSource usage requires manual review");
  }

  if (/\bgl_TexCoord\b/.test(adapted)) {
    warnings.add("unindexed gl_TexCoord usage requires manual review");
  }

  if (/\b(?:gl_FrontMaterial|gl_LightModel|gl_FrontLightModelProduct|gl_FrontLightProduct|gl_Fog)\b/.test(adapted)) {
    warnings.add("unsupported fixed-function material, light model or fog usage requires manual review");
  }

  for (const slot of extractMultiTexCoordSlots(adapted)) {
    if (slot > 0) {
      warnings.add(`gl_MultiTexCoord${slot} requires an additional Three.js UV attribute mapping`);
    }
  }

  if (target !== "webgl2" && textureArrayPattern.test(adapted)) {
    warnings.add("texture arrays require WebGL2 or a texture-array compatibility path");
  }

  return {
    source: adapted,
    warnings: [...warnings].sort()
  };
}

function validatedAttributeName(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid GLSL attribute name: ${name}`);
  }

  return name;
}

function declareVertexAttribute(source: string, name: string): string {
  const declarationPattern = new RegExp(`\\b(?:attribute|in)\\s+vec4\\s+${name}\\s*;`);

  if (declarationPattern.test(source)) {
    return source;
  }

  return `attribute vec4 ${name};\n${source.trimStart()}`;
}

function stripUniformInitializers(source: string): string {
  return source.replace(/^(\s*uniform\s+[^;=]+?)\s*=\s*[^;]+;/gm, "$1;");
}

function applyKnownStarMadeShaderFixes(source: string): string {
  return source
    .replace(/\buniform\s+int\s+animationTime\s*;/g, "uniform float animationTime;")
    .replace(
      /\btangent\s*=\s*tangents\s*\(\s*normals\s*\[\s*int\s*\(\s*nAf\s*\)\s*\]\s*\+\s*tangents\s*\[\s*int\s*\(\s*nBf\s*\)\s*\]\s*\+\s*tangents\s*\[\s*int\s*\(\s*nCf\s*\)\s*\]\s*\)\s*;/g,
      "tangent = normalize(tangents[int(nAf)] + tangents[int(nBf)] + tangents[int(nCf)]);"
    );
}

function extractTexCoordSlots(source: string): readonly number[] {
  const slots = new Set<number>();

  for (const match of source.matchAll(texCoordPattern)) {
    slots.add(Number(match[1]));
  }

  return [...slots].sort((a, b) => a - b);
}

function extractMultiTexCoordSlots(source: string): readonly number[] {
  const slots = new Set<number>();

  for (const match of source.matchAll(multiTexCoordPattern)) {
    slots.add(Number(match[1]));
  }

  return [...slots].sort((a, b) => a - b);
}

function extractLightSourceSlots(source: string): readonly number[] {
  const slots = new Set<number>();

  for (const match of source.matchAll(lightSourcePattern)) {
    const slot = Number(match[1].trim());

    if (Number.isInteger(slot) && slot >= 0) {
      slots.add(slot);
    }
  }

  return [...slots].sort((a, b) => a - b);
}

function extractTextureMatrixSlots(source: string): readonly number[] {
  const slots = new Set<number>();

  for (const match of source.matchAll(textureMatrixPattern)) {
    const slot = Number(match[1].trim());

    if (Number.isInteger(slot) && slot >= 0) {
      slots.add(slot);
    }
  }

  return [...slots].sort((a, b) => a - b);
}

function declareLightSources(
  source: string,
  slots: readonly number[],
  requestedLightSourceCount: number | undefined
): string {
  const highestSlot = slots.length > 0 ? Math.max(...slots) + 1 : 0;
  const lightSourceCount = Math.max(requestedLightSourceCount ?? defaultLightSourceCount, highestSlot);
  const uniformDeclaration = `uniform StarMadeCompatLightSource starMadeLightSources[${lightSourceCount}];`;
  const declarations = [
    source.includes("struct StarMadeCompatLightSource") ? undefined : lightSourceDeclaration,
    source.includes("uniform StarMadeCompatLightSource starMadeLightSources") ? undefined : uniformDeclaration
  ].filter((declaration): declaration is string => declaration !== undefined);

  if (declarations.length === 0) {
    return source;
  }

  return `${declarations.join("\n")}\n${source.trimStart()}`;
}

function declareTextureMatrices(source: string, slots: readonly number[]): string {
  const highestSlot = slots.length > 0 ? Math.max(...slots) + 1 : 0;
  const textureMatrixCount = Math.max(defaultTextureMatrixCount, highestSlot);
  const declaration = `uniform mat4 starMadeTextureMatrices[${textureMatrixCount}];`;

  if (source.includes("uniform mat4 starMadeTextureMatrices")) {
    return source;
  }

  return `${declaration}\n${source.trimStart()}`;
}

function declareFixedFunctionUniforms(
  source: string,
  usage: {
    readonly usesFog: boolean;
    readonly usesLightModel: boolean;
    readonly usesLightModelProduct: boolean;
    readonly usesLightProduct: boolean;
    readonly usesMaterial: boolean;
  }
): string {
  const declarations = [
    usage.usesMaterial && !source.includes("struct StarMadeCompatMaterial") ? materialDeclaration : undefined,
    usage.usesMaterial && !source.includes("uniform StarMadeCompatMaterial starMadeFrontMaterial")
      ? "uniform StarMadeCompatMaterial starMadeFrontMaterial;"
      : undefined,
    usage.usesLightModel && !source.includes("struct StarMadeCompatLightModel") ? lightModelDeclaration : undefined,
    usage.usesLightModel && !source.includes("uniform StarMadeCompatLightModel starMadeLightModel")
      ? "uniform StarMadeCompatLightModel starMadeLightModel;"
      : undefined,
    usage.usesLightModelProduct && !source.includes("struct StarMadeCompatLightModelProduct")
      ? lightModelProductDeclaration
      : undefined,
    usage.usesLightModelProduct &&
    !source.includes("uniform StarMadeCompatLightModelProduct starMadeFrontLightModelProduct")
      ? "uniform StarMadeCompatLightModelProduct starMadeFrontLightModelProduct;"
      : undefined,
    usage.usesLightProduct && !source.includes("struct StarMadeCompatLightProduct")
      ? lightProductDeclaration
      : undefined,
    usage.usesLightProduct && !source.includes("uniform StarMadeCompatLightProduct starMadeFrontLightProducts")
      ? "uniform StarMadeCompatLightProduct starMadeFrontLightProducts[8];"
      : undefined,
    usage.usesFog && !source.includes("struct StarMadeCompatFog") ? fogDeclaration : undefined,
    usage.usesFog && !source.includes("uniform StarMadeCompatFog starMadeFog")
      ? "uniform StarMadeCompatFog starMadeFog;"
      : undefined
  ].filter((declaration): declaration is string => declaration !== undefined);

  if (declarations.length === 0) {
    return source;
  }

  return `${declarations.join("\n")}\n${source.trimStart()}`;
}

function declareTexCoordVaryings(source: string, slots: readonly number[]): string {
  const declarations = slots
    .map((slot) => `varying vec4 vTexCoord${slot};`)
    .filter((declaration) => !source.includes(declaration));

  if (declarations.length === 0) {
    return source;
  }

  return `${declarations.join("\n")}\n${source.trimStart()}`;
}

function declareMissingTextureUniforms(source: string): string {
  const declarations = [
    /\boverlayTex\b/.test(source) && !/\buniform\s+sampler2D\s+overlayTex\s*;/.test(source)
      ? "uniform sampler2D overlayTex;"
      : undefined
  ].filter((declaration): declaration is string => declaration !== undefined);

  if (declarations.length === 0) {
    return source;
  }

  return `${declarations.join("\n")}\n${source.trimStart()}`;
}

function adaptShaderToGlsl300Es(source: string, stage: StarMadeShaderStage): string {
  let adapted = source
    .replace(/\bshadow2DArrayOffset\s*\(/g, "textureOffset(")
    .replace(/\bshadow2DArray\s*\(/g, "texture(")
    .replace(/\btexture2DArray\s*\(/g, "texture(")
    .replace(/\btexture2DLod\s*\(/g, "textureLod(")
    .replace(/\btexture2D\s*\(/g, "texture(")
    .replace(/\btextureCube\s*\(/g, "texture(");
  adapted = applyGlsl300FloatLiteralFixes(adapted);

  if (stage === "vertex") {
    adapted = replaceGlslStorageQualifier(adapted, "attribute", "in");
    adapted = replaceGlslStorageQualifier(adapted, "varying", "out");
  } else {
    const usesFragColor = /\bgl_FragColor\b/.test(adapted);

    adapted = replaceGlslStorageQualifier(adapted, "varying", "in").replace(
      /\bgl_FragColor\b/g,
      "starMadeFragColor"
    );

    if (usesFragColor && !/\bout\s+vec4\s+starMadeFragColor\s*;/.test(adapted)) {
      adapted = `out vec4 starMadeFragColor;\n${adapted.trimStart()}`;
    }
  }

  return [
    "#version 300 es",
    "precision highp float;",
    "precision highp int;",
    "precision highp sampler2DArray;",
    "precision highp sampler2DArrayShadow;",
    adapted.trimStart()
  ].join("\n");
}

function replaceGlslStorageQualifier(source: string, from: "attribute" | "varying", to: "in" | "out"): string {
  return source.replace(new RegExp(`(^|\\n)(\\s*)${from}\\b`, "g"), `$1$2${to}`);
}

function applyGlsl300FloatLiteralFixes(source: string): string {
  return source
    .replace(/\b1\s*-\s*t\b/g, "1.0-t")
    .replace(/\byPos\s*\*\s*256\b/g, "yPos * 256.0")
    .replace(/\bshininess\s*=\s*30\s*;/g, "shininess = 30.0;")
    .replace(/\bselectTime\s*>\s*0\b/g, "selectTime > 0.0");
}
