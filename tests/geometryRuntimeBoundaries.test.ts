import { describe, expect, it } from 'vitest';
import { blockDefinitionFromConfig, createStarMadeEncodedCubeGeometry, createStarMadeEncodedCubeShapeFaces,
  createStarMadeEncodedGeometryBuffers, createStarMadeEncodedGeometryFromBuffers,
  createStarMadeEncodedSegmentGeometry, createStarMadeEncodedSegmentGeometryBatches,
  isStarMadeSegmentBlockBlended, segmentBlockIndex, type SegmentDataLike,
  type SegmentBlockDataLike, type StarMadeEncodedSegmentGeometryOptions } from '../src';

const armor = blockDefinitionFromConfig({id:1,name:'armor',textureIds:[33]});
const air = {type:0,hp:0,orientation:0,active:false};
function segment(entries: readonly [number,number,number,number,number?][], origin=[0,0,0]): SegmentDataLike {
  const blocks: SegmentBlockDataLike[] = Array.from({length:32768},()=>air);
  for(const [x,y,z,type,orientation=0] of entries) blocks[segmentBlockIndex(x,y,z)]={type,hp:127,orientation,active:false};
  return {x:origin[0],y:origin[1],z:origin[2],blocks,blockCount:entries.length};
}
const build = (seg:SegmentDataLike, defs?:StarMadeEncodedSegmentGeometryOptions['blockDefinitions'], extra:Partial<StarMadeEncodedSegmentGeometryOptions>={}) =>
  createStarMadeEncodedSegmentGeometry({segment:seg,blockDefinitions:defs,...extra});
const faceType = (value:number) => Math.floor(value/512)%256;

describe('Segment boundary and resolver behavior',()=>{
  it('handles empty segments, air blending and unknown block definitions',()=>{
    expect(isStarMadeSegmentBlockBlended(undefined,air)).toBe(false);
    expect(isStarMadeSegmentBlockBlended(armor,air)).toBe(false);
    const empty=createStarMadeEncodedSegmentGeometryBatches({segment:segment([])});
    expect(empty.totalMeshedBlockCount).toBe(0);
    expect(empty.opaque.index!.count).toBe(0);
    expect(build(segment([[16,16,16,99]])).index!.count).toBe(36);
  });

  it('accepts compact/indexed arrays and function definition providers without changing textures',()=>{
    const other=blockDefinitionFromConfig({id:0,name:'zero',textureIds:[5]});
    for(const definitions of [[other,armor],[armor],[other,other,armor],(id:number)=>id===1?armor:undefined]) {
      const geometry=build(segment([[16,16,16,1],[17,16,16,1]]),definitions);
      expect(geometry.index!.count).toBe(60);
      expect(faceType(geometry.getAttribute('starMadeVertex').getY(0))).toBe(33);
    }
    expect(build(segment([[16,16,16,99]]),[armor]).index!.count).toBe(36);
  });

  it('culls a shared face across the positive Y segment boundary for every neighbor provider',()=>{
    const main=segment([[16,31,16,1]]), neighbor=segment([[16,0,16,1]],[0,32,0]);
    const map=new Map([['0,32,0',neighbor]]);
    for(const source of [[neighbor],map,(x:number,y:number,z:number)=>map.get(`${x},${y},${z}`)]) {
      expect(build(main,[armor],{neighborSegments:source}).index!.count).toBe(30);
    }
  });

  it('applies face predicates and block-dependent light, overlay and occlusion values',()=>{
    const seg=segment([[16,16,16,1]]);
    for(const dynamic of [false,true]) {
      const geometry=build(seg,[armor],{
        isFaceVisible:context=>context.side===2,
        light:dynamic?()=>[3,7,9]:[3,7,9], occlusion:dynamic?()=>6:6, overlay:dynamic?()=>5:5
      });
      expect(geometry.index!.count).toBe(6);
      const encoded=geometry.getAttribute('starMadeVertex');
      expect((encoded.getX(0)>>>16)&31).toBe(3);
      expect((encoded.getX(0)>>>21)&31).toBe(7);
      expect((encoded.getX(0)>>>26)&31).toBe(9);
      expect((encoded.getW(0)>>>9)&63).toBe(5);
      expect((encoded.getW(0)>>>15)&31).toBe(6);
    }
  });

  it.each([.5,1,-4128,4096])('rejects an unencodable segment origin %s', x=>{
    expect(()=>build(segment([[16,16,16,1]],[x,0,0]),[armor])).toThrow(/aligned|chunk coordinate/);
  });

  it.each([0,1,2,3,4,5])('exposes exactly the four sides perpendicular to sprite orientation %s',orientation=>{
    const sprite=blockDefinitionFromConfig({id:2,name:'sprite',blockStyle:3});
    const sides:number[]=[];
    build(segment([[16,16,16,2,orientation]]),[sprite],{isFaceVisible:context=>{sides.push(context.side);return true;}});
    const absent=orientation<2?[0,1]:orientation<4?[2,3]:[4,5];
    expect(sides).toEqual([0,1,2,3,4,5].filter(side=>!absent.includes(side)));
  });

  it.each([0,1,2,3,4,5])('removes coplanar shared faces between equally oriented slabs %s',orientation=>{
    const slab=blockDefinitionFromConfig({id:2,name:'slab',slab:2});
    const second:[number,number,number,number,number]=orientation<4?[17,16,16,2,orientation]:[16,17,16,2,orientation];
    expect(build(segment([[16,16,16,2,orientation],second]),[slab]).index!.count).toBe(60);
  });

  it('culls against a full slab face even when the receiver definition is unknown',()=>{
    const slab=blockDefinitionFromConfig({id:2,name:'slab',slab:2});
    const geometry=build(segment([[16,15,16,99],[16,16,16,2,2]]),[slab],{isBlockMeshed:c=>c.block.type===99});
    expect(geometry.index!.count).toBe(30);
  });

  it('reuses shape occlusion without changing output and keeps cargo fallback rendering explicit',()=>{
    const wedge=blockDefinitionFromConfig({id:2,name:'wedge',blockStyle:1});
    const seg=segment([[16,16,16,1],[17,16,16,2]]);
    const one=build(seg,[armor,wedge]),two=build(seg,[armor,wedge]);
    expect(Array.from(one.index!.array)).toEqual(Array.from(two.index!.array));
    expect(one.index!.count).toBeLessThan(72);
    const cargo=blockDefinitionFromConfig({id:689,name:'cargo',textureIds:[100]});
    const fallback=build(segment([[16,16,16,689,4]]),[cargo]);
    const encoded=fallback.getAttribute('starMadeVertex');
    expect(faceType(encoded.getY(0))).toBe(100);
    expect((encoded.getY(0)>>>23)&1).toBe(1);
  });
});

