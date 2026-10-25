#!/usr/bin/env node
// Golden comparison (PLAN M1b exit 4, and the media-tracks parity check):
// renders the same frames of a media fixture through `nodetool timeline
// render --stills` (golden-import.mjs) and through the native app (--stills),
// and computes the PSNR of each pair with ffmpeg's psnr filter (RGB, average
// over the three channels).
//
// Usage: node native/timeline/scripts/compare-golden.mjs <fixture.json> --frames a,b,c --min-psnr DB [--bin PATH] [--decode sw|hw|auto] [--json]
// --bin is the nodetool-timeline binary (default native/timeline/build/nodetool-timeline).
// Exit 0 only when every pair exists and every PSNR is at least --min-psnr.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = { fixture: null, frames: null, minPsnr: null, json: false, decode: "sw", bin: path.join(root, "build", "nodetool-timeline") };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--frames") args.frames = argv[++i];
    else if (argv[i] === "--bin") args.bin = path.resolve(argv[++i]);
    else if (argv[i] === "--decode") args.decode = argv[++i];
    else if (argv[i] === "--min-psnr") args.minPsnr = Number(argv[++i]);
    else if (argv[i] === "--json") args.json = true;
    else args.fixture = path.resolve(argv[i]);
  }
  if (!args.fixture || !args.frames || !Number.isFinite(args.minPsnr)) {
    console.error("usage: compare-golden.mjs <fixture.json> --frames a,b,c --min-psnr DB [--bin PATH] [--decode sw|hw|auto] [--json]");
    process.exit(2);
  }
  return args;
}

function measure(a, b) {
  const result = execFileSync(
    "bash",
    ["-c", `ffmpeg -hide_banner -i "$0" -i "$1" -lavfi "[0:v]format=rgb24[a];[1:v]format=rgb24[b];[a][b]psnr" -f null - 2>&1`, a, b],
    { encoding: "utf8" }
  );
  const m = /average:(inf|[0-9.]+)/.exec(result);
  if (!m) throw new Error(`no PSNR in ffmpeg output for ${a}`);
  return m[1] === "inf" ? Infinity : Number(m[1]);
}

const args = parseArgs(process.argv.slice(2));
const name = path.basename(args.fixture, ".json");
const goldenOut = path.join(root, "build", "golden", name);
const nativeOut = path.join(root, "build", "native-stills", `${name}-${args.decode}`);

try {
  execFileSync("node", [path.join(root, "scripts", "golden-import.mjs"), args.fixture, "--frames", args.frames, "--out", goldenOut], {
    stdio: ["ignore", "ignore", "pipe"]
  });
} catch (error) {
  console.error(`compare-golden: FAIL: golden-import exited ${error.status}: ${String(error.stderr).trim().split("\n").pop()}`);
  process.exit(1);
}
fs.rmSync(nativeOut, { recursive: true, force: true });
try {
  execFileSync(args.bin, [args.fixture, "--stills", nativeOut, "--still-frames", args.frames, "--decode", args.decode], {
    stdio: ["ignore", "ignore", "pipe"]
  });
} catch (error) {
  console.error(`compare-golden: FAIL: native stills exited ${error.status}: ${String(error.stderr).trim().split("\n").pop()}`);
  process.exit(1);
}

const results = [];
for (const frame of args.frames.split(",").map((f) => Number(f.trim()))) {
  const file = `frame_${String(frame).padStart(6, "0")}.png`;
  const golden = path.join(goldenOut, "stills", file);
  const native = path.join(nativeOut, file);
  if (!fs.existsSync(golden) || !fs.existsSync(native)) {
    results.push({ frame, psnr: null, pass: false, error: !fs.existsSync(golden) ? "no golden still" : "no native still" });
    continue;
  }
  const value = measure(golden, native);
  results.push({ frame, psnr: Number.isFinite(value) ? Math.round(value * 100) / 100 : "inf", pass: value >= args.minPsnr });
}
const pass = results.length > 0 && results.every((r) => r.pass);
const report = { fixture: path.relative(process.cwd(), args.fixture), decode: args.decode, minPsnr: args.minPsnr, verdict: pass ? "pass" : "fail", results };
if (args.json) console.log(JSON.stringify(report));
else {
  for (const r of results) console.log(`frame ${r.frame}: PSNR ${r.psnr} dB ${r.pass ? "ok" : `BELOW ${args.minPsnr}`}${r.error ? ` (${r.error})` : ""}`);
  console.log(pass ? "PASS" : "FAIL");
}
process.exit(pass ? 0 : 1);
