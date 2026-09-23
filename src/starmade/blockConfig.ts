export type BlockStyleId = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface BlockFaceTextures {
  readonly front: number;
  readonly back: number;
  readonly top: number;
  readonly bottom: number;
  readonly right: number;
  readonly left: number;
}

export interface BlockDefinition {
  readonly id: number;
  readonly name: string;
  readonly maxHitPointsFull: number;
  readonly blockStyle: BlockStyleId;
  readonly transparent: boolean;
  readonly animated: boolean;
  readonly individualSides: number;
  readonly slab: number;
  readonly sideTexturesPointToOrientation: boolean;
  readonly hasActivationTexture: boolean;
  readonly canActivate: boolean;
  readonly drawOnlyInBuildMode: boolean;
  readonly extendedTexture: boolean;
  readonly reactorChamberSpecific: boolean;
  readonly resourceInjection: StarMadeResourceInjection;
  readonly resourceInjectionIndex: number;
  readonly lightSource: boolean;
  readonly lightSourceColor: readonly [number, number, number, number];
  readonly drawLogicConnection: boolean;
  readonly logicBlock: boolean;
  readonly logicSignaledByRail: boolean;
  readonly logicBlockButton: boolean;
  readonly lodShape: string;
  readonly lodShapeActive: string;
  readonly lodShapeStyle: 0 | 1 | 2;
  readonly lodCollisionPhysical: boolean;
  readonly textureIds: readonly number[];
  readonly slabIds: readonly number[];
  readonly textures: BlockFaceTextures;
}

export type StarMadeResourceInjection = "off" | "ore" | "flora";

export interface DecoderBlockDefinitionLike {
  readonly id: number;
  readonly name: string;
  readonly hp?: number;
  readonly maxHitPointsFull?: number;
  readonly maxHitPoints?: number;
  readonly blockStyle?: number;
  readonly transparent?: boolean;
  readonly animated?: boolean;
  readonly individualSides?: number;
  readonly slab?: number;
  readonly sideTexturesPointToOrientation?: boolean;
  readonly hasActivationTexture?: boolean;
  readonly canActivate?: boolean;
  readonly drawOnlyInBuildMode?: boolean;
  readonly drawnOnlyInBuildMode?: boolean;
  readonly onlyInBuildMode?: boolean;
  readonly extendedTexture?: boolean;
  readonly isExtendedTexture?: boolean;
  readonly reactorChamberSpecific?: boolean;
  readonly chamberRoot?: number;
  readonly resourceInjection?: string | number | { readonly index?: number; readonly name?: string };
  readonly lightSource?: boolean;
  readonly lightSourceColor?: readonly number[];
  readonly drawLogicConnection?: boolean;
  readonly logicBlock?: boolean;
  readonly logicSignaledByRail?: boolean;
  readonly logicBlockButton?: boolean;
  readonly lodShape?: string;
  readonly lodShapeActive?: string;
  readonly lodShapeStyle?: number | string;
  readonly lodShapeFromFar?: number | string;
  readonly lodCollisionPhysical?: boolean;
  readonly textureIds?: readonly number[];
  readonly slabIds?: readonly number[];
  readonly xmlTypeName?: string;
}

