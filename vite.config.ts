import { readShaderCorpus } from './scripts/shader-corpus.mjs';
import { functionalBlockFromElementInfo, STARMADE_FUNCTIONAL_SOURCE } from "./src/inspection/functional.js";
import { inspectionBlueprintEntities } from "./src/inspection/blueprint.js";
import { defineConfig, type Logger } from "vite";
import { createReadStream, existsSync } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { ServerResponse } from "node:http";
import { isAbsolute, normalize, relative, resolve } from "node:path";

import { resolveBlockTextureAsset } from "./scripts/block-texture-asset.mjs";

const starmadeRoot = process.env.STARMADE_DIR ? resolve(process.env.STARMADE_DIR) : "";
const blockTextureRoot = resolve(starmadeRoot, "data/textures/block");
const customBlockTextureRoot = resolve(starmadeRoot, "customBlockTextures");
const customBlockTextureTemplateRoot = resolve(starmadeRoot, "data/textures/customTemplates");
const configRoot = resolve(starmadeRoot, "data/config");
const lodModelRoot = resolve(starmadeRoot, "data/models/lod");
const isanthBlueprintRoot = resolve(
  starmadeRoot,
  "blueprints/Isanth Type-PNR-25-B"
);

export default defineConfig({
  root: "examples/visual-test",
  plugins: [
    {
      name: "starmade-dev-assets",
      configureServer(server) {
        if (!starmadeRoot || !existsSync(resolve(starmadeRoot, "data/config/BlockConfig.xml"))) {
          throw new Error("Set STARMADE_DIR to a real StarMade installation (data/config/BlockConfig.xml is required)");
        }
        server.middlewares.use('/starmade-assets/shaders.json', (_req, res) => {
          try { res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(readShaderCorpus())); }
          catch (error) { res.statusCode = 500; res.end(String(error)); }
        });
        server.middlewares.use('/starmade-assets/display', (req, res, next) => {
          const assets: Record<string, [string, string]> = {
            '/Monda-Regular.ttf': ['data/font/Monda-Regular.ttf', 'font/ttf'],
            '/screen-gui-blue.png': ['data/image-resource/screen-gui-blue.png', 'image/png']
          };
          const asset = assets[req.url ?? ''];
          if (!asset) { next(); return; }
          res.setHeader('Content-Type', asset[1]);
          const stream = createReadStream(resolve(starmadeRoot, asset[0]));
          stream.on('error', next); stream.pipe(res);
        });
        server.middlewares.use("/starmade-assets/textures/block", (req, res, next) => {
          if (!req.url) {
            next();
            return;
          }

          const requestPath = decodeURIComponent(req.url.split("?")[0] ?? "");
          const asset = resolveBlockTextureAsset(blockTextureRoot, requestPath);
          if (!asset) {
            next();
            return;
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "image/png");
          res.setHeader("Cache-Control", "no-cache");

          if (asset.encoding === "png") {
            streamZipEntryAsPng(asset.path, res, next, server.config.logger);
            return;
          }

          streamTgaZipEntryAsPng(asset.path, res, next, server.config.logger);
        });

        server.middlewares.use("/starmade-assets/custom-block-textures", (req, res, next) => {
          if (!req.url) {
            next();
            return;
          }

          const requestPath = decodeURIComponent(req.url.split("?")[0] ?? "");
          const assetPath = normalize(resolve(customBlockTextureRoot, `.${requestPath}`));
          const templatePath = normalize(resolve(customBlockTextureTemplateRoot, `.${requestPath}`));
          const resolvedPath =
            isPathInside(customBlockTextureRoot, assetPath) && existsSync(assetPath)
              ? assetPath
              : isPathInside(customBlockTextureTemplateRoot, templatePath) && existsSync(templatePath)
                ? templatePath
                : undefined;

          if (!resolvedPath || !resolvedPath.endsWith(".png")) {
            next();
            return;
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "image/png");
          res.setHeader("Cache-Control", "no-cache");
          createReadStream(resolvedPath).pipe(res);
        });

        server.middlewares.use("/starmade-assets/config", (req, res, next) => {
          if (!req.url) {
            next();
            return;
          }

          const requestPath = decodeURIComponent(req.url.split("?")[0] ?? "");

          if (requestPath === "/block-config.json") {
            void sendStarMadeBlockConfigJson(res, next);
            return;
          }

          const assetPath = normalize(resolve(configRoot, `.${requestPath}`));
          const isInsideRoot = isPathInside(configRoot, assetPath);

          if (!isInsideRoot || !assetPath.endsWith(".xml") || !existsSync(assetPath)) {
            next();
            return;
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/xml; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          createReadStream(assetPath).pipe(res);
        });

        server.middlewares.use("/starmade-assets/blueprints", (req, res, next) => {
          if (!req.url) {
            next();
            return;
          }

          const requestPath = decodeURIComponent(req.url.split("?")[0] ?? "");

          if (requestPath !== "/isanth-smd3.json") {
            next();
            return;
          }

          void sendIsanthSmd3Json(res, next);
        });

        server.middlewares.use("/starmade-assets/models/lod", (req, res, next) => {
          if (!req.url) {
            next();
            return;
          }

          const requestPath = decodeURIComponent(req.url.split("?")[0] ?? "");
          const assetPath = normalize(resolve(lodModelRoot, `.${requestPath}`));
          const isInsideRoot = isPathInside(lodModelRoot, assetPath);
          const isAllowedAsset =
            assetPath.endsWith(".scene") ||
            assetPath.endsWith(".material") ||
            assetPath.endsWith(".mesh.xml") ||
            assetPath.endsWith(".png") ||
            assetPath.endsWith(".jpg") ||
            assetPath.endsWith(".jpeg");

          if (!isInsideRoot || !isAllowedAsset || !existsSync(assetPath)) {
            next();
            return;
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", contentTypeForStarMadeAsset(assetPath));
          res.setHeader("Cache-Control", "no-cache");
          createReadStream(assetPath).pipe(res);
        });
      }
    }
  ],
  server: {
    host: "127.0.0.1",
    port: 8001,
    strictPort: true,
    allowedHosts: ["initsysrev.net", "51.77.212.16", "localhost", "127.0.0.1"]
  }
});

async function sendStarMadeBlockConfigJson(
  res: { statusCode: number; setHeader(name: string, value: string): void; end(data: string): void },
  next: (error?: unknown) => void
): Promise<void> {
  try {
    const { BlockConfig, SMToolConfig } = await import("starmade-decoder");
    const config = SMToolConfig.fromData({ starmadeDir: starmadeRoot, worldDir: "world0" });
    const blockConfig = BlockConfig.load(config);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.end(JSON.stringify({
      source: "StarMade-Decoder BlockElementInfo",
      elementInfo: blockConfig.elementInfo.map(serializeBlockElementInfoForClient),
      functionalSource: STARMADE_FUNCTIONAL_SOURCE,
      functional: blockConfig.elementInfo.map(functionalBlockFromElementInfo)
    }));
  } catch (error) {
    next(error);
  }
}

interface StarMadeDecoderBlockElementInfo {
  readonly block: StarMadeDecoderBlockDefinition;
  readonly identity: {
    readonly id: number;
    readonly typeName: string;
    readonly name: string;
  };
  readonly render: {
    readonly style: { readonly id: number };
    readonly textureIds: readonly number[];
    readonly transparent: boolean;
    readonly animated: boolean;
    readonly individualSides: number;
    readonly sideTexturesPointToOrientation: boolean;
    readonly hasActivationTexture: boolean;
    readonly extendedTexture: boolean;
    readonly drawOnlyInBuildMode: boolean;
    readonly resourceInjection: { readonly index: number; readonly key?: string };
    readonly lightSource: boolean;
    readonly lightSourceColor: readonly number[];
    readonly lodShape: string;
    readonly lodShapeActive: string;
    readonly lodShapeStyle: number;
  };
  readonly logic: {
    readonly canActivate: boolean;
    readonly drawLogicConnection: boolean;
    readonly signal: boolean;
    readonly signaledByRail: boolean;
    readonly button: boolean;
  };
  readonly collision: {
    readonly lodCollisionPhysical: boolean;
  };
  readonly chamber: {
    readonly specific: boolean;
  };
}

interface StarMadeDecoderBlockDefinition {
  readonly id: number;
  readonly name: string;
  readonly hp: number;
  readonly slab: number;
  readonly slabIds: readonly number[];
  readonly xmlTypeName: string;
}

function serializeBlockElementInfoForClient(info: StarMadeDecoderBlockElementInfo): StarMadeDecoderBlockElementInfo {
  return {
    block: {
      id: info.block.id,
      name: info.block.name,
      hp: info.block.hp,
      slab: info.block.slab,
      slabIds: info.block.slabIds,
      xmlTypeName: info.block.xmlTypeName
    },
    identity: {
      id: info.identity.id,
      typeName: info.identity.typeName,
      name: info.identity.name
    },
    render: {
      style: { id: info.render.style.id },
      textureIds: info.render.textureIds,
      transparent: info.render.transparent,
      animated: info.render.animated,
      individualSides: info.render.individualSides,
      sideTexturesPointToOrientation: info.render.sideTexturesPointToOrientation,
      hasActivationTexture: info.render.hasActivationTexture,
      extendedTexture: info.render.extendedTexture,
      drawOnlyInBuildMode: info.render.drawOnlyInBuildMode,
      resourceInjection: {
        index: info.render.resourceInjection.index,
        key: info.render.resourceInjection.key
      },
      lightSource: info.render.lightSource,
      lightSourceColor: info.render.lightSourceColor,
      lodShape: info.render.lodShape,
      lodShapeActive: info.render.lodShapeActive,
      lodShapeStyle: info.render.lodShapeStyle
    },
    logic: {
      canActivate: info.logic.canActivate,
      drawLogicConnection: info.logic.drawLogicConnection,
      signal: info.logic.signal,
      signaledByRail: info.logic.signaledByRail,
      button: info.logic.button
    },
    collision: {
      lodCollisionPhysical: info.collision.lodCollisionPhysical
    },
    chamber: {
      specific: info.chamber.specific
    }
  };
}

async function sendIsanthSmd3Json(
  res: { statusCode: number; setHeader(name: string, value: string): void; end(data: string): void },
  next: (error?: unknown) => void
): Promise<void> {
  try {
    const { parseBlueprintFolder, registerAllFactories } = await import("starmade-decoder");
    // Blueprint metadata contains SERIALIZABLE tags, including docked-entity transforms.
    registerAllFactories();
    const blueprint = parseBlueprintFolder(isanthBlueprintRoot);
    const entities = inspectionBlueprintEntities(blueprint.root, "isanth/0");
    const root = entities[0];

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.end(
      JSON.stringify({
        headerVersion: root?.headerVersion ?? 0,
        usedSlots: entities.reduce((total, entity) => total + entity.usedSlots, 0),
        segments: root?.segments ?? [],
        entities
      })
    );
  } catch (error) {
    next(error);
  }
}

function isPathInside(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);

  return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function contentTypeForStarMadeAsset(path: string): string {
  if (path.endsWith(".png")) {
    return "image/png";
  }

  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (path.endsWith(".material")) {
    return "text/plain; charset=utf-8";
  }

  return "application/xml; charset=utf-8";
}

function streamZipEntryAsPng(
  zipPath: string,
  res: ServerResponse,
  next: (error?: unknown) => void,
  logger: Logger
): void {
  const unzip = spawn("unzip", ["-p", zipPath], { stdio: ["ignore", "pipe", "pipe"] });

  streamChildProcessToResponse(unzip, res, next, logger, `unzip ${zipPath}`);
}

function streamTgaZipEntryAsPng(
  zipPath: string,
  res: ServerResponse,
  next: (error?: unknown) => void,
  logger: Logger
): void {
  const unzip = spawn("unzip", ["-p", zipPath], { stdio: ["ignore", "pipe", "pipe"] });
  const convert = spawn("magick", ["tga:-", "png32:-"], { stdio: ["pipe", "pipe", "pipe"] });
  let done = false;

  const cleanup = (): void => {
    if (done) {
      return;
    }

    done = true;
    killProcess(unzip);
    killProcess(convert);
  };
  const fail = (error: unknown): void => {
    if (done) {
      return;
    }

    done = true;
    res.off("close", cleanup);
    killProcess(unzip);
    killProcess(convert);
    next(error);
  };

  res.on("close", cleanup);
  unzip.stderr.on("data", (chunk) => logger.warn(String(chunk)));
  convert.stderr.on("data", (chunk) => logger.warn(String(chunk)));
  unzip.on("error", fail);
  convert.on("error", fail);
  unzip.stdout.on("error", fail);
  convert.stdout.on("error", fail);
  convert.stdin.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") {
      fail(error);
    }
  });
  unzip.on("close", (code, signal) => {
    if (done) {
      return;
    }

    if (code !== 0) {
      fail(new Error(`unzip ${zipPath} exited with ${formatProcessExit(code, signal)}`));
      return;
    }

    if (!convert.stdin.destroyed) {
      convert.stdin.end();
    }
  });
  convert.on("close", (code, signal) => {
    if (done) {
      return;
    }

    done = true;
    res.off("close", cleanup);

    if (code !== 0) {
      next(new Error(`magick tga:- png32:- exited with ${formatProcessExit(code, signal)}`));
      return;
    }

    if (!res.writableEnded) {
      res.end();
    }
  });

  unzip.stdout.pipe(convert.stdin);
  convert.stdout.pipe(res, { end: false });
}

