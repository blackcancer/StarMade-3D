import { Box3, Vector3, type Scene, type PerspectiveCamera, type WebGLRenderer } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createStarMadeBlueprintLodScene } from '../../src/viewer/createBlueprintLodScene.js';

export async function loadBlueprintLodPreview(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, controls: OrbitControls) {
  const start=performance.now();
  const response=await fetch('/starmade-assets/blueprints/isanth.lod.json?level=2');
  if(response.status===404)return undefined;
  if(!response.ok)throw new Error(`LOD cache HTTP ${response.status}`);
  const data=await response.json();
  const handle=createStarMadeBlueprintLodScene(data);
  const bounds=new Box3().setFromObject(handle.root), center=bounds.getCenter(new Vector3()), size=bounds.getSize(new Vector3());
  handle.root.position.sub(center);scene.add(handle.root);
  const distance=Math.max(size.x,size.y,size.z,1)*1.3;
  camera.position.set(distance,distance*.6,distance);controls.target.set(0,0,0);controls.update();
  renderer.setSize(window.innerWidth,window.innerHeight,false);camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();
  handle.update(camera);renderer.render(scene,camera);
  const stats={firstVisibleMs:performance.now()-start,source:'sidecar',level:2,cache:data.cache,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,entities:data.entities.length,bytes:Number(response.headers.get('content-length'))};
  (window as unknown as {__STARMADE_LOD_READY__:unknown}).__STARMADE_LOD_READY__=stats;
  (window as unknown as {__STARMADE_LOD_VIEW__:unknown}).__STARMADE_LOD_VIEW__={renderer,scene,camera,controls,handle};
  return {handle,dispose:()=>{scene.remove(handle.root);handle.dispose();}};
}
