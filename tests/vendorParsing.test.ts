import { afterEach, describe, expect, it, vi } from "vitest";
import { Box3, SkinnedMesh, Mesh, Object3D, Skeleton, AnimationClip, Texture, MeshPhongMaterial, TextureLoader, Vector3 } from "three";
import * as vendor from "../src/vendor/OgreMaxLoader.js";
import { element as e, documentFixture as doc, type ElementFixture } from "./helpers/elementFixture";

// The legacy bundled .d.ts currently exposes only load(), not parse().
const Vendor = vendor as unknown as {
  OgreMaxLoader: new () => {texturePath: string; parse(xml: unknown): {mesh: Mesh; scene: Object3D; skeleton: {skeleton: Skeleton; animations: AnimationClip[]}}};
  DotMaterialLoader: new () => {texturePath: string; textureLoader: TextureLoader; parse(text: string, texturePath?: string): MeshPhongMaterial[]}
};
function geometry(normals = true, uv = true, declared = 3): ElementFixture {
  return e('geometry', {vertexcount: declared}, e('vertexbuffer', {positions: 'true', normals: String(normals), texture_coords: uv ? 1 : 0},
    ...[[0, 0, 0], [1, 0, 0], [0, 1, 0]].map(([x,y,z]) => e('vertex', {}, e('position', {x,y,z}),
      ...(normals ? [e('normal', {x:0,y:0,z:1})] : []), ...(uv ? [e('texcoord', {u:x,v:y})] : [])))));
}
function meshRoot(geom = geometry(), attrs: Record<string, string | number> = {}, children: ElementFixture[] = []): ElementFixture {
  return e('mesh', {}, e('submeshes', {}, e('submesh', attrs, geom, e('faces', {count:1}, e('face', {v1:0,v2:1,v3:2})), ...children)));
}
const parse = (root: ElementFixture) => new Vendor.OgreMaxLoader().parse(doc(root));
afterEach(() => { vi.restoreAllMocks(); });

