#!/usr/bin/env node
import { createConnection } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";

const DEFAULT_CDP_ENDPOINT = "http://127.0.0.1:9222";
const DEFAULT_URL = "http://127.0.0.1:8001/isanth.html";
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_OUTPUT = "artifacts/isanth-webgl-smoke.json";
const STARMADE_EXPECTED_TOTAL_BLOCKS = 3_200;
const STARMADE_EXPECTED_LOD_BLOCKS = 199;
const STARMADE_EXPECTED_SPOT_SOURCES = 45;

async function main(options = parseArgs(process.argv.slice(2))) {
  const startedAt = new Date();
  const started = performance.now();
  const diagnostics = {
    ok: false,
    url: options.url,
    cdpEndpoint: options.cdpEndpoint,
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    elapsedMs: 0,
    readyMs: null,
    checks: [],
    readyState: null,
    canvas: null,
    networkFailures: [],
    ignoredNetworkFailures: [],
    httpErrors: [],
    ignoredHttpErrors: [],
    runtimeExceptions: [],
    ignoredRuntimeExceptions: [],
    logErrors: [],
    ignoredLogErrors: [],
    consoleMessages: [],
    screenshot: null
  };

  let pageTargetId = null;
  let client = null;

  try {
    const target = await createPage(options.cdpEndpoint);
    pageTargetId = target.id;
    client = await CdpClient.connect(target.webSocketDebuggerUrl);
    attachDiagnostics(client, diagnostics);

    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable").catch(() => undefined);
    await client.send("Network.enable");
    await client.send("Page.navigate", { url: options.url });

    const ready = await waitForReadyState(client, options.timeoutMs);
    diagnostics.readyMs = Math.round(performance.now() - started);
    diagnostics.readyState = ready.readyState;
    diagnostics.canvas = ready.canvas;
    diagnostics.screenshot = await capturePageScreenshot(client, options.outputPath).catch((error) => ({
      error: serializeError(error)
    }));

    collectChecks(diagnostics);
  } catch (error) {
    diagnostics.error = serializeError(error);
    addCheck(diagnostics, "smoke script completed", false, "no unhandled error", diagnostics.error.message);
  } finally {
    diagnostics.finishedAt = new Date().toISOString();
    diagnostics.elapsedMs = Math.round(performance.now() - started);

    if (client) {
      await client.send("Page.close").catch(() => undefined);
      client.close();
    }

    if (pageTargetId) {
      await closePage(options.cdpEndpoint, pageTargetId).catch(() => undefined);
    }

    process.exitCode = await completeSmokeDiagnostics(diagnostics, options);
  }
}


