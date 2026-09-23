import { describe, it, expect, vi } from 'vitest';
import { PerspectiveCamera, Texture, Vector3, Group } from 'three';
import { StarMadeDisplayValues, parseStarMadeDisplayText as parse, starMadeDisplayKey as key, starMadeDisplayMatrix as matrix, starMadeDisplayTextsFromManager, createStarMadeDisplayPanel, inspectionBlueprintEntities } from '../src/index.js';

it('reads native position/orientation keys and forwards Decoder manager texts without losing precision',()=>{
  expect(key([0,0,0],0)).toBe('68720525328');
  expect(key([-17,-16,32751],5)).toBe(((5n<<48n)|(32767n<<32n)|65535n).toString());
  for (const p of [[32752,0,0],[-32785,0,0],[.5,0,0]] as const) expect(()=>key(p,0)).toThrow();
  for (const o of [-1,6,.2]) expect(()=>key([0,0,0],o)).toThrow();
  for (const manager of [null,0,{},undefined]) expect(starMadeDisplayTextsFromManager(manager)).toEqual([]);
  const records=new Map([[BigInt(key([0,0,0],5)),'Bridge\nREADY']]);
  const manager={texts:{entries:()=>records}};
  expect(starMadeDisplayTextsFromManager(manager)).toEqual([{position:key([0,0,0],5),text:'Bridge\nREADY'}]);
  const entity={name:'ship',segments:[],children:[],meta:{manager,childTransforms:[],railChildren:[]}};
  const nodes=inspectionBlueprintEntities(entity,'ship');expect(nodes[0].displayTexts?.[0].text).toBe('Bridge\nREADY');
  records.clear();expect(nodes[0].displayTexts).toHaveLength(1);
});

it('parses native styles, aliases, loading/empty states, colors, errors and host substitutions',()=>{
  expect(parse(undefined).text).toBe('loading...');expect(parse('').text).toBe('');
  expect(parse('plain').fontSize).toBe(15);expect(parse('<style>broken').text).toBe('<style>broken');
  for(const c of ['c','color','COLOR']) expect(parse(`<style>${c}=#12abef</style>Text`).color).toBe(0x12abef);
  for(const [s,n] of [['0xff0088',0xff0088],['16711680',0xff0000],['077',63],['-1',0xffffff],['+42',42]] as const)expect(parse(`<style>c=${s}</style>`).color).toBe(n);
  for(const f of ['f','font']) for(let i=0;i<5;i++) expect(parse(`<style>${f}=${i}</style>\nA`).fontSize).toBe([16,18,20,24,30][i]);
  expect(parse('<style>font=99,unknown=1,ignored</style>A').fontSize).toBe(15);
  for(const o of ['o','offset','p','pos','position'])expect(parse(`<style>${o}=1:-2:0.25</style>A`).offset).toEqual([1,-2,.25]);
  expect(parse('<style>o=1:2</style>A').offset).toEqual([0,0,0]);
  for(const h of ['c=bad','c=0xGG','c=089','c=2147483648','c=-2147483649','f=oops','o=1:NaN:2','o=1::2'])expect(parse(`<style>${h}</style>A`)).toMatchObject({text:'style error!',error:true});
  expect(parse('<style>o=1:2:3</style>A').offset).toEqual([1,2,3]);expect(parse('B').offset).toEqual([0,0,0]);
  expect(parse('secret [PASSWORD] never shown').text).toBe('');
  expect(parse('[SHIPNAME] [power] [unknown]',t=>t==='shipname'?'Isanth':undefined).text).toBe('Isanth [power] [unknown]');
  expect(parse('[power]').text).toBe('[power]');
  expect(parse('[power]',()=>{throw Error('host unavailable')})).toMatchObject({error:true,text:'style error!'});
});

