import "../guest/env/index.mjs";
import { ContextAbortController } from "../guest/host/context-services.mjs";
import { PNG } from "./timeline-process-media.mjs";
import { writeFile, readFile } from "node:fs/promises";
import {
  hasEncoder,
  probeMedia,
  packetTimes,
  openVideoFrameEncoder,
  openRgbaFrameReader,
  decodeAudioToPcm,
  openFilterComplex,
  muxAudioWithVideoCopy,
  concatSegments,
  convertAudioToWav
} from "../guest/host/media-native.mjs";
const root = globalThis.__timelineRoot;
let checks = 0;
function assert(ok, message) {
  if (!ok) throw new Error(message);
  checks++;
}
assert(await hasEncoder("libx264"), "real libx264 discovery");
assert(!(await hasEncoder("missing_codec")), "missing codec discovery");
const path = `${root}/frames.mp4`;
const encoder = await openVideoFrameEncoder({
  outPath: path,
  fps: 1,
  input: "rgba",
  width: 8,
  height: 8,
  spec: {
    codec: "libx264",
    pixelFormat: "yuv420p",
    filter: "scale=out_color_matrix=bt709:out_range=tv",
    options: { preset: "veryfast", crf: "0" }
  }
});
for (const color of [
  [255, 0, 0, 255],
  [0, 255, 0, 255]
]) {
  const pixels = new Uint8Array(256);
  for (let i = 0; i < 256; i += 4) pixels.set(color, i);
  await encoder.write(pixels);
}
await encoder.finish();
// A yellow frame passed the former selected-channel-only reference checks.
const yellowEncoder = await openVideoFrameEncoder({
  outPath: `${root}/wrong-color.mp4`,
  fps: 1,
  input: "rgba",
  width: 8,
  height: 8,
  spec: {
    codec: "libx264",
    pixelFormat: "yuv420p",
    options: { preset: "veryfast", crf: "0" }
  }
});
const yellowPixels = new Uint8Array(256);
for (let i = 0; i < yellowPixels.length; i += 4)
  yellowPixels.set([255, 255, 0, 255], i);
await yellowEncoder.write(yellowPixels);
await yellowEncoder.finish();
const probe = await probeMedia(path);
assert(
  probe.video.width === 8 &&
    probe.video.height === 8 &&
    probe.durationSec === 2,
  "video probe"
);
assert((await packetTimes(path)).length === 2, "packet timestamps");
const reader = await openRgbaFrameReader({
  filePath: path,
  filter:
    "fps=1:round=up,scale=4:4:flags=accurate_rnd+full_chroma_int,format=rgba"
});
const red = await reader.next(),
  green = await reader.next();
assert(
  red.width === 4 && red.rgba[0] > 200 && red.rgba[1] < 30,
  "decoded red pixels"
);
assert(green.rgba[1] > 200 && green.rgba[0] < 30, "decoded green pixels");
assert((await reader.next()) === null, "decode EOF");
await reader.close();
const wav = new Uint8Array(44 + 48000 * 2);
const view = new DataView(wav.buffer);
function str(at, text) {
  for (let i = 0; i < text.length; i++) wav[at + i] = text.charCodeAt(i);
}
str(0, "RIFF");
view.setUint32(4, wav.length - 8, true);
str(8, "WAVEfmt ");
view.setUint32(16, 16, true);
view.setUint16(20, 1, true);
view.setUint16(22, 1, true);
view.setUint32(24, 48000, true);
view.setUint32(28, 96000, true);
view.setUint16(32, 2, true);
view.setUint16(34, 16, true);
str(36, "data");
view.setUint32(40, wav.length - 44, true);
for (let i = 0; i < 48000; i++)
  view.setInt16(
    44 + i * 2,
    Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / 48000)),
    true
  );
