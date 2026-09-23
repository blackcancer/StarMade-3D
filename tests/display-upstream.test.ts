import { expect, it } from 'vitest';
import { parseStarMadeDisplayText as parse } from '../src/index.js';

it('cascades multiple styled segments, expanded fonts and last-set panel attributes',()=>{
 const s=parse('Default<style>c=#ff0000,f=5,o=20:-20:2,r=45,bg=red,h=false</style>\nRed<style>c=#00ff00</style>Green');
 expect(s.segments.map(x=>[x.text,x.fontSize,x.color,x.bold])).toEqual([['Default',15,0xffffff,false],['Red',40,0xff0000,true],['Green',40,0x00ff00,true]]);
 expect(s.offset).toEqual([10,-10,2]);expect(s.rotation).toEqual([0,0,45]);expect(s.background).toBe('red');expect(s.holographic).toBe(false);
});
it('hides custom variable writes, resolves reads, and suppresses only password segment and following segments',()=>{
 expect(parse('Public<style>f=1</style>Private[password]<style>f=2</style>Secret').text).toBe('Public');
 expect(parse('[set:a=1][var:a][unset:a][var:absent]',undefined,name=>name==='a'?'42':undefined).text).toBe('42');
});

it('covers native style aliases, segment caps, case handling, resets and malformed numbers',()=>{
 for (let i=0;i<9;i++) expect(parse(`<STYLE>font=${i}</STYLE>X`).fontSize).toBe([16,18,20,24,30,40,70,100,300][i]);
 for(const value of ['-1','99'])expect(parse(`<style>f=4</style>A<style>f=${value}</style>B`).segments[1]).toMatchObject({fontSize:15,bold:false});
 for(const alias of ['r','rot','rotation']) {
  expect(parse(`<style>${alias}=1:2:3</style>A`).rotation).toEqual([1,2,3]);
  expect(parse(`<style>${alias}=1:2</style>A`).rotation).toEqual([0,0,0]);
 }
 for(const alias of ['h','holo','holographic']) {
  expect(parse(`<style>${alias}=TRUE</style>A`).holographic).toBe(true);
  expect(parse(`<style>${alias}=anything</style>A`).holographic).toBe(false);
 }
 for(const alias of ['bg','background'])for(const color of ['blue','red','green','yellow','purple'])expect(parse(`<style>${alias}=${color.toUpperCase()}</style>A`).background).toBe(color);
 expect(parse('<style>bg=false</style>A<style>bg=red</style>B')).toMatchObject({drawBackground:false,background:'red'});
 expect(parse('<style>bg=false</style>A<style>bg=true,bg=unknown</style>B').drawBackground).toBe(true);
 expect(parse('<style>bg=</style>').background).toBe('blue');
 for(const bad of ['r=NaN','r=1::3','r=Infinity','f=2147483648','f=-2147483649'])expect(parse(`<style>${bad}</style>A`).error).toBe(true);
 expect(parse('<style>r=45,bg=red,h=false,o=1:2:3</style>A')).toMatchObject({rotation:[0,0,45]});
 expect(parse('Reset')).toMatchObject({rotation:[0,0,0],offset:[0,0,0],background:'blue',holographic:true,drawBackground:true});
 const many=Array.from({length:35},(_,i)=>`<style>f=0</style>${i}`).join('');
 expect(parse(many).segments).toHaveLength(32);expect(parse(many).segments.at(-1)?.text).toBe('31');
 expect(parse('<style>f=1</style>').text).toBe('<style>f=1</style>');
 expect(parse('[var:absent]').text).toBe('');expect(parse('[set:x=1][unset:x]').text).toBe('');
 expect(parse('[VAR: Foo ]',undefined, name=>name==='foo'?'$& [name]':undefined).text).toBe('$& [name]');
});
