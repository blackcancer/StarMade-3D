export type StarMadeShaderProgramId =
  | "cube.simple"
  | "cube.quads13"
  | "cube.shadow"
  | "cube.depth"
  | "cube.lod"
  | "cube.lodShadow"
  | "cube.shield"
  | "cube.jump";

export interface StarMadeShaderProgramDefinition {
  readonly id: StarMadeShaderProgramId;
  readonly label: string;
  readonly vertexPath: string;
  readonly fragmentPath: string;
  readonly defaultDefines: readonly string[];
  readonly optionalDefines: readonly string[];
  readonly notes: string;
}

export const STARMADE_SHADER_PROGRAMS: Readonly<Record<StarMadeShaderProgramId, StarMadeShaderProgramDefinition>> = {
  "cube.simple": {
    id: "cube.simple",
    label: "Simple cube debug shader",
    vertexPath: "data/shader/cube/quads13/simplecube.vsh",
    fragmentPath: "data/shader/cube/quads13/simplecube.fsh",
    defaultDefines: [],
    optionalDefines: ["threeComp", "shader4", "force130", "INTATT"],
    notes: "Flat debug cube shader used by StarMade as a minimal cube rendering path."
  },
  "cube.quads13": {
    id: "cube.quads13",
    label: "Primary packed cube shader",
    vertexPath: "data/shader/cube/quads13/cube-3rd.vsh",
    fragmentPath: "data/shader/cube/quads13/cubeTArray.fsh",
    defaultDefines: ["owntangent"],
    optionalDefines: [
      "normalmap",
      "normaltexarray",
      "texarray",
      "shadow",
      "VSM",
      "vertexLighting",
      "nospotlights",
      "lightall",
      "blended",
      "shader4",
      "force130",
      "intel130",
      "chunk16",
      "INTATT",
      "noemission",
      "virtual"
    ],
    notes: "Main StarMade cube path for packed chunk geometry, atlas textures, lighting, alpha and animation."
  },
  "cube.shadow": {
    id: "cube.shadow",
    label: "Cube shadow shader",
    vertexPath: "data/shader/cube/quads13/shadowcube.vsh",
    fragmentPath: "data/shader/cube/quads13/shadowcube.fsh",
    defaultDefines: ["owntangent"],
    optionalDefines: ["blended", "VSM", "vertexLighting", "shader4", "force130", "intel130", "INTATT"],
    notes: "Depth and alpha-aware cube shadow pass."
  },
  "cube.depth": {
    id: "cube.depth",
    label: "Cube depth shader",
    vertexPath: "data/shader/cube/quads13/depthcube.vsh",
    fragmentPath: "data/shader/cube/quads13/depthcube.fsh",
    defaultDefines: ["owntangent"],
    optionalDefines: ["VSM", "vertexLighting", "shader4", "force130", "intel130", "INTATT"],
    notes: "Linearized depth pass for cube impostors and visibility effects."
  },
  "cube.lod": {
    id: "cube.lod",
    label: "LOD model cube shader",
    vertexPath: "data/shader/cube/lodCube/lodcube.vert.glsl",
    fragmentPath: "data/shader/cube/lodCube/lodcube.frag.glsl",
    defaultDefines: ["owntangent"],
    optionalDefines: ["normalmap", "shadow", "VSM", "shader4", "force130"],
    notes: "Material path for Ogre LOD meshes that still use StarMade cube lighting."
  },
  "cube.lodShadow": {
    id: "cube.lodShadow",
    label: "LOD model shadow shader",
    vertexPath: "data/shader/cube/lodCube/lodcube.vert.glsl",
    fragmentPath: "data/shader/cube/lodCube/lodcube-shadow.frag.glsl",
    defaultDefines: ["owntangent"],
    optionalDefines: ["normalmap", "shadow", "VSM", "shader4", "force130"],
    notes: "Shadow pass used by StarMade LOD meshes."
  },
  "cube.shield": {
    id: "cube.shield",
    label: "Shield cube shader",
    vertexPath: "data/shader/cube/shieldCube/shieldcube.vsh",
    fragmentPath: "data/shader/cube/shieldCube/shieldcube.fsh",
    defaultDefines: [],
    optionalDefines: ["shader4", "force130", "INTATT"],
    notes: "Specialized animated cube path for shield visuals."
  },
  "cube.jump": {
    id: "cube.jump",
    label: "Jump cube shader",
    vertexPath: "data/shader/cube/jumpCube/jumpcube.vsh",
    fragmentPath: "data/shader/cube/jumpCube/jumpcube.fsh",
    defaultDefines: [],
    optionalDefines: ["shader4", "force130", "INTATT"],
    notes: "Specialized cube shader used by jump-related effects."
  }
};

export function listStarMadeShaderPrograms(): readonly StarMadeShaderProgramDefinition[] {
  return Object.values(STARMADE_SHADER_PROGRAMS);
}

export function getStarMadeShaderProgram(id: StarMadeShaderProgramId): StarMadeShaderProgramDefinition {
  return STARMADE_SHADER_PROGRAMS[id];
}
