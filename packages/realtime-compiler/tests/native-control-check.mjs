import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { compileRealtimeGraph } from "@nodetool-ai/realtime-compiler";
import { audioControlFixture } from "./fixtures/AudioGraph.ts";

export function checkAudioControls(executable, root) {
  const run = (file, output, fps) => spawnSync(executable, ["live", file, "--duration", "0.02", "--fps", String(fps), "--out", output, "--null-audio"],
    { encoding: "utf8", timeout: 60000 });
  // Load the checked-in snapshots themselves, in addition to the rate/layout matrix below.
  for (const name of ["audio-plan", "audio-control-plan"]) {
    const file = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));
    const output = join(root, `${name}-snapshot`); const result = run(file, output, 60);
    assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
    const pcm = readFileSync(join(output, "audio.wav")); assert.equal(pcm.length, 58 + 960 * 8);
    let signal = false;
    for (let offset = 58; offset < pcm.length; offset += 4) {
      const value = pcm.readFloatLE(offset); assert.ok(Number.isFinite(value)); signal ||= value !== 0;
    }
    assert.ok(signal, "Stored audio snapshot unexpectedly silent");
  }
  function checkPcm(pcm, rate, channels, mode) {
    const samples = rate / 50; assert.equal(pcm.length, 58 + samples * channels * 4);
    assert.equal(pcm.readUInt32LE(24), rate); assert.equal(pcm.readUInt16LE(22), channels);
    let begin = 0.5;
    for (let quantum = 0; quantum < Math.ceil(samples / 128); quantum++) {
      const target = Math.fround(mode === "time" ? (quantum + 1) * 128 / rate : mode === "constant" ? 0.25 :
        0.75 * (1 - Math.exp(-(quantum + 1) * 128 / (rate * 0.2))));
      for (let frame = 0; frame < 128 && quantum * 128 + frame < samples; frame++) {
        const sample = quantum * 128 + frame;
        const gain = mode === "ramp" ? begin + (target - begin) * frame / 127 :
          mode === "pole" ? target + (begin - target) * Math.exp(-(frame + 1) / (rate * 0.01)) : target;
        const amplitude = mode === "shared" ? 0.25 * gain * (1 + gain) : 0.25 * gain;
        const expected = [0, amplitude, 0, -amplitude][sample % 4];
        for (let channel = 0; channel < channels; channel++) {
          const actual = pcm.readFloatLE(58 + (sample * channels + channel) * 4);
          assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 2e-6, "Audio control differs from independent quantum/smoothing reference");
        }
      }
      begin = Math.fround(mode === "pole" ? target + (begin - target) * Math.exp(-128 / (rate * 0.01)) : target);
    }
  }
  for (const sampleRate of [44100, 48000]) {
    for (const channels of ["mono", "stereo"]) {
      for (const mode of ["constant", "time", "damp", "ramp", "pole", "shared"]) {
        const input = audioControlFixture(mode === "constant" || mode === "time" ? mode : "damp", mode === "shared");
        const descriptors = new Map(input.descriptors); const gain = descriptors.get("gain");
        assert.equal(gain.kind, "dsp");
        if (mode === "ramp" || mode === "pole") {
          descriptors.set("gain", { ...gain, params: [{ ...gain.params[0], smoothing: mode === "ramp" ? { kind: "ramp" } : { kind: "onePole", timeConstant: 0.01 } }] });
        }
        const graph = { ...input.graph, nodes: input.graph.nodes.map((node) => node.id === "tone" ? { ...node, properties: { frequency: sampleRate / 4 } } : node) };
        const compiled = compileRealtimeGraph({ ...input, descriptors, graph, session: { ...input.session, sampleRate, channels } });
        assert.equal(compiled.status, "ok", JSON.stringify(compiled));
        const name = `control-${sampleRate}-${channels}-${mode}`, file = join(root, `${name}.json`);
        writeFileSync(file, JSON.stringify(compiled.plan));
        let baseline;
        for (const fps of [60, 120, 2]) {
          const output = join(root, `${name}-${fps}`); const result = run(file, output, fps);
          assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
          const pcm = readFileSync(join(output, "audio.wav"));
          if (baseline) { assert.deepEqual(pcm, baseline, "Audio control changed when render frame rate changed"); continue; }
          baseline = pcm; checkPcm(pcm, sampleRate, channels === "mono" ? 1 : 2, mode);
          const corrupt = Buffer.from(pcm); corrupt.writeFloatLE(10, 58);
          assert.throws(() => checkPcm(corrupt, sampleRate, channels === "mono" ? 1 : 2, mode));
        }
        if (sampleRate !== 48000 || channels !== "stereo" || (mode !== "constant" && mode !== "damp")) { continue; }
        const invalidFile = join(root, `${name}-invalid.json`), invalidOutput = join(root, `${name}-invalid`);
        const control = mode === "damp" ? {
          ...compiled.plan.control, ops: compiled.plan.control.ops.map((op) => ({ ...op, domain: "render" })),
          stateful: compiled.plan.control.stateful.map((op) => ({ ...op, domain: "render" }))
        } : { ...compiled.plan.control, ops: compiled.plan.control.ops.map((op) => op.node === "control" ? { ...op, values: [0.25, 0.5] } : op) };
        writeFileSync(invalidFile, JSON.stringify({ ...compiled.plan, control }));
        const invalid = run(invalidFile, invalidOutput, 60);
        assert.ifError(invalid.error); assert.equal(invalid.status, 1);
        assert.match(invalid.stderr, mode === "damp" ? /^gain\/register:/m : /^gain\/control_width:/m);
        assert.equal(existsSync(invalidOutput), false);
      }
    }
  }
}
