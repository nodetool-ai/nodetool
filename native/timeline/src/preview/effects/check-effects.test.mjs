import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parseArgs, comparisonPasses, allComparisonsPass, loadFixtures, visualFxFixtures,
  distinctComparisonPasses, compareDistinctFrames } from "./check-effects.mjs";

test("parses defaults and explicit fixture selection", () => {
  const defaults = parseArgs(["--bin", "build/nodetool-timeline"]);
  assert.equal(defaults.minPsnr, 40);
  assert.equal(defaults.json, false);
  assert.deepEqual(defaults.only, []);
  const args = parseArgs(["--bin", "/tmp/native", "--only", "blend-modes,blend-group", "--min-psnr", "42.5", "--json"]);
  assert.deepEqual(args, { bin: "/tmp/native", only: ["blend-modes", "blend-group"], minPsnr: 42.5, json: true });
});

test("rejects missing, unknown and invalid arguments", () => {
  for (const args of [[], ["--bin"], ["--wat"], ["--bin", "--json"],
    ["--bin", "x", "--only", ""], ["--bin", "x", "--only", "a,,b"],
    ["--bin", "x", "--min-psnr", "NaN"], ["--bin", "x", "--min-psnr", "-1"],
    ["--bin", "x", "--min-psnr", "Infinity"]]) {
    assert.throws(() => parseArgs(args), Error, JSON.stringify(args));
  }
});

test("compares unrounded PSNR, including equality and identical images", () => {
  assert.equal(comparisonPasses(40, 40), true);
  assert.equal(comparisonPasses(39.999, 40), false);
  assert.equal(comparisonPasses(Infinity, 40), true);
  for (const value of [null, undefined, NaN, -Infinity, "inf", 0]) {
    assert.equal(comparisonPasses(value, 40), false);
  }
});

test("requires at least one comparison and every comparison to pass", () => {
  assert.equal(allComparisonsPass([]), false);
  assert.equal(allComparisonsPass([{ pass: true }]), true);
  assert.equal(allComparisonsPass([{ pass: true }, { pass: false }]), false);
  assert.equal(allComparisonsPass([{ error: "missing still" }]), false);
});

