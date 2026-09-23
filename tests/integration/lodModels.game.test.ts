import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createStarMadeLodModelRegistry, parseStarMadeLodModelDefinitions, resolveStarMadeLodModelReference } from "../../src";
import { requireStarMadeDirectory } from "../helpers/gameInstallation";
it("requires the reference WhiteLightRod LOD entry and its actual scene asset", () => {
  const dir = requireStarMadeDirectory();
  const xml = readFileSync(join(dir, "data/config/mainConfig.xml"), "utf8");
  const registry = createStarMadeLodModelRegistry(parseStarMadeLodModelDefinitions(xml));
  const ref = resolveStarMadeLodModelReference("WhiteLightRod", registry, join(dir, "data/models/lod"));
  expect(ref, "Missing reference LOD is a failure, not a skipped assertion").not.toBeNull();
  expect(existsSync(ref!.sceneUrl)).toBe(true);
});
