import { type Box3, type Object3D, type OrthographicCamera, type PerspectiveCamera, type ShaderMaterial, type Vector3, type WebGLRenderer } from "three";
import {
  applyStarMadeShadowParamsToCubeShaderMaterial,
  applyStarMadeShadowParamsToLodObject3D
} from "../shaders/cubeShaderMaterial.js";
import {
  bindStarMadeDirectionalShadowRoots,
  createStarMadeDirectionalShadowPipeline,
  createStarMadePointLightShadowPipeline,
  type StarMadeDirectionalShadowPipeline,
  type StarMadePointLightShadowPipeline,
  type StarMadePointLightShadowSource
} from "../shaders/shadowPipeline.js";
import type { Texture } from "three";

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface StarMadeCubeShadowCasterPass {
  /** Root object3D whose meshes will cast shadows. */
  readonly root: Object3D;
  /** Whether to include LOD meshes from this root. Default true. */
  readonly includeLod?: boolean;
}

export interface StarMadeCubeShadowPipelineOptions {
  /** Scene bounding box used to size the directional shadow frustum. */
  readonly sceneBounds: Box3;
  /**
   * Objects whose meshes cast shadows.
   * Pass one entry per logical scene group (cubes, LOD, etc.).
   */
  readonly casterPasses?: readonly StarMadeCubeShadowCasterPass[];
  /** Block-light point sources for the secondary shadow pass. When absent, only directional is used. */
  readonly pointLightSources?: readonly StarMadePointLightShadowSource[];
  /** World-space center for point-light shadow frustums. Defaults to sceneBounds center. */
  readonly pointLightCenter?: Vector3;
  /** Main receiver camera; used to project PSSM depth thresholds. */
  readonly viewCamera?: PerspectiveCamera | OrthographicCamera;
  /** Sun direction in world space. Default StarMade sun (450,900,0). */
  readonly sunDirection?: Vector3;
  /** Shadow map resolution. Default 1024. */
  readonly mapSize?: number;
  /** Directional shadow strength (0..1). Default 0.35. */
  readonly directionalStrength?: number;
  /** Point-light shadow strength (0..1). Default 0.5. */
  readonly pointLightStrength?: number;
  /** Depth bias. Default 0.003. */
  readonly bias?: number;
  /** Cube texture layers for alpha-discard casters. */
  readonly cubeTextureLayers?: ReadonlyMap<number, Texture>;
}

export interface StarMadeCubeShadowPipeline {
  /**
   * Render all shadow maps. Call once per frame before the main render pass.
   * Pass the Three.js WebGLRenderer.
   */
  render(renderer: WebGLRenderer): void;
  /**
   * Apply shadow uniforms to a cube ShaderMaterial and optionally to all LOD objects
   * in the provided scene roots.
   */
  applyToScene(cubeMaterial: ShaderMaterial, lodRoots?: readonly Object3D[]): void;
  /** The underlying directional pipeline (for diagnostics or direct access). */
  readonly directional: StarMadeDirectionalShadowPipeline;
  /** The underlying point-light pipeline, if point sources were provided. */
  readonly pointLight: StarMadePointLightShadowPipeline | null;
}

/**
 * Creates a unified StarMade shadow pipeline combining:
 * - one directional (sun) shadow map pass
 * - optionally one multi-source point-light block shadow pass
 *
 * Automatically adds all caster passes to both pipelines and wires the
 * directional shadow to the scene root via bindStarMadeDirectionalShadowRoot.
 */
export function createStarMadeCubeShadowPipeline(
  options: StarMadeCubeShadowPipelineOptions
): StarMadeCubeShadowPipeline {
  const {
    sceneBounds,
    casterPasses = [],
    pointLightSources,
    sunDirection,
    mapSize,
    directionalStrength,
    pointLightStrength,
    bias,
    cubeTextureLayers
  } = options;

  // Directional (sun) pipeline
  const directional = createStarMadeDirectionalShadowPipeline({
    sceneBounds,
    lightDirection: sunDirection,
    viewCamera: options.viewCamera,
    mapSize,
    strength: directionalStrength,
    bias,
    cubeTextureLayers
  });

  // Bind caster roots to directional pipeline
  bindStarMadeDirectionalShadowRoots(directional, casterPasses.map((pass) => pass.root));

  // Point-light pipeline (optional)
  let pointLight: StarMadePointLightShadowPipeline | null = null;

  if (pointLightSources && pointLightSources.length > 0) {
    const center = options.pointLightCenter ?? (() => {
      const c = sceneBounds.getCenter(sceneBounds.min.clone());
      return c;
    })();

    pointLight = createStarMadePointLightShadowPipeline({
      sources: pointLightSources,
      receiverCenter: center,
      mapSize,
      strength: pointLightStrength,
      bias,
      cubeTextureLayers
    });

    for (const pass of casterPasses) {
      pointLight.addCaster(pass.root);
    }
  }

  return {
    render(renderer: WebGLRenderer): void {
      directional.render(renderer);
      pointLight?.render(renderer);
    },

    applyToScene(cubeMaterial: ShaderMaterial, lodRoots?: readonly Object3D[]): void {
      applyStarMadeShadowParamsToCubeShaderMaterial(cubeMaterial, directional.shadowParams);

      for (const root of lodRoots ?? []) {
        applyStarMadeShadowParamsToLodObject3D(root, directional.shadowParams);
      }
    },

    get directional() { return directional; },
    get pointLight() { return pointLight; }
  };
}
