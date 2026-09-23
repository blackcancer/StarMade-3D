/** Native Replacements.Type metadata; indexed tokens append a decimal index (e.g. shieldHp0).
 * REACTORHPX and REACTORMAXHPX intentionally retain the duplicate native token.
 * Availability is descriptive: the host owns manager capability checks and formatting.
 */
export const STARMADE_DISPLAY_VARIABLES = [
  { id: 'SHIELD', token: 'shield', power: 'legacy', indexed: false },
  { id: 'SHIELD_CAP', token: 'shieldCap', power: 'legacy', indexed: false },
  { id: 'SHIELD_PERCENT', token: 'shieldPercent', power: 'legacy', indexed: false },
  { id: 'POWER', token: 'power', power: 'legacy', indexed: false },
  { id: 'POWER_CAP', token: 'powerCap', power: 'legacy', indexed: false },
  { id: 'POWER_PERCENT', token: 'powerPercent', power: 'legacy', indexed: false },
  { id: 'POWER_BATTERY', token: 'auxPower', power: 'legacy', indexed: false },
  { id: 'POWER_BATTERY_CAP', token: 'auxPowerCap', power: 'legacy', indexed: false },
  { id: 'POWER_BATTERY_PERCENT', token: 'auxPowerPercent', power: 'legacy', indexed: false },
  { id: 'STRUCTURE_HP', token: 'structureHp', power: 'legacy', indexed: false },
  { id: 'STRUCTURE_HP_CAPACITY', token: 'structureHpCap', power: 'legacy', indexed: false },
  { id: 'STRUCTURE_HP_PERCENT', token: 'structureHpPercent', power: 'legacy', indexed: false },
  { id: 'REACTOR_HP', token: 'activeReactorHp', power: 'reactor', indexed: false },
  { id: 'REACTOR_HP_CAPACITY', token: 'activeReactorMaxHp', power: 'reactor', indexed: false },
  { id: 'REACTOR_HP_PERCENT', token: 'activeReactorHpPercent', power: 'reactor', indexed: false },
  { id: 'ARMOR_HP', token: 'armorHp', power: 'all', indexed: false },
  { id: 'ARMOR_HP_CAPACITY', token: 'armorHpCap', power: 'all', indexed: false },
  { id: 'ARMOR_PERCENT', token: 'armorHpPercent', power: 'all', indexed: false },
  { id: 'MASS', token: 'mass', power: 'all', indexed: false },
  { id: 'BLOCK_COUNT', token: 'blockCount', power: 'all', indexed: false },
  { id: 'SECTOR', token: 'sector', power: 'all', indexed: false },
  { id: 'SYSTEM', token: 'system', power: 'all', indexed: false },
  { id: 'NAME', token: 'name', power: 'all', indexed: false },
  { id: 'DOCKED', token: 'docked', power: 'all', indexed: false },
  { id: 'CLOAKED', token: 'cloaked', power: 'all', indexed: false },
  { id: 'JAMMING', token: 'jamming', power: 'all', indexed: false },
  { id: 'SPEED', token: 'speed', power: 'all', indexed: false },
  { id: 'REACTORIDACTIVE', token: 'activeReactorId', power: 'reactor', indexed: false },
  { id: 'REACTORRECHARGEACTIVE', token: 'activeReactorRecharge', power: 'reactor', indexed: false },
  { id: 'REACTORCONSUMPIONACTIVE', token: 'activeReactorConsumption', power: 'reactor', indexed: false },
  { id: 'REACTORCONSUMPIONPERCENTACTIVE', token: 'activeReactorConsumptionPercent', power: 'reactor', indexed: false },
  { id: 'REACTORIDX', token: 'reactorId', power: 'reactor', indexed: true },
  { id: 'REACTORSIZEX', token: 'reactorSize', power: 'reactor', indexed: true },
  { id: 'REACTORHPX', token: 'reactorHp', power: 'reactor', indexed: true },
  { id: 'REACTORMAXHPX', token: 'reactorHp', power: 'reactor', indexed: true },
  { id: 'SHIELDIDX', token: 'shieldId', power: 'reactor', indexed: true },
  { id: 'SHIELDPERCENTX', token: 'shieldPercent', power: 'reactor', indexed: true },
  { id: 'SHIELDHPX', token: 'shieldHp', power: 'reactor', indexed: true },
  { id: 'SHIELDCAPX', token: 'shieldMaxHp', power: 'reactor', indexed: true },
  { id: 'SHIELDRADIUSX', token: 'shieldRadius', power: 'reactor', indexed: true },
  { id: 'MISSILE_CAPACITY', token: 'missileCapacity', power: 'all', indexed: false },
  { id: 'MISSILE_CAPACITY_MAX', token: 'missileCapacityMax', power: 'all', indexed: false },
  { id: 'CANNON_CAPACITY', token: 'cannonCapacity', power: 'all', indexed: false },
  { id: 'CANNON_CAPACITY_MAX', token: 'cannonCapacityMax', power: 'all', indexed: false },
  { id: 'BEAM_CAPACITY', token: 'beamCapacity', power: 'all', indexed: false },
  { id: 'BEAM_CAPACITY_MAX', token: 'beamCapacityMax', power: 'all', indexed: false },
] as const;

export type StarMadeDisplayValue = string | number | boolean;
export interface StarMadeDisplayValueSource {
  readonly resolve: (token: string) => string | undefined;
}
/** Entity-scoped host-calculated snapshots. Publishing never mutates saved blueprint text. */
export class StarMadeDisplayValues {
  private readonly entities = new Map<string, ReadonlyMap<string, string>>();

  /** Replace the complete snapshot atomically; strings retain host formatting/units. */
  set(entityId: string, values: Readonly<Record<string, StarMadeDisplayValue>>): void {
    if (!entityId) throw Error('Display values need an entity id');
    const next = new Map<string, string>();
    for (const [key, value] of Object.entries(values)) {
      if (!/^[a-z][a-z0-9_]*$/i.test(key)) throw Error('Invalid display token');
      const token = key.toLowerCase();
      if (next.has(token)) throw Error('Duplicate display token');
      if (!(typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value))) throw Error('Invalid display value');
      next.set(token, String(value));
    }
    this.entities.set(entityId, next);
  }

  clear(entityId: string): boolean { return this.entities.delete(entityId); }

  resolve(entityId: string, token: string): string | undefined {
    return this.entities.get(entityId)?.get(token.toLowerCase());
  }

  /** Bind once; resolve always reads the latest snapshot, including after clear/set. */
  forEntity(entityId: string): StarMadeDisplayValueSource {
    if (!entityId) throw Error('Display values need an entity id');
    return Object.freeze({ resolve: (token: string) => this.resolve(entityId, token) });
  }
}
