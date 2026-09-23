import { expect, it } from 'vitest';
import { StarMadeDisplayValues, STARMADE_DISPLAY_VARIABLES, parseStarMadeDisplayText } from '../src/index.js';

it('publishes atomic entity snapshots to bound display sources without leaking dock values', () => {
  const values = new StarMadeDisplayValues();
  const hull = values.forEntity('hull'), dock = values.forEntity('hull/dock');
  expect(hull.resolve('power')).toBeUndefined();
  const snapshot = { power: 12, shieldCap: '9,000', docked: true, empty: '' };
  values.set('hull', snapshot); values.set('hull/dock', { power: 99 });
  snapshot.power = 100;
  expect(hull.resolve('POWER')).toBe('12'); expect(hull.resolve('shieldcap')).toBe('9,000');
  expect(hull.resolve('docked')).toBe('true'); expect(hull.resolve('empty')).toBe('');
  expect(dock.resolve('power')).toBe('99');
  values.set('hull', { power: 0, jamming: false, reactorId999: 'r999', custom: '$& [power]' });
  expect(hull.resolve('shieldCap')).toBeUndefined();
  expect(parseStarMadeDisplayText('[POWER] [jamming] [reactorId999] [custom] [missing]', hull.resolve).text)
    .toBe('0 false r999 $& [power] [missing]');
  expect(values.clear('hull')).toBe(true); expect(values.clear('hull')).toBe(false);
  expect(hull.resolve('power')).toBeUndefined(); expect(dock.resolve('power')).toBe('99');
  values.set('hull', { power: 8 }); expect(hull.resolve('power')).toBe('8');
});

it('rejects invalid snapshots atomically and ambiguous case aliases', () => {
  const values = new StarMadeDisplayValues(); values.set('ship', { power: 5 });
  for (const bad of [NaN, Infinity, -Infinity, null, undefined, {}, 1n]) {
    expect(() => values.set('ship', { power: 7, bad } as never)).toThrow('value');
    expect(values.resolve('ship', 'power')).toBe('5');
  }
  for (const key of ['', '[power]', 'power value', 'énergie']) expect(() => values.set('ship', { [key]: 1 })).toThrow('token');
  expect(() => values.set('ship', { power: 1, POWER: 2 })).toThrow('Duplicate');
  expect(() => values.set('', {})).toThrow('entity');
  expect(() => values.forEntity('')).toThrow('entity');
});

it('accepts every native variable, indexed family and case variant from the public catalog', () => {
  const values = new StarMadeDisplayValues();
  expect(STARMADE_DISPLAY_VARIABLES).toHaveLength(56);
  for (const variable of STARMADE_DISPLAY_VARIABLES) {
    for (const suffix of variable.indexed ? ['0', '1', '999', '1000'] : ['']) {
      const token = variable.token + suffix;
      values.set('ship', { [token]: variable.id });
      expect(parseStarMadeDisplayText(`[${token.toUpperCase()}]`, values.forEntity('ship').resolve).text).toBe(variable.id);
    }
  }
});

it('publishes isolated native custom variable snapshots without executing client write tags',()=>{
 const values=new StarMadeDisplayValues(), source=values.forEntity('ship');
 expect(source.resolveVariable?.('foo')).toBeUndefined();
 values.setVariables('ship',{Foo:'one',_bar:'two'});values.setVariables('dock',{foo:'other'});
 expect(source.resolveVariable?.('FOO')).toBe('one');
 expect(parseStarMadeDisplayText('[set:foo=bad][var:foo][unset:foo]',source.resolve,source.resolveVariable).text).toBe('one');
 expect(source.resolveVariable?.('foo')).toBe('one');
 for(const snapshot of [{'': 'x'},{'3bad':'x'},{['x'.repeat(33)]:'x'},{a:'x'.repeat(257)},{a:1},{Foo:'one',foo:'two'},Object.fromEntries(Array.from({length:129},(_,i)=>['v'+i,'x']))])expect(()=>values.setVariables('ship',snapshot as never)).toThrow();
 expect(()=>values.setVariables('',{})).toThrow();expect(source.resolveVariable?.('foo')).toBe('one');
 values.setVariables('ship',Object.fromEntries(Array.from({length:128},(_,i)=>['v'+i,'x'.repeat(256)])));
 expect(source.resolveVariable?.('v127')).toHaveLength(256);expect(source.resolveVariable?.('foo')).toBeUndefined();
 expect(values.clearVariables('ship')).toBe(true);expect(values.clearVariables('ship')).toBe(false);
 expect(values.forEntity('dock').resolveVariable?.('foo')).toBe('other');
});
