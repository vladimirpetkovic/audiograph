const fs=require('fs'),http=require('http'),{chromium}=require('playwright');
(async()=>{const b=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
for(const v of ['84','86','87']){const html=fs.readFileSync('versions/audiograph_'+v+'.html');
const s=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html'});r.end(html)});await new Promise(r=>s.listen(0,r));
const p=await b.newPage({viewport:{width:1440,height:900}});await p.route('https://fonts.googleapis.com/**',r=>r.abort());await p.goto('http://127.0.0.1:'+s.address().port+'/');await p.waitForTimeout(1500);
for(const m of ['spiral','circle']){const r=await p.evaluate(m=>{setLayout(m);syncLayoutRelevance&&syncLayoutRelevance();const vis=e=>e.offsetParent!==null&&getComputedStyle(e).display!=='none';
const pg=document.getElementById('panelGeo');return [...pg.querySelectorAll('input[type=range],.prow-label')].filter(vis).map(e=>e.id||e.textContent).join(',')},m);console.log(v,m,r)}
s.close();await p.close()}
await b.close()})();
