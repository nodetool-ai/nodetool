import { expect, it, vi } from "vitest";
import { makeSequence, timelineColorSpaceError } from "@nodetool-ai/timeline";
import { renderTimelineComposited } from "../src/nodes/timeline/compositeRender.js";
import { renderTimelineInBrowser } from "../src/nodes/timeline/browserRender.js";
import { resolveTimelineOutput } from "../src/nodes/timeline/outputFormats.js";
it.each([2, 3])("refuses version %s before browser or Dawn output", async (workingColorSpaceVersion) => {
  const sequence = makeSequence({ workingColorSpaceVersion });
  const before = JSON.stringify(sequence);
  const resolveAssetPath = vi.fn();
  const options = { sequence, width: 32, height: 32, fps: 30, durationMs: 1000,
    resolveAssetPath, outPath: "/must-not-create-a106.mp4", output: resolveTimelineOutput({ format: "mp4" }) };
  for (const render of [renderTimelineComposited, renderTimelineInBrowser]) {
    await expect(render(options)).rejects.toThrow(timelineColorSpaceError(sequence)!);
  }
  expect(resolveAssetPath).not.toHaveBeenCalled();
  expect(JSON.stringify(sequence)).toBe(before);
});
