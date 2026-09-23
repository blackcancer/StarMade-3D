/** Native Replacements.Type catalog from the pinned StarMade-Open source. */
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
  { id: 'MASS', token: 'mass', power: 'all', indexed: false },
  { id: 'BLOCK_COUNT', token: 'blockCount', power: 'all', indexed: false },
  { id: 'SECTOR', token: 'sector', power: 'all', indexed: false },
  { id: 'SYSTEM', token: 'system', power: 'all', indexed: false },
  { id: 'SYSTEMNAME', token: 'systemName', power: 'all', indexed: false },
  { id: 'FACTION', token: 'faction', power: 'all', indexed: false },
  { id: 'NAME', token: 'name', power: 'all', indexed: false },
  { id: 'DOCKED', token: 'docked', power: 'all', indexed: false },
  { id: 'DOCKEDTO', token: 'dockedTo', power: 'all', indexed: false },
  { id: 'DOCKEDROOT', token: 'dockedRoot', power: 'all', indexed: false },
  { id: 'CLOAKED', token: 'cloaked', power: 'all', indexed: false },
  { id: 'JAMMING', token: 'jamming', power: 'all', indexed: false },
  { id: 'SPEED', token: 'speed', power: 'all', indexed: false },
  { id: 'MAXSPEED', token: 'maxSpeed', power: 'all', indexed: false },
  { id: 'TMR', token: 'tmr', power: 'all', indexed: false },
  { id: 'REACTORIDACTIVE', token: 'activeReactorId', power: 'reactor', indexed: false },
  { id: 'REACTORRECHARGEACTIVE', token: 'activeReactorRecharge', power: 'reactor', indexed: false },
  { id: 'REACTORCONSUMPIONACTIVE', token: 'activeReactorConsumption', power: 'reactor', indexed: false },
  { id: 'REACTORCONSUMPIONPERCENTACTIVE', token: 'activeReactorConsumptionPercent', power: 'reactor', indexed: false },
  { id: 'REACTORHPPERCENTACTIVE', token: 'activeReactorHpPercent', power: 'reactor', indexed: false },
  { id: 'REACTORHPACTIVE', token: 'activeReactorHp', power: 'reactor', indexed: false },
  { id: 'REACTORMAXHPACTIVE', token: 'activeReactorMaxHp', power: 'reactor', indexed: false },
  { id: 'REACTORLEVELACTIVE', token: 'activeReactorLevel', power: 'reactor', indexed: false },
  { id: 'REACTORSIZEACTIVE', token: 'activeReactorSize', power: 'reactor', indexed: false },
  { id: 'REACTORLEVELX', token: 'reactorLevel', power: 'reactor', indexed: true },
  { id: 'REACTORIDX', token: 'reactorId', power: 'reactor', indexed: true },
  { id: 'REACTORSIZEX', token: 'reactorSize', power: 'reactor', indexed: true },
  { id: 'REACTORHPX', token: 'reactorHp', power: 'reactor', indexed: true },
  { id: 'REACTORMAXHPX', token: 'reactorMaxHp', power: 'reactor', indexed: true },
  { id: 'REACTORPERCENTX', token: 'reactorPercent', power: 'reactor', indexed: true },
  { id: 'TOTALSHIELDHPX', token: 'totalShieldHp', power: 'reactor', indexed: true },
  { id: 'TOTALSHIELDMAXHPX', token: 'totalShieldMaxHp', power: 'reactor', indexed: true },
  { id: 'TOTALSHIELDPERCENTX', token: 'totalShieldPercent', power: 'reactor', indexed: true },
  { id: 'TOTALSHIELDRECHARGE', token: 'totalShieldRecharge', power: 'reactor', indexed: false },
  { id: 'TOTALSHIELDUPKEEP', token: 'totalShieldUpkeep', power: 'reactor', indexed: false },
  { id: 'SHIELDIDX', token: 'shieldId', power: 'reactor', indexed: true },
  { id: 'SHIELDPERCENTX', token: 'shieldPercent', power: 'reactor', indexed: true },
  { id: 'SHIELDHPX', token: 'shieldHp', power: 'reactor', indexed: true },
  { id: 'SHIELDCAPX', token: 'shieldMaxHp', power: 'reactor', indexed: true },
  { id: 'SHIELDRECHARGEX', token: 'shieldRecharge', power: 'reactor', indexed: true },
  { id: 'SHIELDUPKEEPX', token: 'shieldUpkeep', power: 'reactor', indexed: true },
  { id: 'SHIELDRADIUSX', token: 'shieldRadius', power: 'reactor', indexed: true },
  { id: 'MISSILE_CAPACITY', token: 'missileCapacity', power: 'all', indexed: false },
  { id: 'MISSILE_CAPACITY_MAX', token: 'missileCapacityMax', power: 'all', indexed: false },
] as const;

export type StarMadeDisplayValue = string | number | boolean;
export interface StarMadeDisplayValueSource {
  readonly resolveVariable?: (name: string) => string | undefined;
  readonly resolve: (token: string) => string | undefined;
}
/** Entity-scoped host-calculated snapshots. Publishing never mutates saved blueprint text. */
export class StarMadeDisplayValues {
  private readonly variables = new Map<string, ReadonlyMap<string, string>>();
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

  /** Publish server-owned custom variables; rendering never executes set/unset tags. */
  setVariables(entityId: string, values: Readonly<Record<string,string>>): void {
    if (!entityId) throw Error('Display variables need an entity id');
    const next = new Map<string,string>();
    for (const [name,value] of Object.entries(values)) {
      const key = name.toLowerCase();
      if (!/^[a-z_][a-z0-9_]{0,31}$/.test(key) || typeof value !== 'string' || value.length > 256 || next.has(key)) throw Error('Invalid custom display variable');
      next.set(key,value);
    }
    if (next.size > 128) throw Error('Too many custom display variables');
    this.variables.set(entityId,next);
  }

  clearVariables(entityId: string): boolean { return this.variables.delete(entityId); }

  clear(entityId: string): boolean { return this.entities.delete(entityId); }

  resolve(entityId: string, token: string): string | undefined {
    return this.entities.get(entityId)?.get(token.toLowerCase());
  }

  /** Bind once; resolve always reads the latest snapshot, including after clear/set. */
  forEntity(entityId: string): StarMadeDisplayValueSource {
    if (!entityId) throw Error('Display values need an entity id');
    return Object.freeze({ resolve: (token: string) => this.resolve(entityId, token), resolveVariable: (name: string) => this.variables.get(entityId)?.get(name.toLowerCase()) });
  }
}
