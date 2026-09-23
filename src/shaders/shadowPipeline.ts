import {
  Box3,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  FloatType,
  GLSL3,
  Matrix4,
  NearestFilter,
  NoColorSpace,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  type Object3D,
  type Texture,
  Vector2,
  Vector3,
  Vector4,
  WebGLArrayRenderTarget,
  WebGLRenderTarget,
  type WebGLRenderer
} from "three";
import {
  applyStarMadeShadowParamsToCubeShaderMaterial,
  applyStarMadeShadowParamsToLodObject3D,
  createStarMadeCubeShadowDepthMaterial,
  createStarMadeLodShadowDepthMaterial,
  type StarMadeCubeShadowDepthMaterialOptions,
  type StarMadeShadowParams
} from "./cubeShaderMaterial.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public API types
// ─────────────────────────────────────────────────────────────────────────────

export interface StarMadeDirectionalShadowOptions {
  /** World-space direction the light comes from (normalized). Defaults to StarMade sun (450,900,0). */
  readonly lightDirection?: Vector3;
  /** Shadow map size in pixels. Default 1024. */
  readonly mapSize?: number;
  /** Shadow strength (0..1). Default 0.35. */
  readonly strength?: number;
  /** Residual normalized-depth bias. Default 0.00001; receiver-plane correction handles slopes. */
  readonly bias?: number;
  /** Bounds of the scene to cover with the shadow frustum. */
  readonly sceneBounds: Box3;
  /** Extra padding added to the frustum radius. Default 4. */
  readonly frustumPadding?: number;
  /** Cube texture layers needed for alpha-discard casters (layers 0,1,2,3,7). */
  readonly cubeTextureLayers?: ReadonlyMap<number, Texture>;
  /**
   * Number of shadow map splits (PSSM). Default 1. Max 3.
   * With splitCount > 1 the pipeline uses a WebGLArrayRenderTarget so the
   * fragment shader can select the correct split via shadowCoef().
   * Split far distances are calculated from the scene depth range and
   * a logarithmic / uniform lambda blend (splitLambda, default 0.5).
   */
  readonly splitCount?: number;
  /** PSSM lambda blending uniform vs logarithmic split scheme. Default 0.5. */
  readonly splitLambda?: number;
  /**
   * Main receiver camera, whose projection defines gl_FragCoord.z for PSSM.
   * The projection is read each render; call updateProjectionMatrix() after edits.
   * Without a camera, a perspective projection with the split near/far planes is used.
   */
  readonly viewCamera?: PerspectiveCamera | OrthographicCamera;
  /** Fixed split range; defaults to viewCamera's initial near/far, otherwise 0.1 / 600. */
  readonly cameraNearForSplits?: number;
  readonly cameraFarForSplits?: number;
}