function parseArgs(args) {
  const parsed = {
    cdpEndpoint: process.env.STARMADE_CDP_ENDPOINT ?? DEFAULT_CDP_ENDPOINT,
    url: process.env.STARMADE_SMOKE_URL ?? DEFAULT_URL,
    timeoutMs: Number(process.env.STARMADE_SMOKE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    outputPath: process.env.STARMADE_SMOKE_OUTPUT ?? DEFAULT_OUTPUT
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--cdp" && next) {
      parsed.cdpEndpoint = next;
      index++;
    } else if (arg === "--url" && next) {
      parsed.url = next;
      index++;
    } else if (arg === "--timeout-ms" && next) {
      parsed.timeoutMs = Number(next);
      index++;
    } else if (arg === "--out" && next) {
      parsed.outputPath = next;
      index++;
    } else if (arg === "--baseline" && next) {
      parsed.baseline = next;
      index++;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (!Number.isFinite(parsed.timeoutMs) || parsed.timeoutMs <= 0) {
    throw new Error(`Invalid timeout: ${parsed.timeoutMs}`);
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: npm run smoke:isanth -- [options]

Options:
  --cdp <url>          Chrome DevTools HTTP endpoint. Default: ${DEFAULT_CDP_ENDPOINT}
  --url <url>          Visual-test URL. Default: ${DEFAULT_URL}
  --timeout-ms <ms>    Ready-state timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --out <path>         JSON diagnostics artifact. Default: ${DEFAULT_OUTPUT}
  --baseline <path>    Compare against a prior smoke diagnostic; regressions fail.

Environment equivalents:
  STARMADE_CDP_ENDPOINT, STARMADE_SMOKE_URL, STARMADE_SMOKE_TIMEOUT_MS,
  STARMADE_SMOKE_OUTPUT`);
}

async function createPage(cdpEndpoint) {
  const base = cdpEndpoint.replace(/\/+$/, "");
  const aboutBlank = `${base}/json/new?${encodeURIComponent("about:blank")}`;
  let response;

  try {
    response = await fetch(aboutBlank, { method: "PUT" });
  } catch (error) {
    const unavailable = new Error(`CDP endpoint is not reachable at ${cdpEndpoint}`);
    unavailable.code = "CDP_UNAVAILABLE";
    unavailable.cause = error;
    throw unavailable;
  }

  if (!response.ok) {
    response = await fetch(aboutBlank);
  }

  if (!response.ok) {
    throw new Error(`Failed to create CDP page: HTTP ${response.status} ${response.statusText}`);
  }

  const target = await response.json();

  if (!target.webSocketDebuggerUrl) {
    throw new Error("CDP target did not include webSocketDebuggerUrl");
  }

  return target;
}

async function closePage(cdpEndpoint, targetId) {
  const base = cdpEndpoint.replace(/\/+$/, "");
  await fetch(`${base}/json/close/${targetId}`);
}

function attachDiagnostics(cdp, output) {
  cdp.on("Network.loadingFailed", (event) => {
    const failure = {
      requestId: event.requestId,
      errorText: event.errorText,
      canceled: event.canceled === true,
      type: event.type ?? null,
      timestamp: event.timestamp ?? null
    };

    if (failure.canceled && failure.errorText === "net::ERR_ABORTED") {
      output.ignoredNetworkFailures.push(failure);
    } else {
      output.networkFailures.push(failure);
    }
  });

  cdp.on("Network.responseReceived", (event) => {
    const response = event.response ?? {};
    const status = response.status ?? 0;

    if (status < 400) {
      return;
    }

    const httpError = {
      url: response.url ?? null,
      status,
      statusText: response.statusText ?? "",
      type: event.type ?? null
    };

    if (isIgnoredHttpError(httpError)) {
      output.ignoredHttpErrors.push(httpError);
    } else {
      output.httpErrors.push(httpError);
    }
  });

  cdp.on("Runtime.consoleAPICalled", (event) => {
    output.consoleMessages.push({
      type: event.type,
      text: (event.args ?? []).map((arg) => arg.value ?? arg.description ?? "").join(" "),
      url: event.stackTrace?.callFrames?.[0]?.url ?? null
    });
  });

  cdp.on("Runtime.exceptionThrown", (event) => {
    const details = event.exceptionDetails ?? {};
    const exception = {
      text: details.text ?? "",
      url: details.url ?? "",
      lineNumber: details.lineNumber ?? null,
      columnNumber: details.columnNumber ?? null,
      description: details.exception?.description ?? details.exception?.value ?? ""
    };

    if (isExtensionUrl(exception.url)) {
      output.ignoredRuntimeExceptions.push(exception);
    } else {
      output.runtimeExceptions.push(exception);
    }
  });

  cdp.on("Log.entryAdded", (event) => {
    const entry = event.entry ?? {};

    if (entry.level !== "error") {
      return;
    }

    const error = {
      source: entry.source ?? null,
      text: entry.text ?? "",
      url: entry.url ?? "",
      lineNumber: entry.lineNumber ?? null
    };

    if (isExtensionUrl(error.url) || isIgnoredLogError(error)) {
      output.ignoredLogErrors.push(error);
    } else {
      output.logErrors.push(error);
    }
  });
}

function isIgnoredHttpError(error) {
  return error.status === 404 && typeof error.url === "string" && error.url.endsWith("/favicon.ico");
}

function isIgnoredLogError(error) {
  return (
    error.source === "network" &&
    typeof error.url === "string" &&
    error.url.endsWith("/favicon.ico") &&
    error.text.includes("404")
  );
}

function isExtensionUrl(url) {
  return typeof url === "string" && url.startsWith("chrome-extension://");
}

async function waitForReadyState(cdp, timeoutMs) {
  const timeoutAt = performance.now() + timeoutMs;
  let lastResult = null;
  let lastConsoleLogAt = 0;

  while (performance.now() < timeoutAt) {
    const result = await evaluatePageState(cdp);
    lastResult = result;

    if (result.readyState) {
      await emitPageConsoleSnapshot(cdp, "ready", result).catch(() => undefined);
      return result;
    }

    if (performance.now() - lastConsoleLogAt > 1_000) {
      lastConsoleLogAt = performance.now();
      await emitPageConsoleSnapshot(cdp, "waiting", result).catch(() => undefined);
    }

    await sleep(250);
  }

  const error = new Error(`Timed out waiting for __STARMADE_3D_READY__ after ${timeoutMs} ms`);
  error.lastResult = lastResult;
  throw error;
}

async function evaluatePageState(cdp) {
  const evaluation = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const readyState = window.__STARMADE_3D_READY__ ?? null;
      const canvas = document.querySelector("canvas");
      const canvasSummary = {
        present: Boolean(canvas),
        width: canvas?.width ?? 0,
        height: canvas?.height ?? 0,
        clientWidth: canvas?.clientWidth ?? 0,
        clientHeight: canvas?.clientHeight ?? 0,
        sampleCount: 0,
        nonBlackSamples: 0,
        nonBackgroundSamples: 0,
        maxChannel: 0,
        firstNonBackgroundSample: null,
        webglError: null
      };

      if (canvas && canvas.width > 0 && canvas.height > 0) {
        const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");

        if (gl) {
          const background = [15, 17, 23];
          const pixel = new Uint8Array(4);
          const steps = 16;

          for (let yi = 0; yi <= steps; yi++) {
            const y = Math.min(canvas.height - 1, Math.max(0, Math.round((canvas.height - 1) * yi / steps)));

            for (let xi = 0; xi <= steps; xi++) {
              const x = Math.min(canvas.width - 1, Math.max(0, Math.round((canvas.width - 1) * xi / steps)));
              gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
              canvasSummary.sampleCount++;
              canvasSummary.maxChannel = Math.max(canvasSummary.maxChannel, pixel[0], pixel[1], pixel[2], pixel[3]);

              if (pixel[0] > 3 || pixel[1] > 3 || pixel[2] > 3) {
                canvasSummary.nonBlackSamples++;
              }

              const backgroundDistance =
                Math.abs(pixel[0] - background[0]) +
                Math.abs(pixel[1] - background[1]) +
                Math.abs(pixel[2] - background[2]);

              if (backgroundDistance > 10 && pixel[3] > 0) {
                canvasSummary.nonBackgroundSamples++;
                canvasSummary.firstNonBackgroundSample ??= { x, y, rgba: Array.from(pixel) };
              }
            }
          }

          canvasSummary.webglError = gl.getError();
        }
      }

      return {
        href: location.href,
        title: document.title,
        performanceNow: performance.now(),
        readyState,
        canvas: canvasSummary
      };
    })()`,
    returnByValue: true,
    awaitPromise: true
  });

  if (evaluation.exceptionDetails) {
    throw new Error(evaluation.exceptionDetails.text ?? "Runtime.evaluate failed");
  }

  return evaluation.result.value;
}

async function emitPageConsoleSnapshot(cdp, phase, state) {
  const readyState = state.readyState ?? null;
  const canvas = state.canvas ?? null;
  const payload = {
    phase,
    performanceNow: Math.round(state.performanceNow ?? 0),
    ready: Boolean(readyState),
    scene: readyState?.scene ?? null,
    totalBlocks: readyState?.totalBlocks ?? null,
    lodBlocks: readyState?.lodBlocks ?? null,
    spotSourceCount: readyState?.spotSourceCount ?? null,
    segmentMeshes: readyState?.segmentMeshes ?? null,
    lodMeshes: readyState?.lodMeshes ?? null,
    canvas: canvas
      ? {
          present: canvas.present,
          width: canvas.width,
          height: canvas.height,
          nonBlackSamples: canvas.nonBlackSamples,
          nonBackgroundSamples: canvas.nonBackgroundSamples,
          webglError: canvas.webglError
        }
      : null
  };

  await cdp.send("Runtime.evaluate", {
    expression: `console.log("[StarMade-3D smoke]", ${JSON.stringify(payload)})`,
    awaitPromise: false
  });
}

async function capturePageScreenshot(cdp, outputPath) {
  const pngPath = outputPath.replace(/\.json$/i, ".png");
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false
  });

  if (typeof result.data !== "string") {
    throw new Error("CDP screenshot did not return base64 data");
  }

  const png = Buffer.from(result.data, "base64");
  await writeFile(pngPath, png);
  return {
    path: pngPath,
    byteLength: png.byteLength,
    ...samplePngPixels(png)
  };
}

