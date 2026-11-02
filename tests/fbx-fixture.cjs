// A minimal ASCII FBX: a quad skinned to one bone that slides 100 cm along X over one second
// (plus an empty one-frame take, like many exporters write).
module.exports=function fbxFile(){
  const K=46186158000;
  const text=`; FBX 7.4.0 project file
FBXHeaderExtension:  {
	FBXVersion: 7400
}
GlobalSettings:  {
	Properties70:  {
		P: "UpAxis", "int", "Integer", "",1
		P: "UnitScaleFactor", "double", "Number", "",1
	}
}
Objects:  {
	Geometry: 100, "Geometry::Quad", "Mesh" {
		Vertices: *12 {
			a: -50,0,0,50,0,0,50,100,0,-50,100,0
		}
		PolygonVertexIndex: *4 {
			a: 0,1,2,-4
		}
	}
	Model: 200, "Model::Quad", "Mesh" {
		Properties70:  {
		}
	}
	Model: 300, "Model::Bone", "LimbNode" {
		Properties70:  {
			P: "Lcl Translation", "Lcl Translation", "", "A",0,0,0
		}
	}
	Deformer: 400, "Deformer::Skin", "Skin" {
	}
	Deformer: 500, "SubDeformer::Bone", "Cluster" {
		Indexes: *4 {
			a: 0,1,2,3
		}
		Weights: *4 {
			a: 1,1,1,1
		}
		TransformLink: *16 {
			a: 1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1
		}
	}
	AnimationStack: 600, "AnimStack::Take 001", "" {
	}
	AnimationLayer: 610, "AnimLayer::Base", "" {
	}
	AnimationStack: 700, "AnimStack::Slide", "" {
	}
	AnimationLayer: 710, "AnimLayer::Base", "" {
	}
	AnimationCurveNode: 800, "AnimCurveNode::T", "" {
	}
	AnimationCurve: 900, "AnimCurve::", "" {
		KeyTime: *2 {
			a: 0,${K}
		}
		KeyValueFloat: *2 {
			a: 0,100
		}
	}
}
Connections:  {
	C: "OO",200,0
	C: "OO",300,0
	C: "OO",100,200
	C: "OO",400,100
	C: "OO",500,400
	C: "OO",300,500
	C: "OO",610,600
	C: "OO",710,700
	C: "OO",800,710
	C: "OP",800,300, "Lcl Translation"
	C: "OP",900,800, "d|X"
}
`;
  return {name:'slide.fbx',mimeType:'application/octet-stream',buffer:Buffer.from(text)};
};