export interface StarMadeDirectionalShadowPipeline {
  /** Render the shadow map into its render target. Call once per frame before main render. */
  render(renderer: WebGLRenderer): void;
  /** Apply shadow uniforms to a cube ShaderMaterial. */
  applyToCubeMaterial(material: ShaderMaterial): void;
  /** Apply shadow uniforms to all LOD ShaderMaterials in a scene graph. */
  applyToLodObject3D(root: Object3D): number;
  /** The StarMadeShadowParams ready for manual applyStarMadeShadowParams*() calls. */
  readonly shadowParams: StarMadeShadowParams;
  /** Shadow map render target (read-only access for diagnostics). */
  readonly renderTarget: WebGLRenderTarget;
  /** The underlying array render target when splitCount > 1 (null for single-split). */
  readonly arrayRenderTarget: WebGLArrayRenderTarget | null;
  /** Shadow camera (read-only access for diagnostics). */
  readonly camera: OrthographicCamera;
  /** Diagnostics. */
  readonly mapSize: number;
  readonly strength: number;
  readonly bias: number;
  readonly casterMeshCount: number;
  readonly casterTriangleCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

const STARMADE_DEFAULT_SUN_DIRECTION = new Vector3(450, 900, 0).normalize();
const STARMADE_DEFAULT_SHADOW_MAP_SIZE = 1024;
const STARMADE_DEFAULT_SHADOW_STRENGTH = 0.35;
const STARMADE_DEFAULT_SHADOW_BIAS = 0.00001;
const STARMADE_DEFAULT_FRUSTUM_PADDING = 4;

/**
 * Creates a single-source directional shadow pipeline aligned with StarMade-Open's
 * shadow rendering path (one orthographic depth pass, scalar shadowCoef() in shader).
 *
 * Usage:
 * ```ts
 * const shadow = createStarMadeDirectionalShadowPipeline({ sceneBounds, lightDirection: sunDir });
 * bindStarMadeDirectionalShadowRoot(shadow, segmentRoot);
 * shadow.applyToCubeMaterial(cubeMaterial);
 * shadow.applyToLodObject3D(segmentRoot);
 * // in render loop:
 * shadow.render(renderer);
 * renderer.render(scene, camera);
 * ```
 */
export function createStarMadeDirectionalShadowPipeline(
  options: StarMadeDirectionalShadowOptions
): StarMadeDirectionalShadowPipeline {
  const lightDirection = options.lightDirection?.clone().normalize() ?? STARMADE_DEFAULT_SUN_DIRECTION.clone();
  const mapSize = options.mapSize ?? STARMADE_DEFAULT_SHADOW_MAP_SIZE;
  const strength = options.strength ?? STARMADE_DEFAULT_SHADOW_STRENGTH;
  const bias = options.bias ?? STARMADE_DEFAULT_SHADOW_BIAS;
  const padding = options.frustumPadding ?? STARMADE_DEFAULT_FRUSTUM_PADDING;
  const splitCount = Math.max(1, Math.min(3, options.splitCount ?? 1));
  const splitLambda = options.splitLambda ?? 0.5;
  const cNear = options.cameraNearForSplits ?? options.viewCamera?.near ?? 0.1;
  const cFar = options.cameraFarForSplits ?? options.viewCamera?.far ?? 600;
  const viewProjection = options.viewCamera?.projectionMatrix ?? new PerspectiveCamera(50, 1, cNear, cFar).projectionMatrix;

  const center = options.sceneBounds.getCenter(new Vector3());
  const size = options.sceneBounds.getSize(new Vector3());
  const radius = size.length() * 0.5 + padding;

  // PSSM split distances: lambda blend of logarithmic and uniform schemes.
  const splitFarWorld: number[] = [];
  for (let i = 1; i <= splitCount; i++) {
    const uni = cNear + (cFar - cNear) * (i / splitCount);
    // Orthographic receivers can have near=0, where logarithmic splitting is undefined.
    const log = cNear > 0 ? cNear * Math.pow(cFar / cNear, i / splitCount) : uni;
    splitFarWorld.push(splitLambda * log + (1 - splitLambda) * uni);
  }

  // Fit all scene corners in light space, rather than a bounding sphere. A scene
  // bound is not a camera-frustum slice: do not crop it to splitFar/2, which drops
  // off-center casters. Cascade subdivision can improve resolution independently.
  function buildSplitCamera(): OrthographicCamera {
    const cam = new OrthographicCamera(-radius, radius, radius, -radius, 0.1, radius * 5);
    cam.position.copy(center).addScaledVector(lightDirection, radius * 2.2);
    cam.lookAt(center);
    cam.updateMatrixWorld(true);
    const lightBounds = new Box3();
    for (const x of [options.sceneBounds.min.x, options.sceneBounds.max.x]) {
      for (const y of [options.sceneBounds.min.y, options.sceneBounds.max.y]) {
        for (const z of [options.sceneBounds.min.z, options.sceneBounds.max.z]) {
          lightBounds.expandByPoint(new Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse));
        }
      }
    }
    cam.left = lightBounds.min.x - padding;
    cam.right = lightBounds.max.x + padding;
    cam.bottom = lightBounds.min.y - padding;
    cam.top = lightBounds.max.y + padding;
    cam.near = Math.max(0.01, -lightBounds.max.z - padding);
    cam.far = Math.max(cam.near + 0.01, -lightBounds.min.z + padding);
    cam.updateProjectionMatrix();
    return cam;
  }

