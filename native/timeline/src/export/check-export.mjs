#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
export const bin = path.resolve(args.includes("--bin") ? args[args.indexOf("--bin") + 1] : path.join(root, "build/nodetool-timeline"));
// Work folders go next to the binary, in the build folder: /tmp is a tmpfs
// with a per-user quota that other jobs on the machine share.
export const scratchBase = path.dirname(bin);
export function run(program, argv, options = {}) {
  const result = spawnSync(program, argv, {
    encoding: "utf8", maxBuffer: 128 * 1024 * 1024, ...options
  });
  assert.equal(result.error, undefined, `${program}: ${result.error}`);
  assert.equal(result.status, 0, `${program} ${argv.join(" ")}: exit ${result.status}\n${result.stderr}`);
  return result;
}
export function exportFile(fixture, out, format = "mp4", extra = []) {
  return JSON.parse(run(bin, [fixture, "--export", out, "--format", format, "--json", ...extra]).stdout);
}
export function psnr(a, b) {
  assert.ok(fs.existsSync(a), `Missing frame ${a}`);
  assert.ok(fs.existsSync(b), `Missing frame ${b}`);
  const result = run("ffmpeg", ["-v", "info", "-i", a, "-i", b, "-filter_complex",
    "[0:v]format=rgb24[a];[1:v]format=rgb24[b];[a][b]psnr", "-f", "null", "-"]);
  const match = /average:(inf|[\d.]+)/.exec(result.stderr);
  assert.ok(match, "No PSNR measurement");
  return match[1] === "inf" ? Infinity : Number(match[1]);
}
// PSNR in the export's own picture format. An H.264 MP4 carries 4:2:0
// BT.709 limited-range video, so an RGB still with sharp colour edges loses
// up to ~8 dB in chroma subsampling alone, whatever the encoder (the server's
// own `timeline render` MP4 measures 34.9 dB against its RGB stills on
// media-tracks frame 0). The golden still is therefore converted to that
// format and compared plane by plane with the decoded frame.
export function psnrYuv(still, movie, frame, width, height) {
  assert.ok(fs.existsSync(still), `Missing frame ${still}`);
  const dir = fs.mkdtempSync(path.join(scratchBase, "nt-export-yuv-"));
  try {
    const golden = path.join(dir, "golden.yuv");
    const decoded = path.join(dir, "decoded.yuv");
    run("ffmpeg", ["-v", "error", "-y", "-i", still, "-vf",
      `scale=${width}:${height}:out_color_matrix=bt709:out_range=tv,format=yuv420p`, "-f", "rawvideo", golden]);
    run("ffmpeg", ["-v", "error", "-y", "-i", movie, "-vf", `select=eq(n\\,${frame})`, "-frames:v", "1",
      "-f", "rawvideo", "-pix_fmt", "yuv420p", decoded]);
    assert.equal(fs.statSync(decoded).size, (width * height * 3) / 2, `Missing frame ${frame} in ${movie}`);
    const raw = ["-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", `${width}x${height}`];
    const result = run("ffmpeg", ["-v", "info", ...raw, "-i", decoded, ...raw, "-i", golden,
      "-lavfi", "psnr", "-f", "null", "-"]);
    const match = /average:(inf|[\d.]+)/.exec(result.stderr);
    assert.ok(match, "No PSNR measurement");
    return match[1] === "inf" ? Infinity : Number(match[1]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
export function requireFrames(rows) {
  assert.ok(rows.length > 0, "Compared no frames");
  for (const row of rows) {
    assert.ok(row.psnr >= 40, `${row.fixture} frame ${row.frame}: PSNR ${row.psnr} < 40 dB`);
  }
}
export function duration(doc) {
  return doc.clips.length ? Math.max(...doc.clips.map(c => c.startMs + c.durationMs)) : doc.durationMs;
}
export function checkedFrames(doc) {
  const count = Math.max(1, Math.round(duration(doc) * doc.fps / 1000));
  const frames = new Set([0, count - 1]);
  for (const c of doc.clips) {
    for (const ms of [c.startMs, c.startMs + c.durationMs]) {
      const at = Math.ceil(ms * doc.fps / 1000 - 1e-9);
      for (const f of [at - 1, at]) {
        if (f >= 0 && f < count) frames.add(f);
      }
    }
  }
  return [...frames].sort((a, b) => a - b);
}
function golden() {
  // Each 1080p or 4K export is tens of megabytes, so each fixture's files are
  // removed once it is compared.
  const out = fs.mkdtempSync(path.join(scratchBase, "nt-export-golden-"));
  const rows = [];
  try {
    for (const name of fs.readdirSync(path.join(root, "fixtures")).sort()) {
      if (!name.endsWith(".json") || ["audio-mix.json", "audio-proxy.json"].includes(name)) continue;
      const fixture = path.join(root, "fixtures", name);
      const doc = JSON.parse(fs.readFileSync(fixture));
      if (!doc.clips.some(c => c.mediaPath && ["video", "image"].includes(c.mediaType))) continue;
      const frames = checkedFrames(doc);
      if (name === "video-rejections.json") {
        // DESIGN.md D10a step 1: the compositor draws a placeholder for
        // rotated, non-square, alpha and HDR media, so the preview itself
        // differs from the golden. Skip only while the preview stills fail
        // too; once D10a step 2 lands this assertion fails and the skip goes.
        const preview = spawnSync("node", [path.join(root, "scripts/compare-golden.mjs"), fixture,
          "--frames", frames.join(","), "--min-psnr", "40", "--bin", bin], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
        assert.equal(preview.status, 1, `${name}: the preview now matches the golden; remove the D10a skip\n${preview.stdout}${preview.stderr}`);
        console.log(`SKIP ${name}: D10a placeholders, preview stills also below 40 dB: ${preview.stdout.trim().split("\n").join("; ")}`);
        continue;
      }
      const movie = path.join(out, `${name}.mp4`);
      exportFile(fixture, movie);
      const gold = path.join(out, `${name}-gold`);
      const goldenResult = spawnSync("node", [path.join(root, "scripts/golden-import.mjs"), fixture,
        "--frames", frames.join(","), "--out", gold], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      if (goldenResult.status !== 0) {
        const comparison = spawnSync("node", [path.join(root, "scripts/compare-golden.mjs"), fixture,
          "--frames", frames.join(","), "--bin", bin], {
          encoding: "utf8", maxBuffer: 16 * 1024 * 1024
        });
        assert.notEqual(comparison.status, 0, `compare-golden accepted ${name} rejected by golden-import`);
        console.log(`SKIP ${name}: golden-import: ${goldenResult.stderr.trim()}\ncompare-golden: ${comparison.stderr.trim()}`);
        continue;
      }
      const probe = JSON.parse(run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_streams",
        "-of", "json", movie]).stdout).streams[0];
      for (const frame of frames) {
        const index = frame + (args.includes("--shift-frame") ? 1 : 0);
        const still = path.join(gold, "stills", `frame_${String(frame).padStart(6, "0")}.png`);
        const value = psnrYuv(still, movie, index, probe.width, probe.height);
        const row = { fixture: name, frame, psnr: value };
        console.log(JSON.stringify({ ...row, psnr: Number.isFinite(value) ? value : "inf" }));
        rows.push(row);
      }
      fs.rmSync(movie, { force: true });
      fs.rmSync(gold, { recursive: true, force: true });
    }
    requireFrames(rows);
    console.log(`export_golden: PASS (${rows.length} frames)`);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) golden();
