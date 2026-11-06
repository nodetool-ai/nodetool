#!/usr/bin/env node
// Writes the audio soak fixture (PLAN M3 exit 4): the four video tracks of
// fixtures/video-4tracks.json repeated every 15 s, and eight audio tracks
// that each always hold one sounding clip (tone files from
// scripts/make-fixtures.sh, back to back, 8 s each, with 50 ms fades), so 8
// audio clips play at every moment beside 4 decoding video tracks. The
// tracks sit at -18 dB, so the sum stays well below full scale.
//
// With --kind av-sync it writes the live A/V fixture instead: the clip of
// fixtures/av-sync.json (flash on source frame 30 n, click at 1000 n ms)
// repeated back to back, so the clicks continue for the whole run.
//
// Usage: node native/timeline/scripts/make-audio-soak.mjs [--kind soak|av-sync] [--seconds N] [--out FILE]
// Default: soak, 600 s, fixtures/generated/audio-soak.json (not checked in).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(root, "fixtures");
const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const seconds = Number(opt("--seconds", "600"));
const kind = opt("--kind", "soak");
const out = path.resolve(opt("--out", path.join(fixtures, "generated", kind === "av-sync" ? "av-sync-long.json" : "audio-soak.json")));

if (kind === "av-sync") {
  const av = JSON.parse(fs.readFileSync(path.join(fixtures, "av-sync.json"), "utf8"));
  const template = av.clips[0];
  const span = 12000;
  const clips = [];
  for (let k = 0; k * span < seconds * 1000; k++) {
    clips.push({ ...template, id: `fb-${k}`, startMs: k * span, durationMs: span, inPointMs: 1000, mediaPath: path.join(fixtures, template.mediaPath) });
  }
  const doc = { ...av, id: "seq-av-sync-long", name: `Flash and beep (${seconds} s)`, durationMs: clips.length * span, clips };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(doc, null, 2));
  console.log(`${out}: ${clips.length} clips, ${doc.durationMs / 1000} s`);
  process.exit(0);
}

const base = JSON.parse(fs.readFileSync(path.join(fixtures, "video-4tracks.json"), "utf8"));
const durationMs = seconds * 1000;
const media = (p) => path.join(fixtures, p);

const clips = [];
const period = 15000;
for (let k = 0; k * period < durationMs; k++) {
  for (const c of base.clips) {
    if (c.startMs + c.durationMs > period) continue;
    clips.push({ ...c, id: `${c.id}-${k}`, startMs: c.startMs + k * period, mediaPath: media(c.mediaPath) });
  }
  for (const c of base.clips) {
    if (c.startMs + c.durationMs <= period) continue;
    // Full-length clips: one per period.
    clips.push({ ...c, id: `${c.id}-${k}`, startMs: k * period, durationMs: Math.min(period, durationMs - k * period), mediaPath: media(c.mediaPath) });
  }
}

const tones = ["media/tone-220-48k-mono.wav", "media/tone-lr-48k-stereo.wav"];
const tracks = [...base.tracks];
for (let t = 0; t < 8; t++) {
  const trackId = `audio-${t + 1}`;
  tracks.push({ id: trackId, name: `Audio ${t + 1}`, type: "audio", index: tracks.length, visible: true, locked: false, muted: false, volumeDb: -18, pan: (t % 3) / 2 - 0.5 });
  // Offset each track so its cuts fall at different times.
  const offset = t * 700;
  for (let at = -offset, n = 0; at < durationMs; at += 8000, n++) {
    const start = Math.max(0, at);
    const end = Math.min(durationMs, at + 8000);
    if (end - start < 100) continue;
    clips.push({
      id: `${trackId}-${n}`, trackId, name: `tone ${n}`, startMs: start, durationMs: end - start, inPointMs: start - at,
      mediaType: "audio", sourceType: "imported", status: "generated", locked: false, versions: [],
      mediaPath: media(tones[(t + n) % 2]), fadeInMs: 50, fadeOutMs: 50
    });
  }
}

const doc = { ...base, id: "seq-audio-soak", name: `Audio soak (${seconds} s)`, durationMs, tracks, clips };
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(doc, null, 2));
console.log(`${out}: ${clips.length} clips, ${seconds} s`);