  const splitCameras: OrthographicCamera[] = [];
  const shadowMatrices: Matrix4[] = [];
  for (let i = 0; i < splitCount; i++) {
    const cam = buildSplitCamera();
    splitCameras.push(cam);
    shadowMatrices.push(buildShadowMatrix(cam));
  }
  const camera = splitCameras[0];

  // The shaders store raw normalized depth in red. RGBA8 truncates it to 256
  // levels, producing stripes/self-shadowing even with a perfectly flat receiver.
  // Require WebGL2 EXT_color_buffer_float; never silently fall back to RGBA8.
  // Nearest sampling compares actual depths rather than interpolated edge colors.
  // Render targets: plain 2D for 1 split, array for > 1 splits.
  function configureTexture(tex: Texture, name: string): void {
    // r164 WebGLArrayRenderTarget ignores the fourth constructor argument.
    tex.type = FloatType;
    tex.name = name;
    tex.generateMipmaps = false;
    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    tex.wrapS = ClampToEdgeWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    tex.colorSpace = NoColorSpace;
  }

  let arrayRenderTarget: WebGLArrayRenderTarget | null = null;
  let primaryRenderTarget: WebGLRenderTarget;
  if (splitCount > 1) {
    arrayRenderTarget = new WebGLArrayRenderTarget(mapSize, mapSize, splitCount, { depthBuffer: true, type: FloatType });
    configureTexture(arrayRenderTarget.texture, "StarMadeDirectionalShadowMapArray");
    primaryRenderTarget = arrayRenderTarget as unknown as WebGLRenderTarget;
  } else {
    primaryRenderTarget = new WebGLRenderTarget(mapSize, mapSize, { depthBuffer: true, type: FloatType });
    configureTexture(primaryRenderTarget.texture, "StarMadeDirectionalShadowMap");
  }

  const cubeDepthOpts = buildCubeDepthOptions(options.cubeTextureLayers);
  const depthMaterials = {
    cube: createStarMadeCubeShadowDepthMaterial(cubeDepthOpts),
    cubeAlpha: createStarMadeCubeShadowDepthMaterial({ ...cubeDepthOpts, alphaDiscard: true }),
    lod: createStarMadeLodShadowDepthMaterial({ lightPosition: lightDirection.clone() }),
    generic: createGenericShadowDepthMaterial()
  };

  const texelSize = new Vector2(1 / mapSize, 1 / mapSize);

  // Compare projected receiver depth with gl_FragCoord.z, never light-camera depth.
  // Preserve the public vector so materials already bound to it update each frame.
  const farDistances = new Vector4(0.9983, 0.9983, 0.9983, 1);
  function updateFarDistances(): void {
    if (splitCount === 1) return;
    const projection = options.viewCamera?.projectionMatrix ?? viewProjection;
    const depth = new Vector3();
    for (let i = 0; i < splitCount; i++) {
      depth.set(0, 0, -splitFarWorld[i]).applyMatrix4(projection);
      farDistances.setComponent(i, Math.min(1, Math.max(0, 0.5 * depth.z + 0.5)));
    }
    for (let i = splitCount; i < 3; i++) {
      farDistances.setComponent(i, farDistances.getComponent(splitCount - 1));
    }
  }
  updateFarDistances();

  const shadowParams: StarMadeShadowParams = {
    maps: [primaryRenderTarget.texture],
    mapArray: splitCount > 1 ? arrayRenderTarget!.texture : undefined,
    mapArrayMode: splitCount > 1 ? "splits" : undefined,
    matrices: shadowMatrices as unknown as [Matrix4, Matrix4, Matrix4],
    strength,
    bias,
    texelSize,
    texSize: new Vector2(mapSize, 1 / mapSize),
    farDistances,
    splits: splitCount
  };

  let casterScenes: (Scene | null)[] = Array(splitCount).fill(null);

  let cachedMeshCount = 0;
  let cachedTriCount = 0;
  let boundRoots: readonly Object3D[] = [];

