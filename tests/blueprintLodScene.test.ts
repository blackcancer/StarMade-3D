import { BufferGeometry, Group, LOD, Matrix4, Mesh, PerspectiveCamera, ShaderMaterial, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { createStarMadeBlueprintLodScene, type StarMadeBlueprintLodSceneData } from "../src/viewer/createBlueprintLodScene.js";
import { createStarMadeBlueprintLod } from "../src/geometry/blueprintLod.js";
import { segmentBlockIndex, type SegmentBlockDataLike } from "../src/starmade/segmentData.js";

const identity = new Matrix4().toArray();
function mesh(cellSize: 1 | 2 | 4 = 1) {
  const blocks: SegmentBlockDataLike[] = [];
  blocks[segmentBlockIndex(16, 16, 16)] = { type: 1, hp: 100, orientation: 0, active: false };
  return createStarMadeBlueprintLod({ segments: [{ x: 0, y: 0, z: 0, blocks }], cellSize, palette: () => ({ color: [0.8, 0.2, 0.1], emission: [0, 0.5, 0] }) });
}
function data(): StarMadeBlueprintLodSceneData {
  return { entities: [{ id: "ship", transform: identity }], regions: [1, 2, 4].map(size => ({ entityId: "ship", cellSize: size as 1 | 2 | 4, mesh: mesh(size as 1 | 2 | 4) })) };
}

describe("blueprint preview LOD scene", () => {
  it("creates indexed, bounded geometry and one texture-free material retaining emission", () => {
    const scene = createStarMadeBlueprintLodScene(data());
    const meshes: Mesh[] = [];
    scene.root.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
    expect(meshes).toHaveLength(3);
    expect(new Set(meshes.map(value => value.material)).size).toBe(1);
    const first = meshes[0];
    expect(first.geometry.getAttribute("position").count).toBe(24);
    expect(first.geometry.index?.count).toBe(36);
    expect(first.geometry.boundingSphere?.radius).toBeCloseTo(Math.sqrt(3) / 2);
    expect(first.geometry.getAttribute("emissiveColor").getY(0)).toBe(0.5);
    const material = first.material as ShaderMaterial;
    expect(material.vertexColors).toBe(true);
    expect(material.fragmentShader).toContain("colorspace_fragment");
    expect(material.vertexShader).toContain("normalMatrix * normal");
    expect(material.uniforms).toEqual({});
    expect(meshes.map(value => value.parent?.visible)).toEqual([true, false, false]);
    scene.dispose();
  });

  it("switches levels with hysteresis and preserves child entity transforms", () => {
    const source = data();
    const scene = createStarMadeBlueprintLodScene({
      entities: [{ id: "turret", parentId: "ship", transform: new Matrix4().makeTranslation(5, 0, 0).toArray() }, { id: "ship", transform: new Matrix4().makeTranslation(10, 0, 0).toArray() }],
      regions: [...source.regions, { entityId: "turret", cellSize: 4, mesh: mesh(4) }, { entityId: "ship", cellSize: 1, mesh: mesh() }]
    }, { distances: [0, 10, 20] });
    const camera = new PerspectiveCamera();
    camera.position.set(10, 0, 0);
    scene.update(camera);
    const ship = scene.root.getObjectByName("ship")!;
    const turret = scene.root.getObjectByName("turret")!;
    expect(turret.parent).toBe(ship);
    expect(turret.getWorldPosition(new Vector3()).toArray()).toEqual([15, 0, 0]);
    const lod = ship.children.find(child => child instanceof LOD) as LOD;
    expect(lod.levels[0].object.children).toHaveLength(2);
    expect(lod.getCurrentLevel()).toBe(0);
    camera.position.z = 11; scene.update(camera); expect(lod.getCurrentLevel()).toBe(1);
    camera.position.z = 9.5; scene.update(camera); expect(lod.getCurrentLevel()).toBe(1);
    camera.position.z = 8; scene.update(camera); expect(lod.getCurrentLevel()).toBe(0);
    camera.position.z = 21; scene.update(camera); expect(lod.getCurrentLevel()).toBe(2);
    scene.dispose();
    scene.update(camera);
  });

  it("accepts empty input and empty meshes", () => {
    const empty = createStarMadeBlueprintLodScene({ entities: [], regions: [] });
    empty.update(new PerspectiveCamera());
    expect(empty.root.children).toEqual([]);
    empty.dispose();
    const scene = createStarMadeBlueprintLodScene({ entities: [{ id: "empty", parentId: null, transform: identity }], regions: [{ entityId: "empty", cellSize: 2, mesh: createStarMadeBlueprintLod({ segments: [], cellSize: 2 }) }] });
    scene.update(new PerspectiveCamera());
    scene.dispose();
  });

  it("owns and disposes all allocated resources exactly once, also on constructor failure", () => {
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    const materialDispose = vi.spyOn(ShaderMaterial.prototype, "dispose");
    try {
      const scene = createStarMadeBlueprintLodScene(data());
      const parent = new Group(); parent.add(scene.root);
      scene.dispose(); scene.dispose();
      expect(parent.children).toEqual([]);
      expect(scene.root.children).toEqual([]);
      expect(geometryDispose).toHaveBeenCalledTimes(3);
      expect(materialDispose).toHaveBeenCalledTimes(1);
      const source = data();
      expect(() => createStarMadeBlueprintLodScene({ ...source, regions: [source.regions[0], { ...source.regions[1], entityId: "missing" }] })).toThrow(/Unknown/);
      expect(geometryDispose).toHaveBeenCalledTimes(4);
      expect(materialDispose).toHaveBeenCalledTimes(2);
    } finally { geometryDispose.mockRestore(); materialDispose.mockRestore(); }
  });

  it("rejects invalid transforms, hierarchies and thresholds", () => {
    for (const distances of [[0, 1], [-1, 10, 20], [0, NaN, 20], [0, 10, 5], [1, 10, 20]]) {
      expect(() => createStarMadeBlueprintLodScene(data(), { distances: distances as [number, number, number] })).toThrow(/distances/);
    }
    const source = data();
    const build = (entities: StarMadeBlueprintLodSceneData["entities"]) => createStarMadeBlueprintLodScene({ ...source, entities });
    expect(() => build([{ id: "", transform: identity }])).toThrow(/id/);
    expect(() => build([source.entities[0], source.entities[0]])).toThrow(/Duplicate/);
    expect(() => build([{ id: "ship", transform: [1, 2] }])).toThrow(/transform/);
    expect(() => build([{ id: "ship", transform: identity.map((value, index) => index === 0 ? NaN : value) }])).toThrow(/transform/);
    expect(() => build([{ id: "ship", parentId: "missing", transform: identity }])).toThrow(/parent/);
    expect(() => build([{ id: "ship", parentId: "ship", transform: identity }])).toThrow(/cycle/);
    expect(() => build([{ id: "ship", parentId: "child", transform: identity }, { id: "child", parentId: "ship", transform: identity }])).toThrow(/cycle/);
  });

  it("rejects malformed mesh payloads before allocating their geometry", () => {
    const source = data(), region = source.regions[0];
    const malformed = [
      { cellSize: 3 }, { cellSize: 2 }, { positions: [0, 1] }, { normals: [] }, { colors: [] }, { emissiveColors: [] },
      { positions: region.mesh.positions.map((value, index) => index === 0 ? Infinity : value) },
      { colors: region.mesh.colors.map((value, index) => index === 0 ? NaN : value) },
      { indices: [0, 1] }, { indices: [0, 1, 10000] }, { indices: [0, 1, -1] }, { indices: [0, 1, 1.5] }
    ];
    for (const patch of malformed) {
      expect(() => createStarMadeBlueprintLodScene({ ...source, regions: [{ ...region, mesh: { ...region.mesh, ...patch } as typeof region.mesh }] })).toThrow(/mesh/);
    }
    expect(() => createStarMadeBlueprintLodScene({ ...source, regions: [{ ...region, cellSize: 3 as 1 }] })).toThrow(/cellSize/);
  });
});
