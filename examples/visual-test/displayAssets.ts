import { SRGBColorSpace, TextureLoader, type Group } from 'three';
import { loadStarMadeShaderSources, createStarMadeDisplayPanel, starMadeDisplayKey, type StarMadeDisplayText, type InspectionBlock } from '../../src/index.js';

export async function loadDisplayAssets() {
  await loadStarMadeShaderSources('/starmade-assets/shaders.json');
  const response = await fetch('/starmade-assets/display/Monda-Regular.ttf');
  if (!response.ok) throw Error('Native display font unavailable');
  const face = await new FontFace('StarMadeDisplay', await response.arrayBuffer()).load();
  const colors=['blue','red','green','yellow','purple'] as const;
  const textures=await Promise.all(colors.map(color=>new TextureLoader().loadAsync('/starmade-assets/display/screen-gui-'+color+'.png')));
  textures.forEach(texture=>texture.colorSpace=SRGBColorSpace);
  const backgrounds=Object.fromEntries(colors.map((color,i)=>[color,textures[i]]));
  const background=backgrounds.blue;
  document.fonts.add(face);
  return { background, backgrounds, fontFamily:'StarMadeDisplay', createCanvas:()=>document.createElement('canvas'), dispose:()=>{textures.forEach(texture=>texture.dispose());document.fonts.delete(face)} };
}
export function attachDisplays(root: Group, blocks: readonly InspectionBlock[], records: readonly StarMadeDisplayText[], assets: Awaited<ReturnType<typeof loadDisplayAssets>>) {
  const texts = new Map(records.map(record=>[record.position,record.text]));
  return blocks.filter(block=>block.state.type===479).map(block=>{
    const panel=createStarMadeDisplayPanel({...assets,position:block.position,orientation:block.state.orientation,text:texts.get(starMadeDisplayKey(block.position,block.state.orientation))});
    root.add(panel.root); return panel;
  });
}
