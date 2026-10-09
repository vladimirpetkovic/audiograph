// v61: every layout that shows the Outline control must actually draw an outline (Phyllotaxis never did).
const {chromium}=require('playwright');const path=require('path');
const B=process.env.AUDIOGRAPH_OUTLINE_BUILD||'versions/audiograph_61.html';
const assert=(c,m)=>{if(!c){console.error('FAIL: '+m);process.exit(1)}console.log('ok - '+m)};
(async()=>{const b=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});const pg=await b.newPage({viewport:{width:1280,height:800}});
 const errors=[];pg.on('pageerror',e=>errors.push(e.message));
 await pg.goto('file://'+path.resolve(__dirname,'..',B));await pg.waitForTimeout(500);
 const r=await pg.evaluate(()=>{const out={};const ms=[...new Set([...document.querySelectorAll('button')].map(b=>((b.getAttribute('onclick')||'').match(/setLayout\('(\w+)'/)||[])[1]).filter(Boolean))];
  const v=new Array(120).fill(0).map((_,i)=>.3+.6*Math.abs(Math.sin(i*.2)));
  for(const m of ms){setLayout(m,[...document.querySelectorAll('button')].find(b=>(b.getAttribute('onclick')||'').includes("setLayout('"+m+"'")));
   if(document.getElementById('rowOutline').offsetParent===null)continue;
   const fn={linear:drawDensity,circle:drawCircle,concentric:drawConcentric,spiral:drawSpiral,phyllotaxis:drawPhyllotaxis,fractal:drawFractal,sine:drawSine,custom:drawCustom}[m];
   if(!fn){out[m]='no renderer mapped';continue}
   const c=document.createElement('canvas');c.width=800;c.height=500;const g=c.getContext('2d');
   const ink=()=>{g.clearRect(0,0,800,500);fn(g,800,500,v,P(),false);const d=g.getImageData(0,0,800,500).data;let s=0;for(let i=3;i<d.length;i+=4)s+=d[i];return s};
   const res=[];for(const st of ['solid','dotted','dashed','connected','fill']){outlineStyle=st;showOutline=false;const a=ink();showOutline=true;const bb=ink();res.push(bb>a?st:'!'+st)}
   showOutline=false;outlineStyle='solid';out[m]=res.join(',')}return out});
 assert(Object.keys(r).includes('phyllotaxis'),'Phyllotaxis shows the Outline control');
 for(const [m,s] of Object.entries(r))assert(!s.includes('!')&&!s.includes('no renderer'),`${m} draws an outline in every style (${s})`);
 assert(!errors.length,'no page errors '+errors.join(';'));await b.close()})();