test("rejects empty selection, unknown names and invalid frame metadata", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "effects-fixtures-"));
  try {
    assert.throws(() => loadFixtures(directory, []), /No fixtures/);
    assert.throws(() => loadFixtures(directory, ["missing"]), /Unknown fixture/);
    const fixture = path.join(directory, "sample.json");
    for (const goldenFrames of [undefined, [], [{ frame: -1, criterion: "J1" }],
      [{ frame: 0, criterion: "" }], [{ frame: 0, criterion: "J1" }, { frame: 0, criterion: "J1" }]]) {
      fs.writeFileSync(fixture, JSON.stringify({ goldenFrames }));
      assert.throws(() => loadFixtures(directory, []), /goldenFrames/);
    }
    fs.writeFileSync(fixture, JSON.stringify({ goldenFrames: [{ frame: 15, criterion: "J1" }] }));
    assert.deepEqual(loadFixtures(directory, ["sample"]), [{ name: "sample", fixture,
      frames: [{ frame: 15, criterion: "J1" }] }]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("step 2 covers every effect, crop, document order and group surfaces", () => {
  const directory = fileURLToPath(new URL("./fixtures/", import.meta.url));
  const fixtures = loadFixtures(directory, []);
  const types = ["color", "blur", "pixelate", "posterize", "directionalBlur", "lensDistortion", "lut", "glow", "dropShadow", "vignette", "sharpen", "chromaKey", "curves", "levels", "liftGammaGain", "grain"];
  for (const type of types) {
    const fixture = fixtures.find(item => item.name === `clip-${type}`);
    assert.ok(fixture, `missing fixture for ${type}`);
    assert.deepEqual(fixture.frames.map(item => item.frame), [0, 30]);
    const doc = JSON.parse(fs.readFileSync(fixture.fixture, "utf8"));
    const effects = doc.clips.flatMap(clip => clip.effects ?? []).filter(effect => effect.type === type);
    assert.equal(effects.length, 2, `${type} needs two settings`);
    assert.notDeepEqual(effects[0], effects[1]);
    if (type === "grain") assert.ok(effects.every(effect => effect.animate === false));
  }
  for (const name of ["clip-crop-chain", "clip-ordered-chain", "effects-group", "effects-nested-group"]) {
    assert.ok(fixtures.some(item => item.name === name), name);
  }
});

test("validates optional distinct frame pairs against the golden frames", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "effects-distinct-"));
  try {
    const fixture = path.join(directory, "sample.json");
    const goldenFrames = [0, 1].map(frame => ({ frame, criterion: "J5" }));
    for (const distinctFrames of [null, {}, [null], [0], [[0]], [[0, 1, 2]], [[0, 0]],
      [[0, 2]], [[-1, 1]], [[0.5, 1]], [["0", 1]], [[0, 1], [1, 0]], [[0, 1], [0, 1]]]) {
      fs.writeFileSync(fixture, JSON.stringify({ goldenFrames, distinctFrames }));
      assert.throws(() => loadFixtures(directory, []), /distinctFrames/, JSON.stringify(distinctFrames));
    }
    for (const distinctFrames of [[], [[0, 1]], [[1, 0]]]) {
      fs.writeFileSync(fixture, JSON.stringify({ goldenFrames, distinctFrames }));
      assert.deepEqual(loadFixtures(directory, ["sample"])[0].distinctFrames, distinctFrames);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("native frame distinctness fails on identical, near-identical or missing stills", () => {
  assert.equal(distinctComparisonPasses(40), true);
  assert.equal(distinctComparisonPasses(39.999), true);
  for (const psnr of [40.001, Infinity, NaN, -Infinity, -1, null, undefined, "inf"]) {
    assert.equal(distinctComparisonPasses(psnr), false, String(psnr));
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "effects-native-pair-"));
  try {
    for (const frame of [0, 1]) {
      fs.copyFileSync(new URL("./fixtures/posterize-midpoint.png", import.meta.url),
        path.join(directory, `frame_${String(frame).padStart(6, "0")}.png`));
    }
    const rows = compareDistinctFrames(directory, [[0, 1], [0, 2]]);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0].distinctFrames, [0, 1]);
    assert.equal(rows[0].psnr, "inf");
    assert.equal(rows[0].pass, false);
    assert.equal(rows[1].pass, false);
    assert.match(rows[1].error, /Missing native still/);
    assert.equal(allComparisonsPass([{ pass: true }, ...rows]), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("animated grain fixtures cover clip and group seeds with distinct native frames", () => {
  const directory = fileURLToPath(new URL("./fixtures/", import.meta.url));
  for (const name of ["clip-grain-animated", "group-grain-animated"]) {
    const fixture = loadFixtures(directory, [name])[0];
    assert.deepEqual(fixture.frames.map(item => item.frame), [17, 18]);
    assert.deepEqual(fixture.distinctFrames, [[17, 18]]);
    assert.ok(fixture.frames.every(item => item.criterion.includes("PSNR >= 40 dB")));
    const doc = JSON.parse(fs.readFileSync(fixture.fixture, "utf8"));
    assert.equal(doc.fps, 24);
    const picture = doc.clips.find(clip => clip.mediaType === "image");
    assert.equal(picture.width, doc.width);
    assert.equal(picture.height, doc.height);
    assert.ok(fs.existsSync(path.resolve(directory, picture.mediaPath)));
    const treated = name === "clip-grain-animated" ? picture : doc.clips.find(clip => clip.id === picture.parentId);
    const grain = treated.effects.find(effect => effect.type === "grain");
    assert.equal(grain.animate, true);
    assert.equal(grain.enabled, true);
    assert.equal(grain.amount, 1);
    assert.ok(fixture.frames.every(({ frame }) => frame !== grain.seed &&
      frame * 1000 / doc.fps >= picture.startMs && frame * 1000 / doc.fps < picture.startMs + picture.durationMs));
  }
});

test("step 3 covers each shader mode and animated sequence time", () => {
  const fixtures = loadFixtures(fileURLToPath(new URL("./fixtures/", import.meta.url)), []);
  assert.equal(visualFxFixtures.filter(([type]) => type === "stylize").length, 15);
  assert.equal(visualFxFixtures.filter(([type]) => type === "generator").length, 8);
  for (const [type, mode, frames] of visualFxFixtures) {
    const name = `${type}-modes`;
    const fixture = fixtures.find(item => item.name === name);
    assert.ok(fixture, name);
    assert.deepEqual(fixture.frames.filter(item => item.criterion.includes(` ${mode},`)).map(item => item.frame), frames, mode);
    const doc = JSON.parse(fs.readFileSync(fixture.fixture, "utf8"));
    const clip = doc.clips.find(clip => clip.effects.some(effect => effect.type === type && effect.mode === mode));
    assert.ok(clip, mode);
    assert.equal(clip.width, doc.width);
    assert.equal(clip.height, doc.height);
    assert.ok(frames.every(frame => frame * 1000 / doc.fps >= clip.startMs && frame * 1000 / doc.fps < clip.startMs + clip.durationMs));
    const effect = clip.effects.find(effect => effect.type === type);
    assert.equal(effect.type, type);
    assert.equal(effect.mode, mode);
    assert.equal(effect.enabled, true);
    if (mode === "fractal") {
      assert.equal(effect.animate, true);
      assert.equal(frames.length, 2);
      assert.notEqual(effect.time, frames[0] / doc.fps);
    }
  }
});

test("new PNG fixtures declare supported RGB ingress", () => {
  for (const name of ["visual-source.png", "posterize-midpoint.png"]) {
    const bytes = fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes[24], 8, name);
    assert.equal(bytes[25], 2, `${name} must not declare an alpha channel`);
  }
});

test("matte imports resolve separately and bind without mutating the fixture", async () => {
  const { matteImports, bindMatteAssets } = await import("./import-matte.mjs");
  const doc = { clips: [{ id: "a", mediaPath: "picture.mp4", generatedMatte: { mediaPath: "mask.mp4", assetId: "old", invert: true } }, { id: "b" }] };
  assert.deepEqual(matteImports(doc, "/tmp/j4"), [{ clipId: "a", file: "/tmp/j4/mask.mp4" }]);
  assert.throws(() => bindMatteAssets(doc, []), /Missing matte asset/);
  const bound = bindMatteAssets(doc, [{ clipId: "a", assetId: "new" }]);
  assert.deepEqual(bound.clips[0].generatedMatte, { assetId: "new", invert: true });
  assert.equal(doc.clips[0].generatedMatte.assetId, "old");
  assert.equal(bound.clips[0].mediaPath, "picture.mp4");
  assert.deepEqual(matteImports({ clips: [{ id: "a", generatedMatte: { assetId: "real" } }] }, "/tmp"), []);
});

test("prepares generated matte fixtures with absolute picture paths and a pending matte", async () => {
  const { prepareMatteFixture } = await import("./import-matte.mjs");
  const doc = { clips: [{ id: "a", mediaPath: "picture.mp4", generatedMatte: { mediaPath: "mask.mp4", assetId: "old", status: "ready" } }] };
  const prepared = prepareMatteFixture(doc, "/tmp/j4");
  assert.equal(prepared.clips[0].mediaPath, "/tmp/j4/picture.mp4");
  assert.equal(prepared.clips[0].generatedMatte.status, "generating");
  assert.equal(doc.clips[0].generatedMatte.status, "ready");
});

test("step 4 covers shape kinds, order, moving matte times and generated options", () => {
  const fixtures = loadFixtures(fileURLToPath(new URL("./fixtures/", import.meta.url)), []);
  const names = ["mask-rect", "mask-ellipse", "mask-rounded", "mask-path", "mask-feather", "mask-ellipse-feather",
    "mask-invert", "mask-path-feather", "mask-rounded-feather", "mask-path-invert", "mask-rounded-invert", "mask-effects", "matte-alpha", "matte-alpha-invert",
    "matte-luma", "matte-luma-invert", "matte-moving", "generated-matte", "generated-matte-strength", "generated-matte-effects"];
  for (const name of names) {
    const fixture = fixtures.find(item => item.name === name);
    assert.ok(fixture, name);
    const moving = name === "matte-moving" || name.startsWith("generated-matte");
    assert.deepEqual(fixture.frames.map(item => item.frame), moving ? [0, 21] : [0]);
    assert.ok(fixture.frames.every(item => item.criterion.startsWith("J4 ")));
    const doc = JSON.parse(fs.readFileSync(fixture.fixture, "utf8"));
    const picture = doc.clips.find(clip => clip.id === "picture");
    assert.equal(picture.width, doc.width);
    assert.equal(picture.height, doc.height);
    if (name.startsWith("generated-matte")) {
      assert.equal(picture.generatedMatte.status, "ready");
      assert.ok(fs.existsSync(path.resolve(path.dirname(fixture.fixture), picture.generatedMatte.mediaPath)));
    }
  }
});


test("posterize midpoint requires identical pixels, not merely 40 dB", () => {
  assert.equal(comparisonPasses(52.9,40,true),false);
  assert.equal(comparisonPasses(Infinity,40,true),true);
  const fixture=loadFixtures(fileURLToPath(new URL("./fixtures/",import.meta.url)),["clip-posterize-midpoint"])[0];
  assert.equal(fixture.frames[0].identical,true);
});

test("track video fixtures cover conversion, aggregation and group scope", () => {
  const fixtures = loadFixtures(fileURLToPath(new URL("./fixtures/", import.meta.url)), []);
  for (const type of ["colorCorrection", "videoBlur", "sharpen", "vignette", "chromaKey", "clip-aggregate", "group"]) {
    const fixture = fixtures.find(item => item.name === `track-${type}`);
    assert.ok(fixture, type);
    assert.deepEqual(fixture.frames.map(item => item.frame), [0]);
    assert.ok(fixture.frames[0].criterion.includes("PSNR >= 40 dB"));
    const doc = JSON.parse(fs.readFileSync(fixture.fixture, "utf8"));
    const picture = doc.clips.find(clip => clip.id === "picture");
    assert.equal(picture.width, doc.width);
    assert.equal(picture.height, doc.height);
    const track = doc.tracks.find(track => track.id === picture.trackId);
    if (type === "clip-aggregate") {
      assert.deepEqual(track.effects.map(effect => effect.type), ["colorCorrection", "videoBlur"]);
      assert.deepEqual(picture.effects.map(effect => effect.type), ["color", "blur", "posterize"]);
    } else if (type === "group") {
      assert.equal(picture.parentId, "group");
    } else {
      assert.equal(track.effects.filter(effect => effect.type === type && effect.enabled).length, 1);
      assert.equal(track.effects.filter(effect => effect.type === type && !effect.enabled).length, 1);
    }
    if (type === "chromaKey") {
      assert.ok(picture.mediaPath.endsWith("rgb-solid-720p.mp4"));
      assert.equal(track.effects[0].keyColor, "#c02040");
    }
  }
});


test("adjustment fixtures cover masked accumulation and group isolation", () => {
  const directory = fileURLToPath(new URL("./fixtures/", import.meta.url));
  for (const name of ["adjustment-two-layers", "adjustment-group"]) {
    const fixture = loadFixtures(directory, [name])[0];
    assert.deepEqual(fixture.frames.map(item => item.frame), [6, 18]);
    assert.ok(fixture.frames.every(item => item.criterion.includes("PSNR >= 40 dB")));
    const doc = JSON.parse(fs.readFileSync(fixture.fixture, "utf8"));
    const adjustment = doc.clips.find(clip => clip.mediaType === "adjustment");
    assert.deepEqual(adjustment.effects.map(effect => effect.type), ["color", "blur"]);
    assert.ok(adjustment.effects.every(effect => effect.enabled));
    assert.ok(adjustment.opacity > 0 && adjustment.opacity < 1);
    assert.ok(adjustment.mask.width < 1);
    const pictures = doc.clips.filter(clip => clip.mediaType === "image");
    assert.equal(pictures.length, 2);
    assert.ok(pictures.every(clip => doc.tracks.find(t => t.id === clip.trackId).index >
      doc.tracks.find(t => t.id === adjustment.trackId).index));
    if (name === "adjustment-group") {
      assert.ok(adjustment.parentId);
      assert.equal(pictures.filter(clip => clip.parentId === adjustment.parentId).length, 1);
      assert.equal(pictures.filter(clip => !clip.parentId).length, 1);
    }
  }
});

test("clip effect animation fixture samples grade and mask at distinct times", () => {
  const fixture = loadFixtures(fileURLToPath(new URL("./fixtures/", import.meta.url)), ["clip-effect-animated"])[0];
  assert.deepEqual(fixture.frames.map(item => item.frame), [6, 24]);
  assert.deepEqual(fixture.distinctFrames, [[6, 24]]);
  const doc = JSON.parse(fs.readFileSync(fixture.fixture, "utf8"));
  assert.deepEqual(doc.clips[0].animations[0].styleTracks.map(track => track.target),
    ["effect.grade.brightness", "mask.x"]);
});

test("generated matte treatment fixture separates clip treatments from track effects", () => {
  const fixture = loadFixtures(fileURLToPath(new URL("./fixtures/", import.meta.url)), ["generated-matte-effects"])[0];
  assert.deepEqual(fixture.frames.map(item => item.frame), [0, 21]);
  const doc = JSON.parse(fs.readFileSync(fixture.fixture, "utf8"));
  const picture = doc.clips.find(clip => clip.id === "picture");
  const track = doc.tracks.find(track => track.id === picture.trackId);
  assert.ok(picture.effects.some(effect => effect.type === "color" && effect.enabled && effect.brightness === 0.8));
  assert.ok(picture.mask.featherPx > 0);
  assert.equal(picture.generatedMatte.invert, true);
  assert.equal(picture.opacity, 0.8);
  assert.ok(track.effects.some(effect => effect.type === "colorCorrection" && effect.enabled && effect.brightness === -0.4));
  assert.ok(fixture.frames.every(item => item.criterion.includes("keeps clip brightness") &&
    item.criterion.includes("excludes track brightness")));
});
