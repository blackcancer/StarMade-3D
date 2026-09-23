import { expect, it } from 'vitest';
import { ManagerContainer, TextBlocks } from 'starmade-decoder';
import { inspectionBlueprintEntities, starMadeDisplayKey } from '../../src/index.js';

it('preserves actual Decoder TextBlocks independently for hull and nested docked entities',()=>{
  const position=starMadeDisplayKey([-17,2,3],5);
  const manager=ManagerContainer.EMPTY.withTexts(TextBlocks.EMPTY.set(BigInt(position),'<style>c=#ffaa00</style>Hull'));
  const childManager=ManagerContainer.EMPTY.withTexts(TextBlocks.EMPTY.set(BigInt(position),'Dock\n[shipname]'));
  const leaf={name:'sub-dock',segments:[],children:[],meta:{manager:childManager,childTransforms:[],railChildren:[]}};
  const root={name:'hull',segments:[],children:[{name:'dock',segments:[],children:[leaf]}],meta:{manager,childTransforms:[],railChildren:[]}};
  const nodes=JSON.parse(JSON.stringify(inspectionBlueprintEntities(root,'ship')));
  expect(nodes.map((n:{displayTexts:unknown})=>n.displayTexts)).toEqual([[{position,text:'<style>c=#ffaa00</style>Hull'}],[],[{position,text:'Dock\n[shipname]'}]]);
  expect(manager.texts.get(BigInt(position))).toBe('<style>c=#ffaa00</style>Hull');
});
