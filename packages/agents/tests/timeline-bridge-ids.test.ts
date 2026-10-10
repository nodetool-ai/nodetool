import { describe, expect, it } from "vitest";

import { createTimelineToolBridge } from "../src/capabilities/timeline-bridge.js";

function clip(
  id: string,
  trackId: string,
  mediaType: "video" | "audio",
  startMs: number,
  linkId: string
) {
  return {
    id,
    trackId,
    name: id,
    startMs,
    durationMs: 2000,
    inPointMs: 0,
    outPointMs: 2000,
    mediaType,
    sourceType: "imported" as const,
    status: "generated" as const,
    currentAssetId: `asset-${id}`,
    linkId
  };
}

describe("headless bridge ids (O1)", () => {
  it("mints link ids that never collide with a seeded link group", async () => {
    const bridge = createTimelineToolBridge({
      sequenceId: "sequence-1",
      sequence: {
        tracks: [
          { id: "tv", name: "V", type: "video", index: 0, visible: true, locked: false },
          { id: "ta", name: "A", type: "audio", index: 1, visible: true, locked: false }
        ],
        clips: [
          clip("shot-a", "tv", "video", 0, "link_1"),
          clip("sound-a", "ta", "audio", 0, "link_1"),
          clip("shot-b", "tv", "video", 4000, "link_2"),
          clip("sound-b", "ta", "audio", 4000, "link_2")
        ]
      }
    });
    const split = bridge.tools.find((t) => t.name === "ui_timeline_split_clip")!;
    await split.execute({ target: "shot-b", atMs: 5000 });
    const clips = bridge.finalState().documentClips;
    const groupA = clips.filter((c) => c.linkId === "link_1").map((c) => c.id);
    expect(groupA.sort()).toEqual(["shot-a", "sound-a"]);
    const fresh = clips.filter((c) => !c.id.includes("-"));
    expect(fresh).toHaveLength(4);
    for (const half of fresh) {
      expect(half.id).toMatch(/^[0-9a-f]{32}$/);
      expect(half.linkId).toMatch(/^[0-9a-f]{32}$/);
    }
  });
});
