import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { StarMadeDisplayValues, createStarMadeDisplayPanel } from '../../src/index.js';
import { loadDisplayAssets } from './displayAssets.js';
const assets=await loadDisplayAssets();
const values=new StarMadeDisplayValues();
values.set('demo',{name:'ISS Example',elapsed:0});
const renderer=new WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
const scene=new Scene();const camera=new PerspectiveCamera(45,innerWidth/innerHeight,.01,200);camera.position.set(5,4,9);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.update();
const input=document.querySelector<HTMLTextAreaElement>('#text')!;
const panels=Array.from({length:6},(_,orientation)=>{
 const position=[(orientation%3-1)*2,(orientation<3?1:-1),0] as const;
 const cube=new Mesh(new BoxGeometry(1,1,1),new MeshBasicMaterial({color:0x1c2838}));cube.position.set(...position);scene.add(cube);
 const panel=createStarMadeDisplayPanel({...assets,position,orientation,text:input.value,values:values.forEntity('demo')});scene.add(panel.root);return panel;
});
input.oninput=()=>panels.forEach(panel=>panel.update(input.value));
function draw(){controls.update();values.set('demo',{name:'ISS Example',elapsed:Math.floor(performance.now()/1000)});panels.forEach(panel=>{panel.update();panel.updateVisibility(camera);});renderer.render(scene,camera);}
renderer.setAnimationLoop(draw);
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
document.querySelector('#status')!.textContent='Texte, police et fond chargés depuis l’installation StarMade.';
// Browser acceptance uses the public panel handles; no alternate rendering implementation.
Object.assign(window,{__DISPLAY__:{values,panels,renderer,scene,camera,draw,focus(orientation:number){const p=panels[orientation];p.root.updateMatrixWorld(true);const center=new Vector3(128,128,0).applyMatrix4(p.root.matrixWorld);const normal=new Vector3(0,0,1).transformDirection(p.root.matrixWorld);camera.position.copy(center).addScaledVector(normal,2.5);camera.up.copy(new Vector3(0,-1,0).transformDirection(p.root.matrixWorld));controls.target.copy(center);controls.update();draw();}}});

addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);panels.forEach(panel=>panel.dispose());assets.dispose();for(const object of scene.children)if(object instanceof Mesh){object.geometry.dispose();(object.material as MeshBasicMaterial).dispose();}controls.dispose();renderer.dispose();});
