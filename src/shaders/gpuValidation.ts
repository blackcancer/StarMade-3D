import { adaptStarMadeShaderToThree, type StarMadeShaderThreeCompatTarget } from "./compat.js";
import { preprocessStarMadeShaderProgram } from "./preprocess.js";
import type { StarMadeShaderProgramId } from "./programs.js";

export interface StarMadeThreeShaderProgramSourceOptions {
  readonly defines?: readonly string[];
  readonly includeDefaultDefines?: boolean;
  readonly lightSourceCount?: number;
  readonly target?: StarMadeShaderThreeCompatTarget;
  readonly vertexAttributeName?: string;
}

export interface StarMadeThreeShaderProgramSources {
  readonly id: StarMadeShaderProgramId;
  readonly target: StarMadeShaderThreeCompatTarget;
  readonly defines: readonly string[];
  readonly vertexSource: string;
  readonly fragmentSource: string;
  readonly vertexWarnings: readonly string[];
  readonly fragmentWarnings: readonly string[];
}

export interface StarMadeWebglShaderCompileResult {
  readonly ok: boolean;
  readonly log: string;
}

export interface StarMadeWebglProgramCompileResult {
  readonly ok: boolean;
  readonly vertex: StarMadeWebglShaderCompileResult;
  readonly fragment: StarMadeWebglShaderCompileResult;
  readonly programLog: string;
}

export function createStarMadeThreeShaderProgramSources(
  id: StarMadeShaderProgramId,
  options: StarMadeThreeShaderProgramSourceOptions = {}
): StarMadeThreeShaderProgramSources {
  const target = options.target ?? "webgl2";
  const processed = preprocessStarMadeShaderProgram(id, {
    defines: options.defines,
    includeDefaultDefines: options.includeDefaultDefines
  });
  const vertex = adaptStarMadeShaderToThree(processed.vertexShader, {
    stage: "vertex",
    lightSourceCount: options.lightSourceCount,
    target,
    vertexAttributeName: options.vertexAttributeName
  });
  const fragment = adaptStarMadeShaderToThree(processed.fragmentShader, {
    stage: "fragment",
    lightSourceCount: options.lightSourceCount,
    target
  });
  const vertexSource = applyStarMadeThreeShaderProgramPatches(id, vertex.source);
  const fragmentSource = applyStarMadeThreeShaderProgramPatches(id, fragment.source);

  return {
    id,
    target,
    defines: processed.defines,
    vertexSource,
    fragmentSource,
    vertexWarnings: vertex.warnings,
    fragmentWarnings: fragment.warnings
  };
}

