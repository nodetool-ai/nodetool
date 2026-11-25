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

  it("resolves 12-character short transition candidate ids in preview and apply", async () => {
    const ids = [
      "abcdef01234500000000000000000001",
      "abcdef01234500000000000000000002"
    ];
    let next = 0;
    const bridge = createTimelineToolBridge({
      sequenceId: "sequence-1",
      newId: () => ids[next++] ?? "fedcba98765400000000000000000003",
      generateTransition: async () => ({
        generationId: "gen-1",
        assetId: "asset-trans-1"
      }),
      sequence: {
        tracks: [
          { id: "tv", name: "V", type: "video", index: 0, visible: true, locked: false }
        ],
        clips: [
          clip("a".repeat(32), "tv", "video", 0, "link_1"),
          clip("b".repeat(32), "tv", "video", 2000, "link_2")
        ]
      }
    });
    const generate = bridge.tools.find(
      (t) => t.name === "ui_timeline_generate_transition_at_cut"
    )!;
    const preview = bridge.tools.find(
      (t) => t.name === "ui_timeline_preview_transition_candidate"
    )!;
    const apply = bridge.tools.find(
      (t) => t.name === "ui_timeline_apply_transition_at_cut"
    )!;

    const first = (await generate.execute({
      outgoingClipId: "a".repeat(32),
      incomingClipId: "b".repeat(32),
      type: "crossfade",
      durationMs: 400
    })) as { candidate: { id: string } };
    const shortId = first.candidate.id.slice(0, 12);

    const previewed = (await preview.execute({
      candidate_id: shortId
    })) as { ok: boolean; candidate: { id: string } };
    expect(previewed.ok).toBe(true);
    expect(previewed.candidate.id).toBe(first.candidate.id);

    // A second candidate with the same 12-char prefix makes the short id ambiguous.
    await generate.execute({
      outgoingClipId: "a".repeat(32),
      incomingClipId: "b".repeat(32),
      type: "crossfade",
      durationMs: 400
    });
    await expect(preview.execute({ candidate_id: shortId })).rejects.toThrow(
      /matches more than one/
    );

    // A unique 12-char prefix applies cleanly.
    const third = (await generate.execute({
      outgoingClipId: "a".repeat(32),
      incomingClipId: "b".repeat(32),
      type: "crossfade",
      durationMs: 400
    })) as { candidate: { id: string } };
    const applied = (await apply.execute({
      candidate_id: third.candidate.id.slice(0, 12)
    })) as { ok: boolean; applied: boolean; candidate: { id: string } };
    expect(applied.ok).toBe(true);
    expect(applied.applied).toBe(true);
    expect(applied.candidate.id).toBe(third.candidate.id);
  });
});
