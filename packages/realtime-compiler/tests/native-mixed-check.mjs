import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { compileRealtimeGraph } from "@nodetool-ai/realtime-compiler";
import { mixedFixture } from "./fixtures/MixedGraph.ts";

// RT-F47: a mixed plan must produce the same samples as its audio region alone and the
// same pixels as its render region alone, with the shared analytic control in both domains.
export function checkMixedPlans(executable, root) {
  const run = (file, output) => spawnSync(executable, ["live", file, "--duration", "0.05", "--fps", "60", "--out", output, "--null-audio"],
    { encoding: "utf8", timeout: 60000 });
  const export_ = (name, plan) => {
    const file = join(root, `${name}.json`), output = join(root, name);
    writeFileSync(file, JSON.stringify(plan));
    const result = run(file, output);
    assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
    return output;
  };
  const stored = run(fileURLToPath(new URL("./fixtures/mixed-plan.json", import.meta.url)), join(root, "mixed-snapshot"));
  assert.ifError(stored.error); assert.equal(stored.status, 0, stored.stderr);
  for (const level of ["constant", "time"]) {
    const input = mixedFixture(level);
    const compile = (outputs) => {
      const result = compileRealtimeGraph({ ...input, outputs });
      assert.equal(result.status, "ok", JSON.stringify(result)); return result.plan;
    };
    const mixed = compile(["out", "audio-out"]);
    const mixedOutput = export_(`mixed-${level}`, mixed);
    const audioOutput = export_(`mixed-${level}-audio`, compile(["audio-out"]));
    const renderOutput = export_(`mixed-${level}-render`, compile(["out"]));
    const pcm = readFileSync(join(mixedOutput, "audio.wav"));
    assert.deepEqual(pcm, readFileSync(join(audioOutput, "audio.wav")), "Mixed audio differs from the audio-only plan");
    let signal = false;
    for (let offset = 58; offset < pcm.length; offset += 4) { signal ||= pcm.readFloatLE(offset) !== 0; }
    assert.ok(signal, "Mixed audio unexpectedly silent");
    const frames = readdirSync(mixedOutput).filter((name) => name.endsWith(".png")).sort();
    assert.equal(frames.length, 3);
    assert.deepEqual(readdirSync(renderOutput).filter((name) => name.endsWith(".png")).sort(), frames);
    for (const frame of frames) {
      assert.deepEqual(readFileSync(join(mixedOutput, frame)), readFileSync(join(renderOutput, frame)), "Mixed pixels differ from the render-only plan");
    }
    // Moving the audio copy of the shared control to the render domain leaves the gain without a producer.
    const invalid = { ...mixed, control: { ...mixed.control, ops: mixed.control.ops.map((op) => op.node === "level" ? { ...op, domain: "render" } : op) } };
    const invalidFile = join(root, `mixed-${level}-invalid.json`), invalidOutput = join(root, `mixed-${level}-invalid`);
    writeFileSync(invalidFile, JSON.stringify(invalid));
    const rejected = run(invalidFile, invalidOutput);
    assert.ifError(rejected.error); assert.equal(rejected.status, 1); assert.match(rejected.stderr, /^level\/register:/m);
    assert.equal(existsSync(invalidOutput), false);
  }
}