function samplePngPixels(png) {
  const decoded = decodePng(png);
  const background = [15, 17, 23];
  const steps = 16;
  const summary = {
    width: decoded.width,
    height: decoded.height,
    sampleCount: 0,
    nonBlackSamples: 0,
    nonBackgroundSamples: 0,
    maxChannel: 0,
    firstNonBackgroundSample: null
  };

  for (let yi = 0; yi <= steps; yi++) {
    const y = Math.min(decoded.height - 1, Math.max(0, Math.round((decoded.height - 1) * yi / steps)));

    for (let xi = 0; xi <= steps; xi++) {
      const x = Math.min(decoded.width - 1, Math.max(0, Math.round((decoded.width - 1) * xi / steps)));
      const pixel = decoded.pixel(x, y);

      summary.sampleCount++;
      summary.maxChannel = Math.max(summary.maxChannel, pixel[0], pixel[1], pixel[2], pixel[3]);

      if (pixel[0] > 3 || pixel[1] > 3 || pixel[2] > 3) {
        summary.nonBlackSamples++;
      }

      const backgroundDistance =
        Math.abs(pixel[0] - background[0]) +
        Math.abs(pixel[1] - background[1]) +
        Math.abs(pixel[2] - background[2]);

      if (backgroundDistance > 10 && pixel[3] > 0) {
        summary.nonBackgroundSamples++;
        summary.firstNonBackgroundSample ??= { x, y, rgba: pixel };
      }
    }
  }

  return summary;
}

