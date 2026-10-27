import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parseArgs, comparisonPasses, allComparisonsPass, loadFixtures } from "./check-effects.mjs";

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
