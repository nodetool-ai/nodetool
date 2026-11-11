// Provider video preprocessing is an explicit native decoder grant. Keeping it
// here prevents the server's node-av module and its ambient filesystem loader
// from entering the workflow guest.
import { fromJson, toJson } from '../values.mjs';
import { mp4DurationSeconds } from 'guest-real:@nodetool-ai/runtime/providers/video-duration.js';
function call(name,args,signal) {
  signal?.throwIfAborted();
  const host=globalThis.__host?.context;
  if(!host?.has(name)) throw new Error(`ProcessingContext service '${name}' is not granted`);
  const result=fromJson(host.call(name,toJson(args)));
  signal?.throwIfAborted();
  return result;
}
export async function sampleVideoFrames(bytes,options={}) {
  return call('media:sampleVideoFrames',{bytes,maxFrames:options.maxFrames,maxFps:options.maxFps,maxDimension:options.maxDimension},options.signal);
}
export async function probeVideoDurationSeconds(bytes,signal) {
  signal?.throwIfAborted();
  return mp4DurationSeconds(bytes) ?? call('media:probeVideoDurationSeconds',{bytes},signal);
}
export function frameRateFor(durationSec,maxFrames,maxFps) {
  return durationSec===null || durationSec<=0 ? maxFps : Math.min(maxFps,Math.max(maxFrames>1?(maxFrames-1)/durationSec:1/durationSec,0.01));
}
