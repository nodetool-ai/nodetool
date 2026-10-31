// Diagnostic references only. These never replace a native renderer or effect.
import { OfflineAudioContext, ConstantSourceNode } from 'node-web-audio-api';
export const RATE=48000;
export function schedule(param, breakpoints, map=v=>v) {
 param.setValueAtTime(map(breakpoints[0].value),0);
 for(const bp of breakpoints.slice(1))param.linearRampToValueAtTime(map(bp.value),bp.timeMs/1000);
}
export async function sampleParam(breakpoints,length,map=v=>v) {
 const ctx=new OfflineAudioContext(1,length,RATE),source=new ConstantSourceNode(ctx);
 schedule(source.offset,breakpoints,map); source.connect(ctx.destination); source.start();
 return (await ctx.startRendering()).getChannelData(0);
}
export function rampAt(breakpoints,time,map=v=>v) {
 let at=0;
 while(at+1<breakpoints.length && breakpoints[at+1].timeMs<=time)at++;
 const a=breakpoints[at],b=breakpoints[at+1];
 return b?map(a.value)+(map(b.value)-map(a.value))*(time-a.timeMs)/(b.timeMs-a.timeMs):map(a.value);
}
export function error(a,b) {
 if(a.length!==b.length)throw Error('Reference length mismatch');
 let max=0,frame=0;
 for(let i=0;i<a.length;i++) {
  if(!Number.isFinite(a[i]) || !Number.isFinite(b[i]))throw Error('Non-finite reference sample');
  const d=Math.abs(a[i]-b[i]); if(d>max){max=d;frame=Math.floor(i/2);}
 }
 return {max,frame};
}
export function interleaved(buffer) {
 const out=new Float32Array(buffer.length*2);
 for(let i=0;i<buffer.length;i++)for(let c=0;c<2;c++)out[2*i+c]=buffer.getChannelData(c)[i];
 return out;
}
// The reference panner truncates its quarter-cycle table index to 2048 steps.
// https://docs.rs/crate/web-audio-api/1.2.0/source/src/node/stereo_panner.rs
export function pan(input,values,table=false) {
 const out=new Float32Array(input.length);
 for(let i=0;i<values.length;i++) {
  const p=values[i],l=input[2*i],r=input[2*i+1];
  let x=p<=0?Math.fround(p+1):p;
  if(table)x=Math.floor(Math.fround(x*2048))/2048;
  const cos=table?Math.fround(Math.cos(x*Math.PI/2)):Math.cos(x*Math.PI/2);
  const sin=table?Math.fround(Math.sin(x*Math.PI/2)):Math.sin(x*Math.PI/2);
  out[2*i]=p<=0?Math.fround(l+Math.fround(r*cos)):Math.fround(l*cos);
  out[2*i+1]=p<=0?Math.fround(r*sin):Math.fround(r+Math.fround(l*sin));
 }
 return out;
}
export function biquad(input,frequencies,transposed=false) {
 const out=new Float32Array(input.length);
 const x1=[0,0],x2=[0,0],y1=[0,0],y2=[0,0],z1=[0,0],z2=[0,0];
 for(let i=0;i<frequencies.length;i++) {
  const w=2*Math.PI*frequencies[i]/RATE,cos=Math.cos(w),alpha=Math.sin(w)/(2*Math.pow(10,1/20));
  const a0=1+alpha,b0=(1-cos)/2/a0,b1=(1-cos)/a0,b2=b0,a1=-2*cos/a0,a2=(1-alpha)/a0;
  for(let c=0;c<2;c++) {
   const x=input[2*i+c];
   const y=transposed?b0*x+z1[c]:b0*x+b1*x1[c]+b2*x2[c]-a1*y1[c]-a2*y2[c];
   if(transposed){z1[c]=b1*x-a1*y+z2[c];z2[c]=b2*x-a2*y;}
   else{x2[c]=x1[c];x1[c]=x;y2[c]=y1[c];y1[c]=y;}
   out[2*i+c]=y;
  }
 }
 return out;
}
