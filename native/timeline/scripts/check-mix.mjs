#!/usr/bin/env node
// Mixer reference check (PLAN M3 exit 1, DESIGN.md D25 and D26): diffs the
// native offline mix (`nodetool-timeline <fixture> --render-audio`) against a
// reference mix built here from the web rules, sample by sample.
//
// The reference decodes each source with the ffmpeg CLI (not the native
// AudioSource), and takes every rule from the TypeScript where it lives:
//   - which clips sound: `videoClipsWithOwnAudio`, `soundTrackSoloed` and
//     `effectiveAssetId` from @nodetool-ai/timeline, plus the audio-clip and
//     solo-group rule of web/src/components/timeline/render/renderAudio.ts
//     (`isPlayableAudioClip`, `audibleTrackIds`), copied below;
//   - fades: `resolveClipFades` and `clipFadeGain`;
//   - the source rate: `sourceRate`;
//   - the gain chain of preview/AudioGraph.ts: clip volumeDb, then the
//     track fader and StereoPannerNode for audio and midi tracks only, then
//     master.volumeDb (`dbToGain`, copied below).
// `mediaPath` stands in for `currentAssetId`, as in the native model.
//
// Each fixture runs as is and in variants: a soloed track, a muted track,
// and a master fader change. A variant is written to fixtures/generated/.
//
// Usage: node native/timeline/scripts/check-mix.mjs [fixture.json ...] [--bin PATH] [--json]
// Default fixtures: native/timeline/fixtures/audio-mix.json and audio-proxy.json
// (a video proxy with no audio track whose sound comes from `audioPath`). Needs
// scripts/make-fixtures.sh and `npm run build:packages`.
// Exit 0 only when every variant matches within 1e-6, no native or
// reference sample is NaN or infinite, and at least one non-silent sample
// was compared.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  clipFadeGain,
  effectiveAssetId,
  resolveClipFades,
  soundTrackSoloed,
  sourceRate,
  videoClipsWithOwnAudio
} from "@nodetool-ai/timeline";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RATE = 48000;
const TOLERANCE = 1e-6;

const args = { fixtures: [], bin: path.join(root, "build-m3", "nodetool-timeline"), json: false };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "--bin") args.bin = path.resolve(process.argv[++i]);
  else if (a === "--json") args.json = true;
  else args.fixtures.push(path.resolve(a));
}
// The mix rules, and a proxy picture whose sound comes from `audioPath`.
if (args.fixtures.length === 0) {
  args.fixtures = ["audio-mix.json", "audio-proxy.json"].map((f) => path.join(root, "fixtures", f));
}
if (!fs.existsSync(args.bin)) args.bin = path.join(root, "build", "nodetool-timeline");

// AudioGraph.ts `dbToGain`.
const dbToGain = (db) => (db === undefined || db === 0 ? 1 : Math.pow(10, db / 20));

// renderAudio.ts: the clips the export (and the preview) sound.
function soundingClips(doc) {
  // The sound reads `audioPath` when set, else `mediaPath` (Mixer.cpp).
  const clips = doc.clips.map((c) => ({ ...c, currentAssetId: c.audioPath || c.mediaPath }));
  const tracks = doc.tracks;
  const audioTracks = tracks.filter((t) => t.type === "audio" || t.type === "midi");
  const hasSolo = audioTracks.some((t) => t.solo);
  const audible = new Set(audioTracks.filter((t) => !t.muted && (!hasSolo || t.solo)).map((t) => t.id));
  const isPlayableAudioClip = (clip) =>
    !clip.muted && clip.startMs + clip.durationMs > 0 && clip.mediaType === "audio" && effectiveAssetId(clip) !== undefined;
  if (soundTrackSoloed(tracks) !== hasSolo) throw new Error("solo group disagrees with soundTrackSoloed");
  return [
    ...videoClipsWithOwnAudio(clips, tracks).filter((c) => c.startMs + c.durationMs > 0).map((c) => ({ clip: c, own: true })),
    ...clips.filter((c) => isPlayableAudioClip(c) && audible.has(c.trackId)).map((c) => ({ clip: c, own: false }))
  ];
}

const pcmCache = new Map();
// Interleaved stereo Float32Array of a source at 48 kHz, decoded by ffmpeg.
function decode(file) {
  if (pcmCache.has(file)) return pcmCache.get(file);
  const channels = Number(
    execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels", "-of", "csv=p=0", file])
      .toString()
      .trim()
  );
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-map", "0:a:0", "-ar", String(RATE), "-f", "f32le", "-"], {
    maxBuffer: 1 << 30
  });
  const src = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  let stereo;
  if (channels === 1) {
    stereo = new Float32Array(src.length * 2);
    for (let i = 0; i < src.length; i++) stereo[2 * i] = stereo[2 * i + 1] = src[i];
  } else if (channels === 2) {
    stereo = src;
  } else {
    throw new Error(`${file}: ${channels} channels; the reference handles mono and stereo`);
  }
  pcmCache.set(file, stereo);
  return stereo;
}

