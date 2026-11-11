import test from "node:test";
import assert from "node:assert/strict";
import { comparisonDocument, comparePairs, measure, pickFrames, main } from "./check-example-stills.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";

test("comparison copy removes only excluded clips and J fields", () => {
  const bundle = { name: "example", fps: 30, width: 640, height: 360, durationMs: 1000,
    document: { tracks: [{ id: "v", type: "video", effects: [{ type: "videoBlur" }] }, { id: "a", type: "audio", effects: [{ type: "gain" }] }],
      clips: [{ id: "text", mediaType: "text", effects: [], blendMode: "screen", matte: {}, mask: {}, textStyle: { text: "keep" }, animations: [{ preset: "followPath" }] },
        { id: "shape", mediaType: "shape", parentId: "group", transitionIn: { type: "push" } }, { id: "group", mediaType: "group", layout: { display: "flex" } },
        ...["video", "image", "audio", "model3d", "adjustment"].map((mediaType) => ({ id: mediaType, mediaType }))] } };
  const before = structuredClone(bundle);
  const { document, removed } = comparisonDocument(bundle, "example");
  assert.deepEqual(bundle, before);
  assert.equal(removed.length, 10);
  assert.deepEqual(document.clips, [
    { id: "text", mediaType: "text", textStyle: { text: "keep" }, animations: [{ preset: "followPath" }] },
    before.document.clips[1], before.document.clips[2]
  ]);
  assert.deepEqual(document.tracks, [{ id: "v", type: "video" }, before.document.tracks[1]]);
});

test("PSNR check rejects missing images", () => {
  assert.throws(() => measure("/missing/render2d-a.png", "/missing/render2d-b.png"), /ffmpeg failed/);
});

test("frame selection rejects a failing plan process", () => {
  assert.throws(() => pickFrames({ name: "plain", fps: 30, durationMs: 1000, width: 640, height: 360,
    tracks: [{ id: "v", type: "video", index: 0, visible: true }], clips: [{ id: "plain", trackId: "v", mediaType: "text",
      startMs: 0, durationMs: 1000, textStyle: { text: "plain", fontSizePx: 30 } }] }, "/missing/document.json", "/usr/bin/false"));
});

