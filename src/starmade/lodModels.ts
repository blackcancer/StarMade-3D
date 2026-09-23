import type { LoadingManager, Object3D } from "three";
import { OgreMaxLoader } from "../vendor/OgreMaxLoader.js";

export { OgreMaxLoader };

export interface StarMadeLodModelDefinition {
  readonly name: string;
  readonly filename: string;
  readonly relpath: string;
}

export interface StarMadeLodModelReference extends StarMadeLodModelDefinition {
  readonly sceneUrl: string;
  readonly texturePath: string;
}

export interface StarMadeLodModelLoadOptions {
  readonly manager?: LoadingManager;
}

export function parseStarMadeLodModelDefinitions(xml: string): readonly StarMadeLodModelDefinition[] {
  // Commented experiments in mainConfig.xml are not live model declarations.
  const declarations = xml.replace(/<!--[\s\S]*?-->/g, "");
  const lodMatch = /<LOD\b[^>]*>([\s\S]*?)<\/LOD>/i.exec(declarations);

  if (!lodMatch) {
    return [];
  }

  const definitions: StarMadeLodModelDefinition[] = [];
  const entryPattern = /<([A-Za-z_][\w:.-]*)\b([^/>]*\bfilename\s*=\s*"([^"]+)"[^/>]*\brelpath\s*=\s*"([^"]+)"[^/>]*)\/>/g;

  for (const match of lodMatch[1].matchAll(entryPattern)) {
    definitions.push({
      name: match[1],
      filename: match[3],
      relpath: normalizeLodRelpath(match[4])
    });
  }

  return definitions;
}

export function createStarMadeLodModelRegistry(
  definitions: readonly StarMadeLodModelDefinition[]
): ReadonlyMap<string, StarMadeLodModelDefinition> {
  return new Map(definitions.map((definition) => [definition.name, definition]));
}

export function resolveStarMadeLodModelReference(
  modelName: string,
  registry: ReadonlyMap<string, StarMadeLodModelDefinition>,
  baseUrl = "/starmade-assets/models/lod"
): StarMadeLodModelReference | null {
  const definition = registry.get(modelName);

  if (!definition) {
    return null;
  }

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const modelBaseUrl = `${normalizedBaseUrl}/${definition.relpath}`;

  return {
    ...definition,
    sceneUrl: `${modelBaseUrl}/${definition.filename}.scene`,
    texturePath: `${modelBaseUrl}/`
  };
}

export async function loadStarMadeLodModel(
  modelReference: StarMadeLodModelReference,
  options: StarMadeLodModelLoadOptions = {}
): Promise<Object3D> {
  const loader = new OgreMaxLoader(options.manager);
  loader.texturePath = modelReference.texturePath;
  return loader.load(modelReference.sceneUrl);
}

function normalizeLodRelpath(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}
