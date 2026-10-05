/**
 * Every structural timeline op, driven twice: through the headless
 * `ui_timeline_*` tool and through `applyTimelineOp` directly. The two must
 * agree on the result and on the document (I11). Generated transition
 * candidates are the one lifecycle adapter: the bridge creates a cut-level
 * candidate, while the pure op remains the final host-side apply primitive.
 *
 * The bridge delegates to the op module today, so a passing run is a check
 * that it still does — the table is what fails when a handler is forked back
 * into a host. Inverting one fixture's expectation (e.g. dropping the
 * `set_clip_params` timing keys from the op) turns it red.
 */

import { applyTimelineOp, TIMELINE_OP_NAMES } from "@nodetool-ai/timeline/ops";
import { DEFAULT_MIDI_INSTRUMENT, DEFAULT_TEMPO } from "@nodetool-ai/timeline";
import { describe, expect, it } from "vitest";
import {
  createTimelineToolBridge,
  type TimelineBridgeInitialState
} from "../src/evals/surfaces/timeline.js";

import {
  ASSET,
  COMPOSITION,
  directContext,
  directState,
  FIXTURES,
  seedClips,
  seedMarkers,
  seedMediaTracks,
  seedTracks
} from "../../timeline/tests/fixtures/ops.js";

function bridgeInit(): TimelineBridgeInitialState {
  return {
    retargetFormat: async () => ({ sequenceId: "adapted_1", name: "Adapted" }),
    sequence: {
      tempo: directState().tempo,
      setup: directState().setup,
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: seedTracks(),
      clips: seedClips(),
      markers: seedMarkers(),
      mediaTracks: seedMediaTracks()
    },
    resolveAsset: async (ref) => (ref.includes("asset_1") ? ASSET : null),
    loadComposition: {
      get: async (id) => (id === COMPOSITION.id ? COMPOSITION : null),
      listIds: async () => [COMPOSITION.id]
    },
    generateTransition: async ({ source, request }) => ({
      generationId: `generation-${source.outgoingClipId}-${source.incomingClipId}`,
      assetId: `asset-transition-${request.type}`
    })
  };
}

