import { describe, expect, it } from "vitest";
import type { TimelineDocument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { applyOps } from "../src/capabilities/timeline-operations.js";
import type { CapabilityRun } from "../src/capabilities/types.js";

describe("applyOps seeds the music marker (F2)", () => {
  it("get_state reports the document's crossfade length", async () => {
    const sequence = {
      id: "seq",
      name: "Seq",
      project_id: "project",
      fps: 30,
      width: 64,
      height: 64
    } as never;
    const document = {
      tracks: [],
      clips: [],
      markers: [],
      mediaTracks: [],
      music: { autoCrossfadeMs: 12 }
    } as unknown as TimelineDocument;
    const run = { context: { userId: "user-1" } } as unknown as CapabilityRun;
    const { records } = await applyOps(run, sequence, document, [
      { op: "ui_timeline_get_state", input: {} }
    ]);
    expect(records[0]).toMatchObject({ ok: true, result: { autoCrossfadeMs: 12 } });
  });
});