test("pair verdict requires every image, every threshold, and a nonempty selection", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "render2d-pairs-"));
  try {
    const a = path.join(dir,"a"), b = path.join(dir,"b");
    fs.mkdirSync(a); fs.mkdirSync(b);
    const canvas = createCanvas(16,16), painter = canvas.getContext("2d");
    painter.fillStyle = "black"; painter.fillRect(0,0,16,16);
    fs.writeFileSync(path.join(a,"frame_000001.png"),canvas.toBuffer("image/png"));
    fs.copyFileSync(path.join(a,"frame_000001.png"),path.join(b,"frame_000001.png"));
    assert.equal(comparePairs([1],a,b,35).pass,true);
    assert.equal(comparePairs([1,2],a,b,35).pass,false);
    assert.equal(comparePairs([],a,b,35).pass,false);
    painter.fillStyle = "white"; painter.fillRect(0,0,16,16);
    fs.writeFileSync(path.join(b,"frame_000001.png"),canvas.toBuffer("image/png"));
    assert.equal(comparePairs([1],a,b,35).pass,false);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

// Exercise the CLI orchestration without a GPU or server process.
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
function simulatedRun(t, checkNative) {
  t.mock.method(childProcess, "execFileSync", (bin, args, options) => {
    if (args.includes("--dump-plan")) {
      assert.equal(options.env.QT_QPA_PLATFORM, "offscreen");
      return JSON.stringify({ frames: args.at(-1).split(",").map(() => ({ layers: [{ kind: "text", clipId: "test" }] })) });
    }
    checkNative(options.env);
    const out = args[args.indexOf("--stills") + 1];
    fs.mkdirSync(out, { recursive: true });
    for (const frame of args.at(-1).split(",")) fs.writeFileSync(path.join(out, `frame_${frame.padStart(6, "0")}.png`), "stub");
    return "";
  });
  t.mock.method(childProcess, "spawnSync", (bin, args, options) => {
    if (bin === "ffmpeg") return { status: 0, stderr: "PSNR average:20.00" };
    const out = args[args.indexOf("--out") + 1];
    fs.mkdirSync(out, { recursive: true });
    for (const frame of args[args.indexOf("--frames") + 1].split(",")) fs.writeFileSync(path.join(out, `frame_${frame.padStart(6, "0")}.png`), "stub");
    fs.writeSync(options.stdio[1], JSON.stringify({ skippedClips: [], fontsUnavailable: [] }));
    return { status: 0 };
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  t.mock.method(console, "error", () => {});
  t.mock.method(console, "log", () => {});
  return main(["--examples", "cadence,kite"]);
}

test("native stills inherit the caller platform and RHI, while plans stay offscreen", (t) => {
  const before = { platform: process.env.QT_QPA_PLATFORM, rhi: process.env.QSG_RHI_BACKEND };
  process.env.QT_QPA_PLATFORM = "xcb";
  process.env.QSG_RHI_BACKEND = "vulkan";
  t.after(() => {
    for (const [key, value] of [["QT_QPA_PLATFORM", before.platform], ["QSG_RHI_BACKEND", before.rhi]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const environments = [];
  simulatedRun(t, (env) => { environments.push(env); });
  assert.ok(environments.length > 0);
  for (const env of environments) {
    assert.equal(env.QT_QPA_PLATFORM, "xcb");
    assert.equal(env.QSG_RHI_BACKEND, "vulkan");
  }
});

test("a failed PSNR still measures every selected example and exits 1", (t) => {
  let rendered = 0;
  const status = simulatedRun(t, () => { rendered++; });
  assert.equal(rendered, 2);
  assert.equal(status, 1);
});


test("a renderer error is reported and remaining examples still run", (t) => {
  let rendered = 0;
  const status = simulatedRun(t, () => {
    if (++rendered === 1) throw new Error("simulated native failure");
  });
  assert.equal(rendered, 2);
  assert.equal(status, 1);
});

test("comparison removes matte-only sources before removing their consumers and matte fields", () => {
  const bundle = { document: { tracks: [], clips: [
    { id: "source", mediaType: "shape", shapeStyle: { kind: "rect", fillStyle: { type: "linear" } } },
    { id: "hidden-source", mediaType: "shape", hidden: true },
    { id: "image", mediaType: "image", matte: { sourceClipId: "source", mode: "luma" } },
    { id: "text", mediaType: "text", matte: { sourceClipId: "hidden-source", mode: "alpha" } },
    { id: "ordinary-gradient", mediaType: "shape", hidden: false },
    { id: "invalid-matte", mediaType: "text", matte: { sourceClipId: "ordinary-gradient", mode: "unknown" } }
  ] } };
  const { document, removed } = comparisonDocument(bundle, "mattes");
  assert.deepEqual(document.clips.map((c) => c.id), ["text", "ordinary-gradient", "invalid-matte"]);
  for (const id of ["source", "hidden-source"]) assert.ok(removed.some((entry) => entry.startsWith(`${id}:`) && entry.includes("matte source")));
  assert.ok(bundle.document.clips[3].matte);
});

import * as stills from './check-example-stills.mjs';
function eligibilityDocument() {
  const clip = (id, mediaType, startMs, extra = {}) => ({ id, mediaType, trackId: 'v', startMs, durationMs: 100,
    ...(mediaType === 'text' ? { textStyle: { text: 'plain', fontSizePx: 40 } } : { shapeStyle: { kind: 'rect', fill: '#ffffff' } }), ...extra });
  return { name: 'eligibility', width: 640, height: 360, fps: 30, durationMs: 700,
    tracks: [{ id: 'v', type: 'video', index: 0, visible: true }], clips: [
      clip('masked', 'shape', 0, { animations: [{ id: 'reveal', role: 'in', preset: 'wipe', durationMs: 100 }] }),
      clip('cut', 'group', 100, { transitionIn: { type: 'gradientWipe', durationMs: 100 } }),
      clip('child', 'shape', 100, { parentId: 'cut' }),
      clip('blur', 'text', 200, { animations: [{ id: 'blur-in', role: 'in', preset: 'custom', durationMs: 100,
        custom: { curves: [{ property: 'blur', keyframes: [{ t: 0, value: 10 }, { t: 1, value: 0 }] }] } }] }),
      clip('excluded', 'text', 300), clip('plain', 'text', 400),
      clip('ancestor', 'group', 500), clip('nested', 'text', 500, { parentId: 'ancestor' }),
      clip('repeated', 'shape', 600, { repeater: { count: 2, positionStep: { x: 10, y: 0 }, scaleStep: 1, rotationStep: 0, opacityStep: 1 } })
    ] };
}
test('oracle rejects masks, group cut effects, generated blur and excluded IDs, and accepts plain text', () => {
  const doc = eligibilityDocument();
  const exclusions = { excluded: ['animationLinks'], ancestor: ['animationLinks'], repeated: ['animationLinks'] };
  for (const [time, expected] of [[50, 'mask'], [150, 'transition-effect'], [250, 'effect:anim-blur'],
    [350, 'plan-exclusion:animationLinks'], [450, null], [550, 'plan-exclusion:animationLinks'], [650, 'plan-exclusion:animationLinks']]) {
    const reasons = stills.frameEligibility(doc, time, exclusions);
    if (expected) assert.ok(reasons.some((r) => r.reason === expected), `${time}: ${JSON.stringify(reasons)}`);
    else assert.deepEqual(reasons, []);
  }
});
test('selection reports rejected candidates and fails when fewer than six are eligible', () => {
  const doc = eligibilityDocument();
  const report = stills.eligibleCandidates(doc, [1, 4, 7, 10, 13], { excluded: ['animationLinks'] });
  assert.deepEqual(report.eligible, [13]);
  assert.equal(report.excluded.length, 4);
  assert.equal(report.reasons.mask.count, 1);
  assert.deepEqual(report.reasons.mask.frames, [1]);
  assert.throws(() => stills.spreadFrames(report.eligible, doc.name), /only 1 eligible/);
  assert.deepEqual(stills.spreadFrames(Array.from({ length: 12 }, (_, i) => i), doc.name), [1, 3, 5, 7, 9, 11]);
});

test('oracle rejects authored group effects, dip solids, clip masks and frames without I pixels', () => {
  const doc = eligibilityDocument();
  doc.clips = [
    { id: 'group', trackId: 'v', mediaType: 'group', startMs: 0, durationMs: 100,
      effects: [{ id: 'authored', type: 'blur', enabled: true, radius: 3 }] },
    { id: 'shape', trackId: 'v', mediaType: 'shape', startMs: 0, durationMs: 100, parentId: 'group',
      shapeStyle: { kind: 'rect', fill: '#fff' }, mask: { kind: 'ellipse', x: 0, y: 0, width: 1, height: 1 } },
    { id: 'dip', trackId: 'v', mediaType: 'group', startMs: 100, durationMs: 100,
      transitionIn: { type: 'dipToColor', durationMs: 100, color: '#aabbcc' } },
    { id: 'dip-child', trackId: 'v', mediaType: 'text', startMs: 100, durationMs: 100, parentId: 'dip',
      textStyle: { text: 'dip', fontSizePx: 30 } }
  ];
  const first = stills.frameEligibility(doc, 50).map((r) => r.reason);
  assert.ok(first.includes('effect:authored'));
  assert.ok(first.includes('mask'));
  assert.ok(stills.frameEligibility(doc, 125).some((r) => r.reason === 'transition-solid'));
  assert.deepEqual(stills.frameEligibility(doc, 650), [{ reason: 'no-I-layer', clipId: null }]);
});

test('an exclusion naming a repeated instance is checked as well as its base ID', () => {
  const reasons = stills.frameEligibility(eligibilityDocument(), 650, { 'repeated:repeat:1': ['animationLinks'] });
  assert.ok(reasons.some((r) => r.reason === 'plan-exclusion:animationLinks' && r.clipId === 'repeated:repeat:1'));
});
