import { Mesh, MeshStandardMaterial, type Material, type BufferGeometry, type Object3D, type Scene, type Camera, type WebGLRenderer } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { InspectionDiagnostic } from './analysis.js';

export interface InspectionExportOptions {
  readonly binary?: boolean;
  /** Explicit opt-in: native shaders cannot be represented faithfully in glTF. */
  readonly nativeShaders?: 'reject' | 'approximate';
}
/** Exports a visual snapshot. Decoder remains the only owner of blueprint serialization. */
export async function exportInspectionGltf(root: Object3D, options: InspectionExportOptions = {}) {
  const diagnostics: InspectionDiagnostic[] = [];
  const owned = new Set<Material>();
  const geometries = new Set<BufferGeometry>();
  const copy = root.clone(true);
  try {
    copy.traverse(object => {
      if (object.animations.length) diagnostics.push({ code: 'animation-snapshot', message: `${object.name}: current pose only; animation tracks not exported` });
      if (!(object instanceof Mesh)) return;
      if (object.geometry.hasAttribute('ivert') || object.geometry.hasAttribute('starMadeVertex')) {
        const geometry = object.geometry.clone();
        geometry.deleteAttribute('ivert'); geometry.deleteAttribute('starMadeVertex');
        object.geometry = geometry; geometries.add(geometry);
        diagnostics.push({ code: 'native-attributes-omitted', message: `${object.name}: packed shader attributes omitted; positions, normals and UVs retained` });
      }
      const convert = (material: Material) => {
        if (!('isShaderMaterial' in material)) return material;
        if (options.nativeShaders !== 'approximate') throw new Error('Native shader export requires explicit approximation');
        diagnostics.push({ code: 'native-shader-approximation', message: `${object.name}: shader lighting, emission and atlas effects replaced by neutral material` });
        const replacement = new MeshStandardMaterial({ color: 0xaaaaaa, transparent: material.transparent, opacity: material.opacity, side: material.side });
        owned.add(replacement); return replacement;
      };
      object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
    });
    const asset = await new GLTFExporter().parseAsync(copy, { binary: options.binary ?? false, onlyVisible: true });
    return { asset, diagnostics, scope: 'visual-snapshot' as const };
  } finally {
    for (const material of owned) material.dispose();
    for (const geometry of geometries) geometry.dispose();
  }
}
/** Captures the host's current viewport synchronously after rendering; does not own the renderer or camera. */
export function captureInspectionPreview(renderer: WebGLRenderer, scene: Scene, camera: Camera): string {
  const target = renderer.getRenderTarget();
  const face = renderer.getActiveCubeFace(); const level = renderer.getActiveMipmapLevel();
  try {
    renderer.setRenderTarget(null); renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  } finally {
    renderer.setRenderTarget(target, face, level);
  }
}
