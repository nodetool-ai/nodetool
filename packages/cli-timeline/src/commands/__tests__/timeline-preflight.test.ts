import { describe, expect, it } from "vitest";
import { preflightTimeline, runTimelinePreflight, vulkanDriverFiles } from "../timeline-preflight.js";
import { runTimelineRender } from "../timeline-render.js";

describe("timeline preflight", () => {
  it("reports the render failure and the configured driver manifest instead of throwing", async () => {
    const failing: typeof runTimelineRender = async () => { throw new Error("No WebGPU adapter available (Node/Dawn)."); };
    await expect(runTimelinePreflight(failing, { VK_DRIVER_FILES: "/opt/vk/lvp_icd.json" })).resolves.toEqual({
      ok: false, vulkanDriverFiles: "/opt/vk/lvp_icd.json", error: "No WebGPU adapter available (Node/Dawn)."
    });
  });

  it("fails an incomplete export", async () => {
    const incomplete: typeof runTimelineRender = async (_ref, opts) => ({
      out: String(opts.out), format: "mp4", stills: false, sheet: false, frames: 6, width: 160, height: 90, fps: 30,
      elapsedMs: 1, skippedClips: ["title"], complete: false, diagnostics: [], fontsUnavailable: []
    });
    expect(await runTimelinePreflight(incomplete, {})).toMatchObject({ ok: false, vulkanDriverFiles: null });
  });

  it("holds one shape clip and one text clip, and reads VK_DRIVER_FILES before VK_ICD_FILENAMES", () => {
    const document = preflightTimeline().document as { clips: { mediaType: string }[] };
    expect(document.clips.map(clip => clip.mediaType)).toEqual(["shape", "text"]);
    expect(vulkanDriverFiles({ VK_DRIVER_FILES: "a.json", VK_ICD_FILENAMES: "b.json" })).toBe("a.json");
    expect(vulkanDriverFiles({ VK_ICD_FILENAMES: "b.json" })).toBe("b.json");
  });
});