function streamChildProcessToResponse(
  child: ChildProcessWithoutNullStreams,
  res: ServerResponse,
  next: (error?: unknown) => void,
  logger: Logger,
  label: string
): void {
  let done = false;
  const cleanup = (): void => {
    if (!done) {
      done = true;
      killProcess(child);
    }
  };
  const fail = (error: unknown): void => {
    if (done) {
      return;
    }

    done = true;
    res.off("close", cleanup);
    killProcess(child);
    next(error);
  };

  res.on("close", cleanup);
  child.stderr.on("data", (chunk) => logger.warn(String(chunk)));
  child.on("error", fail);
  child.stdout.on("error", fail);
  child.on("close", (code, signal) => {
    if (done) {
      return;
    }

    done = true;
    res.off("close", cleanup);

    if (code !== 0) {
      next(new Error(`${label} exited with ${formatProcessExit(code, signal)}`));
      return;
    }

    if (!res.writableEnded) {
      res.end();
    }
  });
  child.stdout.pipe(res, { end: false });
}

function killProcess(child: ChildProcessWithoutNullStreams): void {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill();
  }
}

function formatProcessExit(code: number | null, signal: NodeJS.Signals | null): string {
  return code === null ? `signal ${signal ?? "unknown"}` : `code ${code}`;
}