export interface DecoderBlockElementInfoLike {
  readonly block: DecoderBlockDefinitionLike;
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

const DEFAULT_LIGHT: readonly [number, number, number, number] = [1, 1, 1, 1];
const STARMADE_MAX_HITPOINTS_BYTE = 127;
const STARMADE_RESOURCE_INJECTION_INDEX = {
  off: 0,
  ore: 1,
  flora: 17
} as const;
const STARMADE_ORIENTATION_RESOURCE_OVERLAY: readonly number[] = Object.freeze([
  0, 1, 2, 3, 4, 5, 6, 7,
  8, 9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0
]);
/**
 * Resolves native atlas animation from the caller's block catalogue.
 * @param block - Block metadata from the installed BlockConfig or an override.
 * @returns Whether this block participates in the four-frame atlas animation.
 * @remarks IDs do not determine animation. System blocks such as the ship core,
 * shield capacitor and reactors have genuine frame sequences in the native pack.
 */
export function starMadeBlockUsesTextureAnimation(
  block: Pick<BlockDefinition, "id" | "animated"> | Pick<DecoderBlockDefinitionLike, "id" | "animated">
): boolean {
  return Boolean(block.animated);
}

export function blockDefinitionFromConfig(input: DecoderBlockDefinitionLike): BlockDefinition {
  const individualSides = input.individualSides ?? 1;
  const textureIds = normalizeTextureIds(input.textureIds ?? [0], individualSides);
  const slab = normalizeSlab(input.slab ?? inferSlab(input));
  const resourceInjection = normalizeResourceInjection(input.resourceInjection);

  return {
    id: input.id,
    name: input.name,
    maxHitPointsFull: normalizeMaxHitPoints(input.maxHitPointsFull ?? input.maxHitPoints ?? input.hp ?? 100),
    blockStyle: normalizeBlockStyle(input.blockStyle ?? 0),
    transparent: input.transparent ?? false,
    animated: input.animated ?? false,
    individualSides,
    slab,
    sideTexturesPointToOrientation: input.sideTexturesPointToOrientation ?? false,
    hasActivationTexture: input.hasActivationTexture ?? false,
    canActivate: input.canActivate ?? false,
    drawOnlyInBuildMode: input.drawOnlyInBuildMode ?? input.drawnOnlyInBuildMode ?? input.onlyInBuildMode ?? false,
    extendedTexture: input.extendedTexture ?? input.isExtendedTexture ?? false,
    reactorChamberSpecific: input.reactorChamberSpecific ?? Boolean(input.chamberRoot),
    resourceInjection,
    resourceInjectionIndex: STARMADE_RESOURCE_INJECTION_INDEX[resourceInjection],
    lightSource: input.lightSource ?? false,
    lightSourceColor: normalizeLight(input.lightSourceColor),
    drawLogicConnection: input.drawLogicConnection ?? false,
    logicBlock: input.logicBlock ?? false,
    logicSignaledByRail: input.logicSignaledByRail ?? false,
    logicBlockButton: input.logicBlockButton ?? false,
    lodShape: normalizeLodShapeName(input.lodShape),
    lodShapeActive: normalizeLodShapeName(input.lodShapeActive),
    lodShapeStyle: normalizeLodShapeStyle(input.lodShapeStyle ?? input.lodShapeFromFar ?? numericLodShapeFallback(input.lodShape)),
    lodCollisionPhysical: input.lodCollisionPhysical ?? true,
    textureIds,
    slabIds: input.slabIds?.slice(0, 3) ?? [],
    textures: faceTexturesFromTextureIds(textureIds)
  };
}

export function blockDefinitionFromElementInfo(input: DecoderBlockElementInfoLike): BlockDefinition {
  return blockDefinitionFromConfig({
    id: input.identity.id,
    name: input.identity.name,
    hp: input.block.hp,
    maxHitPointsFull: input.block.maxHitPointsFull,
    maxHitPoints: input.block.maxHitPoints,
    blockStyle: input.render.style.id,
    transparent: input.render.transparent,
    animated: input.render.animated,
    individualSides: input.render.individualSides,
    slab: input.block.slab,
    sideTexturesPointToOrientation: input.render.sideTexturesPointToOrientation,
    hasActivationTexture: input.render.hasActivationTexture,
    canActivate: input.logic.canActivate,
    drawOnlyInBuildMode: input.render.drawOnlyInBuildMode,
    extendedTexture: input.render.extendedTexture,
    reactorChamberSpecific: input.chamber.specific,
    resourceInjection: input.render.resourceInjection.index,
    lightSource: input.render.lightSource,
    lightSourceColor: input.render.lightSourceColor,
    drawLogicConnection: input.logic.drawLogicConnection,
    logicBlock: input.logic.signal,
    logicSignaledByRail: input.logic.signaledByRail,
    logicBlockButton: input.logic.button,
    lodShape: input.render.lodShape,
    lodShapeActive: input.render.lodShapeActive,
    lodShapeStyle: input.render.lodShapeStyle,
    lodCollisionPhysical: input.collision.lodCollisionPhysical,
    textureIds: input.render.textureIds,
    slabIds: input.block.slabIds,
    xmlTypeName: input.identity.typeName || input.block.xmlTypeName
  });
}

export function starMadeBlockTextureOrientationCode(
  block: Pick<BlockDefinition, "blockStyle" | "individualSides"> | undefined,
  side: number,
  orientation: number
): number {
  if (!block) {
    return side;
  }

  if (block.blockStyle === 6) {
    return getOrientationCode24(side, orientation);
  }

  if (block.individualSides >= 6) {
    return getOrientationCode6(side, orientation);
  }

  if (block.individualSides === 3) {
    return getOrientationCode3(side);
  }

  return side;
}

export function resolveStarMadeBlockTextureId(
  block: Pick<BlockDefinition, "textureIds" | "blockStyle" | "individualSides" | "hasActivationTexture">,
  side: number,
  orientation: number,
  active: boolean
): number {
  const orientationCode = starMadeBlockTextureOrientationCode(block, side, orientation);
  const baseTextureId = block.textureIds[orientationCode] ?? block.textureIds[0] ?? 0;

  return block.hasActivationTexture && !active ? baseTextureId + 1 : baseTextureId;
}

export function resolveStarMadeBlockTextureLayerLocal(
  block: Pick<BlockDefinition, "textureIds" | "blockStyle" | "individualSides" | "hasActivationTexture">,
  side: number,
  orientation: number,
  active: boolean
): { readonly textureId: number; readonly layer: number; readonly localTile: number; readonly orientationCode: number } {
  const orientationCode = starMadeBlockTextureOrientationCode(block, side, orientation);
  const baseTextureId = block.textureIds[orientationCode] ?? block.textureIds[0] ?? 0;
  const textureId = block.hasActivationTexture && !active ? baseTextureId + 1 : baseTextureId;

  return {
    textureId,
    layer: Math.floor(Math.abs(textureId) / 256),
    localTile: textureId % 256,
    orientationCode
  };
}

export function starMadeHitPointsCodeFromByteHp(value: number): number {
  const hpByte = Math.max(0, Math.min(STARMADE_MAX_HITPOINTS_BYTE, Math.trunc(value)));
  const hpFactor = hpByte / STARMADE_MAX_HITPOINTS_BYTE;

  return hpFactor < 1 ? Math.max(0, Math.min(7, Math.trunc((1 - hpFactor) * 7))) : 0;
}

export function starMadeResourceOverlay(
  block: Pick<BlockDefinition, "resourceInjectionIndex"> | undefined,
  orientation: number
): number {
  const injectionIndex = block?.resourceInjectionIndex ?? 0;

  if (injectionIndex <= 0) {
    return 0;
  }

  const resourceOverlay = STARMADE_ORIENTATION_RESOURCE_OVERLAY[Math.trunc(orientation)] ?? 0;

  return resourceOverlay > 0 ? injectionIndex + resourceOverlay - 1 : 0;
}

function normalizeLodShapeName(value: string | undefined): string {
  const normalized = value?.trim() ?? "";

  return normalized === "0" || normalized === "1" || normalized === "2" ? "" : normalized;
}

function numericLodShapeFallback(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  return normalized === "0" || normalized === "1" || normalized === "2" ? normalized : undefined;
}

function normalizeLodShapeStyle(value: number | string | undefined): 0 | 1 | 2 {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : value;

  return parsed === 1 || parsed === 2 ? parsed : 0;
}

function normalizeMaxHitPoints(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 100;
}

function normalizeResourceInjection(value: DecoderBlockDefinitionLike["resourceInjection"]): StarMadeResourceInjection {
  const raw = typeof value === "object" && value !== null
    ? value.name ?? value.index
    : value;

  if (typeof raw === "number") {
    if (raw === STARMADE_RESOURCE_INJECTION_INDEX.ore) {
      return "ore";
    }

    if (raw === STARMADE_RESOURCE_INJECTION_INDEX.flora) {
      return "flora";
    }

    return "off";
  }

  const normalized = raw?.toLowerCase().trim();

  if (normalized === "ore") {
    return "ore";
  }

  if (normalized === "flora") {
    return "flora";
  }

  return "off";
}

function getOrientationCode6(side: number, orientation: number): number {
  const mapping = [
    [5, 4, 3, 2, 0, 1],
    [4, 5, 3, 2, 1, 0],
    [1, 0, 5, 4, 2, 3],
    [0, 1, 4, 5, 3, 2],
    [1, 0, 3, 2, 4, 5],
    [0, 1, 3, 2, 5, 4]
  ] as const;

  return 5 - mapping[clampInteger(orientation, 0, 5)][side];
}

function getOrientationCode24(side: number, orientation: number): number {
  const mapping = [
    [5, 4, 2, 3, 0, 1],
    [4, 5, 2, 3, 1, 0],
    [0, 1, 4, 5, 3, 2],
    [1, 0, 5, 4, 2, 3],
    [1, 0, 3, 2, 4, 5],
    [0, 1, 2, 3, 5, 4]
  ] as const;

  return 5 - mapping[Math.floor(clampInteger(orientation, 0, 23) / 4)][side];
}

function getOrientationCode3(side: number): number {
  const mapping = [0, 0, 3, 2, 0, 0] as const;

  return 5 - mapping[side];
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function normalizeTextureIds(textureIds: readonly number[], individualSides: number): readonly number[] {
  const base = textureIds[0] ?? 0;

  if (textureIds.length >= 6) {
    return textureIds.slice(0, 6);
  }

  if (individualSides >= 6) {
    return [base, base + 1, base + 2, base + 3, base + 4, base + 5];
  }

  if (individualSides === 3) {
    return [base + 2, base + 2, base, base + 1, base + 2, base + 2];
  }

  return [base, base, base, base, base, base];
}

export function faceTexturesFromTextureIds(textureIds: readonly number[]): BlockFaceTextures {
  const normalized = normalizeTextureIds(textureIds, textureIds.length >= 6 ? 6 : 1);

  return {
    front: normalized[0] ?? 0,
    back: normalized[1] ?? 0,
    top: normalized[2] ?? 0,
    bottom: normalized[3] ?? 0,
    right: normalized[4] ?? 0,
    left: normalized[5] ?? 0
  };
}

function normalizeBlockStyle(value: number): BlockStyleId {
  if (value === 0 || value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6) {
    return value;
  }

  return 0;
}

function normalizeLight(value: readonly number[] | undefined): readonly [number, number, number, number] {
  if (!value) {
    return DEFAULT_LIGHT;
  }

  return [
    value[0] ?? DEFAULT_LIGHT[0],
    value[1] ?? DEFAULT_LIGHT[1],
    value[2] ?? DEFAULT_LIGHT[2],
    value[3] ?? DEFAULT_LIGHT[3]
  ];
}

function normalizeSlab(value: number): number {
  if (value === 0 || value === 1 || value === 2 || value === 3) {
    return value;
  }

  return 0;
}

function inferSlab(input: DecoderBlockDefinitionLike): number {
  const slabIndex = input.slabIds?.indexOf(input.id) ?? -1;

  if (slabIndex >= 0) {
    return slabIndex + 1;
  }

  const typeName = input.xmlTypeName ?? "";

  if (/_THREE_QUARTER_SLAB$/i.test(typeName)) {
    return 1;
  }

  if (/_HALF_SLAB$/i.test(typeName)) {
    return 2;
  }

  if (/_QUARTER_SLAB$/i.test(typeName)) {
    return 3;
  }

  return 0;
}
