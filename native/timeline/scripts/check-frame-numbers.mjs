#!/usr/bin/env node
// Frame-number check (PLAN M1b exits 2 and 3): reads the burnt-in barcode
// back from native pictures of a fixture whose top layer is a full-frame
// numbered clip, and compares it with the source frame the D17 rule picks for
// that time: floor((t - startMs + inPointMs) * fps / 1000 + eps) of the clip
// on screen. Two runs, both required:
//   - settled (--stills): a paused seek to each frame, read once every layer
//     shows its exact frame. This checks seeks.
//   - play (--play-stills): real-time playback, the first picture shown at
//     each frame. This checks cuts: black or the outgoing clip fails, and so
//     does a frame playback never showed.
// The default frames are every cut frame and the frames on either side.
//
// Usage: node native/timeline/scripts/check-frame-numbers.mjs [fixture.json] [--frames a,b,c] [--decode sw|hw|auto] [--json]
// Default fixture: native/timeline/fixtures/video-cuts.json. Needs
// scripts/make-fixtures.sh and a display (the stills come from the app).
// Exit 0 only when every still was read and every number matches.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EPS = 1e-6;
const SOURCE_FPS = 30; // make-fixtures.sh numbers frames at 30 fps

function parseArgs(argv) {
  const args = { fixture: path.join(root, "fixtures", "video-cuts.json"), frames: null, json: false, decode: "sw" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--frames") args.frames = argv[++i].split(",").map(Number);
    else if (argv[i] === "--decode") args.decode = argv[++i];
    else if (argv[i] === "--json") args.json = true;
    else args.fixture = path.resolve(argv[i]);
  }
  return args;
}

// The clip on screen at `ms` on the top track that has one.
function topClipAt(doc, ms) {
  const tracks = [...doc.tracks].filter((t) => t.visible).sort((a, b) => a.index - b.index);
  for (const track of tracks) {
    const clip = doc.clips.find((c) => c.trackId === track.id && !c.hidden && ms >= c.startMs && ms < c.startMs + c.durationMs);
    if (clip) return clip;
  }
  return null;
}

// The 16-bit barcode in the top 40 rows: bit k is the 80 px cell at x = 80k.
function readBarcode(png) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", png, "-vf", "crop=1280:40:0:0,format=gray", "-f", "rawvideo", "-"], {
    maxBuffer: 1 << 24
  });
  if (raw.length !== 1280 * 40) throw new Error(`${png}: expected a 1280x40 strip, got ${raw.length} bytes`);
  let value = 0;
  for (let k = 0; k < 16; k++) {
    const lum = raw[20 * 1280 + 80 * k + 40];
    if (lum > 128) value |= 1 << k;
  }
  return value;
}

// Mean luma of the whole still on a 0-255 scale. A black still reads as
// frame 0, so a still must also carry a picture.
function meanLuma(png) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", png, "-vf", "scale=64:36,format=gray", "-f", "rawvideo", "-"]);
  return raw.reduce((sum, v) => sum + v, 0) / raw.length;
}

const args = parseArgs(process.argv.slice(2));
const doc = JSON.parse(fs.readFileSync(args.fixture, "utf8"));
const fps = doc.fps;
let frames = args.frames;
if (!frames) {
  const set = new Set();
  for (const clip of doc.clips) {
    const cut = Math.round((clip.startMs / 1000) * fps);
    for (const f of [cut - 1, cut, cut + 1]) if (f >= 0 && f < Math.round((doc.durationMs / 1000) * fps)) set.add(f);
  }
  frames = [...set].sort((a, b) => a - b);
}
const bin = path.join(root, "build", "nodetool-timeline");
const base = path.join(root, "build", "frame-numbers", `${path.basename(args.fixture, ".json")}-${args.decode}`);

// Reads the barcode of each still and compares it with the D17 pick for the
// clip on screen at `timeMs`.
function check(dir, entries) {
  const results = [];
  for (const { frame, timeMs } of entries) {
    const clip = topClipAt(doc, timeMs);
    const png = path.join(dir, `frame_${String(frame).padStart(6, "0")}.png`);
    const expected = clip ? Math.floor(((timeMs - clip.startMs + (clip.inPointMs ?? 0)) / 1000) * SOURCE_FPS + EPS) : null;
    let read = null;
    let error = null;
    if (!fs.existsSync(png)) error = "no still";
    else {
      try {
        read = readBarcode(png);
        if (meanLuma(png) < 20) error = "black still";
      } catch (e) {
        error = String(e.message);
      }
    }
    const pass = error === null && expected !== null && read === expected;
    results.push({ frame, timeMs: Math.round(timeMs * 1000) / 1000, clipId: clip?.id ?? null, expected, read, pass, ...(error && { error }) });
  }
  return results;
}

function run(flag, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  try {
    execFileSync(bin, [args.fixture, flag, dir, "--still-frames", frames.join(","), "--decode", args.decode], {
      stdio: ["ignore", "ignore", "pipe"]
    });
    return null;
  } catch (error) {
    return `${flag} exited ${error.status}: ${String(error.stderr).trim().split("\n").slice(-2).join(" | ")}`;
  }
}

// Settled: a paused seek to each frame, read once every layer is exact.
const settledDir = path.join(base, "settled");
const settledError = run("--stills", settledDir);
const settled = check(settledDir, frames.map((frame) => ({ frame, timeMs: (frame * 1000) / fps })));

// Play: real-time playback; the first picture shown at each frame. A cut that
// shows black or the outgoing clip first fails here even if it settles.
const playDir = path.join(base, "play");
const playError = run("--play-stills", playDir);
let play = [];
const reportFile = path.join(playDir, "play-report.json");
if (fs.existsSync(reportFile)) {
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  play = check(playDir, report.presented);
  for (const frame of report.missed) play.push({ frame, pass: false, error: "not presented during playback" });
}

const modePass = (results, error) => error === null && results.length === frames.length && results.every((r) => r.pass);
const settledPass = modePass(settled, settledError);
const playPass = modePass(play, playError);
const pass = settledPass && playPass;
if (args.json) {
  console.log(
    JSON.stringify({
      fixture: path.relative(process.cwd(), args.fixture),
      decode: args.decode,
      verdict: pass ? "pass" : "fail",
      settled: { verdict: settledPass ? "pass" : "fail", ...(settledError && { error: settledError }), results: settled },
      play: { verdict: playPass ? "pass" : "fail", ...(playError && { error: playError }), results: play }
    })
  );
} else {
  for (const [name, results, error] of [["settled", settled, settledError], ["play", play, playError]]) {
    if (error) console.log(`${name}: ${error}`);
    for (const r of results) {
      console.log(`${name} frame ${r.frame} ${r.clipId ?? ""}: expected ${r.expected}, read ${r.read}${r.error ? ` (${r.error})` : ""} ${r.pass ? "ok" : "MISMATCH"}`);
    }
  }
  console.log(pass ? `PASS: ${settled.length} settled and ${play.length} played frame numbers match` : "FAIL");
}
process.exit(pass ? 0 : 1);
