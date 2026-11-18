import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileRealtimeGraph } from "@nodetool-ai/realtime-compiler";
import { audioFixture, audioFanoutFixture } from "./fixtures/AudioGraph.ts";

export function checkAudio(executable, root) {
  const run = (file, output) => spawnSync(executable, ["live", file, "--duration", "0.01", "--fps", "60", "--out", output, "--null-audio"], { encoding: "utf8", timeout: 60000 });
  const checkPcm = (pcm, rate, channels, amplitude, delay = 0) => {
    const samples = rate / 100;
    assert.equal(pcm.subarray(0, 4).toString(), "RIFF"); assert.equal(pcm.readUInt32LE(24), rate);
    assert.equal(pcm.readUInt16LE(22), channels); assert.equal(pcm.readUInt16LE(34), 32);
    assert.equal(pcm.readUInt32LE(54), samples * channels * 4); assert.equal(pcm.length, 58 + samples * channels * 4);
    for (let sample = 0; sample < samples; sample++) {
      const expected = sample < delay ? 0 : [0, amplitude, 0, -amplitude][(sample - delay) % 4];
      for (let channel = 0; channel < channels; channel++) {
        const value = pcm.readFloatLE(58 + (sample * channels + channel) * 4);
        assert.ok(Number.isFinite(value) && Math.abs(value - expected) < 2e-6, "Compiled WAV differs from independent quadrature reference");
      }
    }
  };
  for (const sampleRate of [44100, 48000]) {
    for (const channels of ["mono", "stereo"]) {
      for (const variant of ["chain", "fanout", "delay"]) {
        const input = variant === "fanout" ? audioFanoutFixture() : audioFixture();
        const graph = { ...input.graph, nodes: input.graph.nodes.map((node) => node.id === "tone" ? { ...node, properties: { frequency: sampleRate / 4 } } :
          variant === "delay" && node.id === "gain" ? { ...node, type: "delay" } : node) };
        const compiled = compileRealtimeGraph({ ...input, graph, session: { ...input.session, sampleRate, channels } });
        assert.equal(compiled.status, "ok", JSON.stringify(compiled));
        const name = `audio-${sampleRate}-${channels}-${variant}`;
        const file = join(root, `${name}.json`), output = join(root, name);
        writeFileSync(file, JSON.stringify(compiled.plan));
        const result = run(file, output); assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
        const pcm = readFileSync(join(output, "audio.wav")); const count = channels === "mono" ? 1 : 2;
        const amplitude = variant === "fanout" ? 0.1875 : variant === "delay" ? 0.25 : 0.125;
        checkPcm(pcm, sampleRate, count, amplitude, variant === "delay" ? 128 : 0);
        const corrupt = Buffer.from(pcm); corrupt.writeFloatLE(10, 58);
        assert.throws(() => checkPcm(corrupt, sampleRate, count, amplitude, variant === "delay" ? 128 : 0));
        if (variant !== "fanout" || sampleRate !== 48000 || channels !== "stereo") { continue; }
        const invalid = join(root, "audio-overlap.json"), invalidOutput = join(root, "audio-overlap");
        const firstBuffer = compiled.plan.audio.nodes[0].out[0];
        writeFileSync(invalid, JSON.stringify({ ...compiled.plan, audio: { ...compiled.plan.audio, nodes: compiled.plan.audio.nodes.map((node) => node.node === "gain" ? { ...node, out: [firstBuffer] } : node) } }));
        const rejected = run(invalid, invalidOutput);
        assert.ifError(rejected.error); assert.equal(rejected.status, 1); assert.match(rejected.stderr, /\/buffer_liveness:/);
        assert.equal(existsSync(invalidOutput), false);
      }
    }
  }
  const source = audioFixture(); const descriptors = new Map(source.descriptors);
  const kernels = ["noise", "level-meter", "biquad.lowpass", "biquad.highpass", "biquad.bandpass", "biquad.notch", "biquad.allpass", "biquad.peaking", "biquad.lowshelf", "biquad.highshelf"];
  for (const kernel of kernels) {
    const generator = kernel === "noise";
    const params = generator ? [{ property: "amplitude", default: 0.25 }] : kernel === "level-meter" ? [] :
      [{ property: "frequency", default: 800 }, { property: "q", default: 0.707 }, { property: "gain", default: 0 }];
    descriptors.set("tested", { kind: "dsp", kernel, stateVersion: 1, inputs: generator ? [] : ["source"], output: "audio", params });
    const graph = { nodes: [{ id: "tone", type: "tone" }, { id: "tested", type: "tested" }, { id: "out", type: "audio-out" }], edges: [
      ...(generator ? [] : [{ source: "tone", sourceHandle: "audio", target: "tested", targetHandle: "source" }]),
      { source: "tested", sourceHandle: "audio", target: "out", targetHandle: "audio" }
    ] };
    const compiled = compileRealtimeGraph({ ...source, graph, descriptors }); assert.equal(compiled.status, "ok", JSON.stringify(compiled));
    const file = join(root, `abi-${kernel}.json`), output = join(root, `abi-${kernel}`); writeFileSync(file, JSON.stringify(compiled.plan));
    const result = run(file, output); assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
    const pcm = readFileSync(join(output, "audio.wav"));
    assert.equal(pcm.length, 58 + 480 * 8);
    let signal = false;
    for (let offset = 58; offset < pcm.length; offset += 4) {
      const value = pcm.readFloatLE(offset); assert.ok(Number.isFinite(value)); signal ||= value !== 0;
    }
    assert.ok(signal, "ABI fixture unexpectedly silent");
    if (kernel === "noise") {
      const repeated = join(root, "noise-repeat"); const repeat = run(file, repeated);
      assert.ifError(repeat.error); assert.equal(repeat.status, 0, repeat.stderr);
      assert.deepEqual(readFileSync(join(repeated, "audio.wav")), pcm);
    }
  }
}