describe("Bundled OgreMax parser — structural fixtures, not GPU/pixel qualification", () => {
  it("parses indexed positions, normals, UVs and explicit 32-bit indices", () => {
    for (const use32bitindexes of ['false', 'true']) {
      const {mesh} = parse(meshRoot(geometry(), {use32bitindexes, name: 'triangle'}));
      expect(mesh.name).toBe('triangle');
      expect(mesh.type).toBe('Mesh');
      expect(mesh.geometry.getAttribute('skinIndex')).toBeUndefined();
      expect(new Box3().setFromObject(mesh).max.toArray()).toEqual([1, 1, 0]);
      expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual([0,0,0,1,0,0,0,1,0]);
      expect(Array.from(mesh.geometry.getAttribute('normal').array)).toEqual([0,0,1,0,0,1,0,0,1]);
      expect(Array.from(mesh.geometry.getAttribute('uv').array)).toEqual([0,0,1,0,0,1]);
      expect(Array.from(mesh.geometry.index!.array)).toEqual([0,1,2]);
      expect(mesh.geometry.index!.array).toBeInstanceOf(use32bitindexes === 'true' ? Uint32Array : Uint16Array);
    }
    const computed = parse(meshRoot(geometry(false, false))).mesh.geometry;
    expect(computed.getAttribute('normal').getZ(0)).toBeCloseTo(1);
    expect(computed.getAttribute('uv')).toBeUndefined();
  });

  it.each([1, 3])('preserves %s-component texture coordinates with one tuple per vertex', dimension => {
    const vertex = () => e('vertex', {}, e('position', {x:0,y:0,z:0}), e('texcoord', {u:.25,v:.5,w:.75}));
    const geom = e('geometry', {vertexcount:3}, e('vertexbuffer', {positions:'true',texture_coords:1,
      texture_coord_dimensions_0:`float${dimension}`}, vertex(), vertex(), vertex()));
    const uv = parse(meshRoot(geom)).mesh.geometry.getAttribute('uv');
    expect(uv.itemSize).toBe(dimension);
    expect(uv.count).toBe(3);
    expect(Array.from(uv.array)).toEqual(Array.from({length:3}, () => [.25,.5,.75].slice(0,dimension)).flat());
  });

  it('retains a vertex index above 65535 even when the index buffer has only one triangle', () => {
    const vertex = () => e('vertex', {}, e('position', {x:0,y:0,z:0}));
    const root = e('mesh', {}, e('submeshes', {}, e('submesh', {},
      e('geometry', {vertexcount:65537}, e('vertexbuffer', {positions:'true'}, ...Array.from({length:65537}, vertex))),
      e('faces', {}, e('face', {v1:0,v2:1,v3:65536})))));
    const index = parse(root).mesh.geometry.index!;
    expect(index.array).toBeInstanceOf(Uint32Array);
    expect(Array.from(index.array)).toEqual([0,1,65536]);
  });

  it("supports shared geometry, multiple submeshes and line operation metadata", () => {
    const shared = geometry();
    const root = e('mesh', {name: 'shared'}, e('sharedgeometry', shared.attributes, ...shared.children),
      e('submeshes', {}, ...['triangle_list', 'line_list', 'line_strip'].map(operationtype =>
        e('submesh', {usesharedvertices:'true', operationtype}, e('faces', {}, e('face', {v1:0,v2:1,v3:2}))))));
    const group = parse(root).mesh;
    expect(group.name).toBe('shared');
    expect(group.children).toHaveLength(3);
    expect(group.children[0].type).toBe('Mesh');
    const bounds = new Box3().setFromObject(group);
    expect(bounds.min.toArray()).toEqual([0, 0, 0]);
    expect(bounds.max.toArray()).toEqual([1, 1, 0]);
    expect(group.children[1].type).toBe('Line');
    expect(group.children[2].type).toBe('Line');
    expect((group.children[0] as Mesh).geometry.getAttribute('position').count).toBe(3);
  });

  it("rejects malformed roots, missing submeshes, mismatched counts and bad indices", () => {
    for (const root of [e('unexpected'), e('mesh'), e('mesh', {}, e('submeshes')), meshRoot(geometry(true, true, 4)),
      e('mesh', {}, e('submeshes', {}, e('submesh', {usesharedvertices:'true'}))),
      e('mesh', {}, e('submeshes', {}, e('submesh', {}, geometry(), e('faces', {}, e('face', {v1:0,v2:1,v3:3}))))),
      e('skeleton'), e('skeleton', {}, e('bones'))]) {
      expect(() => parse(root)).toThrow();
    }
    const invalidTex = e('geometry', {}, e('vertexbuffer', {texture_coords:1, texture_coord_dimensions_0:'float4'}));
    expect(() => parse(meshRoot(invalidTex))).toThrow(/expected 1\/2\/3/);
    const loader = new Vendor.OgreMaxLoader(); loader.texturePath = '/textures/';
    expect(loader.texturePath).toBe('/textures/');
    expect(() => { loader.texturePath = 1 as unknown as string; }).toThrow();
  });

  it("preserves bone assignments and rejects invalid vertex indices or too many influences", () => {
    const assignment = e('boneassignments', {}, e('vertexboneassignment', {vertexindex:0,boneindex:1,weight:0.75}),
      e('boneassignment', {vertexindex:0,boneindex:2,weight:0.25}));
    const result = parse(meshRoot(geometry(), {}, [assignment])).mesh;
    expect(result).toBeInstanceOf(SkinnedMesh);
    expect(Array.from(result.geometry.getAttribute('skinIndex').array).slice(0,4)).toEqual([1,2,0,0]);
    expect(Array.from(result.geometry.getAttribute('skinWeight').array).slice(0,4)).toEqual([0.75,0.25,0,0]);
    expect(() => parse(meshRoot(geometry(), {}, [e('boneassignments', {}, e('boneassignment', {vertexindex:3}))]))).toThrow(/out of range/);
    expect(() => parse(meshRoot(geometry(), {}, [e('boneassignments', {}, ...Array.from({length:5}, (_,i) => e('boneassignment', {vertexindex:0,boneindex:i,weight:0.2})))]))).toThrow(/More than 4/);
  });

  it("parses scene hierarchy, scale, visibility and environment", () => {
    const scene = parse(e('scene', {upAxis:'z', author:'fixture', unitsPerMeter:2, formatVersion:1},
      e('nodes', {}, e('position', {x:10}), e('node', {name:'parent'}, e('position', {y:2}), e('scale', {factor:2}),
        e('node', {name:'child', visibility:'false'}, e('translate', {z:3}), e('scale', {x:1,y:2,z:3})))),
      e('environment', {}, e('colourAmbient', {r:0.2,g:0.3,b:0.4}), e('colourBackground', {r:0.5,g:0.6,b:0.7}), e('clipping', {near:1,far:100})))).scene;
    scene.updateMatrixWorld(true);
    expect(scene.up.toArray()).toEqual([0,0,1]);
    expect(scene.getObjectByName('child')!.getWorldPosition(new Vector3()).toArray()).toEqual([10,2,6]);
    expect(scene.getObjectByName('child')!.visible).toBe(false);
    expect(scene.getObjectByName('environment')!.children).toHaveLength(1);
    expect(scene.getObjectByName('environment')!.userData.clipping).toEqual({near:1,far:100});
    expect(parse(e('scene')).scene.up.toArray()).toEqual([0,1,0]);
    expect(parse(e('scene', {upAxis:'x'}, e('environment'))).scene.up.toArray()).toEqual([1,0,0]);
  });

  it("normalizes explicit quaternions, axis-angle and Euler rotations", () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rotations = [e('rotation', {qx:0,qy:0,qz:0,qw:2}), e('rotation', {axisX:0,axisY:0,axisZ:1,angle:Math.PI/2}),
      e('rotation', {}, e('axis',{x:0,y:0,z:1}), e('angle',{value:Math.PI/2})),
      e('rotation', {angleX:90}), e('rotation', {angleY:90}), e('rotation', {angleZ:90}), e('rotation')];
    for (const rotation of rotations) {
      const node = parse(e('scene', {}, e('nodes', {}, e('node', {name:'rotated'}, rotation)))).scene.getObjectByName('rotated')!;
      expect(node.quaternion.length()).toBeCloseTo(1);
    }
    for (const rotation of [e('rotation', {qx:'NaN',qy:0,qz:0,qw:1}), e('rotation', {angle:'NaN'}),
      e('rotation', {axisX:0,axisY:0,axisZ:0,angle:0})]) {
      expect(() => parse(e('scene', {}, e('nodes', {}, e('node', {}, rotation))))).toThrow();
    }
  });

  it("builds bone hierarchy and keyframe tracks with parent-relative transforms", () => {
    const root = e('skeleton', {}, e('bones', {}, e('bone', {id:1,name:'child'}), e('bone', {id:0,name:'root'}, e('position',{x:1}))),
      e('bonehierarchy', {}, e('boneparent', {parent:'root',bone:'child'})),
      e('animations', {}, e('animation', {name:'move',length:1}, e('tracks', {}, e('track', {bone:'root'},
        e('keyframes', {}, e('keyframe', {time:0}, e('translate',{x:0})), e('keyframe', {time:1}, e('translate',{x:2}))))))));
    const parsed = parse(root).skeleton;
    expect(parsed.skeleton.bones.map(b => b.name)).toEqual(['root','child']);
    expect(parsed.skeleton.bones[1].parent).toBe(parsed.skeleton.bones[0]);
    expect(parsed.animations[0].tracks).toHaveLength(3);
    expect(Array.from(parsed.animations[0].tracks[0].values)).toEqual([1,0,0,3,0,0]);
    expect(parsed.animations[0].duration).toBe(1);
    const noAnimations = parse(e('skeleton', {}, e('bones', {}, e('bone', {id:0,name:'root'})), e('bonehierarchy'))).skeleton;
    expect(noAnimations.animations).toEqual([]);
    expect(parse(e('skeleton', {}, e('bones', {}, e('bone')), e('bonehierarchy'))).skeleton.skeleton.bones[0].name).toBe('');
  });

  it("rejects invalid animation lengths, missing tracks/bones/keyframes and empty tracks", () => {
    const base = (animation: ElementFixture) => e('skeleton', {}, e('bones', {}, e('bone',{id:0,name:'root'})), e('bonehierarchy'), e('animations',{},animation));
    for (const animation of [e('animation',{length:0}), e('animation',{length:'Infinity'}), e('animation',{length:1}),
      e('animation',{length:1},e('tracks',{},e('track',{bone:'missing'},e('keyframes')))),
      e('animation',{length:1},e('tracks',{},e('track',{bone:'root'}))),
      e('animation',{length:1},e('tracks',{},e('track',{bone:'root'},e('keyframes'))))]) expect(() => parse(base(animation))).toThrow();
  });

  it('handles empty animation lists and ignores unknown keyframe tags without losing valid transforms', () => {
    const warning = vi.spyOn(console,'warn').mockImplementation(() => {});
    const rig = e('skeleton', {}, e('bones', {}, e('bone', {id:0,name:'root'})),
      e('bonehierarchy', {}, e('boneparent', {parent:'absent',bone:'root'}), e('boneparent', {parent:'root',bone:'absent'})),
      e('animations', {}, e('animation', {name:'empty',length:1}, e('tracks')),
        e('animation', {length:1}, e('tracks', {}, e('track', {bone:'root'}, e('keyframes', {},
          e('metadata'), e('keyframe', {time:.5}, e('translate', {x:2}), e('scale',{factor:2}))))))));
    const parsed = parse(rig).skeleton;
    expect(parsed.animations[0].tracks).toEqual([]);
    expect(parsed.animations[1].tracks[0].values[0]).toBe(2);
    expect(parsed.animations[1].tracks[2].values[0]).toBe(2);
    expect(warning).toHaveBeenCalledTimes(2);
  });

  it('allows an empty submesh, missing entity meshFile and normals-only vertex buffers', () => {
    vi.spyOn(console,'warn').mockImplementation(() => {});
    const empty = parse(e('mesh', {}, e('submeshes', {}, e('submesh')))).mesh;
    expect(empty.geometry.getAttribute('position').count).toBe(0);
    const root = parse(e('scene', {}, e('nodes', {}, e('node', {}, e('entity'))))).scene;
    expect(root.children[0].children[0].children).toHaveLength(0);
    const separated = e('geometry', {vertexcount:3}, ...geometry(false,false).children,
      e('vertexbuffer', {normals:'true'}, ...Array.from({length:3}, () => e('vertex',{},e('normal',{z:1})))));
    expect(parse(meshRoot(separated)).mesh.geometry.getAttribute('normal').count).toBe(3);
  });
});