describe('Encoded cube boundary contracts',()=>{
  it('fills partial per-vertex arrays from their uniform defaults',()=>{
    const geometry=createStarMadeEncodedCubeGeometry({light:[3,7,9],occlusion:6,vertexLights:[[1,2,3]],vertexOcclusion:[4]});
    const encoded=geometry.getAttribute('starMadeVertex');
    expect((encoded.getX(0)>>>16)&31).toBe(1);
    expect((encoded.getX(1)>>>16)&31).toBe(3);
    expect((encoded.getW(0)>>>15)&31).toBe(4);
    expect((encoded.getW(1)>>>15)&31).toBe(6);
    expect(createStarMadeEncodedCubeShapeFaces()).toHaveLength(6);
  });

  it('supports scalar and sparse per-face texture offsets and explicit animation',()=>{
    for(const offset of [2,[2]]) {
      const geometry=createStarMadeEncodedCubeGeometry({textureTypeOffset:offset,animated:true});
      const codes=geometry.getAttribute('starMadeVertex');
      expect(faceType(codes.getY(0))).toBe(2);
      expect(faceType(codes.getY(4))).toBe(Array.isArray(offset)?0:2);
      expect((codes.getY(0)>>>20)&1).toBe(1);
    }
    const block=blockDefinitionFromConfig({id:1,name:'active lod',lodShapeActive:'active'});
    const codes=createStarMadeEncodedCubeGeometry({block,animated:false}).getAttribute('starMadeVertex');
    expect((codes.getY(0)>>>20)&1).toBe(0);
    const automatic=createStarMadeEncodedCubeGeometry({block}).getAttribute('starMadeVertex');
    expect((automatic.getY(0)>>>20)&1).toBe(1);
  });

  it.each([0,1,2,3,4,5])('keeps slab bounds, thickness and encoding consistent for orientation %s',orientation=>{
    const axis=[2,2,1,1,0,0][orientation];
    for(const slab of [1,2,3]) {
      const geometry=createStarMadeEncodedCubeGeometry({orientation,slab});
      const min=geometry.boundingBox!.min.toArray(),max=geometry.boundingBox!.max.toArray();
      expect(max[axis]-min[axis]).toBe(1-slab*.25);
      const positions=geometry.getAttribute('position');
      // A slab closes exactly one complete unit-cell boundary, never its
      // recessed face. Rounding a 3/4 slab used to invent a second full wall.
      expect(createStarMadeEncodedCubeShapeFaces({orientation,slab})
        .filter(face=>face.fullAxisSide!==null)).toHaveLength(1);
      for (const [faceIndex, face] of createStarMadeEncodedCubeShapeFaces({orientation,slab}).entries()) {
        for (const [corner, vertex] of face.vertices.entries()) {
          const i=faceIndex*4+corner;
          expect(vertex).toEqual([positions.getX(i)*2,positions.getY(i)*2,positions.getZ(i)*2]);
        }
      }
      expect(min.every(v=>v>=-.5)).toBe(true); expect(max.every(v=>v<=.5)).toBe(true);
    }
    for(const xyScaleManip of [0,1]) {
      const geometry=createStarMadeEncodedCubeGeometry({orientation,slab:2,xyScaleManip});
      const codes=geometry.getAttribute('starMadeVertex');
      for(let i=0;i<codes.count;i++) expect((codes.getY(i)>>>8)&1).toBe(xyScaleManip);
    }
  });

  it('keeps explicitly encoded normal overrides consistent with CPU normals',()=>{
    for(const [normalMode,expected] of [[192,[0,1,0]],[80,[0,0,0]]] as const) {
      const geometry=createStarMadeEncodedCubeGeometry({normalMode});
      const normals=geometry.getAttribute('normal'),codes=geometry.getAttribute('starMadeVertex');
      for(let i=0;i<normals.count;i++) {
        expect([normals.getX(i),normals.getY(i),normals.getZ(i)]).toEqual(expected);
        expect(codes.getW(i)&511).toBe(normalMode);
      }
    }
  });

  it('retains caller-supplied draw bucket diagnostics when constructing buffers',()=>{
    const buffers=createStarMadeEncodedGeometryBuffers(); buffers.faceDrawBuckets.push(7);
    expect(createStarMadeEncodedGeometryFromBuffers(buffers).userData.starMadeFaceDrawBucketCounts[7]).toBe(1);
  });
});
