import { describe, expect, it } from "vitest";
import { Color, ShaderMaterial, Texture, Vector3 } from "three";
import { createPreviewScene, createStarMadeCubeAtlasLayout, createStarMadeBlockMaterial, createStarMadeBlockMaterials } from "../src";

describe("Preview scene is an explicitly approximate convenience view, not the parity renderer", () => {
  it("provides a camera, geometry and fill/key lights without a browser", () => {
    const {scene, camera, cube} = createPreviewScene();
    expect(scene.children).toContain(cube);
    expect(scene.children.filter(c => c.type.includes("Light"))).toHaveLength(2);
    expect(camera.position.toArray()).toEqual([2.4, 1.8, 2.8]);
    expect(cube.geometry.getAttribute("position").count).toBe(24);
    expect((cube.material as ShaderMaterial).transparent).toBe(false);
  });
  for (const transparent of [false, true]) for (const lightSource of [false, true]) {
    it(`supports texture/no-texture previews: transparent=${transparent}, light=${lightSource}`, () => {
      const map = new Texture();
      const block = {id: 2, name: "test", textureIds: [33], transparent, lightSource, lightSourceColor: [0.2, 0.4, 0.6, 1]};
      const simple = createPreviewScene({block, map, overlayMap: map});
      const mat = simple.cube.material as ShaderMaterial;
      expect(mat.uniforms.useMainTex.value).toBe(true);
      expect(mat.uniforms.useOverlayTex.value).toBe(true);
      expect(mat.uniforms.opacity.value).toBe(transparent ? 0.72 : 1);
      expect((mat.uniforms.blockLightColor.value as Color).toArray()).toEqual(lightSource ? [0.2, 0.4, 0.6] : [0, 0, 0]);
      expect((createPreviewScene({block}).cube.material as ShaderMaterial).transparent).toBe(transparent);
      const packed = createPreviewScene({block, texturePack: {layout: createStarMadeCubeAtlasLayout(64), layers: new Map([[0, map]])}});
      const materials = packed.cube.material as ShaderMaterial[];
      expect(materials).toHaveLength(5);
      expect(materials[0].uniforms.mainTex.value).toBe(map);
      expect(materials[0].transparent).toBe(transparent);
    });
  }
  it("handles material nulls/defaults and non-default light direction without mutating caller input", () => {
    const direction = new Vector3(1, 2, 3);
    const material = createStarMadeBlockMaterial({map: null, overlayMap: null, opacity: 0.5, alphaTest: 0.2,
      selectTime: 2, emissionStrength: 3, sunDirection: direction});
    expect(material.uniforms.useMainTex.value).toBe(false);
    expect(material.uniforms.useOverlayTex.value).toBe(false);
    expect(material.transparent).toBe(true);
    expect(material.alphaTest).toBe(0.2);
    expect(material.uniforms.sunDirection.value).not.toBe(direction);
    expect(direction.toArray()).toEqual([1, 2, 3]);
    const mats = createStarMadeBlockMaterials({layout: createStarMadeCubeAtlasLayout(64), layers: new Map()});
    expect(mats.every(m => m.name.startsWith("StarMadeBlockMaterial:"))).toBe(true);
  });
});
