import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";

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
  const audio = JSON.parse(readFileSync(new URL("../tests/fixtures/offline-audio.json", import.meta.url), "utf8"));
  const render = JSON.parse(readFileSync(new URL("../tests/fixtures/offline-render.json", import.meta.url), "utf8"));
  const damper = JSON.parse(readFileSync(new URL("../tests/fixtures/offline-damper.json", import.meta.url), "utf8"));
  const control = structuredClone(audio);
  control.audio = { buffers: [], nodes: [], sinks: [] }; control.params = [];
  const mixed = structuredClone(render);
  mixed.audio = audio.audio; mixed.params = audio.params;
  mixed.control.ops.push(...audio.control.ops); mixed.control.stateful = audio.control.stateful;
  async function checkArtifacts(files, name, images) {
    const frames = Array.from({ length: images }, (_, frame) => `frame-${String(frame).padStart(6, "0")}.png`);
    assert.deepEqual(Object.keys(files).sort(), ["audio.wav", "manifest.json", ...frames].sort());
    const manifest = JSON.parse(files["manifest.json"].toString("utf8"));
    assert.equal(manifest.mode, images ? "offline-render" : "offline-audio");
    assert.equal(manifest.samples, 2400); assert.equal(manifest.quanta, 19);
    assert.equal(manifest.controlFrames, 3); assert.equal(manifest.imageFrames, images);
    assert.equal(manifest.sampleRate, 48000); assert.equal(manifest.channels, 2);
    assert.equal(manifest.sanitizedSamples, 0); assert.deepEqual(manifest.audioFiles, ["audio.wav"]);
    const pcm = files["audio.wav"];
    assert.equal(pcm.length, 58 + 2400 * 8);
    assert.equal(pcm.subarray(0, 4).toString(), "RIFF");
    assert.equal(pcm.readUInt32LE(4), pcm.length - 8);
    assert.equal(pcm.readUInt32LE(24), 48000); assert.equal(pcm.readUInt32LE(54), 2400 * 8);
    if (name === "control" || name === "render") { assert.ok(pcm.subarray(58).every((byte) => byte === 0)); }
    else { assert.ok(pcm.subarray(58).some((byte) => byte !== 0), "CLI signal track is silent"); }
    if (name === "damper") {
      const oscillator = [0, 1, 0, -1];
      for (let sample = 0; sample < 2400; sample++) {
        const endpoint = (Math.floor(sample / 128) + 1) * 128 / 48000;
        const expected = 0.75 * (1 - Math.exp(-endpoint / 0.2)) * oscillator[sample % 4];
        for (let channel = 0; channel < 2; channel++) {
          const actual = pcm.readFloatLE(58 + sample * 8 + channel * 4);
          assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 2e-6, "Damper CLI PCM differs from quantum reference");
        }
      }
    }
    for (const [frame, file] of frames.entries()) {
      const { data, info } = await sharp(files[file]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.deepEqual([info.width, info.height, info.channels], [4, 4, 4]);
      const quanta = Math.floor(frame * 48000 / (60 * 128));
      const expected = name === "damper"
        ? [Math.round(255 * 0.75 * (1 - Math.exp(-quanta * 128 / (48000 * 0.2)))), 0, 0, 255]
        : [255, 0, 0, 128];
      assert.equal(data.length, 64);
      for (let byte = 0; byte < data.length; byte++) {
        assert.ok(Math.abs(data[byte] - expected[byte % 4]) <= 1, "CLI frame differs from pixel golden");
      }
    }
  }
  let audioTrack;
  for (const [name, graph, images] of [["control", control, 0], ["audio", audio, 0], ["render", render, 3], ["mixed", mixed, 3], ["damper", damper, 3]]) {
    writeFileSync(plan, JSON.stringify(graph));
    let reference;
    for (const trial of ["a", "b"]) {
      const destination = join(directory, `${name}-${trial}-é-音`);
      run(["--duration", "0.05", "--fps", "60", "--out", destination, "--null-audio"], 0);
      const files = Object.fromEntries(readdirSync(destination).map((file) => [file, readFileSync(join(destination, file))]));
      await checkArtifacts(files, name, images);
      if (!reference) { reference = files; }
      else { assert.deepEqual(files, reference, `${name}: repeated CLI exports differ`); }
    }
    await assert.rejects(checkArtifacts({}, name, images));
    if (name === "audio") { audioTrack = reference["audio.wav"]; }
    if (name === "mixed") { assert.deepEqual(reference["audio.wav"], audioTrack, "Rendering changed the CLI audio track"); }
    if (name === "damper") {
      const wrongFrame = { ...reference, "frame-000000.png": reference["frame-000002.png"] };
      await assert.rejects(checkArtifacts(wrongFrame, name, images), /pixel golden/);
      const corruptedPcm = Buffer.from(reference["audio.wav"]); corruptedPcm.writeFloatLE(0, 58 + 8);
      await assert.rejects(checkArtifacts({ ...reference, "audio.wav": corruptedPcm }, name, images), /Damper CLI PCM/);
    }
    console.log(`Offline CLI ${name}: manifest, media references and repeat bytes pass.`);
  }
  console.log("Offline CLI: fixture matrix, Unicode paths, planar PCM, final trim, slot and argument rejections passed.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
