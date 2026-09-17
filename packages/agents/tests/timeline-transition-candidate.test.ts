import { describe, expect, it } from "vitest";
import { makeClip, makeTrack, type TimelineClip } from "@nodetool-ai/timeline";
import { createTimelineToolBridge } from "../src/evals/surfaces/timeline.js";

function clips(extra: TimelineClip[] = []): TimelineClip[] {
  return [
    makeClip({
      id: "outgoing",
      trackId: "video",
      name: "Outgoing",
      startMs: 0,
      durationMs: 4000,
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      currentAssetId: "asset-outgoing",
      activeTakeId: "take-outgoing"
    }),
    makeClip({
      id: "incoming",
      trackId: "video",
      name: "Incoming",
      startMs: 4000,
      durationMs: 4000,
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      currentAssetId: "asset-incoming",
      activeTakeId: "take-incoming"
    }),
    ...extra
  ];
}

function bridge(extra: TimelineClip[] = []) {
  return createTimelineToolBridge({
    sequenceId: "sequence-1",
    sequence: {
      tracks: [makeTrack({ id: "video", type: "video", index: 0 })],
      clips: clips(extra)
    },
    generateTransition: async ({ source, request }) => ({
      generationId: `generation-${source.outgoingClipId}-${source.incomingClipId}`,
      assetId: `asset-transition-${request.type}`
    })
  });
}

function tool(instance: ReturnType<typeof bridge>, name: string) {
  const found = instance.tools.find((candidate) => candidate.name === name);
  expect(found, `expected ${name} to be registered`).toBeDefined();
  return found!;
}

describe("generated transition candidates at a selected cut", () => {
  it("creates a cut-level candidate and auditions it without changing the document", async () => {
    const instance = bridge();
    const generate = tool(instance, "ui_timeline_apply_transition_at_cut");
    const preview = tool(instance, "ui_timeline_preview_transition_candidate");
    const before = instance.finalState().documentClips;

    const result = (await generate.execute({
      outgoingClipId: "outgoing",
      incomingClipId: "incoming",
      durationMs: 800,
      type: "crossfade"
    })) as {
      generationId: string;
      candidate: {
        id: string;
        kind: string;
        status: string;
        asset: { id: string };
        source: Record<string, unknown>;
      };
    };

    expect(result.candidate).toMatchObject({
      kind: "generated_transition_at_cut",
      status: "success",
      asset: { id: "asset-transition-crossfade" },
      source: {
        sequenceId: "sequence-1",
        outgoingClipId: "outgoing",
        incomingClipId: "incoming",
        cutTimeMs: 4000,
        outgoingAssetId: "asset-outgoing",
        incomingAssetId: "asset-incoming",
        durationMs: 800
      }
    });
    expect(result).toMatchObject({ applied: false });
    expect(instance.finalState().documentClips).toEqual(before);

    const auditioned = (await preview.execute({
      candidate_id: result.candidate.id
    })) as { candidate: { id: string }; previewOnly: boolean };
    expect(auditioned).toMatchObject({
      candidate: { id: result.candidate.id },
      previewOnly: true
    });
    expect(instance.finalState().documentClips).toEqual(before);
    expect(instance.finalState().auditionedTransitionCandidateId).toBe(
      result.candidate.id
    );
  });

  it("refuses to fabricate a candidate when no generation provider is wired", async () => {
    const instance = createTimelineToolBridge({
      sequence: {
        tracks: [makeTrack({ id: "video", type: "video", index: 0 })],
        clips: clips()
      }
    });
    const generate = tool(instance, "ui_timeline_generate_transition_at_cut");

    await expect(
      generate.execute({
        outgoingClipId: "outgoing",
        incomingClipId: "incoming",
        durationMs: 500
      })
    ).rejects.toThrow(/no provider generator/i);
    expect(instance.finalState().transitionCandidates).toEqual([]);
  });

  it("refuses an ambiguous cut before creating a candidate", async () => {
    const instance = bridge([
      makeClip({
        id: "overlap",
        trackId: "video",
        name: "Overlap",
        startMs: 0,
        durationMs: 5000,
        mediaType: "video",
        sourceType: "imported",
        status: "generated"
      })
    ]);
    const generate = tool(instance, "ui_timeline_generate_transition_at_cut");

    await expect(
      generate.execute({
        outgoingClipId: "outgoing",
        incomingClipId: "incoming",
        durationMs: 500
      })
    ).rejects.toThrow(/ambiguous/i);
    expect(instance.finalState().transitionCandidates).toEqual([]);
  });

  it("refuses a missing selected clip", async () => {
    const instance = bridge();
    const generate = tool(instance, "ui_timeline_generate_transition_at_cut");

    await expect(
      generate.execute({
        outgoingClipId: "missing",
        incomingClipId: "incoming",
        durationMs: 500
      })
    ).rejects.toThrow(/no clip found/i);
    expect(instance.finalState().transitionCandidates).toEqual([]);
  });

  it("refuses to preview or apply a candidate after its selected cut is stale", async () => {
    const instance = bridge();
    const generate = tool(instance, "ui_timeline_generate_transition_at_cut");
    const preview = tool(instance, "ui_timeline_preview_transition_candidate");
    const apply = tool(instance, "ui_timeline_apply_transition_at_cut");
    const result = (await generate.execute({
      outgoingClipId: "outgoing",
      incomingClipId: "incoming",
      durationMs: 500
    })) as { candidate: { id: string } };

    await tool(instance, "ui_timeline_move_clip").execute({
      target: "incoming",
      startMs: 4500
    });

    await expect(
      preview.execute({ candidate_id: result.candidate.id })
    ).rejects.toThrow(/stale/i);
    await expect(
      apply.execute({ candidate_id: result.candidate.id })
    ).rejects.toThrow(/stale/i);
  });

  it("applies only an explicit candidate as one cut operation", async () => {
    const instance = bridge();
    const generate = tool(instance, "ui_timeline_generate_transition_at_cut");
    const apply = tool(instance, "ui_timeline_apply_transition_at_cut");
    const before = structuredClone(instance.finalState().documentClips);
    const result = (await generate.execute({
      outgoingClipId: "outgoing",
      incomingClipId: "incoming",
      overlapMs: 700,
      type: "wipe",
      direction: "right",
      softness: 0.2
    })) as { candidate: { id: string } };

    const applied = (await apply.execute({
      candidate_id: result.candidate.id
    })) as {
      operation: { op: string; undoable: boolean; candidateId: string };
      applied: boolean;
    };

    expect(applied).toMatchObject({
      applied: true,
      operation: {
        op: "apply_generated_transition_at_cut",
        undoable: true,
        candidateId: result.candidate.id
      }
    });
    const state = instance.finalState();
    expect(state.documentClips).not.toEqual(before);
    expect(state.documentClips.find((clip) => clip.id === "outgoing")).toMatchObject({
      durationMs: 4700
    });
    expect(state.documentClips.find((clip) => clip.id === "incoming")).toMatchObject({
      transitionIn: {
        type: "wipe",
        durationMs: 700,
        direction: "right",
        softness: 0.2
      }
    });
    expect(state.documentClips.flatMap((clip) => clip.versions ?? [])).toEqual([]);
    expect(state.appliedTransitionCandidates).toHaveLength(1);
    expect(state.appliedTransitionCandidates[0]).toMatchObject({
      id: result.candidate.id,
      source: {
        outgoingClipId: "outgoing",
        incomingClipId: "incoming"
      }
    });
  });
});