function applyStarMadeThreeShaderProgramPatches(id: StarMadeShaderProgramId, source: string): string {
  if (id === "cube.shadow") {
    return source
      .replace(/float\s+xIndex\s*=\s*typeI\s*&\s*15\s*;/g, "float xIndex = float(typeI & 15);")
      .replace(/float\s+yIndex\s*=\s*typeI\s*>>\s*4\s*;/g, "float yIndex = float(typeI >> 4);");
  }

  if (id === "cube.lod" || id === "cube.lodShadow") {
    return source
      .replace(/\bout\s+vec3\s+normal\s*;/g, "out vec3 starMadeLodNormal;")
      .replace(/\bin\s+vec3\s+normal\s*;/g, "in vec3 starMadeLodNormal;")
      .replace(/\bnormal\s*=\s*normal\.xyz\s*;/g, "starMadeLodNormal = normal.xyz;")
      // Intentional native departure: cubeLight ignores its lightPos argument and
      // adds local RGB as ambient. LOD samples instead illuminate exposed faces.
      // Public sample directions are world-space; normals are already view-space.
      .replace(/calculateLight\(vec3 lightPos,/g, "calculateLight(bool localLight, vec3 lightPos,")
      .replace(/calculateLight\(\s*lightPos,/g, "calculateLight(false, lightPos,")
      .replace(/calculateLight\(\s*lightVec\[/g, "calculateLight(true, lightVec[")
      .replace("vec3 lightDir = normalize(starMadeLightSources[0].position.xyz - vPos.xyz);",
        "vec3 localDirection = (viewMatrix * vec4(lightPos, 0.0)).xyz;\n" +
        "vec3 lightDir = localLight ? localDirection / max(length(localDirection), 0.000001) : normalize(starMadeLightSources[0].position.xyz - vPos.xyz);")
      .replace("float blockLightSourceItensity = 1.0;",
        "float blockLightSourceItensity = localLight ? max(dot(normalDirection, lightDir), 0.0) : 1.0;")
      // The native mask restores pre-shadow light even where emission is zero.
      // Keep the shadowed result and add only the texture's emission floor.
      .replace("max(emissive*tex.rgb, lightedColor.rgb)",
        "max(emissive*tex.rgb, starMadeFragColor.rgb)");
  }

  if (id !== "cube.quads13") {
    return source;
  }

  // StarMade's normaltexarray branch references an undeclared packed varying in cubeTArray.
  // The atlas layer is already carried by `layer`, which matches the shard texture-array path.
  let patched = source
    .replace(/\bextraAlphVsLayerNoLight\.y\b/g, "layer")
    .replace(/float\s+xIndex\s*=\s*typeI\s*&\s*15\s*;/g, "float xIndex = float(typeI & 15);")
    .replace(/float\s+yIndex\s*=\s*typeI\s*>>\s*4\s*;/g, "float yIndex = float(typeI >> 4);")
    .replace(/\blayer\s*\*\s*0\.25\b/g, "float(layer) * 0.25")
    .replace(/\b(getBlockTexture|sampleMainTextureSheet|sampleNormalTextureSheet)\(layer\b/g, "$1(float(layer)")
    .replace(/pow\(\((64\.0|100\.0)-dist\)\*0\.03125, (3\.2|4\.2)\)/g,
      "pow(max(0.0, ($1-dist)*0.03125), $2)");

  patched = patched.replace(
    "uniform sampler2DArray cTexNormal;",
    [
      "uniform sampler2DArray cTexNormal;",
      "uniform int starMadeNormalDebugMode;",
      "uniform float starMadeNormalStrength;"
    ].join("\n")
  );
  patched = patched.replace(
    "vec3 bump = normalize(texture(cTexNormal, vec3(vTexCoord0.st, layer)).xyz * 2.0 - 1.0);",
    [
      "vec4 normalTexel = texture(cTexNormal, vec3(vTexCoord0.st, layer));",
      "vec3 normalSample = normalTexel.xyz;",
      "emissionAndShine = normalTexel.a;",
      "vec3 bump = normalSample * 2.0 - 1.0;",
      "bump = normalize(vec3(bump.xy * starMadeNormalStrength, bump.z));"
    ].join("\n    ")
  );

  if (patched.includes("vec4 normalTexel = texture(cTexNormal")) {
    patched = patched.replace(
      "vec4 mixTex;",
      [
        "if(starMadeNormalDebugMode == 1){",
        "    starMadeFragColor = vec4(normalSample, alphMod);",
        "    return;",
        "}",
        "if(starMadeNormalDebugMode == 2){",
        "    starMadeFragColor = vec4(bump * 0.5 + 0.5, alphMod);",
        "    return;",
        "}",
        "",
        "vec4 mixTex;"
      ].join("\n    ")
    );
    patched = patched.replace(
      "vec3 norm = normalDirection;",
      [
        "if(starMadeNormalDebugMode == 3){",
        "    return normalDirection * 0.5 + 0.5;",
        "}",
        "if(starMadeNormalDebugMode == 4){",
        "    return vec3(max(dot(normalDirection, lightDir), 0.0));",
        "}",
        "",
        "vec3 norm = normalDirection;"
      ].join("\n\t")
    );
    patched = patched.replace(
      "starMadeFragColor = lightedColor;",
      [
        "starMadeFragColor = lightedColor;",
        "if(starMadeNormalDebugMode >= 3){",
        "    return;",
        "}"
      ].join("\n    ")
    );
  }

  return patched;
}

export function compileStarMadeWebgl2ShaderProgram(
  gl: WebGL2RenderingContext,
  sources: Pick<StarMadeThreeShaderProgramSources, "vertexSource" | "fragmentSource">
): StarMadeWebglProgramCompileResult {
  const shaders: (StarMadeWebglShaderCompileResult & { readonly shader: WebGLShader | null })[] = [];
  const attached: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  try {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, prepareStandaloneCompileSource(sources.vertexSource, "vertex"));
    shaders.push(vertex);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, prepareStandaloneCompileSource(sources.fragmentSource, "fragment"));
    shaders.push(fragment);
    program = gl.createProgram();
    if (!program) {
      return { ok: false, vertex: {ok: vertex.ok, log: vertex.log}, fragment: {ok: fragment.ok, log: fragment.log},
        programLog: "WebGL2 could not allocate a shader program" };
    }
    for (const result of shaders) {
      if (result.shader) { gl.attachShader(program, result.shader); attached.push(result.shader); }
    }
    gl.linkProgram(program);
    const linked = gl.getProgramParameter(program, gl.LINK_STATUS) === true;
    return {
      ok: vertex.ok && fragment.ok && linked,
      vertex: {ok: vertex.ok, log: vertex.log},
      fragment: {ok: fragment.ok, log: fragment.log},
      programLog: gl.getProgramInfoLog(program)?.trim() ?? ""
    };
  } finally {
    // Allocating a program can fail after shaders have already been allocated.
    // Also clean up if a context wrapper throws during compilation or linking.
    for (const shader of attached) gl.detachShader(program!, shader);
    for (const result of shaders) { if (result.shader) gl.deleteShader(result.shader); }
    if (program) gl.deleteProgram(program);
  }
}

function prepareStandaloneCompileSource(source: string, stage: "vertex" | "fragment"): string {
  if (stage !== "vertex") {
    return source;
  }

  const attributes = [
    ["position", "in vec3 position;"], ["normal", "in vec3 normal;"],
    ["color", "in vec3 color;"], ["uv", "in vec2 uv;"],
    ["modelViewMatrix", "uniform mat4 modelViewMatrix;"],
    ["projectionMatrix", "uniform mat4 projectionMatrix;"],
    ["normalMatrix", "uniform mat3 normalMatrix;"]
  ];
  const declarations = attributes.filter(([name]) =>
    new RegExp(`\\b${name}\\b`).test(source) &&
    !new RegExp(`\\b(?:in|out|attribute|varying|uniform)\\s+(?:(?:lowp|mediump|highp)\\s+)?\\w+\\s+${name}\\b`).test(source)
  ).map(([, declaration]) => declaration);

  if (declarations.length === 0) {
    return source;
  }

  return insertAfterGlslHeader(source, declarations.join("\n"));
}

function insertAfterGlslHeader(source: string, block: string): string {
  const lines = source.split("\n");
  let insertIndex = 0;

  if (lines[0]?.startsWith("#version")) {
    insertIndex = 1;
  }

  // split() produces a dense array and the bounds check guarantees an entry.
  while (insertIndex < lines.length && /^precision\s+/.test(lines[insertIndex].trim())) {
    insertIndex += 1;
  }

  return [...lines.slice(0, insertIndex), block, ...lines.slice(insertIndex)].join("\n");
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): StarMadeWebglShaderCompileResult & { readonly shader: WebGLShader | null } {
  const shader = gl.createShader(type);

  if (!shader) {
    return {
      ok: false,
      log: "WebGL2 could not allocate a shader",
      shader: null
    };
  }

  try {
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return {
      ok: gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true,
      log: gl.getShaderInfoLog(shader)?.trim() ?? "",
      shader
    };
  } catch (error) {
    gl.deleteShader(shader);
    throw error;
  }
}