describe("timeline op parity", () => {
  it("initializes the first MIDI track before adding a MIDI clip", async () => {
    const bridge = createTimelineToolBridge({
      sequence: { tracks: [], clips: [] }
    });
    const addTrack = bridge.tools.find(
      (tool) => tool.name === "ui_timeline_add_track"
    )!;
    await addTrack.execute({ type: "midi", name: "Music" });
    const add = bridge.tools.find(
      (tool) => tool.name === "ui_timeline_add_midi_clip"
    )!;
    await add.execute({ track: "Music", start_ms: 0, duration_ms: 3000 });
    const state = bridge.finalState();
    expect(state.documentTracks).toHaveLength(1);
    expect(state.documentTracks[0].instrument).toEqual(DEFAULT_MIDI_INSTRUMENT);
    expect(state.tempo).toEqual(DEFAULT_TEMPO);
  });
  it("covers every op the module handles", () => {
    expect(FIXTURES.map((f) => f.tool).sort()).toEqual(
      [...TIMELINE_OP_NAMES].sort()
    );
  });

  it("serializes concurrent edits and reads without losing either edit", async () => {
    const bridge = createTimelineToolBridge();
    const add = bridge.tools.find(
      (tool) => tool.name === "ui_timeline_add_text_clip"
    )!;
    const read = bridge.tools.find(
      (tool) => tool.name === "ui_timeline_get_state"
    )!;
    await Promise.all([
      add.execute({ text: "One" }),
      read.execute({}),
      add.execute({ text: "Two" })
    ]);
    expect(bridge.finalState().documentClips.map((clip) => clip.name)).toEqual([
      "One",
      "Two"
    ]);
  });

  it("does not mint a note id already supplied in the same phrase", async () => {
    const bridge = createTimelineToolBridge(bridgeInit());
    const add = bridge.tools.find(
      (tool) => tool.name === "ui_timeline_add_midi_clip"
    )!;
    await expect(
      add.execute({
        track: "track_midi",
        start_ms: 0,
        duration_ms: 2000,
        notes: [
          { id: "note_1", pitch: 60, start_tick: 0, duration_tick: 480 },
          { pitch: 64, start_tick: 480, duration_tick: 480 }
        ]
      })
    ).resolves.toMatchObject({ ok: true });
  });

  for (const fixture of FIXTURES) {
    it(`${fixture.tool} agrees between the bridge and applyTimelineOp`, async () => {
      const bridge = createTimelineToolBridge(bridgeInit());
      if (fixture.tool === "apply_transition_at_cut") {
        const entry = bridge.tools.find(
          (t) => t.name === "ui_timeline_apply_transition_at_cut"
        );
        expect(
          entry,
          "generated transition lifecycle tool is registered"
        ).toBeDefined();
        const result = (await entry!.execute(fixture.args)) as {
          candidate: {
            kind: string;
            source: {
              outgoingClipId: string;
              incomingClipId: string;
            };
          };
        };
        expect(result.candidate).toMatchObject({
          kind: "generated_transition_at_cut",
          source: {
            outgoingClipId: "clip_a",
            incomingClipId: "clip_c"
          }
        });
        const applied = (await entry!.execute({
          candidate_id: result.candidate.id
        })) as { applied: boolean };
        expect(applied).toMatchObject({ applied: true });
        const direct = await applyTimelineOp(
          directState(),
          fixture.op,
          directContext(directState())
        );
        expect(bridge.finalState().documentClips).toEqual(direct.state.clips);
        return;
      }
      const entry = bridge.tools.find(
        (t) => t.name === `ui_timeline_${fixture.tool}`
      );
      expect(entry, `${fixture.tool} is registered`).toBeDefined();
      const viaTool = (await entry!.execute(fixture.args)) as Record<
        string,
        unknown
      >;

      const state = directState();
      const outcome = await applyTimelineOp(
        state,
        fixture.op,
        directContext(state)
      );
      expect(outcome.error).toBeUndefined();

      // The bridge adds presentation-only fields (take counts, midi summaries,
      // and track labels) that the pure ops module intentionally does not own.
      // Every core operation result must still be present and equal.
      const toolResult =
        fixture.tool === "get_state"
          ? Object.fromEntries(
              Object.entries(viaTool).filter(([key]) => key !== "sequenceId")
            )
          : viaTool;
      expect(toolResult).toMatchObject(outcome.result);

      const final = bridge.finalState();
      expect(final.documentTracks).toEqual(outcome.state.tracks);
      expect(final.documentClips).toEqual(outcome.state.clips);
      expect(final.markers).toEqual(outcome.state.markers);
      expect(final.mediaTracks).toEqual(outcome.state.mediaTracks);
      expect(final.setup).toEqual(outcome.state.setup);
      expect(final.tempo).toEqual(outcome.state.tempo);
    });
  }

  it("applies timing sent to set_clip_params rather than dropping it", async () => {
    // The divergence this module closes: the browser handler used to strip
    // startMs/durationMs/fontSizePx from a set_clip_params call and report ok.
    const state = directState();
    const outcome = await applyTimelineOp(
      state,
      {
        op: "set_clip_params",
        target: "clip_b",
        patch: { startMs: 1200, durationMs: 2000, fontSizePx: 80 }
      },
      directContext(state)
    );
    expect(outcome.error).toBeUndefined();
    const clip = outcome.state.clips.find((c) => c.id === "clip_b")!;
    expect(clip.startMs).toBe(1200);
    expect(clip.durationMs).toBe(2000);
    expect(clip.textStyle?.fontSizePx).toBe(80);
    expect(outcome.changedClipIds).toContain("clip_b");
  });

  it("leaves the caller's document alone when an op refuses", async () => {
    const state = directState();
    const outcome = await applyTimelineOp(
      state,
      { op: "delete_clip", target: "nope" },
      directContext(state)
    );
    expect(outcome.error).toContain('No clip found matching "nope"');
    expect(outcome.state).toBe(state);
    expect(state.clips).toHaveLength(6);
  });
});
