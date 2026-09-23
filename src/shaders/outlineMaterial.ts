/**
 * P8 — Outline / edge-detection post-process overlay.
 *
 * Ports StarMade-Open `data/shader/outline/outline.*` (Toon Lines shader).
 * The outline pass reads a rendered texture + depth buffer and highlights edges.
 *
 * Usage: render the scene to a WebGLRenderTarget, then render a screen-quad
 * with createStarMadeOutlineMaterial() over the main canvas.
 */
import {
  GLSL3,
  NearestFilter,
  NoBlending,
  ShaderMaterial,
  type Texture,
  Vector2
} from "three";

/** Default 3×3 Sobel-like kernel offsets for a 1920×1080 viewport. */
export function starMadeOutlineTextureCoordinateOffsets(width: number, height: number): Vector2[] {
  const px = 1 / width;
  const py = 1 / height;
  return [
    new Vector2(-px, -py), new Vector2(0, -py), new Vector2(px, -py),
    new Vector2(-px,  0),  new Vector2(0,  0),  new Vector2(px,  0),
    new Vector2(-px,  py), new Vector2(0,  py),  new Vector2(px,  py)
  ];
}

/**
 * Creates a StarMade-Open outline post-process material.
 * Mirror of `data/shader/outline/outline.*` (edge detection via depth sampling).
 *
 * Render the scene to a render target, then draw a full-screen quad with this
 * material to composite outline edges over the scene.
 *
 * @param renderedTexture  The color texture from the scene render target.
 * @param depthTexture     The depth texture from the scene render target.
 * @param meshForce        Transparency of the underlying mesh (0=transparent,1=opaque). Default 0.5.
 * @param viewportSize     Viewport dimensions in pixels.
 */
export function createStarMadeOutlineMaterial(options: {
  readonly renderedTexture?: Texture | null;
  readonly depthTexture?: Texture | null;
  readonly meshForce?: number;
  readonly viewportSize?: Vector2;
} = {}): ShaderMaterial {
  const width = options.viewportSize?.x ?? 1920;
  const height = options.viewportSize?.y ?? 1080;
  const offsets = starMadeOutlineTextureCoordinateOffsets(width, height);

  const mat = new ShaderMaterial({
    name: "StarMadeOutlineMaterial",
    glslVersion: GLSL3,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NoBlending,
    uniforms: {
      bgl_RenderedTexture: { value: options.renderedTexture ?? null },
      bgl_DepthTexture: { value: options.depthTexture ?? null },
      bgl_MeshForce: { value: options.meshForce ?? 0.5 },
      bgl_TextureCoordinateOffset: { value: offsets }
    },
    vertexShader: `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy * 2.0 - 1.0, 0.0, 1.0);
}`,
    fragmentShader: `
uniform sampler2D bgl_RenderedTexture;
uniform sampler2D bgl_DepthTexture;
uniform float bgl_MeshForce;
uniform vec2 bgl_TextureCoordinateOffset[9];
in vec2 vUv;
out vec4 fragColor;

const float near = 0.001;
const float far = 1.0;
const float farInv = 1.0 / far;
const float edgeForce = 3.0;

float linearDepth(in vec2 uv) {
  float d = texture(bgl_DepthTexture, uv).r;
  return -near / (-1.0 + d * ((far - near) * farInv));
}

void main() {
  vec4 texcol = texture(bgl_RenderedTexture, vUv);

  float s0 = linearDepth(vUv + bgl_TextureCoordinateOffset[0]);
  float s1 = linearDepth(vUv + bgl_TextureCoordinateOffset[1]);
  float s2 = linearDepth(vUv + bgl_TextureCoordinateOffset[2]);
  float s3 = linearDepth(vUv + bgl_TextureCoordinateOffset[3]);
  float s5 = linearDepth(vUv + bgl_TextureCoordinateOffset[5]);
  float s6 = linearDepth(vUv + bgl_TextureCoordinateOffset[6]);
  float s7 = linearDepth(vUv + bgl_TextureCoordinateOffset[7]);
  float s8 = linearDepth(vUv + bgl_TextureCoordinateOffset[8]);

  float mx = max(s0, max(s1, max(s2, max(s3, max(s5, max(s6, max(s7, s8)))))));
  float mn = min(s0, min(s1, min(s2, min(s3, min(s5, min(s6, min(s7, s8)))))));
  float diff = (mx - mn) * 3.0; // simplified dot(vec3, 1.0) equivalent

  if (diff > 0.1) {
    fragColor = vec4(texcol.rgb * edgeForce, 1.0);
  } else {
    fragColor = vec4(texcol.rgb, texcol.r * bgl_MeshForce);
  }
}`
  });

  if (options.renderedTexture) {
    options.renderedTexture.minFilter = NearestFilter;
    options.renderedTexture.magFilter = NearestFilter;
  }

  return mat;
}