await writeFile(`${root}/tone.wav`, wav);
const pcm = await decodeAudioToPcm(`${root}/tone.wav`, {
  sampleRate: 24000,
  channels: 1
});
assert(
  pcm.channels === 1 &&
    pcm.samples.length === 24000 &&
    pcm.samples.some((x) => x > 0.2),
  "audio PCM resample"
);
const mix = await openFilterComplex({
  inputs: [{ filePath: `${root}/tone.wav`, kind: "audio", label: "1:a" }],
  graph:
    "[1:a]atrim=start=0:end=1,asetpts=PTS-STARTPTS,volume=0.5,adelay=0|0,apad[aout]",
  output: "aout",
  outputKind: "audio"
});
await muxAudioWithVideoCopy({
  videoPath: path,
  audio: mix.frames(),
  outPath: `${root}/audio.mp4`,
  codec: "aac",
  sampleRate: 48000
});
await mix.close();
const mixed = await probeMedia(`${root}/audio.mp4`);
assert(
  mixed.video.width === 8 && mixed.audio.channels === 2,
  "copied video and AAC audio"
);
const audio = await decodeAudioToPcm(`${root}/audio.mp4`, {
  sampleRate: 48000,
  channels: 1,
  maxSeconds: 2
});
assert(
  audio.samples.some((x) => x > 0.05),
  "muxed audio is audible"
);
let refused = false;
try {
  await probeMedia("/etc/passwd");
} catch {
  refused = true;
}
assert(refused, "outside path refused");
const abort = new ContextAbortController();
abort.abort();
refused = false;
try {
  await probeMedia(path, { signal: abort.signal });
} catch {
  refused = true;
}
assert(refused, "cancelled probe refused");

await writeFile(`${root}/still.png`, new Uint8Array(PNG));
const still = await openRgbaFrameReader({
  filePath: `${root}/still.png`,
  filter: "scale=8:8,format=rgba"
});
const image = await still.next();
assert(
  image.width === 8 && image.rgba[0] === 255 && image.rgba[1] === 0,
  "real PNG decode"
);
await still.close();
await concatSegments({
  outPath: `${root}/concat.mp4`,
  width: 8,
  height: 8,
  fps: 1,
  segments: [
    { kind: "image", filePath: `${root}/still.png`, durationSec: 1 },
    { kind: "video", filePath: path, durationSec: 1, withAudio: false },
    { kind: "blank", durationSec: 1 }
  ],
  videoFilter: "scale=8:8,pad=8:8:(ow-iw)/2:(oh-ih)/2",
  video: {
    codec: "libx264",
    pixelFormat: "yuv420p",
    options: { preset: "veryfast" }
  },
  audioCodec: "aac"
});
const cut = await probeMedia(`${root}/concat.mp4`);
assert(
  cut.audio.channels === 2 && Math.abs(cut.durationSec - 3) < 0.03,
  "rough-cut concat container"
);
const cutFrames = await openRgbaFrameReader({
  filePath: `${root}/concat.mp4`,
  filter: "format=rgba"
});
const first = await cutFrames.next(),
  second = await cutFrames.next(),
  third = await cutFrames.next();
assert(
  first.rgba[0] > 200 &&
    second.rgba[0] > 200 &&
    third.rgba[0] < 30 &&
    (await cutFrames.next()) === null,
  "concat actual frames"
);
await cutFrames.close();
for (const [name, fn] of [
  ["default deny", () => globalThis.__mediaDenied.hasEncoder("libx264")],
  ["host cancellation", () => globalThis.__mediaCancelled.probe(path)],
  [
    "pixel quota",
    () =>
      globalThis.__mediaLimited.openFilter({
        inputs: [{ filePath: path, kind: "video", label: "in" }],
        graph: "[in]format=rgba[out]",
        output: "out",
        outputKind: "video"
      })
  ],
  [
    "external filter",
    () =>
      globalThis.__host.media.openFilter({
        inputs: [],
        graph: "movie=/etc/passwd[out]",
        output: "out",
        outputKind: "video"
      })
  ],
  [
    "file-reading filter",
    () =>
      globalThis.__host.media.openFilter({
        inputs: [{ filePath: path, kind: "video", label: "in" }],
        graph: "[in]lut3d=file=/etc/passwd[out]",
        output: "out",
        outputKind: "video"
      })
  ],
  [
    "command-file filter",
    () =>
      globalThis.__host.media.openFilter({
        inputs: [{ filePath: path, kind: "video", label: "in" }],
        graph: "[in]sendcmd=f=/etc/passwd,null[out]",
        output: "out",
        outputKind: "video"
      })
  ],
  [
    "codec grant",
    () =>
      globalThis.__host.media.openEncoder({
        outPath: `${root}/denied.mp4`,
        spec: { codec: "mpeg4" }
      })
  ]
]) {
  let failed = false;
  try {
    // A refusal throws at the call, or rejects once the host checked it.
    await fn();
  } catch {
    failed = true;
  }
  assert(failed, name);
}
const invalid = await openVideoFrameEncoder({
  outPath: `${root}/invalid.mp4`,
  fps: 1,
  input: "rgba",
  width: 8,
  height: 8,
  spec: {
    codec: "libx264",
    pixelFormat: "yuv420p",
    options: { preset: "veryfast", crf: 1 }
  }
});
let invalidRefused = false;
try {
  await invalid.write(new Uint8Array(256));
} catch {
  invalidRefused = true;
} finally {
  await invalid.abort();
}
assert(invalidRefused, "invalid codec options release dictionaries");
// Handle ids that are NaN, infinite, not integers or outside the int range
// throw a RangeError before the host converts them to int.
{
  const host = globalThis.__host.media;
  const badIds = [NaN, Infinity, -Infinity, 2 ** 31, -(2 ** 31) - 1, 1.5];
  for (const op of ["next", "write", "finish", "close", "abort"]) {
    for (const id of badIds) {
      let message = "";
      try {
        await host[op](id, new Uint8Array(0));
      } catch (error) {
        message = String(error?.message ?? error);
      }
      assert(message.startsWith("RangeError: "), `${op}(${id}) throws a RangeError, got "${message}"`);
    }
  }
}