function decodePng(png) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((byte, index) => png[index] === byte)) {
    throw new Error("Screenshot is not a PNG");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = png.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];

      if (data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
        throw new Error("Unsupported PNG compression, filter, or interlace method");
      }
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG color format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const bytesPerPixel = channels;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * 4);
  let readOffset = 0;
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const filter = inflated[readOffset++];
    const raw = Buffer.from(inflated.subarray(readOffset, readOffset + stride));
    readOffset += stride;
    const row = unfilterPngRow(filter, raw, previous, bytesPerPixel);

    for (let x = 0; x < width; x++) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      pixels[target] = row[source];
      pixels[target + 1] = row[source + 1];
      pixels[target + 2] = row[source + 2];
      pixels[target + 3] = channels === 4 ? row[source + 3] : 255;
    }

    previous = row;
  }

  return {
    width,
    height,
    pixel(x, y) {
      const index = (y * width + x) * 4;
      return [
        pixels[index],
        pixels[index + 1],
        pixels[index + 2],
        pixels[index + 3]
      ];
    }
  };
}

function unfilterPngRow(filter, raw, previous, bytesPerPixel) {
  const row = Buffer.alloc(raw.length);

  for (let index = 0; index < raw.length; index++) {
    const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
    const up = previous[index] ?? 0;
    const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] ?? 0 : 0;

    if (filter === 0) {
      row[index] = raw[index];
    } else if (filter === 1) {
      row[index] = (raw[index] + left) & 255;
    } else if (filter === 2) {
      row[index] = (raw[index] + up) & 255;
    } else if (filter === 3) {
      row[index] = (raw[index] + Math.floor((left + up) / 2)) & 255;
    } else if (filter === 4) {
      row[index] = (raw[index] + paethPredictor(left, up, upLeft)) & 255;
    } else {
      throw new Error(`Unsupported PNG row filter: ${filter}`);
    }
  }

  return row;
}

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }

  return upDistance <= upLeftDistance ? up : upLeft;
}

