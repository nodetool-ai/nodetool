import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

if (process.argv.length !== 3) { throw new Error("Usage: node cli-check.mjs EXECUTABLE"); }
const executable = resolve(process.argv[2]);
const directory = mkdtempSync(join(tmpdir(), "realtime-cli-"));
try {
  const fixture = JSON.parse(readFileSync(new URL("../tests/fixtures/offline-audio.json", import.meta.url), "utf8"));
  fixture.audio.nodes[0].kernel = "sample-player";
  fixture.audio.nodes[0].bufferSlot = "pcm";
  fixture.audio.nodes[0].params = [0];
  fixture.params = [{ slot: 0, node: "tone", field: "gain", value: 1, smooth: "none", sync: "audio" }];
  fixture.slots = [{ id: "pcm", kind: "buffer", source: "batch.audio", channels: "stereo" }];
  const plan = join(directory, "plan-é-音.json");
  const pcm = join(directory, "samples-é-音.f32");
  writeFileSync(plan, JSON.stringify(fixture));
  const samples = Buffer.alloc(2 * 200 * 4);
  for (let i = 0; i < 200; i++) {
    samples.writeFloatLE(0.25, i * 4);
    samples.writeFloatLE(-0.5, (200 + i) * 4);
  }
  writeFileSync(pcm, samples);
  const output = join(directory, "output-é-音");
  function run(args, expected) {
    const result = spawnSync(executable, ["live", plan, ...args], { encoding: "utf8", timeout: 30000 });
    assert.ifError(result.error);
    assert.equal(result.status, expected, result.stderr);
  }
  const args = ["--duration", "0.01", "--fps", "30000/1001", "--out", output, "--slot", `pcm=${pcm}`, "--null-audio"];
  run(args, 0);
  const wav = readFileSync(join(output, "audio.wav"));
  assert.equal(wav.length, 58 + 480 * 8);
  for (let i = 0; i < 480; i++) {
    assert.equal(wav.readFloatLE(58 + i * 8), i < 200 ? 0.25 : 0);
    assert.equal(wav.readFloatLE(62 + i * 8), i < 200 ? -0.5 : 0);
  }
  run(args, 1);
  assert.deepEqual(readFileSync(join(output, "audio.wav")), wav);
  const invalid = join(directory, "invalid");
  run(["--out", invalid, "--slot", "broken"], 2);
  run(["--out", invalid, "--slot", `pcm=${pcm}`, "--slot", `pcm=${pcm}`], 1);
  run(["--out", invalid], 1);
  run(["--out", invalid, "--unknown"], 2);
  assert.equal(existsSync(invalid), false);
  console.log("Offline CLI: Unicode paths, planar PCM, final trim, slot and argument rejections passed.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
