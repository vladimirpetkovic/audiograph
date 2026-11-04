// Offline video export: renders the project frame by frame on a virtual clock (never drops a frame, whatever the
// resolution) while an OfflineAudioContext analyser steps through the song in sync, then encodes H.264/AAC (or VP9/Opus)
// into an MP4 with WebCodecs. The studio supplies drawFrame (draw one frame for a time and a sound) and the canvas.
import {Muxer,ArrayBufferTarget,FileSystemWritableFileStreamTarget} from './vendor/mp4-muxer.js';

const RATE=48000;
export const exportSupported=()=>typeof VideoEncoder==='function'&&typeof VideoFrame==='function';

async function pickVideo(w,h,fps,bitrate){
  const tries=[['avc','avc1.640034'],['avc','avc1.640033'],['avc','avc1.64002A'],['avc','avc1.4D0034'],['vp9','vp09.00.40.08'],['vp9','vp09.00.10.08']];
  for(const [kind,codec] of tries){
    for(const hw of ['prefer-hardware','no-preference']){
      const config={codec,width:w,height:h,bitrate,framerate:fps,hardwareAcceleration:hw,latencyMode:'quality',...(kind==='avc'?{avc:{format:'avc'}}:{})};
      try{if((await VideoEncoder.isConfigSupported(config)).supported)return {kind,config};}catch{}
    }
  }
  throw Error(`This browser cannot encode ${w}×${h} video; try a lower resolution`);
}
async function pickAudio(){
  if(typeof AudioEncoder!=='function')return null;
  for(const [kind,codec,bitrate] of [['aac','mp4a.40.2',192000],['opus','opus',160000]]){
    const config={codec,sampleRate:RATE,numberOfChannels:2,bitrate};
    try{if((await AudioEncoder.isConfigSupported(config)).supported)return {kind,config};}catch{}
  }
  return null;
}
// The chosen range of the song, resampled to 48 kHz stereo (the audio track of the video).
async function renderTrack(buffer,start,length){
  const ctx=new OfflineAudioContext(2,Math.max(1,Math.ceil(length*RATE)),RATE),src=ctx.createBufferSource();
  src.buffer=buffer;src.connect(ctx.destination);src.start(0,start,length);return ctx.startRendering();
}

/**
 * opts: {buffer, start, length, fps, bitrate, canvas, analyser:{fftSize,smoothing,minDb,maxDb},
 *        drawFrame(i, t, dt, sound:{freq,wave,rate}) (may be async), onProgress(done,total,phase), signal (AbortSignal), file (FileSystemFileHandle, optional)}
 * Resolves with a Blob (or null when it was written straight into opts.file).
 */
export async function renderVideo(opts){
  const {buffer,start,length,fps,canvas,analyser:an0,drawFrame,onProgress=()=>{},signal}=opts;
  const w=canvas.width&~1,h=canvas.height&~1,total=Math.max(1,Math.round(length*fps));
  const video=await pickVideo(w,h,fps,opts.bitrate),audioCfg=await pickAudio();
  onProgress(0,total,'Preparing the sound');
  const track=await renderTrack(buffer,start,length);
  const writable=opts.file?await opts.file.createWritable():null;
  const target=writable?new FileSystemWritableFileStreamTarget(writable):new ArrayBufferTarget();
  const muxer=new Muxer({target,fastStart:writable?false:'in-memory',firstTimestampBehavior:'offset',
    video:{codec:video.kind,width:w,height:h,frameRate:fps},...(audioCfg?{audio:{codec:audioCfg.kind,sampleRate:RATE,numberOfChannels:2}}:{})});
  let failure=null;const fail=e=>{failure||=e;};
  const venc=new VideoEncoder({output:(c,m)=>muxer.addVideoChunk(c,m),error:fail});venc.configure(video.config);
  const aenc=audioCfg?new AudioEncoder({output:(c,m)=>muxer.addAudioChunk(c,m),error:fail}):null;aenc?.configure(audioCfg.config);
  const L=track.getChannelData(0),R=track.numberOfChannels>1?track.getChannelData(1):L;let audioAt=0;
  const feedAudio=upTo=>{
    if(!aenc)return;const end=Math.min(track.length,Math.round(upTo*RATE));
    while(audioAt<end){
      const n=Math.min(4800,end-audioAt),data=new Float32Array(n*2);data.set(L.subarray(audioAt,audioAt+n),0);data.set(R.subarray(audioAt,audioAt+n),n);
      const ad=new AudioData({format:'f32-planar',sampleRate:RATE,numberOfFrames:n,numberOfChannels:2,timestamp:Math.round(audioAt/RATE*1e6),data});
      aenc.encode(ad);ad.close();audioAt+=n;
    }
  };
  // The analyser hears the song offline: suspend at every frame, read the spectrum and waveform, draw, encode, resume.
  const actx=new OfflineAudioContext(1,Math.max(1,Math.ceil((length+1/fps)*RATE)),RATE),src=actx.createBufferSource(),an=actx.createAnalyser();
  an.fftSize=an0.fftSize;an.smoothingTimeConstant=an0.smoothing;an.minDecibels=an0.minDb;an.maxDecibels=an0.maxDb;
  src.buffer=buffer;src.connect(an);an.connect(actx.destination);
  const freq=new Uint8Array(an.frequencyBinCount),wave=new Float32Array(an.fftSize/2),dt=1/fps,key=Math.max(1,Math.round(fps*2));
  let done=0;
  const frameAt=async i=>{
    if(signal?.aborted)throw new DOMException('Export cancelled','AbortError');
    if(failure)throw failure;
    an.getByteFrequencyData(freq);an.getFloatTimeDomainData(wave);
    await drawFrame(i,i*dt,dt,{freq,wave,rate:RATE});
    const vf=new VideoFrame(canvas,{timestamp:Math.round(i*dt*1e6),duration:Math.round(dt*1e6)});
    venc.encode(vf,{keyFrame:i%key===0});vf.close();
    feedAudio((i+1)*dt);
    while(venc.encodeQueueSize>3&&!failure)await new Promise(r=>setTimeout(r,2));
    done=i+1;onProgress(done,total,'Rendering');
  };
  let error=null;
  for(let i=0;i<total;i++)actx.suspend((i+1)/fps).then(()=>frameAt(i)).then(()=>actx.resume(),e=>{error||=e;actx.resume();});
  src.start(0,start,length+1/fps);
  try{
    await actx.startRendering();
    if(error)throw error;
    if(done<total)throw Error('The audio analysis stopped early');
    feedAudio(length);await venc.flush();if(aenc)await aenc.flush();if(failure)throw failure;
    muxer.finalize();
    if(writable){await writable.close();return null;}
    return new Blob([target.buffer],{type:'video/mp4'});
  }catch(e){
    try{venc.close();}catch{}try{aenc?.close();}catch{}
    if(writable)await writable.abort().catch(()=>{});
    throw e;
  }finally{if(venc.state!=='closed')try{venc.close();}catch{}if(aenc&&aenc.state!=='closed')try{aenc.close();}catch{}}
}