// PT14: audio decode batches frames, and convertAudioToWav matches the
// per-sample float to int16 formula.
{
  const seconds = 60, rate = 48000;
  const long = new Uint8Array(44 + seconds * rate * 4);
  const lv = new DataView(long.buffer);
  const lstr = (at, s) => { for (let i = 0; i < s.length; i++) long[at + i] = s.charCodeAt(i); };
  lstr(0, "RIFF"); lv.setUint32(4, long.length - 8, true); lstr(8, "WAVE");
  lstr(12, "fmt "); lv.setUint32(16, 16, true); lv.setUint16(20, 1, true);
  lv.setUint16(22, 2, true); lv.setUint32(24, rate, true); lv.setUint32(28, rate * 4, true);
  lv.setUint16(32, 4, true); lv.setUint16(34, 16, true);
  lstr(36, "data"); lv.setUint32(40, long.length - 44, true);
  let seed = 12345;
  for (let i = 0; i < seconds * rate * 2; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const v = i % 997 === 0 ? 32767 : i % 991 === 0 ? -32768 : (seed >> 8) % 65536 - 32768;
    lv.setInt16(44 + i * 2, v, true);
  }
  await writeFile(`${root}/long.wav`, long);
  const media = globalThis.__host.media;
  const realNext = media.next;
  let nextCalls = 0;
  media.next = (...args) => { nextCalls++; return realNext.apply(media, args); };
  const decoded = await decodeAudioToPcm(`${root}/long.wav`, { sampleRate: rate, channels: 2 });
  await convertAudioToWav(`${root}/long.wav`, `${root}/long-out.wav`);
  media.next = realNext;
  const out = new Uint8Array(await readFile(`${root}/long-out.wav`));
  let hash = 2166136261;
  for (let i = 0; i < out.length; i++) hash = Math.imul(hash ^ out[i], 16777619) >>> 0;
  console.log(`PT14 next calls ${nextCalls} wav bytes ${out.length} fnv ${hash}`);
  // The old formula, applied to the float decode.
  const ref = new DataView(new ArrayBuffer(decoded.samples.length * 2));
  for (let i = 0; i < decoded.samples.length; i++) {
    const s = Math.max(-1, Math.min(1, decoded.samples[i]));
    ref.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  assert(out.length === 44 + decoded.samples.length * 2, "wav length");
  const body = out.subarray(44);
  let same = true;
  for (let i = 0; i < body.length; i++) if (body[i] !== ref.getUint8(i)) { same = false; break; }
  assert(same, "convertAudioToWav matches the float to int16 formula");
  assert(nextCalls <= 130, `audio decode batches frames, got ${nextCalls} next calls`);
}
globalThis.__timelineChecks = checks;
globalThis.__timelineResult = JSON.stringify({ checks, probe, mixed });
globalThis.__nodetool = {};
