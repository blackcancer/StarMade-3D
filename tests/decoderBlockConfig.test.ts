import { describe, expect, it } from "vitest";
import { blockDefinitionFromElementInfo, type DecoderBlockElementInfoLike } from "../src";

// Handwritten structural fixture, not claimed to be a decoded game installation.
function fixture(): DecoderBlockElementInfoLike {
  return {
    block: {id: 10, name: "raw", hp: 350, slab: 2, slabIds: [10, 11, 12], xmlTypeName: "GREY_BASIC_HULL_HALF"},
    identity: {id: 25, typeName: "HULL_HALF", name: "enriched"},
    render: {style: {id: 6}, textureIds: [0, 256, 512, 768, 1024, 1280], transparent: true,
      animated: true, individualSides: 6, sideTexturesPointToOrientation: true,
      hasActivationTexture: true, extendedTexture: true, drawOnlyInBuildMode: true,
      resourceInjection: {index: 17, key: "flora"}, lightSource: true, lightSourceColor: [0.1, 0.2, 0.3, 1],
      lodShape: "Base", lodShapeActive: "Active", lodShapeStyle: 1},
    logic: {canActivate: true, drawLogicConnection: true, signal: true, signaledByRail: true, button: true},
    collision: {lodCollisionPhysical: false}, chamber: {specific: true}
  };
}
describe("Decoder 2.x enriched metadata adapter", () => {
  it("takes enriched rendering/identity data and preserves raw physical metadata", () => {
    const source = fixture();
    const block = blockDefinitionFromElementInfo(source);
    expect(block).toMatchObject({
      id: 25, name: "enriched", maxHitPointsFull: 350, blockStyle: 6, slab: 2,
      transparent: true, animated: true, individualSides: 6, sideTexturesPointToOrientation: true,
      hasActivationTexture: true, extendedTexture: true, drawOnlyInBuildMode: true,
      resourceInjection: "flora", resourceInjectionIndex: 17, lightSource: true,
      lightSourceColor: [0.1, 0.2, 0.3, 1], lodShape: "Base", lodShapeActive: "Active", lodShapeStyle: 1,
      canActivate: true, drawLogicConnection: true, logicBlock: true, logicSignaledByRail: true,
      logicBlockButton: true, reactorChamberSpecific: true, lodCollisionPhysical: false
    });
    expect(block.textureIds).toEqual(source.render.textureIds);
    expect(block.textureIds).not.toBe(source.render.textureIds);
    expect(block.slabIds).not.toBe(source.block.slabIds);
  });
  it("falls back to raw type name without silently substituting render flags", () => {
    const source = fixture();
    const result = blockDefinitionFromElementInfo({...source,
      block: {...source.block, slab: undefined}, identity: {...source.identity, typeName: ""},
      render: {...source.render, transparent: false, animated: false, lightSource: false}
    });
    expect(result.transparent).toBe(false);
    expect(result.animated).toBe(false);
    expect(result.lightSource).toBe(false);
    expect(result.slab).toBe(0); // Unrecognized suffixes are not guessed as a slab.
  });
});
