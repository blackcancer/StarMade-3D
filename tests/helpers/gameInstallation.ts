import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Integration tests must fail explicitly when their real game input is missing. */
export function requireStarMadeDirectory(): string {
  const directory = process.env.STARMADE_DIR;
  if (!directory || !existsSync(directory)) {
    throw new Error("Game integration requires STARMADE_DIR pointing to an existing StarMade installation");
  }
  return resolve(directory);
}
