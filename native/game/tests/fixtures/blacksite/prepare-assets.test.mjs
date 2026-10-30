import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareBlacksiteAssets } from "./prepare-assets.mjs";

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
  assert.equal(sha256(bytes), score.digest);
  assert.equal(bytes.length, score.size);
  assert.equal(sha256(await readFile(new URL("game.json", sourceRoot))), sha256(originalDocument));
  assert.equal(sha256(await readFile(new URL(`assets/${source.assets.score.assetId}.ogg`, sourceRoot))), sha256(originalScore));
});