describe("Bundled material parser", () => {
  it("parses colors, blend modes and diffuse/emissive/normal texture units", () => {
    const loader = new Vendor.DotMaterialLoader();
    const load = vi.spyOn(loader.textureLoader, 'load').mockImplementation(() => new Texture());
    loader.texturePath = '/textures/'; expect(loader.texturePath).toBe('/textures/');
    const units = (texture: string, extra = '') => `texture_unit\n{\ntexture ${texture}\n${extra}\n}`;
    for (const blend of ['add', 'alpha_blend']) {
      const mats = loader.parse(`\n// ignored\nmaterial test\n{\nignored\ntechnique\n{\nignored\npass\n{\nambient 0.2 0.3 0.4\ndiffuse 0.5 0.6 0.7\nspecular 1 1 1 50\nemissive 0.1 0.2 0.3\nscene_blend ${blend}\n${units('main.png')}\n${units('detail_NRM.png')}\n${units('glow.png', 'colour_op_ex add src_texture src_current\ncolour_op_multipass_fallback one one')}\ntexture_unit\n{\n}\nunknown\n}\n}\n}`, '/textures/');
      expect(mats).toHaveLength(1); expect(mats[0].name).toBe('test');
      expect(mats[0].color.toArray()).toEqual([0.5,0.6,0.7]);
      expect(mats[0].shininess).toBe(50);
      expect(mats[0].map?.flipY).toBe(false); expect(mats[0].normalMap).not.toBeNull(); expect(mats[0].emissiveMap).not.toBeNull();
    }
    expect(load.mock.calls.map(args => args[0])).toContain('/textures/main.png');
    expect(loader.parse('')).toEqual([]);
    expect(loader.parse('material dull\n{\ntechnique\n{\npass\n{\nspecular 1 1 1\n}\n}\n}')[0].shininess).toBe(30);
    expect(() => {loader.texturePath = null as unknown as string;}).toThrow();
    expect(() => loader.parse('material bad\nnot-a-brace')).toThrow();
  });
});