function collectChecks(output) {
  const state = output.readyState;
  const canvas = output.canvas;
  const screenshot = output.screenshot;
  const renderedNonBlackSamples = Math.max(canvas?.nonBlackSamples ?? 0, screenshot?.nonBlackSamples ?? 0);
  const renderedNonBackgroundSamples = Math.max(
    canvas?.nonBackgroundSamples ?? 0,
    screenshot?.nonBackgroundSamples ?? 0
  );

  addCheck(output, "ready state published", Boolean(state), true, Boolean(state));
  addCheck(output, "scene id", state?.scene === "isanth-smd3", "isanth-smd3", state?.scene);
  addCheck(output, "expected Isanth block count", state?.totalBlocks === STARMADE_EXPECTED_TOTAL_BLOCKS, STARMADE_EXPECTED_TOTAL_BLOCKS, state?.totalBlocks);
  addCheck(output, "expected Isanth LOD count", state?.lodBlocks === STARMADE_EXPECTED_LOD_BLOCKS, STARMADE_EXPECTED_LOD_BLOCKS, state?.lodBlocks);
  addCheck(output, "no missing LOD models", Array.isArray(state?.missingLods) && state.missingLods.length === 0, [], state?.missingLods);
  addCheck(output, "expected spot sources", state?.spotSourceCount === STARMADE_EXPECTED_SPOT_SOURCES, STARMADE_EXPECTED_SPOT_SOURCES, state?.spotSourceCount);
  addCheck(output, "P1 diagnostics published", Boolean(state?.p1), true, Boolean(state?.p1));
  addCheck(output, "P1 BlockConfig mapped", (state?.p1?.mappedBlockDefinitions ?? 0) > 1000 && state?.p1?.mappedBlockDefinitions === state?.p1?.blockConfigBlocks, "> 1000 and mapped == source", {
    mapped: state?.p1?.mappedBlockDefinitions ?? null,
    source: state?.p1?.blockConfigBlocks ?? null
  });
  addCheck(output, "P1 texture ids inside loaded atlas", Array.isArray(state?.p1?.invalidTextureIds) && state.p1.invalidTextureIds.length === 0, [], state?.p1?.invalidTextureIds ?? null);
  addCheck(output, "P1 XML resource metadata loaded", (state?.p1?.resourceInjectionBlocks ?? 0) > 0, "> 0", state?.p1?.resourceInjectionBlocks ?? null);
  // CubeMeshBufferContainer uses info.isAnimated() directly, including Ship Core.
  addCheck(output, "P1 texture animation matches native Animated", state?.p1?.rawAnimatedBlocks === state?.p1?.textureAnimatedBlocks && (state?.p1?.textureAnimatedBlocks ?? 0) > 0, "rawAnimated == textureAnimated > 0", {
    rawAnimated: state?.p1?.rawAnimatedBlocks ?? null,
    textureAnimated: state?.p1?.textureAnimatedBlocks ?? null
  });
  addCheck(output, "P1 Ship Core follows native Animated", hasSceneBlock(state?.p1?.sceneTextureAnimatedBlocks, 1) && !hasSceneBlock(state?.p1?.sceneStaticAnimatedBlocks, 1), "Ship Core animated and absent from static list", state?.p1?.sceneTextureAnimatedBlocks ?? null);
  addCheck(output, "shadow pipeline enabled", state?.shadow?.enabled === true, true, state?.shadow?.enabled);
  addCheck(output, "shadow split count", (state?.shadow?.splits ?? 0) >= 1, ">= 1", state?.shadow?.splits);
  addCheck(output, "shadow caster meshes", (state?.shadow?.casterMeshCount ?? 0) > 0, "> 0", state?.shadow?.casterMeshCount);
  const shadowFd = state?.shadow?.farDistances;
  addCheck(output, "shadow farDistances valid", !shadowFd || (shadowFd[0] > 0 && shadowFd[0] <= 1), true, shadowFd ? shadowFd[0] : null);
  addCheck(output, "segment meshes present", (state?.segmentMeshes ?? 0) > 0, "> 0", state?.segmentMeshes);
  addCheck(output, "LOD meshes present", (state?.lodMeshes ?? 0) > 0, "> 0", state?.lodMeshes);
  addCheck(output, "canvas present", canvas?.present === true, true, canvas?.present);
  addCheck(output, "canvas has pixels", (canvas?.width ?? 0) > 0 && (canvas?.height ?? 0) > 0, "> 0 x > 0", `${canvas?.width ?? 0} x ${canvas?.height ?? 0}`);
  addCheck(output, "render output non-black", renderedNonBlackSamples > 0, "> 0 samples", {
    canvas: canvas?.nonBlackSamples ?? 0,
    screenshot: screenshot?.nonBlackSamples ?? 0
  });
  addCheck(output, "render output contains geometry", renderedNonBackgroundSamples > 0, "> 0 samples", {
    canvas: canvas?.nonBackgroundSamples ?? 0,
    screenshot: screenshot?.nonBackgroundSamples ?? 0
  });
  addCheck(output, "WebGL error", canvas?.webglError === 0, 0, canvas?.webglError);
  addCheck(output, "network failures", output.networkFailures.length === 0, 0, output.networkFailures.length);
  addCheck(output, "HTTP errors", output.httpErrors.length === 0, 0, output.httpErrors.length);
  addCheck(output, "runtime exceptions", output.runtimeExceptions.length === 0, 0, output.runtimeExceptions.length);
  addCheck(output, "log errors", output.logErrors.length === 0, 0, output.logErrors.length);
}

