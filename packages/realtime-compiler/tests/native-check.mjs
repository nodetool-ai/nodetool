import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import console from "node:console";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import sharp from "sharp";
import { compileRealtimeGraph } from "@nodetool-ai/realtime-compiler";
import { fixture, expressionFixture, alphaFixture } from "./fixtures/RenderGraph.ts";
import { checkAudio } from "./native-audio-check.mjs";
import { checkAudioControls } from "./native-control-check.mjs";
import { checkPcmBoundaries } from "./native-pcm-check.mjs";

assert.equal(process.argv.length, 3, "Pass a GPU-enabled native realtime executable");
const executable = resolve(process.argv[2]);
const root = mkdtempSync(join(tmpdir(), "realtime-compiler-"));
try {
  for (const [name, graph, scale] of [["direct", fixture(), 1], ["expression", expressionFixture(), 0.5]]) {
    const compiled = compileRealtimeGraph(graph);
    assert.equal(compiled.status, "ok", JSON.stringify(compiled));
    const file = join(root, `${name}.json`), output = join(root, name);
    writeFileSync(file, JSON.stringify(compiled.plan));
    const run = (path, destination) => spawnSync(executable, ["live", path, "--duration", "0.05", "--fps", "60", "--out", destination, "--null-audio"], { encoding: "utf8", timeout: 60000 });
    const result = run(file, output);
    assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
    for (let frame = 0; frame < 3; frame++) {
      const { data, info } = await sharp(readFileSync(join(output, `frame-${String(frame).padStart(6, "0")}.png`))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.deepEqual([info.width, info.height, info.channels], [4, 4, 4]);
      const quanta = Math.floor(frame * 48000 / (60 * 128));
      const red = 255 - Math.round(255 * scale * 0.75 * (1 - Math.exp(-quanta * 128 / (48000 * 0.2))));
      for (let byte = 0; byte < 64; byte++) {
        assert.ok(Math.abs(data[byte] - (byte % 4 === 0 ? red : 255)) <= 1, "Compiled graph differs from native pixel reference");
      }
    }
    const invalid = join(root, `${name}-invalid.json`), invalidOutput = join(root, `${name}-invalid-output`);
    writeFileSync(invalid, JSON.stringify({ ...compiled.plan, control: { ...compiled.plan.control, registers: 0 } }));
    const rejected = run(invalid, invalidOutput);
    assert.ifError(rejected.error); assert.equal(rejected.status, 1); assert.match(rejected.stderr, /register/);
    assert.equal(existsSync(invalidOutput), false);
  }
  const alpha = compileRealtimeGraph(alphaFixture());
  assert.equal(alpha.status, "ok", JSON.stringify(alpha));
  const raw = join(root, "straight.rgba"), alphaFile = join(root, "alpha.json"), alphaOutput = join(root, "alpha");
  const pixels = Buffer.alloc(64);
  for (let pixel = 0; pixel < 16; pixel++) {
    pixels.set(pixel % 2 === 0 ? [204, 102, 51, 128] : [255, 127, 63, 0], pixel * 4);
  }
  writeFileSync(raw, pixels); writeFileSync(alphaFile, JSON.stringify(alpha.plan));
  const alphaRun = (file, output) => spawnSync(executable, ["live", file, "--duration", "0.01", "--fps", "60", "--out", output,
    "--slot", `${alpha.plan.slots[0].id}=${raw}`, "--null-audio"], { encoding: "utf8", timeout: 60000 });
  const converted = alphaRun(alphaFile, alphaOutput);
  assert.ifError(converted.error); assert.equal(converted.status, 0, converted.stderr);
  const { data, info } = await sharp(join(alphaOutput, "frame-000000.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height, info.channels], [4, 4, 4]);
  for (let byte = 0; byte < 64; byte++) {
    const start = byte - byte % 4, coverage = pixels[start + 3];
    const expected = byte % 4 === 3 ? coverage : coverage === 0 ? 0 :
      Math.round((coverage - Math.round(pixels[byte] * coverage / 255)) * 255 / coverage);
    assert.ok(Math.abs(data[byte] - expected) <= 2, "Converted alpha differs from independent quantized pixel reference");
  }
  const bypass = join(root, "alpha-bypass.json"), bypassOutput = join(root, "alpha-bypass");
  writeFileSync(bypass, JSON.stringify({ ...alpha.plan, render: { ...alpha.plan.render, passes: alpha.plan.render.passes.slice(1).map((pass) =>
    ({ ...pass, inputs: { ...pass.inputs, source: alpha.plan.slots[0].id } })) } }));
  const bypassed = alphaRun(bypass, bypassOutput);
  assert.ifError(bypassed.error); assert.equal(bypassed.status, 1); assert.match(bypassed.stderr, /^invert\/alpha:/m);
  assert.equal(existsSync(bypassOutput), false);
  checkAudio(executable, root);
  checkAudioControls(executable, root);
  checkPcmBoundaries(executable, root);
  console.log("Compiled render/audio/control/PCM fixtures match native references; invalid bindings, slots and buffer reuse reject before output.");
} finally { rmSync(root, { recursive: true, force: true }); }
