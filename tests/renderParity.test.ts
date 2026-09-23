/**
 * @fileoverview Source-derived rendering regressions independent of visual tuning.
 *
 * Native references are pinned in references.lock.json. These are CPU contracts,
 * not a claim of GLSL branch coverage or a replacement for image comparisons.
 */
import { describe, expect, it } from "vitest";
import { BoxGeometry, DataArrayTexture, DataTexture, Group, Matrix4, Mesh,
  OrthographicCamera, Scene, ShaderMaterial, Vector3, Vector4, type WebGLRenderer } from "three";
import { applyStarMadeSceneSunToShaderMaterial, blockDefinitionFromConfig,
  computeStarMadeBlockLightVolume, createStarMadeCubeShaderMaterial,
  createStarMadeEncodedCubeGeometry, createStarMadeLodInstance, createStarMadeLodShaderMaterial,
  updateStarMadeCubeShaderTime, updateStarMadeSceneSunViewSpace,
  type StarMadeLodBlockInstance } from "../src";

const constructors = [createStarMadeCubeShaderMaterial, createStarMadeLodShaderMaterial];
function beforeDraw(material: ShaderMaterial, camera: OrthographicCamera): void {
  camera.updateMatrixWorld(true);
  material.onBeforeRender({} as WebGLRenderer, new Scene(), camera,
    new BoxGeometry(), new Mesh(), null as never);
}

describe("Positional sun — OpenGL GL_POSITION uses w=1 in eye space", () => {
  it.each(constructors)("updates each material from world coordinates for every camera", create => {
    const point = new Vector3(100, 20, -30);
    const material = create({ lightPosition: point });
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    const version = material.version;
    for (const location of [new Vector3(2, 8, 14), new Vector3(-5, 9, -10)]) {
      camera.position.copy(location); camera.lookAt(1, 2, 3);
      material.uniformsNeedUpdate = false;
      beforeDraw(material, camera);
      expect(material.uniformsNeedUpdate).toBe(true);
      const expected = new Vector4(point.x, point.y, point.z, 1).applyMatrix4(camera.matrixWorldInverse);
      expect(material.uniforms.starMadeLightSources.value[0].position.toArray()).toEqual(expected.toArray());
      beforeDraw(material, camera);
      expect(material.uniforms.starMadeLightSources.value[0].position.toArray()).toEqual(expected.toArray());
      expect(material.uniforms.lightPos.value.toArray()).toEqual(point.toArray());
    }
    expect(material.version).toBe(version);
  });

  it.each(constructors)("prioritizes explicit position and retains the legacy unnormalized alias", create => {
    const position = new Vector3(7, 9, 11), alias = new Vector3(3, 4, 0);
    const material = create({ sun: { position, direction: alias } });
    expect(material.uniforms.lightPos.value.toArray()).toEqual([7, 9, 11]);
    position.set(0, 0, 0);
    expect(material.userData.starMadeSunWorldPosition).toEqual([7, 9, 11]);
    applyStarMadeSceneSunToShaderMaterial(material, { direction: alias });
    expect(material.uniforms.lightPos.value.length()).toBe(5);
    applyStarMadeSceneSunToShaderMaterial(material, { position: new Vector3(10, 20, 30), direction: alias });
    expect(material.userData.starMadeSunWorldPosition).toEqual([10, 20, 30]);
    expect(updateStarMadeSceneSunViewSpace(material, new Matrix4().makeTranslation(-1, -2, -3))).toBe(true);
    expect(material.uniforms.starMadeLightSources.value[0].position.toArray()).toEqual([9, 18, 27, 1]);
  });

  it("does not transform unrelated or incomplete shader materials", () => {
    const material = new ShaderMaterial();
    expect(updateStarMadeSceneSunViewSpace(material, new Matrix4())).toBe(false);
    material.userData.starMadeSunWorldPosition = [1, 2, 3];
    expect(updateStarMadeSceneSunViewSpace(material, new Matrix4())).toBe(false);
    material.uniforms.starMadeLightSources = { value: [] };
    expect(updateStarMadeSceneSunViewSpace(material, new Matrix4())).toBe(false);
    material.uniforms.starMadeLightSources.value = [{ position: new Vector3() }];
    expect(updateStarMadeSceneSunViewSpace(material, new Matrix4())).toBe(false);
  });

  it.each([false, true])("keeps the sun callback on cloned LOD materials, material array=%s", array => {
    const source = createStarMadeLodShaderMaterial({ sun: { position: new Vector3(10, 20, 30) } });
    const prototype = new Group();
    prototype.add(new Mesh(new BoxGeometry(), array ? [source] : source));
    const reference = { name: "fixture", filename: "fixture", relpath: "fixture",
      sceneUrl: "/fixture.scene", texturePath: "/textures/" };
    const entry: StarMadeLodBlockInstance = { key: "fixture", modelReference: reference,
      blockDefinition: blockDefinitionFromConfig({ id: 5, name: "fixture", lodShape: "fixture" }),
      block: { orientation: 0, active: true }, worldPosition: [0, 0, 0], position: [0, 0, 0],
      entityName: "fixture", blockId: 5 };
    const instance = createStarMadeLodInstance(prototype, entry, {
      volume: computeStarMadeBlockLightVolume({ size: [3, 3, 3], sources: [], solids: [] }), volumeShift: [1, 1, 1]
    });
    const mesh = instance.children[0].children[0] as Mesh;
    const material = (array ? (mesh.material as ShaderMaterial[])[0] : mesh.material) as ShaderMaterial;
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.position.set(1, 2, 3);
    beforeDraw(material, camera);
    expect(material.uniforms.starMadeLightSources.value[0].position.toArray()).toEqual([9, 18, 27, 1]);
    expect(source.uniforms.starMadeLightSources.value[0].position.toArray()).toEqual([10, 20, 30, 1]);
    expect(material).not.toBe(source);
    const ownLight = material.uniforms.lightDiffuse.value[0];
    ownLight.set(1, 2, 3, 4);
    expect(source.uniforms.lightDiffuse.value[0].toArray()).not.toEqual([1, 2, 3, 4]);
  });
});

