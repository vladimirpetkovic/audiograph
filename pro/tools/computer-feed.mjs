#!/usr/bin/env node
// Audiograph Pro – computer feed. Reports this machine's real CPU, GPU, memory and network use
// to the Computer input node. Run:  node computer-feed.mjs  [port]   (default 7703)
// It listens on 127.0.0.1 only and just reports numbers; nothing is read or sent anywhere else.
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import {execFile} from 'node:child_process';

const PORT=+(process.argv[2]||process.env.PORT||7703);
const run=(cmd,args)=>new Promise(res=>execFile(cmd,args,{timeout:2000,windowsHide:true},(err,out)=>res(err?'':String(out))));
const clamp=v=>Math.max(0,Math.min(1,v));
const state={cpu:0,gpu:null,memory:0,net:0,cores:os.cpus().length,platform:process.platform,updated:0};

let prevCpu=null;
function cpu(){
  const sum=os.cpus().map(c=>c.times).reduce((a,c)=>({idle:a.idle+c.idle,total:a.total+c.user+c.nice+c.sys+c.irq+c.idle}),{idle:0,total:0});
  if(prevCpu){const total=sum.total-prevCpu.total;if(total>0)state.cpu=clamp(1-(sum.idle-prevCpu.idle)/total);}
  prevCpu=sum;
}
async function memory(){
  if(process.platform==='darwin'){
    // Activity Monitor's "memory used": app (active + wired) plus compressed pages.
    const out=await run('vm_stat',[]),page=+(out.match(/page size of (\d+)/)?.[1]||16384);
    const get=k=>+(out.match(new RegExp(k+':\\s+(\\d+)'))?.[1]||0);
    const used=(get('Pages active')+get('Pages wired down')+get('Pages occupied by compressor'))*page;
    if(used){state.memory=clamp(used/os.totalmem());return;}
  }
  if(process.platform==='linux'){
    const m=fs.readFileSync('/proc/meminfo','utf8'),get=k=>+(m.match(new RegExp(k+':\\s+(\\d+)'))?.[1]||0);
    if(get('MemAvailable')){state.memory=clamp(1-get('MemAvailable')/get('MemTotal'));return;}
  }
  state.memory=clamp(1-os.freemem()/os.totalmem());
}
async function gpu(){
  if(process.platform==='darwin'){
    const out=await run('ioreg',['-r','-d','1','-w','0','-c','IOAccelerator']);
    const all=[...out.matchAll(/"Device Utilization %"=(\d+)/g)].map(m=>+m[1]);
    if(all.length){state.gpu=clamp(Math.max(...all)/100);return;}
  }
  const nv=await run('nvidia-smi',['--query-gpu=utilization.gpu','--format=csv,noheader,nounits']);
  const v=nv.split('\n').filter(s=>s.trim()).map(Number).filter(Number.isFinite);
  state.gpu=v.length?clamp(Math.max(...v)/100):null;
}
let prevNet=null;
async function network(){
  let bytes=0;
  if(process.platform==='darwin'){
    const out=await run('netstat',['-ibn']);
    for(const line of out.split('\n')){const c=line.trim().split(/\s+/);if(c.length>=10&&c[2]?.startsWith('<Link')&&!c[0].startsWith('lo'))bytes+=(+c[6]||0)+(+c[9]||0);}
  }else if(process.platform==='linux'){
    for(const line of fs.readFileSync('/proc/net/dev','utf8').split('\n').slice(2)){const [name,rest]=line.split(':');if(!rest||name.trim()==='lo')continue;const c=rest.trim().split(/\s+/);bytes+=(+c[0]||0)+(+c[8]||0);}
  }else return;
  const now=Date.now();
  if(prevNet&&bytes>=prevNet.bytes)state.net=(bytes-prevNet.bytes)/((now-prevNet.t)/1000);
  prevNet={bytes,t:now};
}
async function sample(){cpu();await Promise.all([memory(),gpu(),network()]).catch(()=>{});state.updated=Date.now();}
await sample();setInterval(sample,500);

http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Private-Network','true');
  res.setHeader('Access-Control-Allow-Methods','GET');
  res.setHeader('Cache-Control','no-store');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  if(req.method!=='GET'){res.writeHead(405);return res.end();}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(state));
}).listen(PORT,'127.0.0.1',()=>console.log(`Audiograph computer feed on http://127.0.0.1:${PORT}  (${state.cores} cores${state.gpu==null?', no GPU reading':''}). Ctrl+C to stop.`));