it('places all six screens in native face frames, independently of the owning entity transform',()=>{
  const origins=[[-.5,.51,.51],[.5,.51,-.51],[.5,.51,.51],[-.5,-.51,.51],[-.51,.51,-.5],[.51,.51,.5]];
  const rights=[[1,0,0],[-1,0,0],[-1,0,0],[1,0,0],[0,0,1],[0,0,-1]];
  for(let o=0;o<6;o++){
    const m=matrix([0,0,0],o);const origin=new Vector3().setFromMatrixPosition(m);expect(origin.toArray()).toEqual(origins[o]);
    const right=new Vector3(1,0,0).transformDirection(m);rights[o].forEach((v,i)=>expect(right.getComponent(i)).toBeCloseTo(v));
    const parent=new Group();parent.position.set(10,20,30);parent.rotation.y=.7;const panel=new Group();panel.matrixAutoUpdate=false;panel.matrix.copy(m);parent.add(panel);parent.updateMatrixWorld(true);
    expect(panel.getWorldPosition(new Vector3()).distanceTo(origin.applyMatrix4(parent.matrixWorld))).toBeLessThan(1e-9);
  }
  expect(new Vector3().setFromMatrixPosition(matrix([2,3,4],0,[1,2,3])).toArray()).toEqual([-1.5,5.51,5.51]);
  expect(()=>matrix([0,0,0],0,[NaN,0,0])).toThrow();
});

function canvasFixture(width=25,height=20) {
  const context={font:'',textBaseline:'',fillStyle:'',strokeStyle:'',lineWidth:0,strokeText:vi.fn(),scale:vi.fn(),fillText:vi.fn(),measureText:vi.fn(()=>({width,fontBoundingBoxAscent:height-4,fontBoundingBoxDescent:4}))};
  const canvas={width:0,height:0,getContext:()=>context} as unknown as HTMLCanvasElement;
  return {canvas,context};
}
function options(f=canvasFixture()) { return {position:[0,0,0] as const,orientation:0,background:new Texture(),createCanvas:()=>f.canvas,fontFamily:'Monda',text:'A\nB'}; }

describe('owned panel resources and updates',()=>{
 it('renders entity snapshots, prioritizes supplied values and preserves unresolved variables',()=>{
  const values=new StarMadeDisplayValues(), f=canvasFixture();
  values.set('ship',{power:12,name:'Hull'});
  const panel=createStarMadeDisplayPanel({...options(f),values:values.forEntity('ship'),text:'[power] [name] [speed] [unknown]',resolveToken:t=>t==='speed'?'4':undefined});
  expect(f.context.fillText).toHaveBeenLastCalledWith('12 Hull 4 [unknown]',1,17);
  const version=panel.texture.version; values.set('ship',{power:12,name:'Hull'});
  expect(panel.update()).toBe(false); expect(panel.texture.version).toBe(version);
  values.set('ship',{power:13,name:'Hull'}); expect(panel.update()).toBe(true);
  expect(f.context.fillText).toHaveBeenLastCalledWith('13 Hull 4 [unknown]',1,17);
  values.clear('ship');expect(panel.update()).toBe(true);
  expect(f.context.fillText).toHaveBeenLastCalledWith('[power] [name] 4 [unknown]',1,17);panel.dispose();
 });
 it('rasterizes styled multiline text, stays unlit/depth-tested, updates only on changes and releases owned resources',()=>{
  const f=canvasFixture();const opt=options(f);const panel=createStarMadeDisplayPanel(opt);
  expect(f.canvas.width).toBe(54);expect(f.canvas.height).toBe(84);
  expect(f.context.fillText.mock.calls).toEqual([['A',1,17],['B',1,37]]);
  expect(panel.text.material.depthTest).toBe(true);expect(panel.text.material.depthWrite).toBe(false);expect(panel.text.material.toneMapped).toBe(false);expect(panel.background.geometry.attributes.position.count).toBe(4);
  expect(panel.update()).toBe(false);expect(panel.update(undefined)).toBe(true);expect(f.context.fillText).toHaveBeenLastCalledWith('loading...',1,17);expect(panel.update('<style>c=#00ff00,f=4,o=1:2:3</style>NEW')).toBe(true);expect(f.context.fillStyle).toBe('#00fa00');expect(f.context.strokeText).toHaveBeenLastCalledWith('NEW',1,17);expect(f.context.lineWidth).toBe(1);expect(f.context.font).toBe('bold 30px "Monda"');
  const camera=new PerspectiveCamera();camera.position.set(0,0,100);panel.updateVisibility(camera);expect(panel.text.visible).toBe(true);camera.position.set(0,0,600);panel.updateVisibility(camera);expect(panel.text.visible).toBe(false);expect(panel.background.visible).toBe(true);camera.position.set(0,0,0);panel.updateVisibility(camera);expect(panel.text.visible).toBe(true);
  const shared=vi.fn(),owned=vi.fn();opt.background.addEventListener('dispose',shared);panel.texture.addEventListener('dispose',owned);
  new Group().add(panel.root);panel.dispose();panel.dispose();expect(shared).not.toHaveBeenCalled();expect(owned).toHaveBeenCalledTimes(1);expect(panel.root.parent).toBeNull();expect(()=>panel.update('x')).toThrow('disposed');
 });
 it('refreshes host values without changing raw text and honors custom draw distance',()=>{
  let value='one';const panel=createStarMadeDisplayPanel({...options(),text:'[power]',resolveToken:()=>value,maxTextDistance:0});value='two';expect(panel.update()).toBe(true);const camera=new PerspectiveCamera();panel.updateVisibility(camera);expect(panel.text.visible).toBe(false);panel.dispose();
 });
 it('fails explicitly for missing rasterizers or bounded invalid content, cleaning allocations',()=>{
  expect(()=>createStarMadeDisplayPanel({...options(),maxTextDistance:-1})).toThrow();
  expect(()=>createStarMadeDisplayPanel({...options(),createCanvas:()=>({getContext:()=>null}) as unknown as HTMLCanvasElement})).toThrow('2D');
  expect(()=>createStarMadeDisplayPanel({...options(),text:'x'.repeat(16385)})).toThrow('16384');
  for(const f of [canvasFixture(5000),canvasFixture(20,5000),canvasFixture(20,NaN),canvasFixture(20,0)])expect(()=>createStarMadeDisplayPanel(options(f))).toThrow('dimensions');
  const panel=createStarMadeDisplayPanel({...options(),text:undefined});expect(panel.update()).toBe(false);panel.dispose();
 });
});

