import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const [runner, bundle] = process.argv.slice(2);
const graph = fileURLToPath(
  new URL("../tests/graphs/audio-render.json", import.meta.url)
);
const expected = JSON.parse(
  readFileSync(
    new URL("../tests/graphs/audio-render.expected.json", import.meta.url),
    "utf8"
  )
);
const result = spawnSync(runner, [bundle, graph], {
  encoding: "utf8",
  timeout: 60000,
  maxBuffer: 8 * 1024 * 1024
});
assert.equal(result.status, 0, result.stderr);
const messages = result.stdout
  .split("\n")
  .filter((line) => line.startsWith("{"))
  .map(JSON.parse);
const output = messages.find(
  (message) => message.type === "output_update" && message.node_id === "out"
);
assert.ok(output?.value?.data, "recorder must emit an inline WAV");
const wav = Buffer.from(output.value.data, "base64");
assert.equal(wav.readUInt32LE(24), 44100);
assert.equal(wav.readUInt16LE(22), 1);
assert.equal((wav.length - 44) / 2, expected.frames);
assert.equal(
  createHash("sha256").update(wav.subarray(44)).digest("hex"),
  expected.pcm_sha256
);
console.log("Native render matches the TypeScript frame count and PCM hash");

const effectGraph = fileURLToPath(
  new URL("../tests/graphs/audio-effects.json", import.meta.url)
);
const effects = JSON.parse(
  readFileSync(
    new URL("../tests/graphs/audio-effects.expected.json", import.meta.url),
    "utf8"
  )
);
assert.deepEqual(Object.keys(effects).sort(), [
  "Bitcrush", "Compress", "Distortion", "Limiter", "NoiseGate", "Reverb", "Phaser", "Delay",
  "Gain", "HighShelfFilter", "LowShelfFilter", "PeakFilter", "LowPassFilter", "HighPassFilter"
].sort(), "qualify every signal effect in the fixture");

const rendered = spawnSync(runner, [bundle, effectGraph], {
  encoding: "utf8",
  timeout: 60000,
  maxBuffer: 16 * 1024 * 1024
});
assert.equal(rendered.status, 0, rendered.stderr);
const effectMessages = rendered.stdout
  .split("\n")
  .filter((line) => line.startsWith("{"))
  .map(JSON.parse);
for (const [name, reference] of Object.entries(effects)) {
  const output = effectMessages.find(
    (message) =>
      message.type === "output_update" && message.node_id === "out" + name
  );
  assert.ok(output?.value?.data, name + " emits a clip");
  const wav = Buffer.from(output.value.data, "base64");
  assert.equal((wav.length - 44) / 2, reference.frames, name + " frame count");
  assert.equal(
    createHash("sha256").update(wav.subarray(44)).digest("hex"),
    reference.pcm_sha256,
    name + " PCM hash"
  );
}
console.log("Native signal effects match TypeScript clip PCM hashes");

const lfoGraph = fileURLToPath(
  new URL("../tests/graphs/audio-lfo-render.json", import.meta.url)
);
const lfoExpected = JSON.parse(
  readFileSync(
    new URL("../tests/graphs/audio-lfo-render.expected.json", import.meta.url),
    "utf8"
  )
);
const lfoRun = spawnSync(runner, [bundle, lfoGraph], {
  encoding: "utf8",
  timeout: 60000
});
assert.equal(lfoRun.status, 0, lfoRun.stderr);
const lfoMessages = lfoRun.stdout
  .split("\n")
  .filter((line) => line.startsWith("{"))
  .map(JSON.parse);
const lfoOutput = lfoMessages.find(
  (message) => message.type === "output_update" && message.node_id === "out"
);
assert.ok(lfoOutput?.value?.data, "LFO-driven oscillator emits a clip");
const lfoWav = Buffer.from(lfoOutput.value.data, "base64");
assert.equal((lfoWav.length - 44) / 2, lfoExpected.frames);
assert.equal(
  createHash("sha256").update(lfoWav.subarray(44)).digest("hex"),
  lfoExpected.pcm_sha256
);

console.log("Native LFO render matches the TypeScript PCM hash");

const innerGraph = fileURLToPath(new URL("../tests/graphs/audio-subgraph-render.json", import.meta.url));
const innerRun = spawnSync(runner, [bundle, innerGraph], { encoding: "utf8", timeout: 60000 });
assert.equal(innerRun.status, 0, innerRun.stderr);
const innerOutput = innerRun.stdout.split("\n").filter(line => line.startsWith("{")).map(JSON.parse)
  .find(message => message.type === "output_update" && message.node_id === "out");
assert.ok(innerOutput?.value?.data, "a sink fed by an inner graph emits audio");
const innerWav = Buffer.from(innerOutput.value.data, "base64");
assert.equal(innerWav.readUInt32LE(24), 44100, "inner graph preserves the root render rate");
assert.equal((innerWav.length - 44) / 2, 2205, "inner graph preserves the root render bound");
console.log("Inner graph preserves the top-level audio transport");
