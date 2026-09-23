import {
  Color,
  type ColorRepresentation,
  DataTexture,
  LinearFilter,
  RGBAFormat,
  ShaderMaterial,
  type Texture,
  UnsignedByteType,
  Vector3
} from "three";
import type { StarMadeCubeTexturePack } from "../textures/index.js";
import { STARMADE_SCENE_LIGHTING_DEFAULTS } from "./cubeShaderMaterial.js";

export interface StarMadeBlockMaterialOptions {
  readonly map?: Texture | null;
  readonly overlayMap?: Texture | null;
  readonly tint?: ColorRepresentation;
  readonly transparent?: boolean;
  readonly opacity?: number;
  readonly alphaTest?: number;
  readonly selectTime?: number;
  readonly emissionStrength?: number;
  readonly blockLightColor?: ColorRepresentation;
  readonly ambientColor?: ColorRepresentation;
  readonly sunColor?: ColorRepresentation;
  readonly sunDirection?: Vector3;
}

export const STARMADE_CUBE_LIGHTING_DEFAULTS = {
  shininess: 30,
  specularPower: 0.5,
  sunOcclusionStrength: 1.1,
  diffuseStrength: 1.3,
  staticAmbient: 0.05,
  occlusionStrength: 0.2
} as const;

export const starMadeBlockVertexShader = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const starMadeBlockFragmentShader = `
precision highp float;

uniform sampler2D mainTex;
uniform sampler2D overlayTex;
uniform bool useMainTex;
uniform bool useOverlayTex;
uniform vec3 tintColor;
uniform vec3 ambientColor;
uniform vec3 sunColor;
uniform vec3 sunDirection;
uniform vec3 blockLightColor;
uniform float opacity;
uniform float alphaTest;
uniform float selectTime;
uniform float emissionStrength;
uniform float shininess;
uniform float specularPower;
uniform float sunOcclusionStrength;
uniform float diffuseStrength;
uniform float staticAmbient;
uniform float occlusionStrength;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

vec3 calculateStarMadeCubeLight(vec3 color, vec3 normalDirection, vec3 viewDirection) {
  vec3 norm = normalize(normalDirection);
  vec3 viewDir = normalize(viewDirection);
  vec3 lightDir = normalize(sunDirection);

  float sunOcclusion = sunOcclusionStrength;
  vec3 ambient = (blockLightColor * color) + (staticAmbient * color) + (occlusionStrength * sunOcclusion * color);

  float diff = min(1.0, max(dot(norm, lightDir), 0.0) * diffuseStrength);
  vec3 diffuse = diff * color * sunOcclusion;

  vec3 reflectDir = normalize(-reflect(lightDir, norm));
  float spec = pow(max(dot(reflectDir, viewDir), 0.0), shininess);
  float totalSpecular = specularPower * spec * sunOcclusion;
  vec3 specular = vec3(totalSpecular) * 0.3 + totalSpecular * 0.7 * color;
  specular *= vec3(1.0, 0.95, 0.85);

  return (ambientColor * ambient) + (sunColor * (diffuse + specular));
}

void main() {
  vec4 texel = useMainTex ? texture2D(mainTex, vUv) : vec4(1.0);

  if (useOverlayTex) {
    vec4 overlay = texture2D(overlayTex, vUv);
    texel = mix(texel, overlay, overlay.a);
  }

  texel.rgb *= tintColor;
  float alpha = texel.a * opacity;

  if (alpha < alphaTest) {
    discard;
  }

  vec3 lit = calculateStarMadeCubeLight(texel.rgb, vNormal, -vViewPosition);
  vec3 emissive = texel.rgb * emissionStrength;

  gl_FragColor = vec4(max(lit, emissive) + vec3(selectTime), alpha);
}
`;

export function createStarMadeBlockMaterial(options: StarMadeBlockMaterialOptions = {}): ShaderMaterial {
  const opacity = options.opacity ?? 1;
  const transparent = options.transparent ?? opacity < 1;
  const fallbackTexture = createFallbackTexture();

  return new ShaderMaterial({
    name: "StarMadeBlockMaterial",
    vertexShader: starMadeBlockVertexShader,
    fragmentShader: starMadeBlockFragmentShader,
    uniforms: {
      mainTex: { value: options.map ?? fallbackTexture },
      overlayTex: { value: options.overlayMap ?? fallbackTexture },
      useMainTex: { value: options.map !== undefined && options.map !== null },
      useOverlayTex: { value: options.overlayMap !== undefined && options.overlayMap !== null },
      tintColor: { value: new Color(options.tint ?? 0xffffff) },
      ambientColor: { value: new Color(options.ambientColor ?? 0xffffff) },
      sunColor: { value: new Color(options.sunColor ?? 0xffffff) },
      sunDirection: { value: options.sunDirection?.clone().normalize() ?? STARMADE_SCENE_LIGHTING_DEFAULTS.sunDirection.clone() },
      blockLightColor: { value: new Color(options.blockLightColor ?? 0x000000) },
      opacity: { value: opacity },
      alphaTest: { value: options.alphaTest ?? (transparent ? 0.01 : 0) },
      selectTime: { value: options.selectTime ?? 0 },
      emissionStrength: { value: options.emissionStrength ?? 0 },
      shininess: { value: STARMADE_CUBE_LIGHTING_DEFAULTS.shininess },
      specularPower: { value: STARMADE_CUBE_LIGHTING_DEFAULTS.specularPower },
      sunOcclusionStrength: { value: STARMADE_CUBE_LIGHTING_DEFAULTS.sunOcclusionStrength },
      diffuseStrength: { value: STARMADE_CUBE_LIGHTING_DEFAULTS.diffuseStrength },
      staticAmbient: { value: STARMADE_CUBE_LIGHTING_DEFAULTS.staticAmbient },
      occlusionStrength: { value: STARMADE_CUBE_LIGHTING_DEFAULTS.occlusionStrength }
    },
    transparent,
    alphaTest: options.alphaTest ?? (transparent ? 0.01 : 0)
  });
}

export function createStarMadeBlockMaterials(
  texturePack: StarMadeCubeTexturePack,
  options: Omit<StarMadeBlockMaterialOptions, "map" | "overlayMap"> = {}
): ShaderMaterial[] {
  return texturePack.layout.layers.map((layer) => {
    const material = createStarMadeBlockMaterial({
      ...options,
      map: texturePack.layers.get(layer.layer)
    });
    material.name = `StarMadeBlockMaterial:${layer.name}`;
    return material;
  });
}

function createFallbackTexture(): DataTexture {
  const texture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
