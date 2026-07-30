import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadRunRecordFromDebugBundle } from "../src/core/record.js";
import { normalizeRunRecord, type NormalizedRunRecord } from "../src/core/normalize.js";
import {
  diffNormalizedRecords,
  formatStreamDiff,
  streamDiffIsEmpty
} from "../src/core/diff.js";

const BUNDLE_DIR = resolve(
  __dirname,
  "../../journeys/linear-text-pipeline/fixtures/debug-bundle"
);

function cloneNormalized(record: NormalizedRunRecord): NormalizedRunRecord {
  return JSON.parse(JSON.stringify(record)) as NormalizedRunRecord;
}

describe("diffNormalizedRecords", () => {
  it("is empty for two normalizations of the same record", async () => {
    const record = await loadRunRecordFromDebugBundle(BUNDLE_DIR);
    const baseline = normalizeRunRecord(record);
    const candidate = normalizeRunRecord(record);
    expect(streamDiffIsEmpty(diffNormalizedRecords(baseline, candidate))).toBe(
      true
    );
  });

  it("flags an injected divergence on the affected channel only", async () => {
    const record = await loadRunRecordFromDebugBundle(BUNDLE_DIR);
    const baseline = normalizeRunRecord(record);
    const candidate = cloneNormalized(baseline);

    // Inject a divergence: the "upper1" node reports "failed" instead of
    // "completed" on the candidate surface.
    const target = candidate.frames.find(
      (f) =>
        f.channel === "node:upper1" &&
        f.message["type"] === "node_update" &&
        f.message["status"] === "completed"
    );
    expect(target).toBeDefined();
    target!.message["status"] = "failed";
    target!.message["error"] = "boom";

    const diff = diffNormalizedRecords(baseline, candidate);
    expect(streamDiffIsEmpty(diff)).toBe(false);

    const channelNames = diff.channels.map((c) => c.channel);
    expect(channelNames).toEqual(["node:upper1"]);

    // Every other channel (job, other nodes, control/edges) is untouched.
    const upperChannel = diff.channels[0];
    const kinds = upperChannel.entries.map((e) => e.kind).sort();
    expect(kinds).toEqual(["added", "removed"]);

    expect(formatStreamDiff(diff)).toContain("channel node:upper1");
  });

  it("flags a missing terminal frame as a divergence", async () => {
    const record = await loadRunRecordFromDebugBundle(BUNDLE_DIR);
    const baseline = normalizeRunRecord(record);
    const candidate = cloneNormalized(baseline);
    candidate.frames = candidate.frames.filter(
      (f) => !(f.channel === "job" && f.message["status"] === "completed")
    );

    const diff = diffNormalizedRecords(baseline, candidate);
    expect(streamDiffIsEmpty(diff)).toBe(false);
    expect(diff.channels.map((c) => c.channel)).toEqual(["job"]);
  });
});