  function ensureCasterScene(splitIdx: number): Scene {
    if (!casterScenes[splitIdx]) {
      const scene = new Scene();
      for (const root of boundRoots) scene.add(buildCasterClone(root, depthMaterials));
      if (splitIdx === 0) {
        const stats = countCasterStats(scene);
        cachedMeshCount = stats.meshCount;
        cachedTriCount = stats.triangleCount;
      }
      casterScenes[splitIdx] = scene;
    }
    const scene = casterScenes[splitIdx]!;
    for (let i = 0; i < boundRoots.length; i++) {
      syncCasterWorldTransform(boundRoots[i], scene.children[i]);
    }
    return scene;
  }

  const pipeline: StarMadeDirectionalShadowPipeline & { _bindRoots: (roots: readonly Object3D[]) => void } = {
    get renderTarget() { return primaryRenderTarget; },
    get arrayRenderTarget() { return arrayRenderTarget; },
    get camera() { return camera; },
    get mapSize() { return mapSize; },
    get strength() { return strength; },
    get bias() { return bias; },
    get shadowParams() { return shadowParams; },
    get casterMeshCount() { return cachedMeshCount; },
    get casterTriangleCount() { return cachedTriCount; },

    render(renderer: WebGLRenderer) {
      updateFarDistances();
      if (boundRoots.length === 0) { return; }
      const prev = renderer.getRenderTarget();
      const prevFace = renderer.getActiveCubeFace();
      const prevMip = renderer.getActiveMipmapLevel();
      const prevColor = renderer.getClearColor(new Color());
      const prevAlpha = renderer.getClearAlpha();
      const prevAutoClear = renderer.autoClear;
      const prevXr = renderer.xr.enabled;
      renderer.xr.enabled = false;
      renderer.autoClear = true;

      try {
      for (let i = 0; i < splitCount; i++) {
        const scene = ensureCasterScene(i);
        const cam = splitCameras[i];
        if (arrayRenderTarget) {
          renderer.setRenderTarget(arrayRenderTarget, i);
        } else {
          renderer.setRenderTarget(primaryRenderTarget);
        }
        renderer.setClearColor(0xffffff, 1);
        renderer.clear();
        renderer.render(scene, cam);
      }

      } finally {
        renderer.setRenderTarget(prev, prevFace, prevMip);
        renderer.setClearColor(prevColor, prevAlpha);
        renderer.autoClear = prevAutoClear;
        renderer.xr.enabled = prevXr;
      }
    },

    applyToCubeMaterial(material: ShaderMaterial) {
      applyStarMadeShadowParamsToCubeShaderMaterial(material, shadowParams);
    },

    applyToLodObject3D(root: Object3D) {
      return applyStarMadeShadowParamsToLodObject3D(root, shadowParams);
    },

    _bindRoots(roots: readonly Object3D[]) {
      // Rebinding also explicitly invalidates topology/material snapshots.
      boundRoots = [...new Set(roots)];
      casterScenes = Array(splitCount).fill(null);
      cachedMeshCount = 0;
      cachedTriCount = 0;
      if (boundRoots.length > 0) ensureCasterScene(0);
    }
  };

  return pipeline;
}

/**
 * Binds a world root Object3D to a directional shadow pipeline for rendering.
 * Must be called before the first pipeline.render() call.
 * Re-binding a different root triggers a caster scene rebuild.
 */
export function bindStarMadeDirectionalShadowRoot(
  pipeline: StarMadeDirectionalShadowPipeline,
  root: Object3D
): void {
  bindStarMadeDirectionalShadowRoots(pipeline, [root]);
}

/**
 * Binds all caster roots without reparenting scene objects. Unlike repeated
 * single-root binding, this retains every group in the directional pass.
 * Rebind after changing child topology/materials; all descendant transforms are live.
 */
export function bindStarMadeDirectionalShadowRoots(
  pipeline: StarMadeDirectionalShadowPipeline,
  roots: readonly Object3D[]
): void {
  const p = pipeline as StarMadeDirectionalShadowPipeline & { _bindRoots?: (roots: readonly Object3D[]) => void };
  p._bindRoots?.(roots);
}

