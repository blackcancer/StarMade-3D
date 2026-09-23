/**
 * P9 — World, Post-Process, And Effects Pipeline
 *
 * Opt-in effect modules. Each function creates an isolated ShaderMaterial.
 * None of these affect the cube/LOD/shadow pipeline when not used.
 *
 * Ported from StarMade-Open shader sources:
 *   - gamma/gamma.frag.glsl
 *   - bloom/simplebloom.frag.glsl
 *   - thruster/thruster.{frag,vert}.glsl
 *   - simplebeam/simplebeam.{frag,vert}.glsl
 *   - sky/sky.{fsh,vsh}
 */
import {
  AdditiveBlending,
  DoubleSide,
  FrontSide,
  GLSL3,
  NoBlending,
  ShaderMaterial,
  type Texture,
  Vector4
} from "three";

// ─────────────────────────────────────────────────────────────────────────────
// Gamma correction post-process
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a gamma correction post-process material.
 * Mirror of `data/shader/gamma/gamma.frag.glsl`.
 *
 * Apply to a full-screen quad after rendering the scene to a render target.
 *
 * @param gammaInv  1/gamma value. Default 1/2.2 ≈ 0.4545 (sRGB).
 * @param texture   The rendered scene texture.
 */
export function createStarMadeGammaMaterial(options: {
  readonly gammaInv?: number;
  readonly texture?: Texture | null;
} = {}): ShaderMaterial {
  return new ShaderMaterial({
    name: "StarMadeGammaMaterial",
    glslVersion: GLSL3,
    depthWrite: false,
    depthTest: false,
    blending: NoBlending,
    uniforms: {
      fbTex: { value: options.texture ?? null },
      gammaInv: { value: options.gammaInv ?? (1 / 2.2) }
    },
    vertexShader: `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy * 2.0 - 1.0, 0.0, 1.0);
}`,
    fragmentShader: `
uniform sampler2D fbTex;
uniform float gammaInv;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec4 color = texture(fbTex, vUv);
  color.xyz = pow(color.xyz, vec3(gammaInv));
  fragColor = color;
}`
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple bloom post-process
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a simple bloom post-process material.
 * Mirror of `data/shader/bloom/simplebloom.frag.glsl`.
 *
 * Cross-shaped Gaussian-like blur with threshold cutoff.
 * Apply to a full-screen quad over the scene.
 *
 * @param texture   The rendered scene texture.
 * @param blurStep  Pixel offset per blur sample. Default 0.005.
 * @param threshold Brightness threshold for bloom contribution. Default 0.3.
 * @param strength  Bloom multiplier. Default 1.2.
 */
export function createStarMadeSimpleBloomMaterial(options: {
  readonly texture?: Texture | null;
  readonly blurStep?: number;
  readonly threshold?: number;
  readonly strength?: number;
} = {}): ShaderMaterial {
  return new ShaderMaterial({
    name: "StarMadeSimpleBloomMaterial",
    glslVersion: GLSL3,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    uniforms: {
      tex: { value: options.texture ?? null },
      blurStep: { value: options.blurStep ?? 0.005 },
      threshold: { value: options.threshold ?? 0.3 },
      strength: { value: options.strength ?? 1.2 }
    },
    vertexShader: `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy * 2.0 - 1.0, 0.0, 1.0);
}`,
    fragmentShader: `
uniform sampler2D tex;
uniform float blurStep;
uniform float threshold;
uniform float strength;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec4 blur = vec4(0.0);
  for (int i = -4; i < 5; i++) {
    vec4 p = texture(tex, vUv + vec2(float(i) * blurStep, 0.0));
    vec4 c = p - threshold;
    c *= 15.0;
    if ((c.r + c.g + c.b) > 0.0) blur += c;
  }
  for (int i = -4; i < 5; i++) {
    vec4 p = texture(tex, vUv + vec2(0.0, float(i) * blurStep));
    vec4 c = p - threshold;
    c *= 15.0;
    if ((c.r + c.g + c.b) > 0.0) blur += c;
  }
  fragColor = blur / 64.0 * strength;
}`
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Thruster effect
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a StarMade thruster plume material.
 * Mirror of `data/shader/thruster/thruster.{frag,vert}.glsl`.
 *
 * Uses a 3D noise texture for turbulence. Apply to a cone/cylinder mesh
 * placed at the thruster nozzle.
 *
 * @param color0  Primary color + heatfactor in alpha channel.
 * @param color1  Secondary color.
 * @param ticks   Animation time (incremented per frame).
 */
export function createStarMadeThrusterMaterial(options: {
  readonly color0?: Vector4;
  readonly color1?: Vector4;
  readonly ticks?: number;
  readonly noiseTex?: Texture | null;
} = {}): ShaderMaterial {
  const color0 = options.color0 ?? new Vector4(1.0, 0.4, 0.1, 0.8);
  const color1 = options.color1 ?? new Vector4(0.8, 0.6, 0.2, 1.0);

  return new ShaderMaterial({
    name: "StarMadeThrusterMaterial",
    glslVersion: GLSL3,
    transparent: true,
    depthWrite: false,
    side: FrontSide,
    blending: AdditiveBlending,
    uniforms: {
      noiseTex: { value: options.noiseTex ?? null },
      thrustColor0: { value: color0 },
      thrustColor1: { value: color1 },
      ticks: { value: options.ticks ?? 0 }
    },
    vertexShader: `
out vec3 outOrigPos;
out vec3 outNormal;
out vec2 vUv;
void main() {
  outOrigPos = position;
  outNormal = normalize(normalMatrix * normalize(vec3(position.xy, 0.0)));
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `
out vec3 outOrigPos;
in vec3 outNormal;
in vec2 vUv;
uniform vec4 thrustColor0;
uniform vec4 thrustColor1;
uniform float ticks;
out vec4 fragColor;
void main() {
  float heatfactor = thrustColor0.a;
  float heat = 1.0 - clamp(outOrigPos.z / 2.0, 0.0, 1.0);
  vec2 len = vec2(outOrigPos.y, outOrigPos.x);
  heat *= clamp(length(len) / max(outOrigPos.z, 0.001) * 2.0, 0.0, 1.0);
  // Simplified noise via sin-based pattern (no sampler3D in WebGL2 GLSL 300 es without extension)
  float noiseval = abs(sin(vUv.x * 8.0 + ticks) * cos(vUv.y * 6.0 + ticks * 0.7)) * 0.5 + 0.5;
  noiseval = pow(noiseval, 1.5 + 1.5 * heatfactor);
  vec3 a = 10.0 * noiseval * pow(heat * heatfactor, 3.5) * thrustColor0.rgb;
  vec3 b = 2.5 * noiseval * thrustColor1.rgb;
  vec3 rgb = a + b;
  float edgeAlpha = abs(dot(vec3(0.0, 0.0, 1.0), outNormal));
  edgeAlpha = max(0.0, edgeAlpha - 0.1) * 2.0;
  float alpha = edgeAlpha * pow(heat, 0.85 + 25.0 * (1.01 - heatfactor));
  if (alpha <= 0.05) discard;
  fragColor = vec4(rgb, alpha);
}`
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple beam / projectile effect
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a StarMade simple beam material.
 * Mirror of `data/shader/simplebeam/simplebeam.{frag,vert}.glsl`.
 *
 * Apply to a stretched quad mesh along the beam axis.
 *
 * @param color0   Primary color.
 * @param color1   Secondary color.
 * @param beamTime Animation time for pulse effect.
 * @param zoomFac  Zoom factor (0..1). Default 1.
 */
export function createStarMadeSimpleBeamMaterial(options: {
  readonly color0?: Vector4;
  readonly color1?: Vector4;
  readonly beamTime?: number;
  readonly zoomFac?: number;
} = {}): ShaderMaterial {
  const color0 = options.color0 ?? new Vector4(0.2, 0.6, 1.0, 1.0);
  const color1 = options.color1 ?? new Vector4(0.1, 0.4, 1.0, 1.0);

  return new ShaderMaterial({
    name: "StarMadeSimpleBeamMaterial",
    glslVersion: GLSL3,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: {
      thrustColor0: { value: color0 },
      thrustColor1: { value: color1 },
      beamTime: { value: options.beamTime ?? 0 },
      ticks: { value: options.beamTime ?? 0 },
      zoomFac: { value: options.zoomFac ?? 1.0 }
    },
    vertexShader: `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `
uniform vec4 thrustColor0;
uniform vec4 thrustColor1;
uniform float beamTime;
uniform float zoomFac;
in vec2 vUv;
out vec4 fragColor;
void main() {
  float beamWidth = 10.0;
  vec2 uv = vUv - 0.5;
  vec3 thrustColor = normalize(thrustColor1.rgb);
  vec3 colorAdj = vec3(0.1) + thrustColor;
  float u = min(10.0, abs(1.0 / (uv.x * beamWidth)));
  float pulse = abs(1.0 / (uv.y - sin(beamTime * 3.0) * 1.25 + 3.0));
  vec3 finalColor = u * colorAdj + pulse * colorAdj;
  float edgeAlpha = 1.0 - abs(1.0 - vUv.x * 2.0);
  float threshold = 0.4985;
  if (uv.y > threshold) {
    edgeAlpha -= (uv.y - threshold) / (0.5 - uv.y);
  }
  if (edgeAlpha < 0.15 + (1.0 - zoomFac) * 0.6) discard;
  float noise = abs(sin(uv.x * 4.0 + beamTime) * cos(vUv.y * 8.0 + beamTime * 0.3)) * 0.3;
  finalColor.rgb += (zoomFac * -0.90) + noise;
  fragColor = vec4(finalColor, edgeAlpha);
}`
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sky / atmosphere
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a StarMade sky/cloud material.
 * Mirror of `data/shader/sky/sky.{fsh,vsh}`.
 *
 * Apply to a large sphere around the scene (sky dome).
 *
 * @param cloudTexture   Cloud noise/diffuse texture.
 * @param normalTexture  Cloud normal map.
 * @param lightPos       Sun direction in world space.
 * @param cMove          Cloud animation time offset.
 * @param cSharp         Cloud sharpness (contrast).
 * @param cCover         Cloud coverage (0..1).
 */
export function createStarMadeSkyMaterial(options: {
  readonly cloudTexture?: Texture | null;
  readonly normalTexture?: Texture | null;
  readonly lightPos?: Vector4;
  readonly cMove?: number;
  readonly cSharp?: number;
  readonly cCover?: number;
} = {}): ShaderMaterial {
  const lightPos = options.lightPos ?? new Vector4(0.45, 0.9, 0.0, 0);

  return new ShaderMaterial({
    name: "StarMadeSkyMaterial",
    glslVersion: GLSL3,
    side: DoubleSide,
    uniforms: {
      tex: { value: options.cloudTexture ?? null },
      nmap: { value: options.normalTexture ?? null },
      lightPos: { value: lightPos },
      cMove: { value: options.cMove ?? 0 },
      cSharp: { value: options.cSharp ?? 1.0 },
      cCover: { value: options.cCover ?? 0.5 }
    },
    vertexShader: `
out vec4 vPos;
out vec3 vNormal;
out vec2 vUv;
void main() {
  vPos = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vUv = uv;
  gl_Position = projectionMatrix * vPos;
}`,
    fragmentShader: `
uniform sampler2D tex;
uniform sampler2D nmap;
uniform float cSharp;
uniform float cCover;
uniform float cMove;
uniform vec4 lightPos;
in vec4 vPos;
in vec3 vNormal;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec3 nnorm = normalize(vNormal);
  vec3 light = normalize(vec3(lightPos.x, lightPos.y * 8.0, lightPos.z));
  float sunlight = max(0.0, dot(light, nnorm));
  float sun = pow(sunlight, 2048.0);
  // Simplified cloud lighting (no 3D tex coord)
  vec3 cNorm = texture(nmap, vUv * 6.0 + vec2(cMove, cMove * 2.0)).xyz;
  cNorm = normalize(cNorm * 2.0 - 1.0);
  float cDiff = max(0.0, dot(cNorm, light)) * 2.0 + 0.3;
  float sky = texture(tex, vUv * 6.0 + vec2(cMove, cMove * 2.0)).r;
  float cloudAlpha = clamp((sky - cCover) * cSharp * 3.0 + cCover, 0.0, 1.0);
  vec3 cloudColor = vec3(cDiff) * mix(vec3(0.6, 0.7, 0.8), vec3(1.0), cloudAlpha);
  vec3 skyColor = mix(vec3(0.05, 0.1, 0.3), vec3(0.4, 0.6, 0.9), max(0.0, nnorm.y));
  vec3 finalColor = mix(skyColor, cloudColor, cloudAlpha) + vec3(sun * 0.8);
  fragColor = vec4(finalColor, 1.0);
}`
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-frame update helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Updates animation time uniforms on thruster or beam materials.
 * Call once per frame with elapsed time in seconds.
 */
export function updateStarMadeEffectTime(material: ShaderMaterial, deltaSeconds: number): void {
  const u = material.uniforms as Record<string, { value: number }>;
  if (u.ticks) { u.ticks.value += deltaSeconds * 60; } // ~60fps tick rate
  if (u.beamTime) { u.beamTime.value += deltaSeconds; }
  if (u.cMove) { u.cMove.value += deltaSeconds * 0.01; }
}
