#!/usr/bin/env node
// Headless A/V sync (PLAN M3 exit 1, DESIGN.md D21 and D22) on
// fixtures/av-sync.json, whose one clip is a video with a white flash on
// source frame 30 n and a click at source time 1000 n ms in its own audio.
// Three runs, all without a window and without a sound:
//   1. `--av-sync`: the offline mix puts each click within 1 ms of the
//      timeline time the clip placement gives it, and on the null device the
//      audio-master clock reads that time within 1 ms when the click is
//      audible, across a device change. 0 underruns, play start under 300 ms.
//   2. `--stills` at each click frame: the picture is the flash (mean luma
//      over 200) and its burnt-in barcode is source frame 30 n.
//   3. `--play-stills --audio null`: real-time playback on the audio-master
//      clock. The first picture shown at each click frame is the flash with
//      the right barcode, so picture and click land on the same frame. The
//      audio report must show the null backend, 0 underruns and 0 late
//      starts.
//
// Usage: node native/timeline/scripts/check-av-sync.mjs [fixture.json] [--bin PATH] [--json]
// Needs scripts/make-fixtures.sh. Exit 0 only when every run passes and at
// least one click was compared in each.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = { fixture: path.join(root, "fixtures", "av-sync.json"), bin: path.join(root, "build-m3", "nodetool-timeline"), json: false };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "--bin") args.bin = path.resolve(process.argv[++i]);
  else if (a === "--json") args.json = true;
  else args.fixture = path.resolve(a);
}
if (!fs.existsSync(args.bin)) args.bin = path.join(root, "build", "nodetool-timeline");
const doc = JSON.parse(fs.readFileSync(args.fixture, "utf8"));
const fps = doc.fps;
const out = path.join(root, "build-m3", "av-sync", path.basename(args.fixture, ".json"));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// The 16-bit barcode in the top 40 rows (scripts/make-fixtures.sh).
function readBarcode(png) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", png, "-vf", "crop=1280:40:0:0,format=gray", "-f", "rawvideo", "-"]);
  let value = 0;
  for (let k = 0; k < 16; k++) if (raw[20 * 1280 + 80 * k + 40] > 128) value |= 1 << k;
  return value;
}
function meanLuma(png) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", png, "-vf", "crop=iw:ih-80:0:80,scale=64:36,format=gray", "-f", "rawvideo", "-"]);
  return raw.reduce((sum, v) => sum + v, 0) / raw.length;
}

// 1. Mixer and clock arithmetic.
const sync = spawnSync(args.bin, [args.fixture, "--av-sync", "--json"], { encoding: "utf8" });
let avSync = null;
try {
  avSync = JSON.parse(sync.stdout.trim().split("\n").pop());
} catch {
  avSync = { pass: false, error: sync.stderr };
}
const clicks = (avSync?.offline?.clicks ?? []).map((c) => c.expectedMs);
const frames = clicks.map((ms) => Math.round((ms * fps) / 1000));
const clip = doc.clips[0];
const expectedSourceFrame = (frame) => Math.round((((frame * 1000) / fps - clip.startMs + clip.inPointMs) * 30) / 1000);

function checkPictures(dir, list) {
  return list.map((frame) => {
    const png = path.join(dir, `frame_${String(frame).padStart(6, "0")}.png`);
    if (!fs.existsSync(png)) return { frame, pass: false, reason: "no still" };
    const barcode = readBarcode(png);
    const luma = meanLuma(png);
    const expected = expectedSourceFrame(frame);
    return { frame, barcode, expected, luma: Math.round(luma), pass: barcode === expected && expected % 30 === 0 && luma > 200 };
  });
}

// 2. Settled stills.
const stillsDir = path.join(out, "stills");
const stills = spawnSync(args.bin, [args.fixture, "--stills", stillsDir, "--still-frames", frames.join(","), "--size", "1280x720"], {
  encoding: "utf8"
});
const settled = frames.length ? checkPictures(stillsDir, frames) : [];

// 3. Real-time play on the audio-master clock.
const playDir = path.join(out, "play");
const play = spawnSync(
  args.bin,
  [args.fixture, "--play-stills", playDir, "--still-frames", frames.join(","), "--size", "1280x720", "--audio", "null",
    "--audio-latency-ms", "25", "--audio-report", path.join(out, "play-audio.json")],
  { encoding: "utf8" }
);
const played = frames.length ? checkPictures(playDir, frames) : [];
let audio = null;
try {
  audio = JSON.parse(fs.readFileSync(path.join(out, "play-audio.json"), "utf8"));
} catch {
  audio = null;
}
const audioOk = audio?.backend === "Null" && audio.underruns === 0 && audio.lateStarts === 0 && audio.callbacks > 0 &&
  audio.openFailures === 0 && audio.decodeErrors === 0 &&
  audio.playStartMs >= 0 && audio.playStartMs < 300;

const summary = {
  pass:
    sync.status === 0 && avSync?.pass === true && frames.length > 0 &&
    stills.status === 0 && settled.length > 0 && settled.every((r) => r.pass) &&
    play.status === 0 && played.length > 0 && played.every((r) => r.pass) && audioOk,
  avSync: {
    exit: sync.status,
    pass: avSync?.pass ?? false,
    offlineMaxErrorMs: avSync?.offline?.maxErrorMs ?? null,
    nullDeviceMaxErrorMs: avSync?.nullDevice?.maxErrorMs ?? null,
    clicks: avSync?.offline?.expected ?? 0,
    nullDeviceClicks: avSync?.nullDevice?.matched ?? 0,
    clicksAfterDeviceChange: avSync?.nullDevice?.clicksAfterDeviceChange ?? 0,
    engine: avSync?.engine ?? null
  },
  stills: { exit: stills.status, frames: settled },
  play: { exit: play.status, frames: played, audio, audioPass: audioOk }
};
if (args.json) console.log(JSON.stringify(summary));
else console.log(JSON.stringify(summary, null, 2));
process.exit(summary.pass ? 0 : 1);