function referenceMix(doc, baseDir) {
  const frames = Math.round((doc.durationMs * RATE) / 1000);
  const out = new Float64Array(frames * 2);
  const master = dbToGain(doc.master?.volumeDb);
  for (const { clip, own } of soundingClips(doc)) {
    const track = doc.tracks.find((t) => t.id === clip.trackId);
    const pcm = decode(path.resolve(baseDir, clip.audioPath || clip.mediaPath));
    const count = pcm.length / 2;
    const rate = sourceRate(clip);
    const fades = resolveClipFades(clip, clip.durationMs);
    const clipGain = clip.volumeDb ? Math.pow(10, clip.volumeDb / 20) : 1;
    // A video track's chain is never set by AudioGraph.updateTracks.
    const trackGain = own ? 1 : dbToGain(track.volumeDb);
    const pan = own ? 0 : Math.min(1, Math.max(-1, track.pan ?? 0));
    let lToL = 1, rToL = 0, lToR = 0, rToR = 1;
    if (pan < 0) {
      const x = ((pan + 1) * Math.PI) / 2;
      rToL = Math.cos(x);
      rToR = Math.sin(x);
    } else if (pan > 0) {
      const x = (pan * Math.PI) / 2;
      lToL = Math.cos(x);
      lToR = Math.sin(x);
    }
    const first = Math.max(0, Math.ceil((clip.startMs * RATE) / 1000 - 1e-6));
    const last = Math.min(frames, Math.ceil(((clip.startMs + clip.durationMs) * RATE) / 1000 - 1e-6));
    const at = (f) => (f >= 0 && f < count ? [pcm[2 * f], pcm[2 * f + 1]] : [0, 0]);
    for (let f = first; f < last; f++) {
      const into = (f * 1000) / RATE - clip.startMs;
      const s = ((clip.inPointMs ?? 0) + into * rate) * (RATE / 1000);
      const s0 = Math.floor(s + 1e-9);
      const frac = Math.max(0, s - s0);
      const [l0, r0] = at(s0);
      const [l1, r1] = frac > 1e-9 ? at(s0 + 1) : [l0, r0];
      const inL = l0 + (l1 - l0) * frac;
      const inR = r0 + (r1 - r0) * frac;
      const g = clipGain * clipFadeGain(clip, clip.durationMs, into) * trackGain * master;
      out[2 * f] += (inL * lToL + inR * rToL) * g;
      out[2 * f + 1] += (inL * lToR + inR * rToR) * g;
    }
  }
  return out;
}

function variants(doc) {
  const list = [{ name: "as-is", doc }];
  const audio = doc.tracks.filter((t) => t.type === "audio");
  const unmuted = audio.filter((t) => !t.muted);
  if (unmuted.length > 0) {
    const solo = structuredClone(doc);
    solo.tracks.find((t) => t.id === unmuted[unmuted.length - 1].id).solo = true;
    list.push({ name: `solo ${unmuted[unmuted.length - 1].id}`, doc: solo });
    const muted = structuredClone(doc);
    muted.tracks.find((t) => t.id === unmuted[0].id).muted = true;
    list.push({ name: `mute ${unmuted[0].id}`, doc: muted });
  }
  const louder = structuredClone(doc);
  louder.master = { ...(louder.master ?? { effects: [] }), volumeDb: 4 };
  list.push({ name: "master +4 dB", doc: louder });
  return list;
}

const genDir = path.join(root, "fixtures", "generated");
fs.mkdirSync(genDir, { recursive: true });
const results = [];
let compared = 0;
for (const fixture of args.fixtures) {
const base = JSON.parse(fs.readFileSync(fixture, "utf8"));
const baseDir = path.dirname(fixture);
for (const v of variants(base)) {
  // Variants keep media paths relative to the original fixture.
  const doc = structuredClone(v.doc);
  for (const c of doc.clips) {
    if (c.mediaPath) c.mediaPath = path.resolve(baseDir, c.mediaPath);
    if (c.audioPath) c.audioPath = path.resolve(baseDir, c.audioPath);
  }
  const file = path.join(genDir, `mix-${path.basename(fixture, ".json")}-${v.name.replace(/[^a-z0-9]+/gi, "_")}.json`);
  fs.writeFileSync(file, JSON.stringify(doc, null, 2));
  const outFile = path.join(genDir, `${path.basename(file, ".json")}.f32`);
  const report = JSON.parse(execFileSync(args.bin, [file, "--render-audio", outFile]).toString());
  const raw = fs.readFileSync(outFile);
  const native = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const ref = referenceMix(doc, baseDir);
  let maxError = 0;
  let worstAt = -1;
  let energy = 0;
  if (native.length !== ref.length) {
    results.push({ variant: v.name, pass: false, reason: `length ${native.length} vs ${ref.length}` });
    continue;
  }
  let nonFinite = 0;
  for (let i = 0; i < ref.length; i++) {
    // A NaN or infinite sample fails outright: `NaN > maxError` is false, so
    // it would never raise the error.
    if (!Number.isFinite(native[i]) || !Number.isFinite(ref[i])) {
      nonFinite++;
      if (worstAt < 0) worstAt = i;
      continue;
    }
    const e = Math.abs(native[i] - ref[i]);
    if (e > maxError) {
      maxError = e;
      worstAt = i;
    }
    energy += ref[i] * ref[i];
  }
  compared += ref.length;
  const pass = nonFinite === 0 && Number.isFinite(maxError) && maxError <= TOLERANCE && energy > 0;
  results.push({
    fixture: path.basename(fixture),
    variant: v.name,
    pass,
    voices: report.voices,
    samples: ref.length,
    maxError,
    nonFinite,
    worstFrame: worstAt >= 0 ? Math.floor(worstAt / 2) : null,
    rms: Math.sqrt(energy / ref.length)
  });
}
}
const pass = results.length > 0 && results.every((r) => r.pass) && compared > 0;
const summary = { pass, tolerance: TOLERANCE, fixtures: args.fixtures.map((f) => path.relative(root, f)), compared, results };
if (args.json) console.log(JSON.stringify(summary));
else {
  for (const r of results) console.log(`${r.pass ? "ok  " : "FAIL"} ${r.fixture ?? ""} ${r.variant}: max error ${r.maxError ?? r.reason}${r.nonFinite ? `, ${r.nonFinite} non-finite samples` : ""}, voices ${r.voices?.join(",")}`);
  console.log(pass ? "mix matches the reference" : "mix differs from the reference");
}
process.exit(pass ? 0 : 1);
