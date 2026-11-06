import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { runTimelineRender } from "../timeline-render.js";
it.each([2, 3])("refuses version %s without rewriting the saved bytes", async (workingColorSpaceVersion) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "a106-"));
  try {
    const input = path.join(directory, "timeline.json");
    const saved = JSON.stringify({ tracks: [], clips: [], markers: [], workingColorSpaceVersion });
    await writeFile(input, saved);
    const render = vi.fn();
    await expect(runTimelineRender(input, { out: path.join(directory, "out.mp4") }, async () => null, render)).rejects.toThrow(`Document workingColorSpaceVersion is ${workingColorSpaceVersion}. This build supports versions up to 1. Open it with a build that supports this value.`);
    expect(render).not.toHaveBeenCalled();
    expect(await readFile(input, "utf8")).toBe(saved);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