it('updates backgrounds, native rotations, variable reads and time without rerasterizing',()=>{
 const f=canvasFixture(), red=new Texture(), values=new StarMadeDisplayValues();values.setVariables('s',{a:'FIRST'});
 const p=createStarMadeDisplayPanel({...options(f),backgrounds:{red},values:values.forEntity('s'),text:'<style>bg=red,r=10:20:30,h=false,f=0</style>[var:a]'});
 expect(p.background.material.map).toBe(red);expect(p.text.parent!.rotation.x).toBeCloseTo(10*Math.PI/180);
 const shader={uniforms:{},fragmentShader:'void main() {\n#include <map_fragment>\n}'};
 p.text.material.onBeforeCompile(shader as never,{} as never);
 expect(shader.fragmentShader).toContain('starMadeDisplayScanline');
 const uniforms=shader.uniforms as Record<string,{value:unknown}>;
 expect(uniforms.smDisplayHolographic.value).toBe(false);
 const version=p.texture.version;p.updateTime(.25);expect(uniforms.uTime.value).toBe(.5);expect(p.texture.version).toBe(version);
 expect(p.text.material.customProgramCacheKey()).toContain('starmade-display-scanline:');
 for(const v of [-1,NaN,Infinity])expect(()=>p.updateTime(v)).toThrow('time');
 p.update('<style>bg=false,h=true</style>');expect(p.background.visible).toBe(false);expect(uniforms.smDisplayHolographic.value).toBe(true);
 values.setVariables('s',{a:'SECOND'});p.update('[var:a]');expect(f.context.fillText).toHaveBeenLastCalledWith('SECOND',1,17);
 p.dispose();expect(()=>p.updateTime(0)).toThrow('disposed');
 expect(()=>createStarMadeDisplayPanel({...options(),text:'<style>bg=purple</style>A'})).toThrow('background');
 const q=createStarMadeDisplayPanel({...options(),text:'<style>bg=purple,bg=false</style>[var:a]',resolveVariable:()=>undefined});q.dispose();
 const r=createStarMadeDisplayPanel({...options(),text:'[var:a]',resolveVariable:()=> 'fallback'});r.dispose();
});
