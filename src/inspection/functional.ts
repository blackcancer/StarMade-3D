import { blockReferenceKey, InspectionDocument, type BlockReference } from './model.js';
import type { InspectionDiagnostic, InspectionRelation } from './analysis.js';

export const STARMADE_FUNCTIONAL_SOURCE = 'StarMade-Open@decf3a1990f29b9505041f122188bf19489bcf7e/ElementKeyMap + installed BlockConfig';
export const FUNCTIONAL_CATEGORIES = {
  core: { label: 'Commande', color: 0xffdd55 },
  energy: { label: 'Réacteur et énergie', color: 0xff8f40 },
  propulsion: { label: 'Propulsion', color: 0x55ddee },
  shields: { label: 'Boucliers', color: 0x5599ff },
  weapons: { label: 'Armement', color: 0xff5577 },
  logistics: { label: 'Stockage', color: 0xd49cff },
  docking: { label: 'Rails et arrimage', color: 0x99dd55 },
  logic: { label: 'Logique', color: 0xff99d5 },
  lighting: { label: 'Éclairage', color: 0xffefbb },
  support: { label: 'Support', color: 0x66cc99 },
  other: { label: 'Autres systèmes', color: 0xbfc9d6 }
} as const;
export type FunctionalCategory = keyof typeof FUNCTIONAL_CATEGORIES;
const categoryTypes: Readonly<Record<string, FunctionalCategory>> = Object.freeze(Object.fromEntries(([
  ['core', ['SHIP_CORE', 'CAMERA', 'BOBBY_AI_MODULE']],
  ['energy', ['REACTOR_POWER', 'REACTOR_STABILIZER', 'REACTOR_CONDUIT', 'POWER_REACTOR', 'POWER_CAPACITOR', 'POWER_BATTERY']],
  ['propulsion', ['THRUSTER_MODULE']],
  ['shields', ['SHIELD_CAPACITOR', 'SHIELD_RECHARGER']],
  ['weapons', ['CANNON_COMPUTER', 'CANNON_BARREL', 'MISSILE_COMPUTER', 'MISSILE_TUBE', 'DAMAGE_BEAM_COMPUTER', 'DAMAGE_BEAM_MODULE', 'PUSH_PULSE_COMPUTER', 'PUSH_PULSE_MODULE', 'EFFECT_EM_COMPUTER', 'EFFECT_EM']],
  ['logistics', ['STORAGE', 'CARGO_SPACE']],
  ['docking', ['RAIL_DOCKER', 'RAIL_BASIC', 'RAIL_ROTATOR_CLOCK_WISE', 'RAIL_ROTATOR_COUNTER_CLOCK_WISE', 'RAIL_TURRET_AXIS', 'PICKUP_RAIL', 'RAIL_MASS_ENHANCER', 'RAIL_SPEED_CONTROLLER', 'RAIL_LOAD', 'RAIL_UNLOAD', 'TURRET_DOCKING_UNIT', 'TURRET_DOCKING_ENHANCER_UNIT']],
  ['support', ['SALVAGE_COMPUTER', 'SALVAGE_MODULE', 'ASTROTECH_COMPUTER', 'ASTROTECH_MODULE', 'GRAVITY_UNIT']]
] as const).flatMap(([category, names]) => names.map(name => [name, category]))));
/** Structural Decoder view, without a runtime SDK dependency or guesses based on translated names. */
export interface FunctionalElementInfoLike {
  readonly identity: { readonly id: number; readonly name: string; readonly typeName: string };
  readonly render: { readonly lightSource: boolean };
  readonly logic: { readonly signal: boolean; readonly controlling: readonly unknown[] };
  readonly classification: { readonly reactorChamber: boolean; readonly systemBlock: boolean; readonly computer: { readonly id: number | null; readonly typeName: string } | null };
}
export interface FunctionalBlockInfo {
  readonly id: number; readonly name: string; readonly typeName: string;
  readonly category: FunctionalCategory | null;
  readonly computerType: number | null;
  readonly canControl: boolean;
}
export function functionalBlockFromElementInfo(info: FunctionalElementInfoLike): FunctionalBlockInfo {
  const computer = info.classification.computer;
  const canControl = info.logic.controlling.length > 0;
  const category = categoryTypes[info.identity.typeName] ?? (computer && categoryTypes[computer.typeName]) ??
    (info.classification.reactorChamber ? 'energy' : info.logic.signal ? 'logic' : info.render.lightSource ? 'lighting' : info.classification.systemBlock || canControl ? 'other' : null);
  return { ...info.identity, category, computerType: computer?.id ?? null, canControl };
}
export interface FunctionalController {
  readonly ref: BlockReference;
  readonly groups: readonly { readonly targetType: number; readonly targets: readonly BlockReference[] }[];
}
export interface BlueprintControllerLike {
  readonly x: number; readonly y: number; readonly z: number;
  readonly groups: readonly { readonly type: number; readonly targets: readonly { readonly x: number; readonly y: number; readonly z: number }[] }[];
}
/** Native blueprint logic uses the same +16 storage origin as segment cells; no scene offset is added. */
export function functionalControllersFromBlueprint(entityId: string, controllers: readonly BlueprintControllerLike[]): FunctionalController[] {
  const ref = (p: { x: number; y: number; z: number }): BlockReference => {
    const value = { entityId, position: [p.x - 16, p.y - 16, p.z - 16] as const };
    blockReferenceKey(value); return value;
  };
  return controllers.map(c => ({ ref: ref(c), groups: c.groups.map(g => ({ targetType: g.type, targets: g.targets.map(ref) })) }));
}
export interface FunctionalSystem {
  readonly controller: BlockReference;
  readonly type: number;
  readonly members: readonly BlockReference[];
}
export function buildFunctionalMap(document: InspectionDocument, definitions: ReadonlyMap<number, FunctionalBlockInfo>, controllers: readonly FunctionalController[]) {
  const diagnostics: InspectionDiagnostic[] = [];
  const categories = new Map<FunctionalCategory, BlockReference[]>();
  const systems: FunctionalSystem[] = [];
  const relations: InspectionRelation[] = [];
  const controlled = new Set<string>();
  const unique = new Set<string>();
  for (const block of document.query()) {
    const definition = definitions.get(block.state.type);
    if (!definition) diagnostics.push({ code: 'unknown-functional-type', message: `Unknown functional type ${block.state.type}`, ref: block.ref });
    else if (definition.category) {
      const refs = categories.get(definition.category) ?? [];
      refs.push(block.ref); categories.set(definition.category, refs);
    }
  }
  for (const controller of controllers) {
    const source = document.resolve(controller.ref);
    if (!source) { diagnostics.push({ code: 'missing-controller', message: 'Controller cell is absent', ref: controller.ref }); continue; }
    const members = new Map<string, BlockReference>();
    for (const group of controller.groups) for (const ref of group.targets) {
      const target = document.resolve(ref);
      if (!target) { diagnostics.push({ code: 'missing-controlled-block', message: 'Controlled cell is absent', ref }); continue; }
      if (target.state.type !== group.targetType) { diagnostics.push({ code: 'controlled-type-mismatch', message: `Saved type ${group.targetType}, actual type ${target.state.type}`, ref }); continue; }
      const key = blockReferenceKey(ref);
      const edge = JSON.stringify([blockReferenceKey(controller.ref), key]);
      if (unique.has(edge)) { diagnostics.push({ code: 'duplicate-control-link', message: 'Repeated saved control link', ref }); continue; }
      unique.add(edge); members.set(key, ref);
      relations.push({ kind: 'saved-controller', from: controller.ref, to: ref });
      if (definitions.get(target.state.type)?.computerType === source.state.type) controlled.add(key);
    }
    systems.push({ controller: controller.ref, type: source.state.type, members: [...members.values()] });
  }
  const unlinked: BlockReference[] = [];
  for (const block of document.query()) {
    const computer = definitions.get(block.state.type)?.computerType;
    if (computer != null && !controlled.has(blockReferenceKey(block.ref))) unlinked.push(block.ref);
  }
  return { source: STARMADE_FUNCTIONAL_SOURCE, categories, systems, relations, unlinked, diagnostics };
}