/**
 * Synchronizes the entire caster hierarchy without replacing its depth materials.
 * @param source - Live color-pass object, possibly below an external entity parent.
 * @param clone - Matching depth-pass snapshot; rebind when child topology changes.
 * @param worldRoot - Whether this node is detached from the source's parent.
 * @returns Nothing; local matrices and visibility are copied into the depth tree.
 * @remarks Local matrices are copied exactly (including caller-managed matrices).
 * Nested LOD transforms and activation visibility are not frozen at bind time.
 */
function syncCasterWorldTransform(source: Object3D, clone: Object3D, worldRoot = true): void {
  source.updateWorldMatrix(true, false);
  clone.matrixAutoUpdate = false;
  clone.matrix.copy(worldRoot ? source.matrixWorld : source.matrix);
  clone.matrixWorldNeedsUpdate = true;
  clone.visible = source.visible;
  for (let i = 0; i < source.children.length; i++) {
    // A topology change must use the public bind API, not a partly rebuilt snapshot.
    const child = clone.children[i];
    if (child) syncCasterWorldTransform(source.children[i], child, false);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildShadowMatrix(camera: OrthographicCamera): Matrix4 {
  return new Matrix4()
    .set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    )
    .multiply(camera.projectionMatrix)
    .multiply(camera.matrixWorldInverse);
}

function buildCubeDepthOptions(layers?: ReadonlyMap<number, Texture>): StarMadeCubeShadowDepthMaterialOptions {
  return {
    mainTexture0: layers?.get(0) ?? undefined,
    mainTexture1: layers?.get(1) ?? undefined,
    mainTexture2: layers?.get(2) ?? undefined,
    mainTexture3: layers?.get(3) ?? undefined,
    mainTexture7: layers?.get(7) ?? undefined
  };
}

function createGenericShadowDepthMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: "StarMadeGenericShadowDepthMaterial",
    glslVersion: GLSL3,
    side: DoubleSide,
    depthTest: true,
    depthWrite: true,
    vertexShader: "void main(){\n\tgl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}",
    fragmentShader: "out vec4 starMadeFragColor;\nvoid main(){\n\tfloat d = gl_FragCoord.z;\n\tstarMadeFragColor = vec4(d, d, d, 1.0);\n}"
  });
}

type DepthMaterials = {
  readonly cube: ShaderMaterial;
  readonly cubeAlpha: ShaderMaterial;
  readonly lod: ShaderMaterial;
  readonly generic: ShaderMaterial;
};

function buildCasterClone(root: Object3D, materials: DepthMaterials): Object3D {
  const clone = root.clone(true);
  syncCasterWorldTransform(root, clone);

  clone.traverse((object) => {
    const candidate = object as Object3D & {
      isMesh?: boolean;
      material?: unknown;
    };

    if (!candidate.isMesh) {
      return;
    }

    const mat = candidate.material;
    const mats: unknown[] = Array.isArray(mat) ? mat : mat ? [mat] : [];
    const first = mats.find((m) => m instanceof ShaderMaterial) as ShaderMaterial | undefined;

    const isLod = first?.name.startsWith("StarMadeLodShaderMaterial") ?? false;
    // Effect/outline ShaderMaterials use ordinary float positions, not packed
    // integer ivert data. Routing every shader through cube depth causes invalid
    // vertex bindings and silently missing casters in a mixed scene.
    const isCube = first?.name.startsWith("StarMadeCubeShaderMaterial") ?? false;
    const isCubeAlpha = isCube && first!.transparent;
    // Packed cube vertices can move by the per-material chunk shift in GLSL.
    // The shared geometry's CPU sphere cannot describe that displacement. Do
    // not cull the depth snapshot against an unshifted sphere before its draw.
    if (isCube) candidate.frustumCulled = false;

    candidate.material = isLod
      ? materials.lod
      : isCubeAlpha
        ? materials.cubeAlpha
        : isCube
          ? materials.cube
          : materials.generic;

    // Casters share cached depth materials. Copy the live source frame before
    // each draw, not when the clone is constructed, so animated alpha masks and
    // different source-material clocks remain synchronized with the color pass.
    const depthMaterial = candidate.material as ShaderMaterial;
    candidate.onBeforeRender = () => {
      if (depthMaterial.uniforms.animationTime) {
        depthMaterial.uniforms.animationTime.value = first?.uniforms.animationTime?.value ?? 0;
        // Native cube-3rd.vsh and shadowcube.vsh both apply shift * 32 and
        // lodThreshold. Cached depth materials must follow each color draw;
        // otherwise a translated chunk casts a shadow at its unshifted origin.
        const shift = first?.uniforms.shift?.value as Vector3 | undefined;
        depthMaterial.uniforms.shift.value.set(shift?.x ?? 0, shift?.y ?? 0, shift?.z ?? 0);
        depthMaterial.uniforms.lodThreshold.value = first?.uniforms.lodThreshold?.value ?? 128;
        depthMaterial.uniformsNeedUpdate = true;
      }
    };
  });

  return clone;
}

