/**
 * P8 — Selection, Build Overlays, And Interaction Visuals
 *
 * Ports StarMade-Open selection shader passes:
 *   - selectionSolid: flat colored overlay for a selected structure
 *   - selectionSingle: textured overlay (block texture + selectionColor tint)
 *   - selectTime: pulsation uniform already on the cube material
 *   - build-mode: controlled via setStarMadeCubeShaderAllLight + onlyInBuildMode flag
 */
import {
  AdditiveBlending,

  DoubleSide,
  GLSL3,
  ShaderMaterial,
  type Texture,
  Vector4
} from "three";

// ─────────────────────────────────────────────────────────────────────────────
// selectionSolid — flat color overlay for a whole blueprint selection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a StarMade-Open selectionSolid overlay material.
 * Renders a uniform color over the selected geometry.
 * Mirror of `data/shader/cube/selectionSolid.*`.
 */
export function createStarMadeSelectionSolidMaterial(
  options: { readonly color?: Vector4 } = {}
): ShaderMaterial {
  const color = options.color ?? new Vector4(0.1, 0.1, 0.5, 0.4);

  return new ShaderMaterial({
    name: "StarMadeSelectionSolidMaterial",
    glslVersion: GLSL3,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: {
      selectionColor: { value: color }
    },
    vertexShader: `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `
uniform vec4 selectionColor;
out vec4 fragColor;
void main() {
  fragColor = selectionColor;
}`
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// selectionSingle — textured overlay for a single selected block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a StarMade-Open selectionSingle overlay material.
 * Renders the block texture tinted with selectionColor, with a zoom (texMult).
 * Mirror of `data/shader/cube/selectionSingle.*`.
 */
export function createStarMadeSelectionSingleMaterial(
  options: {
    readonly mainTexture?: Texture | null;
    readonly color?: Vector4;
    readonly texMult?: number;
  } = {}
): ShaderMaterial {
  const color = options.color ?? new Vector4(1, 0.6, 0, 0.7);
  const texMult = options.texMult ?? 1.0;

  return new ShaderMaterial({
    name: "StarMadeSelectionSingleMaterial",
    glslVersion: GLSL3,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: {
      mainTexA: { value: options.mainTexture ?? null },
      selectionColor: { value: color },
      texMult: { value: texMult }
    },
    vertexShader: `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `
uniform sampler2D mainTexA;
uniform vec4 selectionColor;
uniform float texMult;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec4 color = texture(mainTexA, -(texMult - 1.0) * 0.5 + vUv * texMult);
  if (color.a <= 0.01) discard;
  fragColor = color * selectionColor;
}`
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// selectTime helper — update blink pulsation on cube material
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Updates `selectTime` on a cube ShaderMaterial — controls the selection blink
 * effect in the StarMade cube vertex shader.
 *
 * StarMade-Open: SegmentDrawer sets `selectTime = timeMilli - blinkTime` while
 * `blinkTime > 0`, then resets to 0 when the blink period ends.
 *
 * @param material  Cube ShaderMaterial.
 * @param timeMs    Elapsed blink time in milliseconds (0 = no blink).
 */
export function updateStarMadeCubeShaderSelectTime(
  material: ShaderMaterial,
  timeMs: number
): void {
  const u = material.uniforms as Record<string, { value: number }>;

  if (u.selectTime) {
    u.selectTime.value = timeMs;
    material.needsUpdate = false; // uniform update only, no recompile
  }
}
