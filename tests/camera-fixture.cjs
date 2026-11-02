const text=s=>new TextEncoder().encode(s);
const fbx=`; FBX 7.4.0
GlobalSettings: {
 Properties70: {
  P: "UpAxis", "int", "Integer", "", 1
  P: "UnitScaleFactor", "double", "Number", "", 1
 }
}
Objects: {
 NodeAttribute: 1, "NodeAttribute::Camera", "Camera" {
  Properties70: {
   P: "FocalLength", "double", "Number", "A", 35
   P: "FilmWidth", "double", "Number", "", 1.417322834645669
  }
 }
 Model: 2, "Model::Camera", "Camera" {
  Properties70: {
   P: "Lcl Translation", "Lcl Translation", "", "A", 0, 0, 500
   P: "Lcl Rotation", "Lcl Rotation", "", "A", 0, 0, 0
  }
 }
 AnimationCurveNode: 3, "AnimCurveNode::T", "" {
 }
 AnimationCurveNode: 4, "AnimCurveNode::R", "" {
 }
 AnimationCurveNode: 5, "AnimCurveNode::FocalLength", "" {
 }
 AnimationCurve: 6, "AnimCurve::TX", "" {
  KeyTime: *2 {
   a: 0, 46186158000
  }
  KeyValueFloat: *2 {
   a: 0, 200
  }
 }
 AnimationCurve: 7, "AnimCurve::RY", "" {
  KeyTime: *2 {
   a: 0, 46186158000
  }
  KeyValueFloat: *2 {
   a: 0, 90
  }
 }
 AnimationCurve: 8, "AnimCurve::Focal", "" {
  KeyTime: *2 {
   a: 0, 46186158000
  }
  KeyValueFloat: *2 {
   a: 35, 70
  }
 }
}
Connections: {
 C: "OO", 1, 2
 C: "OP", 3, 2, "Lcl Translation"
 C: "OP", 4, 2, "Lcl Rotation"
 C: "OP", 5, 1, "FocalLength"
 C: "OP", 6, 3, "d|X"
 C: "OP", 7, 4, "d|Y"
 C: "OP", 8, 5, "d|X"
}
`;
const usda=`#usda 1.0
(
 timeCodesPerSecond = 24
 metersPerUnit = 1
 upAxis = "Z"
)
def Xform "Rig" {
 double3 xformOp:translate = (0, 0, 2)
 uniform token[] xformOpOrder = ["xformOp:translate"]
 def Camera "Camera" {
  double3 xformOp:translate.timeSamples = {
   0: (0, 0, 5),
   24: (2, 0, 5),
  }
  float3 xformOp:rotateXYZ.timeSamples = {
   0: (0, 0, 0),
   24: (0, 90, 0),
  }
  uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ"]
  float focalLength.timeSamples = {
   0: 35,
   24: 70,
  }
  float horizontalAperture = 36
 }
}
`;
function gltf(){const data=new Float32Array([0,1,0,0,5,2,0,5,0,0,0,1,0,Math.SQRT1_2,0,Math.SQRT1_2]),bytes=Buffer.from(data.buffer);return text(JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{translation:[0,2,0],children:[1]},{camera:0}],cameras:[{type:'perspective',perspective:{yfov:2*Math.atan(18/35),aspectRatio:1,znear:.01}}],buffers:[{uri:'data:application/octet-stream;base64,'+bytes.toString('base64'),byteLength:bytes.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:8},{buffer:0,byteOffset:8,byteLength:24},{buffer:0,byteOffset:32,byteLength:32}],accessors:[{bufferView:0,componentType:5126,count:2,type:'SCALAR'},{bufferView:1,componentType:5126,count:2,type:'VEC3'},{bufferView:2,componentType:5126,count:2,type:'VEC4'}],animations:[{samplers:[{input:0,output:1},{input:0,output:2}],channels:[{sampler:0,target:{node:1,path:'translation'}},{sampler:1,target:{node:1,path:'rotation'}}]}]}));}
// Tiny binary FBX with compressed arrays exercises the browser's deflate path.
function binary(){const zlib=require('node:zlib'),P=v=>{if(typeof v==='string'){const b=Buffer.from(v),h=Buffer.alloc(5);h.write('S');h.writeUInt32LE(b.length,1);return Buffer.concat([h,b]);}if(Array.isArray(v)){const isTime=v.some(x=>Math.abs(x)>1e8),b=Buffer.alloc(v.length*(isTime?8:4));v.forEach((x,i)=>isTime?b.writeBigInt64LE(BigInt(x),i*8):b.writeFloatLE(x,i*4));const c=zlib.deflateSync(b),h=Buffer.alloc(13);h.write(isTime?'l':'f');h.writeUInt32LE(v.length,1);h.writeUInt32LE(1,5);h.writeUInt32LE(c.length,9);return Buffer.concat([h,c]);}const b=Buffer.alloc(9);b.write('D');b.writeDoubleLE(v,1);return b;},node=(name,p=[],children=[])=>({name,p,children}),prop=(key,...v)=>node('P',[key,'double','Number','',...v]),properties=(...p)=>node('Properties70',[],p),curve=(id,values)=>node('AnimationCurve',[id,'Curve',''],[node('KeyTime',[[0,46186158000]]),node('KeyValueFloat',[values])]),nodes=[node('GlobalSettings',[],[properties(prop('UnitScaleFactor',1),prop('UpAxis',1))]),node('Objects',[],[node('NodeAttribute',[1,'Camera','Camera'],[properties(prop('FocalLength',35),prop('FilmWidth',36/25.4))]),node('Model',[2,'Camera','Camera'],[properties(prop('Lcl Translation',0,0,500))]),node('AnimationCurveNode',[3,'T','']),node('AnimationCurveNode',[4,'F','']),curve(6,[0,200]),curve(8,[35,70])]),node('Connections',[],[node('C',['OO',1,2]),node('C',['OP',3,2,'Lcl Translation']),node('C',['OP',4,1,'FocalLength']),node('C',['OP',6,3,'d|X']),node('C',['OP',8,4,'d|X'])])];let offset=27;function record(n){const name=Buffer.from(n.name),p=Buffer.concat(n.p.map(P)),h=Buffer.alloc(13),start=offset;offset+=13+name.length+p.length;const kids=n.children.map(record),tail=Buffer.alloc(13);offset+=13;h.writeUInt32LE(offset,0);h.writeUInt32LE(n.p.length,4);h.writeUInt32LE(p.length,8);h[12]=name.length;return Buffer.concat([h,name,p,...kids,tail]);}const h=Buffer.alloc(27);h.write('Kaydara FBX Binary  \0\x1a\0','binary');h.writeUInt32LE(7400,23);return Buffer.concat([h,...nodes.map(record),Buffer.alloc(13)]);}
module.exports=()=>({fbx:[...text(fbx)],binary:[...binary()],usda:[...text(usda)],gltf:[...gltf()]});