type CasterStats = { readonly meshCount: number; readonly triangleCount: number };

function countCasterStats(scene: Object3D): CasterStats {
  let meshCount = 0;
  let triangleCount = 0;

  scene.traverse((object) => {
    const candidate = object as Object3D & {
      isMesh?: boolean;
      geometry?: {
        getAttribute(name: string): { readonly count: number } | undefined;
        getIndex(): { readonly count: number } | null;
      };
    };

    if (!candidate.isMesh || !candidate.geometry) {
      return;
    }

    const position = candidate.geometry.getAttribute("position");
    const index = candidate.geometry.getIndex();
    meshCount++;
    triangleCount += (index?.count ?? position?.count ?? 0) / 3;
  });

  return { meshCount, triangleCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-source (point-light) shadow pipeline
// ─────────────────────────────────────────────────────────────────────────────

export interface StarMadePointLightShadowSource {
  /** Unique key for this source (e.g. "white", "red", "blue"). */
  readonly key: string;
  /** World-space position of the light source. */
  readonly position: Vector3;
  /** Normalized RGB color of the light source (0..1). */
  readonly color: Vector3;
}

export interface StarMadePointLightShadowOptions {
  /** Light sources to cast from (max 3 used by the shader). */
  readonly sources: readonly StarMadePointLightShadowSource[];
  /** World-space center of the shadow receiver area. */
  readonly receiverCenter: Vector3;
  /** Half-width of the orthographic shadow frustum. Default 13. */
  readonly frustumHalfSize?: number;
  /** Near/far plane distances. Default 0.1 / 60. */
  readonly cameraNear?: number;
  readonly cameraFar?: number;
  /** Shadow map size (per layer). Default 1024. */
  readonly mapSize?: number;
  /** Shadow strength (0..1). Default 0.5. */
  readonly strength?: number;
  /** Residual normalized-depth bias for the experimental projected-source pass. Default 0.003. */
  readonly bias?: number;
  /** Cube texture layers for alpha-discard casters. */
  readonly cubeTextureLayers?: ReadonlyMap<number, Texture>;
}

export interface StarMadePointLightShadowPipeline {
  /** Render all source shadow maps. Call once per frame before main render. */
  render(renderer: WebGLRenderer): void;
  /**
   * Apply combined shadow params to a cube ShaderMaterial.
   * Uses mapArrayMode "blockSources" when a shared array render target is used.
   */
  applyToCubeMaterial(material: ShaderMaterial, strength?: number): void;
  /** Apply combined shadow params to all LOD ShaderMaterials in a hierarchy. */
  applyToLodObject3D(root: Object3D, strength?: number): number;
  /**
   * Add a caster Object3D to all shadow scenes.
   * Material types (LOD, cube, cube-alpha, generic) are auto-detected from material names.
   * The options parameter is accepted for compatibility but ignored — detection is automatic.
   */
  addCaster(root: Object3D, options?: { readonly alphaDiscard?: boolean; readonly isLod?: boolean }): void;
  /** Resulting StarMadeShadowParams, available for manual application. */
  readonly shadowParams: StarMadeShadowParams;
  /** Shared WebGLArrayRenderTarget (one layer per source). */
  readonly renderTarget: WebGLArrayRenderTarget;
  readonly mapSize: number;
  readonly strength: number;
  readonly bias: number;
  readonly sourceCount: number;
  readonly casterMeshCount: number;
  readonly casterTriangleCount: number;
}

/**
 * Creates an experimental multi-source projected shadow pipeline.
 * This is not StarMade's voxel block-light propagation. It uses one orthographic
 * depth pass per source,
 * stored in a WebGLArrayRenderTarget, sampled via mapArrayMode "blockSources".
 */
export function createStarMadePointLightShadowPipeline(
  options: StarMadePointLightShadowOptions
): StarMadePointLightShadowPipeline {
  const mapSize = options.mapSize ?? 1024;
  const strength = options.strength ?? 0.5;
  const bias = options.bias ?? 0.003;
  const frustumHalf = options.frustumHalfSize ?? 13;
  const cameraNear = options.cameraNear ?? 0.1;
  const cameraFar = options.cameraFar ?? 60;
  const sources = options.sources.slice(0, 3); // shader supports max 3

  const renderTarget = new WebGLArrayRenderTarget(mapSize, mapSize, Math.max(1, sources.length), { type: FloatType });
  renderTarget.depthBuffer = true;
  configurePointLightShadowTexture(renderTarget.texture, "StarMadePointLightShadowMapArray");

  const sourceEntries = sources.map((source, index) => {
    const camera = new OrthographicCamera(-frustumHalf, frustumHalf, frustumHalf, -frustumHalf, cameraNear, cameraFar);
    const direction = options.receiverCenter.clone().sub(source.position).normalize();
    camera.position.copy(source.position).addScaledVector(direction, -Math.abs(cameraFar * 0.4));
    camera.lookAt(options.receiverCenter);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    const shadowMatrix = buildPointLightShadowMatrix(camera);
    const scene = new Scene();

    return { source, index, camera, shadowMatrix, scene };
  });

  const texelSize = new Vector2(1 / mapSize, 1 / mapSize);
  const cubeDepthOpts = buildPointLightCubeDepthOptions(options.cubeTextureLayers);
  const depthMaterials = {
    cube: createStarMadeCubeShadowDepthMaterial(cubeDepthOpts),
    cubeAlpha: createStarMadeCubeShadowDepthMaterial({ ...cubeDepthOpts, alphaDiscard: true }),
    lod: createStarMadeLodShadowDepthMaterial(),
    generic: createPointLightGenericShadowDepthMaterial()
  };

  function buildShadowParams(overrideStrength?: number): StarMadeShadowParams {
    return {
      mapArray: renderTarget.texture,
      mapArrayMode: "blockSources",
      colors: sourceEntries.map((e) => e.source.color),
      matrices: sourceEntries.map((e) => e.shadowMatrix) as [Matrix4?, Matrix4?, Matrix4?],
      strength: overrideStrength ?? strength,
      bias,
      texelSize,
      texSize: new Vector2(mapSize, 1 / mapSize),
      splits: sources.length
    };
  }

  let cachedShadowParams = buildShadowParams();
  let totalCasterMeshCount = 0;
  let totalCasterTriCount = 0;
  const liveCasters: Array<{ source: Object3D; clones: Object3D[] }> = [];

  const pipeline: StarMadePointLightShadowPipeline = {
    get renderTarget() { return renderTarget; },
    get mapSize() { return mapSize; },
    get strength() { return strength; },
    get bias() { return bias; },
    get sourceCount() { return sources.length; },
    get shadowParams() { return cachedShadowParams; },
    get casterMeshCount() { return totalCasterMeshCount; },
    get casterTriangleCount() { return totalCasterTriCount; },

    render(renderer: WebGLRenderer) {
      const prev = renderer.getRenderTarget();
      const prevFace = renderer.getActiveCubeFace();
      const prevMip = renderer.getActiveMipmapLevel();
      const prevColor = renderer.getClearColor(new Color());
      const prevAlpha = renderer.getClearAlpha();
      const prevAutoClear = renderer.autoClear;
      const prevXr = renderer.xr.enabled;

      renderer.xr.enabled = false;
      renderer.autoClear = true;

      try {
      for (const caster of liveCasters) {
        for (const clone of caster.clones) syncCasterWorldTransform(caster.source, clone);
      }
      for (const entry of sourceEntries) {
        renderer.setRenderTarget(renderTarget, entry.index);
        renderer.setClearColor(0xffffff, 1);
        renderer.clear();
        renderer.render(entry.scene, entry.camera);
      }

      } finally {
        renderer.setRenderTarget(prev, prevFace, prevMip);
        renderer.setClearColor(prevColor, prevAlpha);
        renderer.autoClear = prevAutoClear;
        renderer.xr.enabled = prevXr;
      }
    },

    addCaster(root: Object3D, _opts?: { readonly alphaDiscard?: boolean; readonly isLod?: boolean }) {
      const stats = countCasterStats(root);
      totalCasterMeshCount += stats.meshCount;
      totalCasterTriCount += stats.triangleCount;
      // Auto-detects LOD, cube-alpha, cube and generic meshes from material names
      const clones = sourceEntries.map((entry) => {
        // Object3D.clone() does not copy per-draw callbacks. Build each source's
        // caster from the live object so its animation hook is retained.
        const clone = buildPointLightCasterClone(root, depthMaterials.cube, depthMaterials);
        syncCasterWorldTransform(root, clone);
        entry.scene.add(clone);
        return clone;
      });
      liveCasters.push({ source: root, clones });
    },

    applyToCubeMaterial(material: ShaderMaterial, overrideStrength?: number) {
      if (overrideStrength !== undefined) {
        cachedShadowParams = buildShadowParams(overrideStrength);
      }
      applyStarMadeShadowParamsToCubeShaderMaterial(material, cachedShadowParams);
    },

    applyToLodObject3D(root: Object3D, overrideStrength?: number) {
      if (overrideStrength !== undefined) {
        cachedShadowParams = buildShadowParams(overrideStrength);
      }
      return applyStarMadeShadowParamsToLodObject3D(root, cachedShadowParams);
    }
  };

  return pipeline;
}

// helpers

function buildPointLightShadowMatrix(camera: OrthographicCamera): Matrix4 {
  return new Matrix4()
    .set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    )
    .multiply(camera.projectionMatrix)
    .multiply(camera.matrixWorldInverse);
}

function buildPointLightCubeDepthOptions(layers?: ReadonlyMap<number, Texture>): StarMadeCubeShadowDepthMaterialOptions {
  return {
    mainTexture0: layers?.get(0) ?? undefined,
    mainTexture1: layers?.get(1) ?? undefined,
    mainTexture2: layers?.get(2) ?? undefined,
    mainTexture3: layers?.get(3) ?? undefined,
    mainTexture7: layers?.get(7) ?? undefined
  };
}

function createPointLightGenericShadowDepthMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: "StarMadePointLightGenericShadowDepthMaterial",
    glslVersion: GLSL3,
    side: DoubleSide,
    depthTest: true,
    depthWrite: true,
    vertexShader: "void main(){\n\tgl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}",
    fragmentShader: "out vec4 starMadeFragColor;\nvoid main(){\n\tfloat d = gl_FragCoord.z;\n\tstarMadeFragColor = vec4(d, d, d, 1.0);\n}"
  });
}

function configurePointLightShadowTexture(texture: Texture, name: string): void {
  // Three r164 array targets do not forward constructor texture options.
  texture.type = FloatType;
  texture.name = name;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.colorSpace = NoColorSpace;
}

function buildPointLightCasterClone(
  root: Object3D,
  _defaultMat: ShaderMaterial,
  materials: { readonly lod: ShaderMaterial; readonly cube: ShaderMaterial; readonly cubeAlpha: ShaderMaterial; readonly generic: ShaderMaterial }
): Object3D {
  return buildCasterClone(root, materials);
}
