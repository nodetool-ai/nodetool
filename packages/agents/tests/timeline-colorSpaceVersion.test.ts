import { expect, it, vi } from "vitest";
import { makeSequence, timelineColorSpaceError } from "@nodetool-ai/timeline";
import { renderTimelineFrames } from "../src/timeline-preview/frames.js";
it.each([2, 3])("refuses Canvas2D version %s before loading media", async (workingColorSpaceVersion) => {
  const sequence = makeSequence({ workingColorSpaceVersion });
  const before = JSON.stringify(sequence);
  const loadAsset = vi.fn();
  await expect(renderTimelineFrames({ sequence, timesMs: [0], loadAsset })).rejects.toThrow(timelineColorSpaceError(sequence)!);
  expect(loadAsset).not.toHaveBeenCalled();
  expect(JSON.stringify(sequence)).toBe(before);
});
