import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { compileRealtimeGraph } from "@nodetool-ai/realtime-compiler";
import { pcmFixture, PCM_FIXTURE_HASH } from "./fixtures/PcmGraph.ts";

function preparedPcm(frames, channels) {
  const patterns = [[0.25, -0.5, 0.75, -1], [-0.125, 0.375, -0.625, 0.875]];
  const bytes = Buffer.alloc(frames * channels * 4);
  for (let channel = 0; channel < channels; channel++) {
    for (let frame = 0; frame < frames; frame++) { bytes.writeFloatLE(patterns[channel][frame % 4], (channel * frames + frame) * 4); }
  }
  return bytes;
}
export function checkPcmBoundaries(executable, root) {
  const run = (file, output, slot, raw, fps = 60) => spawnSync(executable, ["live", file, "--duration", "0.01", "--fps", String(fps), "--out", output,
    ...(slot ? ["--slot", `${slot}=${raw}`] : []), "--null-audio"], { encoding: "utf8", timeout: 60000 });
  function checkWave(pcm, rate, channels, frames, source, gain) {
    const samples = rate / 100;
    assert.equal(pcm.length, 58 + samples * channels * 4);
    assert.equal(pcm.readUInt32LE(24), rate); assert.equal(pcm.readUInt16LE(22), channels);
    for (let frame = 0; frame < samples; frame++) {
      for (let channel = 0; channel < channels; channel++) {
        const expected = frame < frames ? source.readFloatLE((channel * frames + frame) * 4) * gain : 0;
        const actual = pcm.readFloatLE(58 + (frame * channels + channel) * 4);
        assert.equal(actual, expected, "Sample player differs from planar input/gain/silence reference");
      }
    }
  }
  for (const sampleRate of [44100, 48000]) {
    for (const channels of ["mono", "stereo"]) {
      for (const frames of [3, 193]) {
        for (const multiple of [false, true]) {
          const input = pcmFixture(multiple), count = channels === "mono" ? 1 : 2;
          const bytes = preparedPcm(frames, count), contentHash = createHash("sha256").update(bytes).digest("hex");
          if (frames === 193 && channels === "stereo") { assert.equal(contentHash, PCM_FIXTURE_HASH); }
          const metadata = input.batchPcm[0];
          const compiled = compileRealtimeGraph({ ...input, session: { ...input.session, sampleRate, channels },
            batchPcm: [{ ...metadata, sampleRate, channels, frames, contentHash }] });
          assert.equal(compiled.status, "ok", JSON.stringify(compiled));
          const name = `pcm-${sampleRate}-${channels}-${frames}-${multiple}`, file = join(root, `${name}.json`), raw = join(root, `${name}.f32`);
          const slot = compiled.plan.slots[0].id;
          writeFileSync(file, JSON.stringify(compiled.plan)); writeFileSync(raw, bytes);
          const baseline = [];
          for (const fps of [60, 120, 2]) {
            const output = join(root, `${name}-${fps}`); const result = run(file, output, slot, raw, fps);
            assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
            const names = compiled.plan.audio.sinks.map((sink, index) => index === 0 ? "audio.wav" : `audio-${index}.wav`);
            assert.deepEqual(readdirSync(output).sort(), ["manifest.json", ...names].sort());
            const manifest = JSON.parse(readFileSync(join(output, "manifest.json"), "utf8"));
            assert.deepEqual(manifest.audioFiles, names); assert.equal(manifest.sanitizedSamples, 0);
            for (const [index, sink] of compiled.plan.audio.sinks.entries()) {
              const pcm = readFileSync(join(output, names[index]));
              if (fps !== 60) { assert.deepEqual(pcm, baseline[index], "PCM output changed with render frame rate"); continue; }
              const gain = sink.node === "out-source" ? 1 : sink.node === "out-b" ? 0.25 : 0.5;
              checkWave(pcm, sampleRate, count, frames, bytes, gain); baseline.push(pcm);
              const corrupt = Buffer.from(pcm); corrupt.writeFloatLE(10, 58);
              assert.throws(() => checkWave(corrupt, sampleRate, count, frames, bytes, gain));
            }
          }
          if (sampleRate !== 48000 || channels !== "stereo" || frames !== 193 || !multiple) { continue; }
          const badPlanFile = join(root, "pcm-missing-slot.json"), badPlanOut = join(root, "pcm-missing-slot");
          writeFileSync(badPlanFile, JSON.stringify({ ...compiled.plan, audio: { ...compiled.plan.audio, nodes: compiled.plan.audio.nodes.map((node) =>
            node.kernel === "sample-player" ? { ...node, bufferSlot: "missing" } : node) } }));
          const rejected = run(badPlanFile, badPlanOut);
          assert.ifError(rejected.error); assert.equal(rejected.status, 1); assert.match(rejected.stderr, /^player\/buffer_slot:/m);
          assert.equal(existsSync(badPlanOut), false);
          for (const [label, content] of [["partial", bytes.subarray(0, bytes.length - 1)], ["nonfinite", Buffer.from(bytes)]]) {
            if (label === "nonfinite") { content.writeFloatLE(NaN, 0); }
            const invalidRaw = join(root, `${label}.f32`), invalidOut = join(root, `pcm-${label}`); writeFileSync(invalidRaw, content);
            const invalid = run(file, invalidOut, slot, invalidRaw);
            assert.ifError(invalid.error); assert.equal(invalid.status, 1);
            assert.match(invalid.stderr, label === "partial" ? /expected planar float32 little-endian PCM/ : /non-finite PCM sample/);
            assert.equal(existsSync(invalidOut), false);
          }
        }
      }
    }
  }
  const bytes = preparedPcm(193, 2), raw = join(root, "snapshot-pcm.f32"); writeFileSync(raw, bytes);
  for (const name of ["pcm-plan", "pcm-multisink-plan"]) {
    const file = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)); const plan = JSON.parse(readFileSync(file, "utf8"));
    const output = join(root, `${name}-snapshot`); const result = run(file, output, plan.slots[0].id, raw);
    assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
    checkWave(readFileSync(join(output, "audio.wav")), 48000, 2, 193, bytes, 0.5);
  }
}