function addCheck(output, name, ok, expected, actual) {
  output.checks.push({ name, ok, expected, actual });
}

function hasSceneBlock(blocks, id) {
  return Array.isArray(blocks) && blocks.some((block) => block?.id === id && (block.count ?? 0) > 0);
}


async function compareBaseline(current, baselinePath) {
  let baseline;
  try {
    baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)
      || !Number.isFinite(baseline.readyMs) || baseline.readyMs <= 0
      || !baseline.readyState || typeof baseline.readyState !== 'object' || Array.isArray(baseline.readyState)
      || !Array.isArray(baseline.checks) || baseline.checks.length === 0
      || baseline.checks.some(check => !check || typeof check.ok !== 'boolean')) {
      throw new Error('Malformed smoke baseline: expected positive readyMs, readyState and nonempty boolean checks');
    }
    for (const key of ['totalBlocks', 'lodBlocks', 'spotSourceCount']) {
      if (!Number.isSafeInteger(baseline.readyState[key]) || baseline.readyState[key] < 0) {
        throw new Error(`Malformed smoke baseline: readyState.${key} must be a nonnegative integer`);
      }
    }
  } catch (error) {
    return { path: baselinePath, ok: false, regressions: [], error: serializeError(error) };
  }
  const regressions = [];
  const rs = current.readyState ?? {};
  const bs = baseline.readyState;
  for (const key of ['totalBlocks', 'lodBlocks', 'spotSourceCount']) {
    if (!Number.isSafeInteger(rs[key]) || rs[key] < 0) {
      regressions.push(`${key}: current value is missing or invalid`);
    } else if (rs[key] < bs[key]) {
      regressions.push(key + ': was ' + String(bs[key]) + ', now ' + String(rs[key]));
    }
  }
  if (!Number.isFinite(current.readyMs) || current.readyMs <= 0) {
    regressions.push('readyMs: current value is missing or invalid');
  } else if (current.readyMs > baseline.readyMs * 1.5) {
    regressions.push('readyMs: was ' + String(baseline.readyMs) + ', now ' + String(current.readyMs));
  }
  const prevFailed = baseline.checks.filter(ch => !ch.ok).length;
  const currFailed = current.checks.filter(ch => !ch.ok).length;
  if (currFailed > prevFailed) {
    regressions.push('failed checks: was ' + String(prevFailed) + ', now ' + String(currFailed));
  }
  return { path: baselinePath, ok: regressions.length === 0, regressions };
}

