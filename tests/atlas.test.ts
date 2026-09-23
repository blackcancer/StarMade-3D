import { describe, expect, it } from "vitest";
import {
  STARMADE_CUBE_UV_INSET,
  createStarMadeCubeAtlasLayout,
  tileIdToStarMadeLayer,
  tileIdToStarMadeLocalTile,
  tileIdToUvRect
} from "../src/starmade/atlas";

describe("tileIdToUvRect", () => {
  it("maps a tile id to normalized UV bounds", () => {
    expect(tileIdToUvRect(17, { columns: 16, rows: 16 })).toEqual({
      u0: 1 / 16,
      v0: 1 / 16,
      u1: 2 / 16,
      v1: 2 / 16
    });
  });

  it("rejects tile ids outside the atlas", () => {
    expect(() => tileIdToUvRect(256, { columns: 16, rows: 16 })).toThrow(/outside/);
  });

  it("can inset UV bounds to avoid atlas bleeding", () => {
    expect(tileIdToUvRect(17, { columns: 16, rows: 16, uvInset: 0.001 })).toEqual({
      u0: 1 / 16 + 0.001,
      v0: 1 / 16 + 0.001,
      u1: 2 / 16 - 0.001,
      v1: 2 / 16 - 0.001
    });
  });

  it("maps StarMade texture ids to cube texture sheets", () => {
    const layout = createStarMadeCubeAtlasLayout(64);

    expect(layout.uvInset).toBe(STARMADE_CUBE_UV_INSET);
    expect(tileIdToStarMadeLayer(33, layout).name).toBe("t000");
    expect(tileIdToStarMadeLayer(300, layout).name).toBe("t001");
    expect(tileIdToStarMadeLayer(800, layout).name).toBe("t003");
    expect(tileIdToStarMadeLayer(1800, layout).name).toBe("custom");
    expect(tileIdToStarMadeLocalTile(300, layout)).toBe(44);
  });
});
