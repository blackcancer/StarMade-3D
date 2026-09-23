import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { requireStarMadeDirectory } from "../helpers/gameInstallation";

it("serves the complete installed Isanth blueprint, including SERIALIZABLE metadata and its attached entity", async () => {
  requireStarMadeDirectory();
  const server = await createServer({
    configFile: resolve("vite.config.ts"),
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, watch: null }
  });
  try {
    await server.listen();
    const { port } = server.httpServer!.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/starmade-assets/blueprints/isanth-smd3.json`);
    expect(response.status, await response.clone().text()).toBe(200);
    const data = await response.json() as {
      entities: { name: string; segments: { blockCount: number; lastChanged: string }[] }[];
      segments: unknown[];
    };
    expect(data.entities.map(entity => entity.name)).toEqual(["root", "ATTACHED_0"]);
    expect(data.entities.map(entity => entity.segments.reduce((total, segment) => total + segment.blockCount, 0)))
      .toEqual([3167, 33]);
    expect(data.segments).toHaveLength(2);
    for (const entity of data.entities) {
      for (const segment of entity.segments) expect(segment.lastChanged).toMatch(/^\d+$/);
    }
  } finally {
    await server.close();
  }
}, 20_000);
