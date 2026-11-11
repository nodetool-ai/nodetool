import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateMedia } from "@nodetool-ai/runtime/media/testing";
import { analyze, Edges, offsets } from "./analyze.mjs";

test("edge detector excludes a partial opening pulse and merges click ringing", () => {
  const detector = new Edges(0.5, 0.2);
  [1, 0, 1, 0, 1, 0, 0, 1].forEach((value, index) => detector.sample(index * 0.05, value));
  assert.deepEqual(detector.times, [0.1, 0.35000000000000003]);
  assert.throws(() => detector.sample(0.1, 1));
  assert.throws(() => detector.sample(1, NaN));
});

test("pairing retains sign and rejects absent, ambiguous and dropped events", () => {
  assert.ok(Math.abs(offsets([1, 2, 3], [0.98, 1.98, 2.98], 0.2, 1 / 120).meanMs + 20) < 1e-9);
  assert.throws(() => offsets([], [], 0.2, 1 / 120));
  assert.throws(() => offsets([1, 2, 3], [1, 3], 0.2, 1 / 120));
  assert.throws(() => offsets([1, 2, 3], [1, 2, 3], 2, 1 / 120));
  assert.throws(() => offsets([1, 2, 3], [1, 2, 3.5], 0.2, 1 / 120));
});

test("decodes synthetic click/flash video with preserved 50 ms stream offset", async () => {
  const directory = await mkdtemp(join(tmpdir(), "realtime-sync-"));
  try {
    const recording = join(directory, "fixture.mkv");
    await generateMedia({ outPath: recording,
      video: { source: "color=c=black:s=32x32:r=100:d=4", codec: "ffv1",
        filter: "drawbox=color=white:t=fill:enable='between(mod(t,1),0.2,0.24)'" },
      audio: { source: "aevalsrc='if(between(mod(t,1),0.1,0.11),0.8,0)':s=48000:d=4", codec: "pcm_f32le",
        filter: "asetpts=PTS+0.05/TB" }
    });
    const result = await analyze(recording, {
      roi: [0, 0, 32, 32], audioThreshold: 0.5, flashThreshold: 0.5, gapSec: 0.4, maximumOffsetSec: 0.2
    });
    assert.equal(result.count, 4);
    assert.ok(Math.abs(result.meanMs - 50) <= 10.1, JSON.stringify(result));
    assert.ok(result.cameraFrameIntervalMs <= 10.1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