/** Complete the same verdict, artifact and summary used by the CLI. */
export async function completeSmokeDiagnostics(output, options) {
  const hasSmokeChecks = output.checks.length > 0;
  if (options.baseline) {
    output.baseline = await compareBaseline(output, options.baseline);
    addCheck(output, 'baseline comparison', output.baseline.ok, 'readable baseline with no regressions',
      output.baseline.error?.message ?? output.baseline.regressions);
  }
  output.ok = !output.error && hasSmokeChecks && output.checks.every(check => check.ok === true);
  await writeDiagnostics(options.outputPath, output);
  printSummary(output, options.outputPath);
  return output.ok ? 0 : output.error?.code === 'CDP_UNAVAILABLE' ? 2 : 1;
}

async function writeDiagnostics(outputPath, output) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
}

function printSummary(output, outputPath) {
  const failed = output.checks.filter((check) => !check.ok);
  const mark = output.ok ? "PASS" : "FAIL";

  console.log(`[StarMade-3D] Isanth WebGL smoke ${mark}`);
  console.log(`[StarMade-3D] diagnostics: ${outputPath}`);

  if (output.readyMs !== null) {
    console.log(`[StarMade-3D] ready: ${output.readyMs} ms`);
  }

  if (failed.length > 0) {
    console.log("[StarMade-3D] failed checks:");

    for (const check of failed) {
      console.log(`- ${check.name}: expected ${JSON.stringify(check.expected)}, got ${JSON.stringify(check.actual)}`);
    }
  }

  if (output.error) {
    console.log(`[StarMade-3D] error: ${output.error.message}`);
  }
}

