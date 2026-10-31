import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareBlacksiteAssets } from "./prepare-assets.mjs";
import { BLACKSITE_AUDIO_LIMITS, float32Wave } from "./prepare-audio.mjs";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const sourceRoot = new URL("../../../../../packages/game-runtime/samples/blacksite/", import.meta.url);

test("native BLACKSITE score uses admitted WAV and retains its original source and visuals", async () => {
  const originalDocument = await readFile(new URL("game.json", sourceRoot));
  const source = JSON.parse(originalDocument);
  const originalScore = await readFile(new URL(`assets/${source.assets.score.assetId}.ogg`, sourceRoot));
  const output = await mkdtemp(join(tmpdir(), "blacksite-score-audio-"));
  const prepared = await prepareBlacksiteAssets(output);
  const score = prepared.assets.find(asset => asset.id === "score");
  assert.ok(score);
  assert.equal(score.kind, "audio");
  assert.match(score.path, /\.wav$/);
  const bytes = await readFile(join(output, score.path));
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WAVE");
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
  assert.equal(bytes.readUInt16LE(20), 3);
  assert.equal(bytes.readUInt16LE(22), 1);
  assert.equal(bytes.readUInt32LE(24), 48000);
  assert.equal(bytes.readUInt16LE(34), 32);
  assert.equal(bytes.readUInt32LE(40), bytes.length - 44);
  assert.equal(sha256(bytes), score.digest);
  assert.equal(bytes.length, score.size);
  assert.ok(bytes.length > 8 * 1024 * 1024);
  assert.ok(bytes.length <= BLACKSITE_AUDIO_LIMITS.fileBytes);
  const reference = spawnSync("ffmpeg", ["-v", "error", "-nostdin", "-i", "pipe:0", "-map", "0:a:0", "-c:a", "pcm_f32le", "-f", "f32le", "pipe:1"], { input: originalScore, maxBuffer: BLACKSITE_AUDIO_LIMITS.fileBytes, timeout: 30_000 });
  assert.equal(reference.status, 0, reference.stderr?.toString("utf8"));
  assert.deepEqual(bytes.subarray(44), reference.stdout);
  const audio = prepared.provenance.audio.score;
  assert.equal(audio.decodedPcmDigest, sha256(reference.stdout));
  assert.equal(audio.frames, reference.stdout.length / 4);
  assert.equal(audio.durationSeconds, audio.frames / 48000);
  assert.equal(audio.sourceDurationSeconds, 48);
  assert.ok(Number.isFinite(audio.minimumSample) && Number.isFinite(audio.maximumSample));
  assert.equal(audio.sourceDigest, source.assets.score.digest);
  assert.equal(audio.preparedDigest, score.digest);
  assert.deepEqual(await readFile(join(output, audio.sourceCopyPath)), originalScore);
  const visuals = prepared.assets.filter(asset => asset.kind !== "audio");
  assert.ok(visuals.length > 0);
  // Captured from the old, copied-OGG preparer before this regression was fixed.
  assert.equal(sha256(JSON.stringify(visuals)), "e7ad06bab1966e73e0ba609a5d86c6a6d93c951bb0bdea47fed9c7df46f38ad4");
  const byId = new Map(prepared.assets.map(asset => [asset.id, asset]));
  for (const asset of visuals) {
    assert.equal(sha256(await readFile(join(output, asset.path))), asset.digest);
  }
  for (const asset of prepared.assets.filter(asset => asset.id !== "score" && source.assets[asset.id])) {
    assert.equal(asset.digest, source.assets[asset.id].digest);
  }
  // native/game/src/browser/Model.cpp: existing 8 MiB file / 16 MiB closure.
  for (const asset of prepared.assets.filter(asset => asset.kind === "model")) {
    const closure = new Set(), pending = [asset.id];
    while (pending.length) {
      const id = pending.pop();
      if (closure.has(id)) { continue; }
      closure.add(id);
      pending.push(...byId.get(id).dependencies);
    }
    assert.equal(closure.has("score"), false);
    assert.ok([...closure].every(id => byId.get(id).size <= 8 * 1024 * 1024));
    assert.ok([...closure].reduce((sum, id) => sum + byId.get(id).size, 0) <= 16 * 1024 * 1024);
  }
  assert.ok(prepared.assets.reduce((sum, asset) => sum + asset.size, 0) <= 256 * 1024 * 1024);
  assert.equal(sha256(await readFile(new URL("game.json", sourceRoot))), sha256(originalDocument));
  assert.equal(sha256(await readFile(new URL(`assets/${source.assets.score.assetId}.ogg`, sourceRoot))), sha256(originalScore));
});

test("float32 score admission rejects invalid samples, channels, rate and existing budgets", () => {
  const finite = Buffer.alloc(4);
  assert.throws(() => float32Wave(finite, 3, 48000), /channel\/rate/);
  assert.throws(() => float32Wave(finite, 1, 7999), /channel\/rate/);
  assert.throws(() => float32Wave(Buffer.alloc(5), 1, 48000), /file\/block/);
  const nonfinite = Buffer.alloc(4);
  nonfinite.writeFloatLE(NaN);
  assert.throws(() => float32Wave(nonfinite, 1, 48000), /nonfinite/);
  nonfinite.writeFloatLE(Infinity);
  assert.throws(() => float32Wave(nonfinite, 1, 48000), /nonfinite/);
  assert.throws(() => float32Wave(Buffer.alloc(BLACKSITE_AUDIO_LIMITS.fileBytes), 1, 48000), /file\/block/);
  assert.throws(() => float32Wave(Buffer.alloc(601 * 8000 * 4), 1, 8000), /decoded audio budget/);
});
