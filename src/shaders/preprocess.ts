import { getStarMadeShaderProgram, type StarMadeShaderProgramId } from "./programs.js";
import { STARMADE_SHADER_SOURCES } from "./sources.js";

export interface StarMadeShaderPreprocessOptions {
  readonly defines?: Iterable<string>;
  readonly includeDefaultDefines?: boolean;
  readonly sources?: Readonly<Record<string, string>>;
  readonly strictConditionals?: boolean;
}

export interface PreprocessedStarMadeShaderProgram {
  readonly id: StarMadeShaderProgramId;
  readonly vertexPath: string;
  readonly fragmentPath: string;
  readonly defines: readonly string[];
  readonly vertexShader: string;
  readonly fragmentShader: string;
}

interface ConditionalFrame {
  readonly parentActive: boolean;
  active: boolean;
  matched: boolean;
}

const importPattern = /^#IMPORT\s+(.+?)\s*$/;
const conditionalPattern = /^#(DELAYED)?(IFDEF|ELSEIF|ELSE|ENDIF)(?:\s+([A-Za-z0-9_]+))?\s*$/;

export function preprocessStarMadeShader(
  source: string,
  options: StarMadeShaderPreprocessOptions = {}
): string {
  return preprocessSource(source, normalizeOptions(options), []);
}

export function listEmbeddedStarMadeShaderPaths(): readonly string[] {
  return Object.keys(STARMADE_SHADER_SOURCES).sort();
}

export function hasEmbeddedStarMadeShader(path: string): boolean {
  return normalizeStarMadeShaderPath(path) in STARMADE_SHADER_SOURCES;
}

export function getEmbeddedStarMadeShaderSource(path: string): string {
  const normalizedPath = normalizeStarMadeShaderPath(path);
  const source = STARMADE_SHADER_SOURCES[normalizedPath];

  if (source === undefined) {
    throw new Error(`Unknown embedded StarMade shader source: ${path}`);
  }

  return source;
}

export function preprocessEmbeddedStarMadeShader(
  path: string,
  options: StarMadeShaderPreprocessOptions = {}
): string {
  return preprocessStarMadeShader(getEmbeddedStarMadeShaderSource(path), normalizeOptions(options));
}

export function preprocessStarMadeShaderProgram(
  id: StarMadeShaderProgramId,
  options: StarMadeShaderPreprocessOptions = {}
): PreprocessedStarMadeShaderProgram {
  const program = getStarMadeShaderProgram(id);
  const defaultDefines = options.includeDefaultDefines === false ? [] : program.defaultDefines;
  const defines = [...defaultDefines, ...(options.defines ?? [])];

  return {
    id,
    vertexPath: program.vertexPath,
    fragmentPath: program.fragmentPath,
    defines,
    vertexShader: preprocessEmbeddedStarMadeShader(program.vertexPath, {
      ...options,
      defines
    }),
    fragmentShader: preprocessEmbeddedStarMadeShader(program.fragmentPath, {
      ...options,
      defines
    })
  };
}

export function normalizeStarMadeShaderPath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\/+/, "");
  const dataShaderIndex = normalized.indexOf("data/shader/");
  const shaderPath = dataShaderIndex >= 0 ? normalized.slice(dataShaderIndex) : normalized;
  const segments = shaderPath.split("/");

  if (
    shaderPath.length === 0 ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`Invalid StarMade shader path: ${path}`);
  }

  return shaderPath;
}

function preprocessSource(
  source: string,
  options: Required<Pick<StarMadeShaderPreprocessOptions, "sources">> & StarMadeShaderPreprocessOptions,
  importStack: readonly string[]
): string {
  const defines = new Set(options.defines ?? []);
  const output: string[] = [];
  const stack: ConditionalFrame[] = [];

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    const importMatch = trimmed.match(importPattern);
    const conditionalMatch = trimmed.match(conditionalPattern);

    if (importMatch) {
      if (currentActive(stack)) {
        output.push(resolveImport(importMatch[1], options, importStack));
      }
      continue;
    }

    if (conditionalMatch) {
      applyConditional(conditionalMatch[2], conditionalMatch[3], defines, stack);
      continue;
    }

    if (currentActive(stack)) {
      output.push(line);
    }
  }

  if (stack.length > 0 && options.strictConditionals === true) {
    throw new Error("Unclosed StarMade shader conditional block");
  }

  return output.join("\n");
}

function resolveImport(
  rawPath: string,
  options: Required<Pick<StarMadeShaderPreprocessOptions, "sources">> & StarMadeShaderPreprocessOptions,
  importStack: readonly string[]
): string {
  const path = normalizeStarMadeShaderPath(rawPath.replace(/^["']|["']$/g, ""));
  // Every entry point normalizes this required map before resolving imports.
  const sources = options.sources;
  const imported = sources[path];

  if (imported === undefined) {
    throw new Error(`Missing StarMade shader import: ${path}`);
  }

  if (importStack.includes(path)) {
    throw new Error(`Circular StarMade shader import: ${[...importStack, path].join(" -> ")}`);
  }

  return preprocessSource(imported, options, [...importStack, path]);
}

function applyConditional(
  directive: string,
  define: string | undefined,
  defines: ReadonlySet<string>,
  stack: ConditionalFrame[]
): void {
  if (directive === "IFDEF") {
    if (!define) {
      throw new Error("#IFDEF requires a define name");
    }

    const parentActive = currentActive(stack);
    const active = parentActive && defines.has(define);
    stack.push({
      parentActive,
      active,
      matched: active
    });
    return;
  }

  const frame = stack.at(-1);
  if (!frame) {
    throw new Error(`#${directive} without matching #IFDEF`);
  }

  if (directive === "ELSEIF") {
    if (!define) {
      throw new Error("#ELSEIF requires a define name");
    }

    const active = frame.parentActive && !frame.matched && defines.has(define);
    frame.active = active;
    frame.matched = frame.matched || active;
    return;
  }

  if (directive === "ELSE") {
    const active = frame.parentActive && !frame.matched;
    frame.active = active;
    frame.matched = true;
    return;
  }

  stack.pop();
}

function currentActive(stack: readonly ConditionalFrame[]): boolean {
  return stack.at(-1)?.active ?? true;
}

function normalizeOptions(
  options: StarMadeShaderPreprocessOptions
): Required<Pick<StarMadeShaderPreprocessOptions, "sources">> & StarMadeShaderPreprocessOptions {
  return {
    ...options,
    sources: options.sources ?? STARMADE_SHADER_SOURCES
  };
}