function serializeError(error) {
  return {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    code: error?.code ?? null,
    stack: error?.stack ?? null,
    cause: error?.cause ? {
      name: error.cause.name ?? "Error",
      message: error.cause.message ?? String(error.cause),
      code: error.cause.code ?? null
    } : null,
    lastResult: error?.lastResult ?? null
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
  static async connect(webSocketUrl) {
    const socket = await MinimalWebSocket.connect(webSocketUrl);
    return new CdpClient(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();

    this.socket.onMessage((text) => {
      const message = JSON.parse(text);

      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);

        if (message.error) {
          pending.reject(new Error(`${message.error.message}: ${message.error.data ?? ""}`));
        } else {
          pending.resolve(message.result ?? {});
        }

        return;
      }

      if (message.method) {
        for (const listener of this.listeners.get(message.method) ?? []) {
          listener(message.params ?? {});
        }
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.sendText(JSON.stringify({ id, method, params }));

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  on(method, listener) {
    const existing = this.listeners.get(method) ?? [];
    existing.push(listener);
    this.listeners.set(method, existing);
  }

  close() {
    this.socket.close();
  }
}

class MinimalWebSocket {
  static connect(webSocketUrl) {
    return new Promise((resolve, reject) => {
      const url = new URL(webSocketUrl);

      if (url.protocol !== "ws:") {
        reject(new Error(`Only ws:// CDP endpoints are supported, got ${url.protocol}`));
        return;
      }

      const port = Number(url.port || 80);
      const socket = createConnection({ host: url.hostname, port });
      const key = randomBytes(16).toString("base64");
      let handshake = Buffer.alloc(0);

      socket.once("error", reject);
      socket.on("connect", () => {
        socket.write([
          `GET ${url.pathname}${url.search} HTTP/1.1`,
          `Host: ${url.host}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          "",
          ""
        ].join("\r\n"));
      });

      const onHandshakeData = (chunk) => {
        handshake = Buffer.concat([handshake, chunk]);
        const end = handshake.indexOf("\r\n\r\n");

        if (end < 0) {
          return;
        }

        socket.off("data", onHandshakeData);
        socket.off("error", reject);

        const header = handshake.subarray(0, end).toString("utf8");
        const expectedAccept = createHash("sha1")
          .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
          .digest("base64");

        if (!header.startsWith("HTTP/1.1 101") || !header.includes(`Sec-WebSocket-Accept: ${expectedAccept}`)) {
          reject(new Error(`WebSocket handshake failed: ${header.split("\r\n")[0]}`));
          socket.destroy();
          return;
        }

        const ws = new MinimalWebSocket(socket);
        const leftover = handshake.subarray(end + 4);

        if (leftover.length > 0) {
          ws.receive(leftover);
        }

        resolve(ws);
      };

      socket.on("data", onHandshakeData);
    });
  }

  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.messageListeners = [];
    this.closed = false;

    this.socket.on("data", (chunk) => this.receive(chunk));
    this.socket.on("close", () => {
      this.closed = true;
    });
  }

  onMessage(listener) {
    this.messageListeners.push(listener);
  }

  sendText(text) {
    this.sendFrame(0x1, Buffer.from(text, "utf8"));
  }

  close() {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.sendFrame(0x8, Buffer.alloc(0));
    this.socket.end();
  }

  receive(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let offset = 2;
      let length = second & 0x7f;

      if (length === 126) {
        if (this.buffer.length < offset + 2) {
          return;
        }

        length = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (this.buffer.length < offset + 8) {
          return;
        }

        const big = this.buffer.readBigUInt64BE(offset);
        length = Number(big);
        offset += 8;
      }

      const maskLength = masked ? 4 : 0;
      const frameLength = offset + maskLength + length;

      if (this.buffer.length < frameLength) {
        return;
      }

      const mask = masked ? this.buffer.subarray(offset, offset + 4) : null;
      offset += maskLength;
      const payload = Buffer.from(this.buffer.subarray(offset, offset + length));
      this.buffer = this.buffer.subarray(frameLength);

      if (mask) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= mask[i % 4];
        }
      }

      if (opcode === 0x1) {
        for (const listener of this.messageListeners) {
          listener(payload.toString("utf8"));
        }
      } else if (opcode === 0x8) {
        this.closed = true;
        this.socket.end();
      } else if (opcode === 0x9) {
        this.sendFrame(0xa, payload);
      }
    }
  }

  sendFrame(opcode, payload) {
    const length = payload.length;
    const headerLength = length < 126 ? 2 : length < 65_536 ? 4 : 10;
    const header = Buffer.alloc(headerLength + 4);
    header[0] = 0x80 | opcode;

    if (length < 126) {
      header[1] = 0x80 | length;
    } else if (length < 65_536) {
      header[1] = 0x80 | 126;
      header.writeUInt16BE(length, 2);
    } else {
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    const maskOffset = headerLength;
    const mask = randomBytes(4);
    mask.copy(header, maskOffset);
    const masked = Buffer.from(payload);

    for (let i = 0; i < masked.length; i++) {
      masked[i] ^= mask[i % 4];
    }

    this.socket.write(Buffer.concat([header, masked]));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
