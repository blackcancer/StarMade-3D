import { attachDisplays, loadDisplayAssets } from './displayAssets.js';
const displayAssets = await loadDisplayAssets();
let displayPanels: ReturnType<typeof attachDisplays> = [];
import { loadStarMadeShaderSources } from '../../src/shaders/sources.js';
await loadStarMadeShaderSources('/starmade-assets/shaders.json');
import { AmbientLight, Color, Float32BufferAttribute, MeshBasicMaterial, DirectionalLight, Group, Matrix4, Mesh, MeshStandardMaterial, Texture, Vector3, ShaderMaterial, type Material, type BufferGeometry, type Object3D, OrthographicCamera, PerspectiveCamera, Raycaster, Scene, Vector2, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  FUNCTIONAL_CATEGORIES, buildFunctionalMap, functionalControllersFromBlueprint,
  inspectEntityHierarchy, inspectionSubtree, inspectionDocumentFromBlueprint, createInspectionRelationOverlay,
  type FunctionalBlockInfo, type FunctionalController, type FunctionalCategory, type InspectionBlueprintNode,
  InspectionDocument, InspectionHitIndex, InspectionSelection, InspectionResourceManager,
  blockDefinitionFromConfig, blockDefinitionFromElementInfo,
  buildInspectionSegments, inspectionSegmentTriangles, entityWorldMatrix,
  inspectionPredicate, inspectionBounds, frameInspectionBounds, inspectDocument,
  compareInspectionDocuments, blockReferenceKey, createInspectionHighlight,
  collectStarMadeLodBlockInstances, loadStarMadeLodPrototypes, createStarMadeLodModelRegistry, parseStarMadeLodModelDefinitions,
  getStarMadeLodOrientationQuaternion, starMadeBlockLodModelName,
  loadStarMadeCubeTexturePack, createStarMadeCubeShaderMaterial, applyStarMadeSceneSunToShaderMaterial,
  createStarMadeSegmentBlockLightScene, applyStarMadeBlockLightToEncodedCubeGeometry, segmentsFromBlocks,
  createStarMadeLodInstance, collectStarMadeLodShaderMaterials, updateStarMadeCubeShaderMVP,
  updateStarMadeCubeShaderClipPlanes, updateStarMadeCubeShaderTime, type StarMadeCubeTexturePack,
  type StarMadeLodBlockInstance, type StarMadeLodPrototypeLoadResult, type InspectionAssetHandle,
  exportInspectionGltf, captureInspectionPreview, measureBlockCentres,
  type BlockDefinition, type BlockPosition, type InspectionEntity,
  type DecoderBlockElementInfoLike, type DecoderBlockDefinitionLike
} from '../../src/index.js';
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const viewport = element('viewport'); const status = element('status'); const details = element('details');
const renderer = new WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); viewport.prepend(renderer.domElement);
const scene = new Scene(); scene.background = new Color(0x101720); scene.add(new AmbientLight(0xffffff, 1.7));
const sun = new DirectionalLight(0xffffff, 2.2); sun.position.set(3, 8, 5); scene.add(sun);
const group = new Group(); scene.add(group);
let camera: PerspectiveCamera | OrthographicCamera = new PerspectiveCamera(45, 1, .01, 1000);
let controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
const hits = new InspectionHitIndex(); const selection = new InspectionSelection();
let overlay = createInspectionHighlight(new InspectionDocument('empty', 0, []), []); scene.add(overlay.root);
let current: InspectionDocument; let original: InspectionDocument;
let definitions = new Map<number, BlockDefinition>();
let functionalDefinitions = new Map<number, FunctionalBlockInfo>();
let controllers: FunctionalController[] = [];
let blueprintNodes: readonly InspectionBlueprintNode[] = [];
let functionalMap: ReturnType<typeof buildFunctionalMap>;
let relationOverlay: ReturnType<typeof createInspectionRelationOverlay> | undefined;
function mappingEnabled() { return element<HTMLInputElement>('functional').checked; }
function visiblePredicate() {
  const base = inspectionPredicate(filter);
  if (!mappingEnabled()) return base;
  const category = element<HTMLSelectElement>('category').value as FunctionalCategory;
  const system = functionalMap.systems[Number(element<HTMLSelectElement>('system').value)];
  const cells = element<HTMLSelectElement>('system').value !== '' && system ? new Set([system.controller, ...system.members].map(blockReferenceKey)) : null;
  return (block: ReturnType<InspectionDocument['query']>[number]) => base(block) && (cells ? cells.has(blockReferenceKey(block.ref)) : category ? functionalDefinitions.get(block.state.type)?.category === category : !!functionalDefinitions.get(block.state.type)?.category);
}
function functionalColor(type: number) { const category = functionalDefinitions.get(type)?.category; return category ? FUNCTIONAL_CATEGORIES[category].color : 0x687782; }
function refreshMapControls() {
  functionalMap = buildFunctionalMap(current, functionalDefinitions, controllers);
  const select = element<HTMLSelectElement>('system'); const previous = select.value;
  select.replaceChildren(new Option('Tous les contrôleurs', ''));
  functionalMap.systems.forEach((system, index) => select.add(new Option(`${functionalDefinitions.get(system.type)?.name ?? system.type} [${system.controller.position}] · ${system.members.length} blocs`, String(index))));
  select.value = previous;
  element('functional-info').textContent = `${functionalMap.systems.length} contrôleurs · ${functionalMap.relations.length} liaisons enregistrées\n${functionalMap.unlinked.length} modules sans liaison compatible · ${functionalMap.diagnostics.length} anomalies`;
  const legend = element('legend'); legend.replaceChildren();
  for (const [category, refs] of functionalMap.categories) { const row = document.createElement('div'); row.style.color = '#' + FUNCTIONAL_CATEGORIES[category].color.toString(16).padStart(6, '0'); row.textContent = `${FUNCTIONAL_CATEGORIES[category].label} : ${refs.length}`; legend.append(row); }
}
function refreshEntityTree() {
  const tree = element('entity-tree'); tree.replaceChildren();
  for (const node of inspectEntityHierarchy(current)) {
    const meta = blueprintNodes.find(n => n.id === node.id);
    const button = document.createElement('button'); button.dataset.entityId = node.id; button.dataset.depth = String(node.depth); button.style.paddingLeft = `${8 + node.depth * 16}px`;
    button.textContent = `${node.depth ? '↳ ' : ''}${meta?.label ?? node.id} · ${node.blockCount} blocs${meta?.docking ? ' · ' + meta.docking.mode : ''}`;
    button.onclick = () => {
      const ids = element<HTMLInputElement>('descendants').checked ? inspectionSubtree(current, node.id) : new Set([node.id]);
      filter = { entities: ids }; selection.clear(); rebuild(); frame();
      element('entity-info').textContent = `${meta?.label ?? node.id}\nID : ${node.id}\nParent : ${node.parentId ?? 'Aucun (racine)'}\n${node.children.length} docking(s) direct(s) · ${node.subtreeBlockCount} blocs avec descendants\n${meta?.docking ? `Arrimage : ${meta.docking.mode}\nConnecteur parent : ${meta.docking.parentConnector ?? 'non renseigné'}\nConnecteur enfant : ${meta.docking.childConnector ?? 'non renseigné'}\nPose statique sauvegardée si disponible ; mouvement non simulé.` : ''}`;
    }; tree.append(button);
  }
}
let filter: Parameters<typeof inspectionPredicate>[0] = {};
let disposers: (() => void)[] = [];
let lodMaterials: ShaderMaterial[] = [];
let lastDiff: ReturnType<typeof compareInspectionDocuments> | undefined;
let diffOverlays: ReturnType<typeof createInspectionHighlight>[] = [];
const pool = new InspectionResourceManager<unknown>(async (key, signal, progress) => {
  const response = await fetch(key, { signal }); if (!response.ok) throw Error(`HTTP ${response.status}`);
  const text = await response.text(); progress({ loaded: text.length, total: text.length }); return key.endsWith('.xml') ? text : JSON.parse(text);
}, () => {}, diagnostic => { status.textContent = diagnostic.message; });
const lodRequests = new Map<string, readonly StarMadeLodBlockInstance[]>();
const lodPool = new InspectionResourceManager<StarMadeLodPrototypeLoadResult>(async key => {
  const entries = lodRequests.get(key)!; lodRequests.delete(key);
  return loadStarMadeLodPrototypes(entries);
}, result => {
  const geometries = new Set<BufferGeometry>(); const materials = new Set<Material>(); const textures = new Set<Texture>();
  for (const prototype of result.prototypes.values()) prototype.traverse(object => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material); for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose());
});
let lodHandle: InspectionAssetHandle<StarMadeLodPrototypeLoadResult> | undefined;
let lodPrototypes: ReadonlyMap<string, Object3D> = new Map();
let missingLods: readonly string[] = [];
const nativeSun = { position: new Vector3(450, 900, 0), ambient: new Vector3(.45, .45, .45), diffuse: new Vector3(1, 1, 1), specular: new Vector3(.45, .45, .45), sourceAmbient: new Vector3(.05, .05, .05) };
type SurfaceAssets = { pack: StarMadeCubeTexturePack; opaque: ShaderMaterial; blended: ShaderMaterial };
const surfaces = new InspectionResourceManager<SurfaceAssets>(async () => {
  const pack = await loadStarMadeCubeTexturePack({ baseUrl: '/starmade-assets/textures/block', customBaseUrl: '/starmade-assets/custom-block-textures', pack: 'Default', tileSize: 256, includeCustom: true, includeNormals: true });
  const create = (blended: boolean) => { const material = createStarMadeCubeShaderMaterial({ textureLayers: pack.layers, normalTextureLayers: pack.normalLayers, overlayMap: pack.overlay, blended, normalStrength: 1, lightPosition: nativeSun.position.clone() }); applyStarMadeSceneSunToShaderMaterial(material, nativeSun); return material; };
  return { pack, opaque: create(false), blended: create(true) };
}, assets => {
  const textures = new Set<Texture>([...assets.pack.layers.values(), ...assets.pack.normalLayers!.values()]);
  if (assets.pack.overlay) textures.add(assets.pack.overlay);
  for (const material of [assets.opaque, assets.blended]) { for (const uniform of Object.values(material.uniforms)) if (uniform.value instanceof Texture) textures.add(uniform.value); material.dispose(); }
  textures.forEach(texture => texture.dispose());
});
let surfaceAssets: SurfaceAssets | undefined;
let surfaceHandle: InspectionAssetHandle<SurfaceAssets> | undefined;
let loadController: AbortController | undefined;
let generation = 0;
function fixture() {
  generation++; loadController?.abort();
  definitions = new Map([
    [1, blockDefinitionFromConfig({ id: 1, name: 'Coque', textureIds: [1] })],
    [2, blockDefinitionFromConfig({ id: 2, name: 'Dalle', textureIds: [1], slab: 2 })],
    [3, blockDefinitionFromConfig({ id: 3, name: 'Pente', textureIds: [1], blockStyle: 1 })]
  ]);
  const blocks = [];
  for (let x = -3; x <= 3; x++) for (let z = -2; z <= 2; z++) for (let y = 0; y <= 2; y++) {
    if (y === 1 && Math.abs(x) < 3 && Math.abs(z) < 2) continue;
    blocks.push({ position: [x, y, z] as BlockPosition, state: { type: y === 2 ? 2 : 1, hp: 255, orientation: 2, active: false, extra: 0 } });
  }
  functionalDefinitions = new Map([[1, { id: 1, name: 'Coque de démonstration', typeName: 'DEMO_HULL', category: null, computerType: null, canControl: false }], [2, { id: 2, name: 'Dalles de démonstration', typeName: 'DEMO_SLAB', category: null, computerType: null, canControl: false }], [3, { id: 3, name: 'Tourelle de démonstration', typeName: 'DEMO_TURRET', category: 'weapons', computerType: null, canControl: false }]]);
  controllers = []; blueprintNodes = [];
  const entities: InspectionEntity[] = [{ id: 'hull', blocks }, { id: 'turret', parentId: 'hull', transform: new Matrix4().makeRotationY(Math.PI / 4).setPosition(0, 4, 0).toArray(), blocks: [0, 1].map(x => ({ position: [x, 0, 0] as const, state: { type: 3, hp: 255, orientation: 0, active: true } })) }];
  entities.push({ id: 'turret/sensor', parentId: 'turret', transform: new Matrix4().makeTranslation(2, 0, 0).toArray(), blocks: [{ position: [0, 0, 0], state: { type: 3, hp: 255, orientation: 0, active: true } }] });
  adopt(new InspectionDocument('inspection-demo', 0, entities));
}
function adopt(doc: InspectionDocument, loaded?: StarMadeLodPrototypeLoadResult, handle?: InspectionAssetHandle<StarMadeLodPrototypeLoadResult>, textures?: SurfaceAssets, texturesHandle?: InspectionAssetHandle<SurfaceAssets>) {
  const oldSurfaceHandle = surfaceHandle; surfaceAssets = textures; surfaceHandle = texturesHandle;
  const oldHandle = lodHandle; lodHandle = handle; lodPrototypes = loaded?.prototypes ?? new Map(); missingLods = loaded?.missing ?? [];
  current = doc; original = doc; selection.clear(); filter = {}; lastDiff = undefined;
  element<HTMLInputElement>('functional').checked = false; element<HTMLSelectElement>('category').value = ''; element<HTMLSelectElement>('system').value = ''; element('entity-info').textContent = ''; refreshMapControls(); refreshEntityTree();
  element<HTMLInputElement>('type').value = '';
  const positions = doc.query().map(b => b.ref.position);
  const cut = element<HTMLInputElement>('cut'); cut.min = String(Math.min(...positions.flat())); cut.max = String(Math.max(...positions.flat())); cut.value = cut.max;
  element('cut-value').textContent = 'Aucune'; element('caption').textContent = `${surfaceAssets ? 'Textures StarMade' : 'Couleurs d’inspection'} · Cliquer pour sélectionner · Maj : sélection multiple`; rebuild(); oldHandle?.release(); oldSurfaceHandle?.release(); frame();
}
function rebuild() {
  displayPanels.forEach(panel => panel.dispose()); displayPanels = [];
  diffOverlays.forEach(o => o.dispose()); diffOverlays = [];
  disposers.forEach(dispose => dispose()); disposers = []; group.clear();
  refreshMapControls();
  const predicate = visiblePredicate();
  relationOverlay?.dispose();
  // The Isanth endpoint currently supplies translations. Rotated fixture entities keep inspection materials.
  const blockLight = !mappingEnabled() && surfaceAssets && createStarMadeSegmentBlockLightScene({ entities: current.entities.map(entity => {
    const matrix = entityWorldMatrix(current, entity.id);
    return { name: entity.id, offset: [matrix.elements[12], matrix.elements[13], matrix.elements[14]] as BlockPosition, segments: segmentsFromBlocks(entity.blocks.filter(b => predicate({ ref: { entityId: entity.id, position: b.position }, state: b.state }))) };
  }), blockDefinitions: definitions, rayCount: 128 });
  for (const entity of current.entities) {
    const root = new Group(); root.matrixAutoUpdate = false; root.matrix.copy(entityWorldMatrix(current, entity.id)); group.add(root);
    const panels = attachDisplays(root, current.query(b => b.ref.entityId === entity.id && predicate(b)).map(b => ({position:b.ref.position,state:b.state})), blueprintNodes.find(node => node.id === entity.id)?.displayTexts ?? [], displayAssets);
    const displayBlocks = current.query(b => b.ref.entityId === entity.id && predicate(b) && b.state.type === 479);
    panels.forEach((panel,i) => { hits.bindBlock(panel.root,current,displayBlocks[i].ref); disposers.push(()=>hits.unbind(panel.root)); });
    displayPanels.push(...panels);
    for (const entry of buildInspectionSegments(current, entity.id, predicate, { blockDefinitions: definitions, starMadeAtlasLayout: surfaceAssets?.pack.layout, isBlockMeshed: context => !context.blockDefinition || !lodPrototypes.has(starMadeBlockLodModelName(context.blockDefinition, context.block.active)) })) {
      for (const pass of ['opaque', 'blended'] as const) {
        const geometry = entry.batches[pass];
        const material = mappingEnabled() ? new MeshBasicMaterial({ vertexColors: true }) : surfaceAssets?.[pass] ?? new MeshStandardMaterial({ color: pass === 'blended' ? 0x81d9f4 : 0x7b9ba9, transparent: pass === 'blended', opacity: pass === 'blended' ? .4 : 1, roughness: .85 });
        if (blockLight) applyStarMadeBlockLightToEncodedCubeGeometry(geometry, [entry.origin[0] - 16 + root.matrix.elements[12], entry.origin[1] - 16 + root.matrix.elements[13], entry.origin[2] - 16 + root.matrix.elements[14]], { volume: blockLight.volume, volumeShift: blockLight.shift, castBoost: 1, occlusionFloor: 0 });
        if (mappingEnabled()) {
          const colors = new Float32Array(geometry.getAttribute('position').count * 3);
          const triangles = inspectionSegmentTriangles(geometry, entity.id, entry.origin); const index = geometry.getIndex()!;
          triangles.forEach((triangle, i) => { const color = new Color(functionalColor(current.resolve(triangle.ref)!.state.type)); for (let j = 0; j < 3; j++) color.toArray(colors, index.getX(i * 3 + j) * 3); });
          geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
        }
        const mesh = new Mesh(geometry, material); mesh.name = `${entity.id}:${entry.origin}:${pass}`;
        hits.bindTriangles(mesh, current, inspectionSegmentTriangles(geometry, entity.id, entry.origin)); root.add(mesh);
        disposers.push(() => { hits.unbind(mesh); geometry.dispose(); if (!(material instanceof ShaderMaterial)) material.dispose(); });
      }
    }
    for (const block of current.query(b => b.ref.entityId === entity.id && predicate(b))) {
      const definition = definitions.get(block.state.type); if (!definition) continue;
      const prototype = lodPrototypes.get(starMadeBlockLodModelName(definition, block.state.active)); if (!prototype) continue;
      const wrapper = new Group(); wrapper.position.set(...block.ref.position); wrapper.quaternion.copy(getStarMadeLodOrientationQuaternion(block.state.orientation, definition.blockStyle));
      wrapper.name = `lod:${blockReferenceKey(block.ref)}`; wrapper.userData.blockReference = block.ref;
      const material = mappingEnabled() ? new MeshBasicMaterial({ color: functionalColor(block.state.type) }) : new MeshStandardMaterial({ color: 0x8fb5a2, roughness: .85 });
      const sharedTextures = new Set<Texture>();
      prototype.traverse(object => {
        if (!(object instanceof Mesh)) return;
        for (const source of Array.isArray(object.material) ? object.material : [object.material]) {
          for (const value of Object.values(source)) if (value instanceof Texture) sharedTextures.add(value);
          if (source instanceof ShaderMaterial) for (const uniform of Object.values(source.uniforms)) if (uniform.value instanceof Texture) sharedTextures.add(uniform.value);
        }
      });
      const offset = new Vector3().setFromMatrixPosition(root.matrix);
      const clone = blockLight ? createStarMadeLodInstance(prototype, { key: blockReferenceKey(block.ref), entityName: entity.id, blockId: block.state.type, blockDefinition: definition, block: block.state, position: [0, 0, 0], worldPosition: [block.ref.position[0] + offset.x, block.ref.position[1] + offset.y, block.ref.position[2] + offset.z], modelReference: { name: '', filename: '', relpath: '', sceneUrl: '', texturePath: '' } }, { volume: blockLight.volume, volumeShift: blockLight.shift, sun: nativeSun }) : prototype.clone(true);
      if (blockLight) wrapper.quaternion.identity(); // Native instance already applies the orientation.
      const sceneOnly: Object3D[] = [];
      clone.traverse(object => {
        if (object instanceof Mesh && !blockLight) object.material = material;
        if ('isLight' in object || 'isCamera' in object) sceneOnly.push(object);
      });
      sceneOnly.forEach(object => object.removeFromParent());
      wrapper.add(clone); root.add(wrapper); hits.bindBlock(wrapper, current, block.ref);
      disposers.push(() => {
        hits.unbind(wrapper); material.dispose();
        const ownedTextures = new Set<Texture>();
        for (const shader of collectStarMadeLodShaderMaterials(clone)) {
          for (const uniform of Object.values(shader.uniforms)) if (uniform.value instanceof Texture && !sharedTextures.has(uniform.value)) ownedTextures.add(uniform.value);
          shader.dispose();
        }
        ownedTextures.forEach(texture => texture.dispose());
      });
    }
  }
  if (mappingEnabled() && element<HTMLInputElement>('links').checked) {
    relationOverlay = createInspectionRelationOverlay(current, functionalMap.relations.filter(edge => predicate(current.resolve(edge.from)!) && predicate(current.resolve(edge.to)!)));
    scene.add(relationOverlay.root);
  }
  lodMaterials = collectStarMadeLodShaderMaterials(group);
  group.updateMatrixWorld(true); selection.reconcile(current); refreshSelection();
  const report = inspectDocument(current, definitions);
  const lod = group.children.flatMap(root => root.children).filter(object => object.name.startsWith('lod:')).length;
  status.textContent = `${report.occupiedCells} blocs · ${current.entities.length} entités · révision ${current.revision}${lod ? ` · ${lod} modèles LOD` : ''}${missingLods.length ? ` · modèles manquants : ${missingLods.join(', ')}` : ''}`;
}
function refreshSelection() {
  overlay.dispose(); overlay = createInspectionHighlight(current, selection.values().filter(ref => visiblePredicate()(current.resolve(ref)!))); scene.add(overlay.root);
  const selected = selection.values();
  const lines = selected.slice(0, 8).map(ref => { const b = current.resolve(ref)!; return `${ref.entityId} [${ref.position}]\n${definitions.get(b.state.type)?.name ?? 'Type inconnu'} (#${b.state.type})\nHP ${b.state.hp} · orientation ${b.state.orientation} · actif brut ${b.state.active} · extra ${b.state.extra ?? 0}`; });
  if (selected.length === 2) lines.push(`Distance des centres : ${measureBlockCentres(current, selected[0], selected[1]).toFixed(3)} blocs`);
  details.textContent = selected.length ? `${selected.length} sélectionné(s)\n\n${lines.join('\n\n')}` : 'Aucun bloc sélectionné.';
}
function resize() { const { width, height } = viewport.getBoundingClientRect(); renderer.setSize(width, height, false); if (camera instanceof PerspectiveCamera) camera.aspect = width / height; else { camera.left = -width / height * camera.top; camera.right = -camera.left; } camera.updateProjectionMatrix(); }
function frame() { resize(); const bounds = inspectionBounds(current, current.query(visiblePredicate())); if (!bounds.isEmpty()) controls.target.copy(frameInspectionBounds(camera, bounds)); controls.update(); }
function setCamera(orthographic: boolean) { controls.dispose(); camera = orthographic ? new OrthographicCamera(-1, 1, 1, -1, .01, 1000) : new PerspectiveCamera(45, 1, .01, 1000); controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; frame(); }
renderer.domElement.addEventListener('click', event => {
  const rect = renderer.domElement.getBoundingClientRect(); const ray = new Raycaster(); ray.setFromCamera(new Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
  const intersection = ray.intersectObject(group, true)[0]; const hit = intersection && hits.resolve(current, intersection);
  if (!event.shiftKey) selection.clear(); if (hit) selection.set(hit.ref, !selection.has(hit.ref)); refreshSelection();
});
element('fixture').onclick = fixture;
element('isanth').onclick = async () => {
  const token = ++generation; loadController?.abort(); loadController = new AbortController(); status.textContent = 'Chargement d’Isanth…';
  const handles = ['/starmade-assets/blueprints/isanth-smd3.json', '/starmade-assets/config/block-config.json', '/starmade-assets/config/mainConfig.xml'].map(url => pool.acquire(url, { signal: loadController!.signal }));
  let pendingLods: InspectionAssetHandle<StarMadeLodPrototypeLoadResult> | undefined;
  let pendingSurfaces: InspectionAssetHandle<SurfaceAssets> | undefined;
  try {
    const [raw, config, mainConfig] = await Promise.all(handles.map(h => h.value)); if (token !== generation) return;
    const payload = raw as { entities: InspectionBlueprintNode[] };
    const source = config as { blocks?: DecoderBlockDefinitionLike[]; elementInfo?: DecoderBlockElementInfoLike[]; functional: FunctionalBlockInfo[] };
    const loadedDefinitions = new Map((source.elementInfo ? source.elementInfo.map(blockDefinitionFromElementInfo) : source.blocks!.map(blockDefinitionFromConfig)).map(d => [d.id, d]));
    const entities = payload.entities;
    // Entity IDs and local offsets preserve the attachment hierarchy supplied by the Decoder.
    const imported = inspectionDocumentFromBlueprint(entities, loadedDefinitions, 'isanth'); const doc = imported.document;
    const entries = collectStarMadeLodBlockInstances({ entities, blockDefinitions: loadedDefinitions, registry: createStarMadeLodModelRegistry(parseStarMadeLodModelDefinitions(mainConfig as string)), modelBaseUrl: '/starmade-assets/models/lod' });
    const key = `isanth/${token}`; lodRequests.set(key, entries); pendingLods = lodPool.acquire(key);
    pendingSurfaces = surfaces.acquire('Default/256');
    const [loaded, textures] = await Promise.all([pendingLods.value, pendingSurfaces.value]); if (token !== generation) return;
    functionalDefinitions = new Map(source.functional.map(info => [info.id, info])); controllers = entities.flatMap(e => functionalControllersFromBlueprint(e.id, e.controllers)); blueprintNodes = entities;
    definitions = loadedDefinitions; adopt(doc, loaded, pendingLods, textures, pendingSurfaces); pendingLods = undefined; pendingSurfaces = undefined; if (imported.diagnostics.length) status.textContent += ` · ${imported.diagnostics.length} pose(s) remplacée(s) par les offsets`;
  } catch (error) { if (token === generation) status.textContent = String(error); }
  finally { pendingSurfaces?.release(); pendingLods?.release(); handles.forEach(h => h.release()); }
};
for (const [id, category] of Object.entries(FUNCTIONAL_CATEGORIES)) element<HTMLSelectElement>('category').add(new Option(category.label, id));
for (const id of ['functional', 'category', 'system', 'links']) element(id).onchange = () => { if (id === 'category' || id === 'system') element<HTMLInputElement>('functional').checked = true; rebuild(); frame(); };
element('unlinked').onclick = () => { element<HTMLInputElement>('functional').checked = false; filter = { cells: new Set(functionalMap.unlinked.map(blockReferenceKey)) }; selection.clear(); functionalMap.unlinked.forEach(ref => selection.set(ref)); rebuild(); frame(); };
element('search').onclick = () => { selection.clear(); const value = element<HTMLInputElement>('type').value; current.query(b => value === '' || b.state.type === Number(value)).forEach(b => selection.set(b.ref)); refreshSelection(); };
element('isolate').onclick = () => { filter = { cells: new Set(selection.values().map(blockReferenceKey)) }; rebuild(); frame(); };
element('reset').onclick = () => { filter = {}; element<HTMLInputElement>('functional').checked = false; element('cut-value').textContent = 'Aucune'; rebuild(); frame(); };
element('cut').oninput = () => { const max: [number, number, number] = [Infinity, Infinity, Infinity]; max[element<HTMLSelectElement>('axis').selectedIndex] = Number(element<HTMLInputElement>('cut').value); filter = { max }; element('cut-value').textContent = String(element<HTMLInputElement>('cut').value); rebuild(); };
element('axis').onchange = () => element('cut').dispatchEvent(new Event('input'));
element('perspective').onclick = () => setCamera(false); element('orthographic').onclick = () => setCamera(true); element('frame').onclick = frame;
element('change').onclick = () => { const ref = selection.values()[0]; if (!ref) { status.textContent = 'Sélectionner un bloc à modifier.'; return; } const b = current.resolve(ref)!; current = current.apply(current.revision, [{ kind: 'block', ref, state: { ...b.state, active: !b.state.active } }]); rebuild(); };
element('compare').onclick = () => {
  lastDiff = compareInspectionDocuments(original, current); details.textContent = JSON.stringify(lastDiff, null, 2);
  diffOverlays.forEach(o => o.dispose());
  diffOverlays = [
    createInspectionHighlight(current, lastDiff.blocks.filter(b => b.after && !b.before).map(b => b.ref), 0x55ee88),
    createInspectionHighlight(original, lastDiff.blocks.filter(b => b.before && !b.after).map(b => b.ref), 0xff6666),
    createInspectionHighlight(current, lastDiff.blocks.filter(b => b.before && b.after).map(b => b.ref), 0xffcc44)
  ];
  diffOverlays.forEach(o => scene.add(o.root));
  status.textContent = `${lastDiff.blocks.length} bloc(s) modifié(s) · ${lastDiff.entities.length} changement(s) d’entités. Vert : ajout · Rouge : retrait · Jaune : modification.`;
};
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
element('png').onclick = () => { const a = document.createElement('a'); a.href = captureInspectionPreview(renderer, scene, camera); a.download = 'inspection.png'; a.click(); };
element('gltf').onclick = async () => { try { const result = await exportInspectionGltf(group, { binary: true, nativeShaders: 'approximate' }); download(new Blob([result.asset as ArrayBuffer], { type: 'model/gltf-binary' }), 'inspection.glb'); status.textContent = 'Vue exportée en GLB. Les shaders StarMade sont approximés par des matériaux neutres.'; } catch (error) { status.textContent = String(error); } };
window.addEventListener('resize', resize);
let lastFrameTime = performance.now();
renderer.setAnimationLoop(time => {
  const delta = Math.max(0, (time - lastFrameTime) / 1000); lastFrameTime = time;
  controls.update(); camera.updateMatrixWorld();
  if (surfaceAssets) for (const material of [surfaceAssets.opaque, surfaceAssets.blended]) {
    updateStarMadeCubeShaderTime(material, delta); updateStarMadeCubeShaderClipPlanes(material, camera.near, camera.far); updateStarMadeCubeShaderMVP(material, camera.matrixWorldInverse, camera.projectionMatrix); material.uniforms.viewPos.value.copy(camera.position);
  }
  for (const material of lodMaterials) material.uniforms.viewPos.value.copy(camera.position);
  displayPanels.forEach(panel => panel.updateVisibility(camera));
  renderer.render(scene, camera);
});
window.addEventListener('pagehide', () => { displayPanels.forEach(panel=>panel.dispose()); displayAssets.dispose(); loadController?.abort(); pool.dispose(); overlay.dispose(); relationOverlay?.dispose(); diffOverlays.forEach(o => o.dispose()); disposers.forEach(d => d()); lodHandle?.release(); lodPool.dispose(); surfaceHandle?.release(); surfaces.dispose(); controls.dispose(); renderer.setAnimationLoop(null); renderer.dispose(); });
fixture();
// Read-only browser acceptance hooks; the application remains usable without them.
Object.assign(globalThis, { __INSPECTION_DEMO__: { get document() { return current; }, get functionalMap() { return functionalMap; }, get blueprintNodes() { return blueprintNodes; }, get diff() { return lastDiff; }, get camera() { return camera; }, get filter() { return filter; }, group, hits, selection, renderer, scene } });
