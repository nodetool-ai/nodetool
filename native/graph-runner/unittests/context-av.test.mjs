import "../guest/env/index.mjs";
import { GuestContext } from "../guest/host/context.mjs";
import { CodeNode } from "@nodetool-ai/code-nodes/nodes/code-node";
import {
  openVideoFrameEncoder,
  probeMedia
} from "../guest/host/media-native.mjs";
import { writeFileSync, readFileSync } from "../guest/host/fs.mjs";
let checks = 0;
const check = (value, message) => {
  if (!value) throw new Error(message);
  checks++;
};
const root = globalThis.__avRoot;
const source = `${root}/source.mp4`;
const encoder = await openVideoFrameEncoder({
  outPath: source,
  fps: 2,
  input: "rgba",
  width: 8,
  height: 4,
  spec: {
    codec: "libx264",
    pixelFormat: "yuv420p",
    options: { preset: "veryfast", crf: "0" }
  }
});
for (const color of [
  [255, 0, 0, 255],
  [0, 255, 0, 255]
]) {
  const pixels = new Uint8Array(8 * 4 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set(color, i);
  await encoder.write(pixels);
}
await encoder.finish();
const video = readFileSync(source);
const tone = new Uint8Array(44 + 48000 * 2),
  view = new DataView(tone.buffer);
function text(at, value) {
  for (let i = 0; i < value.length; i++) tone[at + i] = value.charCodeAt(i);
}
text(0, "RIFF");
view.setUint32(4, tone.length - 8, true);
text(8, "WAVEfmt ");
view.setUint32(16, 16, true);
view.setUint16(20, 1, true);
view.setUint16(22, 1, true);
view.setUint32(24, 48000, true);
view.setUint32(28, 96000, true);
view.setUint16(32, 2, true);
view.setUint16(34, 16, true);
text(36, "data");
view.setUint32(40, tone.length - 44, true);
for (let i = 0; i < 48000; i++)
  view.setInt16(
    44 + i * 2,
    Math.round(8192 * Math.sin((2 * Math.PI * 440 * i) / 48000)),
    true
  );
const context = new GuestContext();
const videoRef = {
  type: "video",
  uri: await context.storage.store("source.mp4", video)
};
const audioRef = {
  type: "audio",
  uri: await context.storage.store("tone.wav", tone)
};
const code = new CodeNode();
code.timeout = 60;
code.dynamicProps.set("video", videoRef);
code.dynamicProps.set("tone", audioRef);
code.dynamicProps.set("keepOriginalAudio", !globalThis.__avDropOriginal);
code.code = `
const original=await video.info(inputs.video);
const clipped=await video.trim(inputs.video,{start:.5,end:1});
const clippedInfo=await video.info(clipped);
const small=await video.resize(inputs.video,{width:4,height:2});
const smallInfo=await video.info(small);
const turned=await video.rotate(inputs.video,90);
const turnedInfo=await video.info(turned);
const frame=await image.decode(await video.extractFrame(inputs.video,.25));
const green=await image.decode(await video.extractFrame(clipped,0));
const pixelCheck=(pixels,color)=>{for(let i=0;i<pixels.length;i+=4)for(let j=0;j<4;j++)if(Math.abs(pixels[i+j]-color[j])>(j===3?0:3))throw new Error('Actual decoded RGBA pixel differs');};
pixelCheck(frame.pixels,[255,0,0,255]);pixelCheck(green.pixels,[0,255,0,255]);
const combined=await video.addAudio(inputs.video,inputs.tone);
const combinedInfo=await video.info(combined);
const extracted=await video.extractAudio(combined);
const audioInfo=await audio.info(extracted);
const normalized=await audio.normalize(extracted);
const cut=await audio.trim(normalized,{start:.1,end:.3});
const joined=await audio.concat([cut,cut]);
const mixed=await audio.mix([cut,cut]);
const reversed=await audio.reverse(cut);
const fadedIn=await audio.fadeIn(cut,{duration:.1});
const fadedOut=await audio.fadeOut(cut,{duration:.1});
const repeated=await audio.repeat(cut,{loops:3});
const moreAudio=await video.addAudio(combined,inputs.tone,{keepOriginalAudio:inputs.keepOriginalAudio});
await workspace.writeBytes('two-tracks.mp4',await video.bytes(moreAudio));
const durations=[];for(const audioRef of [cut,joined,mixed,reversed,fadedIn,fadedOut,repeated])durations.push((await audio.info(audioRef)).duration);
return {original,clippedInfo,smallInfo,turnedInfo,combinedInfo,audioInfo,durations,normalizedBytes:(await audio.bytes(normalized)).length};`;
const result = await code.process(context);
check(
  result.original.width === 8 &&
    result.original.height === 4 &&
    result.original.duration === 1,
  "Code native video.info"
);
check(result.clippedInfo.duration === 0.5, "Code native video.trim");
check(
  result.smallInfo.width === 4 && result.smallInfo.height === 2,
  "Code native video.resize"
);
check(
  result.turnedInfo.width === 4 && result.turnedInfo.height === 8,
  "Code native video.rotate"
);
check(
  result.combinedInfo.has_audio &&
    result.audioInfo.sample_rate === 48000 &&
    result.audioInfo.duration >= 1,
  "Code add/extract compressed audio"
);
for (const [index, expected] of [0.2, 0.4, 0.2, 0.2, 0.2, 0.2, 0.6].entries())
  check(
    Math.abs(result.durations[index] - expected) < 1 / 48000,
    "Code actual audio DSP duration " + index
  );
check(result.normalizedBytes > 44, "Actual Code WAV output bytes");
const deniedMedia = globalThis.__tracksDenied;
try {
  deniedMedia.remuxTracks({
    videoPath: source,
    audioPath: `${root}/two-tracks.mp4`,
    outPath: `${root}/denied.mp4`
  });
  throw new Error("Denied remux accepted");
} catch (error) {
  check(String(error).includes("grant is disabled"), "default-deny remux");
}
try {
  globalThis.__host.media.remuxTracks({
    videoPath: "/etc/passwd",
    audioPath: source,
    outPath: `${root}/escape.mp4`
  });
  throw new Error("Outside path accepted");
} catch (error) {
  check(String(error).includes("EACCES"), "remux path confinement");
}
const bad = new CodeNode();
bad.dynamicProps.set("video", videoRef);
bad.code =
  "return await video.resize(inputs.video,{width:100000,height:100000});";
try {
  await bad.process(context);
  throw new Error("Media byte limit accepted");
} catch (error) {
  check(
    String(error).includes("media limit"),
    "Code decoded media resource bound"
  );
}
globalThis.__g5AvResult = {
  checks,
  videoTransforms: true,
  compressedAudio: true,
  audioDsp: true,
  retainedAudioTracks: true
};
globalThis.__nodetool = {};
