import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parseArgs, comparisonPasses, allComparisonsPass, loadFixtures, visualFxFixtures } from "./check-effects.mjs";

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
