import assert from "node:assert/strict";
import console from "node:console";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import sharp from "sharp";
import { compileRealtimeGraph } from "@nodetool-ai/realtime-compiler";
import { fixture } from "./fixtures/RenderGraph.ts";

assert.equal(process.argv.length, 3, "Pass a GPU-enabled native realtime executable");
const executable = resolve(process.argv[2]);
const root = mkdtempSync(join(tmpdir(), "realtime-compiler-"));
try {
  const compiled = compileRealtimeGraph(fixture());
  assert.equal(compiled.status, "ok", JSON.stringify(compiled));
  const file = join(root, "plan.json"), output = join(root, "frames");
  writeFileSync(file, JSON.stringify(compiled.plan));
  const run = (path, destination) => spawnSync(executable, ["live", path, "--duration", "0.05", "--fps", "60", "--out", destination, "--null-audio"], { encoding: "utf8", timeout: 60000 });
  const result = run(file, output);
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
  for (let frame = 0; frame < 3; frame++) {
    const { data, info } = await sharp(readFileSync(join(output, `frame-${String(frame).padStart(6, "0")}.png`))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height, info.channels], [4, 4, 4]);
    const quanta = Math.floor(frame * 48000 / (60 * 128));
    const red = 255 - Math.round(255 * 0.75 * (1 - Math.exp(-quanta * 128 / (48000 * 0.2))));
    for (let byte = 0; byte < 64; byte++) {
      assert.ok(Math.abs(data[byte] - (byte % 4 === 0 ? red : 255)) <= 1, "Compiled graph differs from native pixel reference");
    }
  }
  const invalid = join(root, "invalid.json"), invalidOutput = join(root, "invalid-output");
  writeFileSync(invalid, JSON.stringify({ ...compiled.plan, control: { ...compiled.plan.control, registers: 0 } }));
  const rejected = run(invalid, invalidOutput);
  assert.ifError(rejected.error); assert.equal(rejected.status, 1); assert.match(rejected.stderr, /register/);
  assert.equal(existsSync(invalidOutput), false);
  console.log("Compiler snapshot loads and renders through native CLI; invalid IR is rejected before output.");
} finally { rmSync(root, { recursive: true, force: true }); }