describe("Native material and animation defaults", () => {
  it("does not add a white overlay or turn a missing normal map into an emissive surface", () => {
    const material = createStarMadeCubeShaderMaterial();
    expect([...material.uniforms.overlayTex.value.image.data]).toEqual([255, 255, 255, 0]);
    for (const name of ["normalTex0", "normalTex1", "normalTex2", "normalTex3", "normalTex7"]) {
      expect([...material.uniforms[name].value.image.data]).toEqual([128, 128, 255, 0]);
    }
    const texture = new DataArrayTexture(new Uint8Array([90, 80, 70, 255]), 1, 1, 1);
    const array = createStarMadeCubeShaderMaterial({ textureArray: texture, normalTextureLayers: new Map([[0, new DataTexture()]]) });
    expect([...array.uniforms.cTexNormal.value.image.data]).toEqual(Array.from({ length: 4 }, () => [128, 128, 255, 0]).flat());
    expect(array.uniforms.cTex.value.colorSpace).toBe("");
  });

  it("retains the native strict half-second condition and one-frame backlog progression", () => {
    const material = createStarMadeCubeShaderMaterial();
    updateStarMadeCubeShaderTime(material, 0.5);
    expect(material.uniforms.animationTime.value).toBe(0);
    updateStarMadeCubeShaderTime(material, 0.001);
    expect(material.uniforms.animationTime.value).toBe(1);
    updateStarMadeCubeShaderTime(material, 2);
    expect(material.uniforms.animationTime.value).toBe(2);
    expect(material.userData._animAccum).toBeCloseTo(1.501);
    updateStarMadeCubeShaderTime(material, 0);
    expect(material.uniforms.animationTime.value).toBe(3);
    updateStarMadeCubeShaderTime(material, 0);
    expect(material.uniforms.animationTime.value).toBe(0);
    expect(material.uniforms.uTime.value).toBeCloseTo(2.501);
  });

  it.each([64, 128, 192, 256, 320, 384, 80])("keeps positions and winding unchanged by shading-normal mode %s", normalMode => {
    const original = createStarMadeEncodedCubeGeometry();
    const overridden = createStarMadeEncodedCubeGeometry({ normalMode });
    expect([...overridden.getAttribute("position").array]).toEqual([...original.getAttribute("position").array]);
    expect([...overridden.index!.array]).toEqual([...original.index!.array]);
    expect([...overridden.getAttribute("uv").array]).toEqual([...original.getAttribute("uv").array]);
    for (let i = 0; i < overridden.getAttribute("starMadeVertex").count; i++) {
      expect(overridden.getAttribute("starMadeVertex").getW(i) & 511).toBe(normalMode);
    }
    original.dispose(); overridden.dispose();
  });
});
