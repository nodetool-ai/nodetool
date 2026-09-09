import { describe, expect, it } from "vitest";
import type { Shot } from "@nodetool-ai/protocol";
import { applyMeasuredShotClipDurations } from "../src/measureClipDurations.js";

const shot = (id: string, status: Shot["status"]): Shot => ({
  type: "shot",
  id,
  index: 0,
  action: id,
  status,
  clip: { type: "video", asset_id: `asset-${id}`, duration: 2 }
});

describe("applyMeasuredShotClipDurations", () => {
  it("replaces persisted rendered-clip durations with measured values", () => {
    const [rendered, planned] = applyMeasuredShotClipDurations(
      [shot("rendered", "rendered"), shot("planned", "planned")],
      new Map([["asset-rendered", 5.184]])
    );

    expect(rendered.clip?.duration).toBe(5.184);
    expect(planned.clip?.duration).toBe(2);
  });

  it("keeps the stored duration when measurement cannot answer", () => {
    const [rendered] = applyMeasuredShotClipDurations(
      [shot("rendered", "rendered")],
      new Map()
    );

    expect(rendered.clip?.duration).toBe(2);
  });
});
