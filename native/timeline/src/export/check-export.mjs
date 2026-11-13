#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
export const bin = path.resolve(args.includes("--bin") ? args[args.indexOf("--bin") + 1] : path.join(root, "build/nodetool-timeline"));
// Work folders go next to the binary, in the build folder: /tmp is a tmpfs
// with a per-user quota that other jobs on the machine share.
export const scratchBase = path.dirname(bin);
export function goldenOutputBase(binary) {
  const base = path.dirname(path.resolve(binary));
  const build = path.join(root, "build");
  const inside = folder => {
    const relative = path.relative(folder, base);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  };
  // golden-import permits only build/ within the repository.
  return inside(build) || !inside(path.resolve(root, "../.."))
    ? base : path.join(build, "golden");
}
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
// Older FFmpeg decoders expose the padded final AAC frame. Honor the file's
// declared stream duration, never the fixture's expected length.
export function decodeAudio(file, output) {
  const streams = JSON.parse(run("ffprobe", ["-v", "error", "-select_streams", "a:0",
    "-show_entries", "stream=sample_rate,time_base,duration_ts", "-of", "json", file]).stdout).streams;
  assert.equal(streams.length, 1, "One exported audio stream");
  const stream = streams[0];
  const rate = Number(stream.sample_rate);
  const ticks = Number(stream.duration_ts);
  const [num, den] = String(stream.time_base).split("/").map(Number);
  assert.equal(rate, 48000, "Exported audio sample rate");
  assert.ok(Number.isSafeInteger(ticks) && ticks > 0, "Declared audio duration in ticks");
  assert.ok(Number.isSafeInteger(num) && num > 0 && Number.isSafeInteger(den) && den > 0,
    "Valid audio time base");
  const samples = Math.round(ticks * num / den * rate);
  assert.ok(Number.isSafeInteger(samples) && samples > 0, "Declared audio sample count");
  run("ffmpeg", ["-v", "error", "-y", "-i", file, "-vn", "-af", `atrim=end_sample=${samples}`,
    "-f", "f32le", "-ar", "48000", "-ac", "2", output]);
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
export function psnrYuv(still, movie, frame, width, height, movieIsStill = false) {
  assert.ok(fs.existsSync(still), `Missing frame ${still}`);
  const dir = fs.mkdtempSync(path.join(scratchBase, "nt-export-yuv-"));
  try {
    const golden = path.join(dir, "golden.yuv");
    const decoded = path.join(dir, "decoded.yuv");
    run("ffmpeg", ["-v", "error", "-y", "-i", still, "-vf",
      `scale=${width}:${height}:out_color_matrix=bt709:out_range=tv,format=yuv420p`, "-f", "rawvideo", golden]);
    const decodedFilter = movieIsStill
      ? `scale=${width}:${height}:out_color_matrix=bt709:out_range=tv,format=yuv420p`
      : `select=eq(n\\,${frame})`;
    run("ffmpeg", ["-v", "error", "-y", "-i", movie, "-vf", decodedFilter, "-frames:v", "1",
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
  const failed = rows.filter(row => !(row.psnr >= 40));
  assert.equal(failed.length, 0, failed.map(row =>
    `${row.fixture} frame ${row.frame}: PSNR ${row.psnr} < 40 dB`).join("\n"));
}
const knownUnsupported = {
  'video-rejections.json': 'D10a placeholders, preview stills also below 40 dB'
};
export function requireFixtureCoverage(expected, rows, unmet = []) {
  assert.ok(expected.length > 0, 'Expected no media fixtures');
  const compared = new Set(rows.map(row => row.fixture));
  const unsupported = new Set(unmet);
  for (const name of unsupported) {
    assert.ok(Object.hasOwn(knownUnsupported, name), `Unknown unsupported fixture ${name}`);
    assert.ok(expected.includes(name), `Unexpected unmet fixture ${name}`);
  }
  for (const name of expected) {
    assert.ok(compared.has(name) || unsupported.has(name), `Missing fixture ${name}`);
  }
}
export function duration(doc) {
  return doc.durationMs > 0 ? doc.durationMs
    : doc.clips.reduce((end, clip) => Math.max(end, clip.startMs + clip.durationMs), 0);
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
// `--shard k/n` keeps every n-th fixture from the k-th (1-based) of the sorted
// list, so ctest can run the shards side by side. Without it, every fixture.
export function shardOf(names, spec) {
  if (!spec) return names;
  const match = /^(\d+)\/(\d+)$/.exec(spec);
  assert.ok(match, `--shard needs k/n, got ${spec}`);
  const [k, n] = [Number(match[1]), Number(match[2])];
  assert.ok(n >= 1 && k >= 1 && k <= n, `--shard ${spec} is out of range`);
  return names.filter((_, index) => index % n === k - 1);
}
function golden() {
  const media = fs.readdirSync(path.join(root, 'fixtures')).sort().filter(name => {
    if (!name.endsWith('.json') || ['audio-mix.json', 'audio-proxy.json'].includes(name)) return false;
    const doc = JSON.parse(fs.readFileSync(path.join(root, 'fixtures', name)));
    return doc.clips.some(c => c.mediaPath && ['video', 'image'].includes(c.mediaType));
  });
  assert.ok(media.length > 0, 'Expected no media fixtures');
  const shard = args.includes("--shard") ? args[args.indexOf("--shard") + 1] : null;
  const expected = shardOf(media, shard);
  assert.ok(expected.length > 0, `Shard ${shard} holds no media fixture`);
  console.log(`export_golden: ${expected.length} of ${media.length} fixtures${shard ? ` (shard ${shard})` : ''}`);
  // Each 1080p or 4K export is tens of megabytes, so each fixture's files are
  // removed once it is compared.
  const out = fs.mkdtempSync(path.join(scratchBase, "nt-export-golden-"));
  let goldOut = out;
  const rows = [];
  let diagnostics;
  const unmet = [];
  try {
    const goldenBase = goldenOutputBase(bin);
    if (goldenBase !== scratchBase) {
      fs.mkdirSync(goldenBase, { recursive: true });
      goldOut = fs.mkdtempSync(path.join(goldenBase, "nt-export-golden-"));
    }
    for (const name of expected) {
      const fixture = path.join(root, "fixtures", name);
      const doc = JSON.parse(fs.readFileSync(fixture));
      const frames = checkedFrames(doc);
      if (name === "video-rejections.json") {
        // DESIGN.md D10a step 1: the compositor draws a placeholder for
        // rotated, non-square, alpha and HDR media, so the preview itself
        // differs from the golden. Skip only while the preview stills fail
        // too; once D10a step 2 lands this assertion fails and the skip goes.
        const preview = spawnSync("node", [path.join(root, "scripts/compare-golden.mjs"), fixture,
          "--frames", frames.join(","), "--min-psnr", "40", "--bin", bin], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
        assert.equal(preview.status, 1, `${name}: the preview now matches the golden; remove the D10a skip\n${preview.stdout}${preview.stderr}`);
        unmet.push(name);
        console.log(`UNMET ${name}: ${knownUnsupported[name]}: ${preview.stdout.trim().split("\n").join("; ")}`);
        continue;
      }
      const movie = path.join(out, `${name}.mp4`);
      const exported = run(bin, [fixture, "--export", movie, "--format", "mp4", "--json"]);
      const exportResult = JSON.parse(exported.stdout);
      console.log(JSON.stringify({ fixture: name, export: exportResult }));
      // Keep backend and encoder diagnostics that successful child runs used to discard.
      process.stdout.write(exported.stderr.split("\n")
        .filter(line => !line.startsWith("export-progress ")).join("\n"));
      const gold = path.join(goldOut, `${name}-gold`);
      const goldenResult = spawnSync("node", [path.join(root, "scripts/golden-import.mjs"), fixture,
        "--frames", frames.join(","), "--out", gold], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      assert.equal(goldenResult.status, 0,
        `${name}: golden-import failed\n${goldenResult.stderr}${goldenResult.error ?? ''}`);
      const probe = JSON.parse(run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_streams",
        "-of", "json", movie]).stdout).streams[0];
      console.log(JSON.stringify({ fixture: name, stream: probe }));
      const failedFrames = [];
      for (const frame of frames) {
        const index = frame + (args.includes("--shift-frame") ? 1 : 0);
        const still = path.join(gold, "stills", `frame_${String(frame).padStart(6, "0")}.png`);
        const value = psnrYuv(still, movie, index, probe.width, probe.height);
        const row = { fixture: name, frame, psnr: value };
        console.log(JSON.stringify({ ...row, psnr: Number.isFinite(value) ? value : "inf" }));
        rows.push(row);
        if (!(value >= 40)) { failedFrames.push(frame); }
      }
      if (failedFrames.length > 0) {
        // Retain only failures, outside the temporary folders cleaned below.
        const artifactBase = path.join(scratchBase, "export-golden-failures");
        fs.mkdirSync(artifactBase, { recursive: true });
        diagnostics ??= fs.mkdtempSync(path.join(artifactBase, "run-"));
        const fixtureOut = path.join(diagnostics, path.basename(name, ".json"));
        const retainedGolden = path.join(fixtureOut, "golden");
        fs.mkdirSync(retainedGolden, { recursive: true });
        for (const frame of failedFrames) {
          const file = `frame_${String(frame).padStart(6, "0")}.png`;
          fs.copyFileSync(path.join(gold, "stills", file), path.join(retainedGolden, file));
        }
        fs.writeFileSync(path.join(fixtureOut, "failures.json"), JSON.stringify({
          platform: process.platform,
          frames: rows.filter(row => row.fixture === name && failedFrames.includes(row.frame)),
          sources: doc.clips.filter(clip => clip.mediaPath).map(clip => ({
            path: clip.mediaPath,
            sha256: createHash("sha256").update(fs.readFileSync(path.resolve(path.dirname(fixture), clip.mediaPath))).digest("hex")
          }))
        }, null, 2));
        fs.writeFileSync(path.join(fixtureOut, "golden.log"), goldenResult.stdout + goldenResult.stderr);
        console.log(`export_golden diagnostics: ${fixtureOut}`);
        const native = path.join(fixtureOut, "native");
        // The same compositor without H.264: separate rendering disagreement
        // from export conversion/encoding loss, in the same 4:2:0 metric.
        const capture = spawnSync(bin, [fixture, "--stills", native, "--still-frames",
          failedFrames.join(","), "--decode", "sw"], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
        fs.writeFileSync(path.join(fixtureOut, "native.log"), capture.stdout + capture.stderr);
        if (capture.status !== 0) {
          console.log(JSON.stringify({ fixture: name, diagnosticError: capture.stderr,
            error: capture.error?.message, status: capture.status }));
        } else {
          try {
            for (const frame of failedFrames) {
              const file = `frame_${String(frame).padStart(6, "0")}.png`;
              const still = path.join(native, file);
              const previewGolden = psnrYuv(path.join(gold, "stills", file), still, 0, probe.width, probe.height, true);
              const exportPreview = psnrYuv(still, movie, frame, probe.width, probe.height);
              const printable = value => Number.isFinite(value) ? value : "inf";
              console.log(JSON.stringify({ fixture: name, frame,
                nativeVsGoldenYuv: printable(previewGolden), exportVsNativeYuv: printable(exportPreview) }));
            }
          } catch (error) {
            console.log(JSON.stringify({ fixture: name, diagnosticError: error.message }));
          }
        }

      }
      fs.rmSync(movie, { force: true });
      fs.rmSync(gold, { recursive: true, force: true });
    }
    requireFixtureCoverage(expected, rows, unmet);
    requireFrames(rows);
    console.log(`export_golden: PASS (${rows.length} frames; unmet fixtures: ${unmet.join(', ') || 'none'})`);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
    if (goldOut !== out) {
      fs.rmSync(goldOut, { recursive: true, force: true });
    }
  }
}
// A short moving section of the numbered scrub fixture exercises exact source times.
// This mode is deliberately separate from the default golden coverage run.
export function checkRange() {
  const started = performance.now();
  const dir = fs.mkdtempSync(path.join(scratchBase, "nt-export-range-"));
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(root, "fixtures/video-scrub-gop.json")));
    doc.durationMs = 1000;
    doc.width = 320;
    doc.height = 180;
    doc.clips[0].mediaPath = path.join(root, "fixtures", doc.clips[0].mediaPath);
    const fixture = path.join(dir, "motion.json");
    fs.writeFileSync(fixture, JSON.stringify(doc));
    const full = path.join(dir, "full.mp4");
    const range = path.join(dir, "range.mp4");
    exportFile(fixture, full);
    exportFile(fixture, range, "mp4", ["--start-ms", "200", "--end-ms", "800"]);
    const decode = (movie, frame, output) => {
      run("ffmpeg", ["-v", "error", "-y", "-i", movie, "-vf", `select=eq(n\\,${frame})`,
        "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "yuv420p", output]);
      assert.equal(fs.statSync(output).size, 320 * 180 * 3 / 2, `Missing frame ${frame}`);
    };
    const rows = [];
    for (const k of [0, 5, 10, 17]) {
      const a = path.join(dir, "full.yuv");
      const b = path.join(dir, "range.yuv");
      decode(full, 6 + k + (args.includes("--shift-frame") ? 1 : 0), a);
      decode(range, k, b);
      const raw = ["-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", "320x180"];
      const compared = run("ffmpeg", ["-v", "info", ...raw, "-i", a, ...raw, "-i", b,
        "-lavfi", "psnr", "-f", "null", "-"]);
      const match = /average:(inf|[\d.]+)/.exec(compared.stderr);
      assert.ok(match, "No ranged PSNR measurement");
      const value = match[1] === "inf" ? Infinity : Number(match[1]);
      console.log(`range frame ${k}: ${value} dB`);
      rows.push({ fixture: "video-scrub-gop range", frame: k, psnr: value });
    }
    requireFrames(rows);
    console.log(`export_range: PASS (${((performance.now() - started) / 1000).toFixed(2)} s)`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (args.includes("--range")) checkRange();
  else golden();
}
