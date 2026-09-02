/**
 * Tests for the timeline / video editor tool-loop eval surface
 * (`src/evals/surfaces/timeline.ts`):
 *   - `createTimelineToolBridge`: direct unit tests of the headless bridge.
 *   - `TIMELINE_TOOL_LOOP_CASES`: each case solved end-to-end via
 *     `runToolLoopEval` with a scripted provider — no network.
 */
import { describe, it, expect } from "vitest";
import type { BaseProvider, ProviderStreamItem, ProviderTool } from "@nodetool-ai/runtime";
import {
  makeClip,
  makeTrack,
  makeTrackEffect,
  type TimelineClip,
  type TimelineMarker,
  type TimelineTrack
} from "@nodetool-ai/timeline";
import { runToolLoopEval } from "../src/evals/tool-loop-eval.js";
import {
  createTimelineToolBridge,
  TIMELINE_TOOL_LOOP_CASES,
  type TimelineBridgeFinalState
} from "../src/evals/surfaces/timeline.js";

// --- scripted provider -------------------------------------------------------

interface ScriptedCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Provider that replays one scripted list of tool calls through the tool
 * `execute` closures (mirroring how a real provider's `generateLoop` dispatches
 * self-executing tools), then ends the turn.
 */
function createScriptedProvider(script: ScriptedCall[]): BaseProvider {
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: ProviderTool[];
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      let seq = 0;
      for (const call of script) {
        if (args.signal?.aborted) break;
        const id = `call_${++seq}`;
        yield { id, name: call.name, args: call.args } as ProviderStreamItem;
        await toolMap.get(call.name)?.execute?.(call.args, id);
      }
      yield { type: "chunk", content: "", done: true } as ProviderStreamItem;
    }
  } as unknown as BaseProvider;
}

// --- createTimelineToolBridge (direct unit tests) ----------------------------

describe("createTimelineToolBridge", () => {
  it("add_text_clip creates an overlay track and a text clip", async () => {
    const bridge = createTimelineToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    const result = (await byName["ui_timeline_add_text_clip"].execute({
      text: "Hello"
    })) as { ok: boolean; clip: { id: string; mediaType: string; trackId: string } };

    expect(result.ok).toBe(true);
    expect(result.clip.mediaType).toBe("text");

    const final = bridge.finalState();
    expect(final.tracks).toHaveLength(1);
    expect(final.tracks[0].type).toBe("overlay");
    expect(final.clips).toHaveLength(1);
    expect(final.clips[0].trackId).toBe(final.tracks[0].id);
  });

  it("split at the playhead yields two clips summing to the original duration", async () => {
    const bridge = createTimelineToolBridge({
      tracks: [{ type: "video" }],
      clips: [
        {
          name: "clip",
          trackIndex: 0,
          mediaType: "video",
          startMs: 0,
          durationMs: 4000
        }
      ]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_timeline_seek"].execute({ timeMs: 1500 });
    const result = (await byName["ui_timeline_split_clip"].execute({
      target: "clip"
    })) as {
      ok: boolean;
      clips: [{ durationMs: number }, { durationMs: number }];
    };

    expect(result.ok).toBe(true);
    const [left, right] = result.clips;
    expect(left.durationMs).toBe(1500);
    expect(right.durationMs).toBe(2500);
    expect(left.durationMs + right.durationMs).toBe(4000);

    const final = bridge.finalState();
    expect(final.clips).toHaveLength(2);
  });

  it("animate_clip throws on an invalid preset", async () => {
    const bridge = createTimelineToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_timeline_add_text_clip"].execute({ text: "Hello" });

    await expect(
      byName["ui_timeline_animate_clip"].execute({
        target: "Hello",
        animations: [{ role: "in", preset: "does-not-exist" }]
      })
    ).rejects.toThrow(/Unknown animation preset/);
  });

  it("animate_clip throws when a preset does not support the requested role", async () => {
    const bridge = createTimelineToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_timeline_add_text_clip"].execute({ text: "Hello" });

    // "pulse" only supports the "emphasis" role.
    await expect(
      byName["ui_timeline_animate_clip"].execute({
        target: "Hello",
        animations: [{ role: "in", preset: "pulse" }]
      })
    ).rejects.toThrow(/does not support role/);
  });

  it("set_clip_binding errors on an imported (non-generated) clip", async () => {
    const bridge = createTimelineToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_timeline_add_text_clip"].execute({ text: "Hello" });

    await expect(
      byName["ui_timeline_set_clip_binding"].execute({
        target: "Hello",
        prompt: "a new prompt"
      })
    ).rejects.toThrow(/not a generated clip/);
  });

  it("a sequence seed keeps every track and clip field through an edit", async () => {
    const sequence = {
      fps: 24,
      width: 1280,
      height: 720,
      tracks: [
        makeTrack({
          id: "t_video",
          name: "Video",
          type: "video" as const,
          index: 0,
          effects: [makeTrackEffect("colorCorrection")]
        }),
        makeTrack({
          id: "t_overlay",
          name: "Titles",
          type: "overlay" as const,
          index: 1,
          heightPx: 64
        })
      ],
      clips: [
        makeClip({
          id: "c_shot",
          trackId: "t_video",
          name: "shot",
          startMs: 0,
          durationMs: 6000,
          mediaType: "video" as const,
          sourceType: "generated" as const,
          bindingKind: "text-to-video" as const,
          prompt: "a red fox",
          provider: "fal_ai",
          model: "fal-ai/ltx",
          status: "generated" as const,
          effects: [
            { id: "fx_blur", type: "blur" as const, enabled: true, radius: 4 }
          ],
          animations: [
            {
              id: "a_in",
              role: "in" as const,
              preset: "fade",
              durationMs: 500,
              easing: "easeOut"
            }
          ]
        }),
        makeClip({
          id: "c_title",
          trackId: "t_overlay",
          name: "Title",
          startMs: 1000,
          durationMs: 3000,
          mediaType: "text" as const,
          sourceType: "imported" as const,
          status: "generated" as const,
          textStyle: {
            text: "Title",
            fontSizePx: 96,
            color: "#ffffff",
            align: "center" as const
          }
        })
      ]
    };
    const bridge = createTimelineToolBridge({ sequence });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    const state = (await byName["ui_timeline_get_state"].execute({})) as {
      fps: number;
      width: number;
      height: number;
      tracks: { id: string; name: string }[];
      clips: { id: string; prompt?: string; textStyle?: { fontSizePx: number } }[];
    };
    expect(state.fps).toBe(24);
    expect(state.width).toBe(1280);
    expect(state.height).toBe(720);
    expect(state.tracks.map((t) => t.id)).toEqual(["t_video", "t_overlay"]);
    expect(state.clips[0].prompt).toBe("a red fox");
    expect(state.clips[1].textStyle?.fontSizePx).toBe(96);

    // One edit; a newly minted id must not collide with the seeded ones.
    const added = (await byName["ui_timeline_add_track"].execute({
      type: "audio",
      name: "Music"
    })) as { track: { id: string } };
    expect(sequence.tracks.map((t) => t.id)).not.toContain(added.track.id);

    const final = bridge.finalState();
    expect(final.documentTracks).toHaveLength(3);
    const shot = final.documentClips.find((c) => c.id === "c_shot");
    expect(shot?.effects).toEqual([
      { id: "fx_blur", type: "blur", enabled: true, radius: 4 }
    ]);
    expect(shot?.animations?.[0]).toMatchObject({ preset: "fade", easing: "easeOut" });
    expect(shot?.provider).toBe("fal_ai");
    const colorCorrection = final.documentTracks.find((t) => t.id === "t_video");
    expect(colorCorrection?.effects?.[0].type).toBe("colorCorrection");

    // The seed itself is untouched — the bridge works on its own copy.
    expect(sequence.clips[0].animations).toHaveLength(1);
    expect(sequence.tracks).toHaveLength(2);
  });
});

// --- TIMELINE_TOOL_LOOP_CASES (solved via runToolLoopEval) -------------------

describe("TIMELINE_TOOL_LOOP_CASES", () => {
  it("titles-with-motion: add_text_clip then animate_clip with a fade-in", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_timeline_get_state", args: {} },
      { name: "ui_timeline_add_text_clip", args: { text: "Hello" } },
      { name: "ui_timeline_list_animation_presets", args: {} },
      {
        name: "ui_timeline_animate_clip",
        args: { target: "Hello", animations: [{ role: "in", preset: "fade" }] }
      }
    ];
    const provider = createScriptedProvider(script);
    const report = await runToolLoopEval({
      provider,
      model: "test-model",
      cases: [TIMELINE_TOOL_LOOP_CASES[0]]
    });

    expect(report.cases[0].accepted).toBe(true);
    expect(report.cases[0].score).toBe(1);
  });

  it("generate-and-arrange: add_track, generate_clip, then move_clip", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_timeline_get_state", args: {} },
      { name: "ui_timeline_add_track", args: { type: "video" } },
      {
        name: "ui_timeline_generate_clip",
        args: {
          kind: "text-to-video",
          prompt: "a cat playing piano",
          trackId: "track_1",
          provider: "fal_ai",
          model: "fal-ai/veo3"
        }
      },
      {
        name: "ui_timeline_move_clip",
        args: { target: "selected", startMs: 2000 }
      }
    ];
    const provider = createScriptedProvider(script);
    const report = await runToolLoopEval({
      provider,
      model: "test-model",
      cases: [TIMELINE_TOOL_LOOP_CASES[1]]
    });

    expect(report.cases[0].accepted).toBe(true);
    expect(report.cases[0].score).toBe(1);
  });

  it("keyframed-slide: animate_clip with custom curves instead of a preset", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_timeline_get_state", args: {} },
      { name: "ui_timeline_add_text_clip", args: { text: "Launch" } },
      { name: "ui_timeline_list_animation_presets", args: {} },
      {
        name: "ui_timeline_animate_clip",
        args: {
          target: "Launch",
          animations: [
            {
              role: "in",
              preset: "custom",
              durationMs: 800,
              curves: [
                {
                  property: "offsetY",
                  keyframes: [
                    { t: 0, value: 120 },
                    { t: 1, value: 0 }
                  ]
                }
              ]
            }
          ]
        }
      }
    ];
    const provider = createScriptedProvider(script);
    const report = await runToolLoopEval({
      provider,
      model: "test-model",
      cases: [TIMELINE_TOOL_LOOP_CASES[3]]
    });

    expect(report.cases[0].success).toBe(true);
    expect(report.cases[0].score).toBe(1);
  });

  it("keyframed-slide: a preset entrance does not satisfy the case", async () => {
    // The predicate reads the stored curves, so an ordinary slide-in — the
    // shape a model reaches for first — must fail it.
    const provider = createScriptedProvider([
      { name: "ui_timeline_add_text_clip", args: { text: "Launch" } },
      {
        name: "ui_timeline_animate_clip",
        args: {
          target: "Launch",
          animations: [{ role: "in", preset: "slide", durationMs: 800 }]
        }
      }
    ]);
    const report = await runToolLoopEval({
      provider,
      model: "test-model",
      cases: [TIMELINE_TOOL_LOOP_CASES[3]]
    });

    expect(report.cases[0].success).toBe(false);
    expect(report.cases[0].criticalFailures).toBeGreaterThan(0);
  });

  it("cut-and-trim: split_clip by name then delete_clip the second half", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_timeline_get_state", args: {} },
      {
        name: "ui_timeline_split_clip",
        args: { target: "shot", atMs: 3000 }
      },
      // The bridge assigns deterministic ids: the pre-seeded clip is clip_1,
      // so the split's left/right halves become clip_2 (kept, "shot") and
      // clip_3 (the second half, deleted here).
      { name: "ui_timeline_delete_clip", args: { target: "clip_3" } }
    ];
    const provider = createScriptedProvider(script);
    const report = await runToolLoopEval({
      provider,
      model: "test-model",
      cases: [TIMELINE_TOOL_LOOP_CASES[2]]
    });

    expect(report.cases[0].accepted).toBe(true);
    expect(report.cases[0].score).toBe(1);
  });
});

// --- motion predicates (hand-built final states) ------------------------------

/**
 * The shipped predicate for a case, so a test grades the state the eval grades
 * — not a copy of the rule that can drift from it.
 */
function predicateOf(
  caseId: string,
  name: string
): (state: TimelineBridgeFinalState) => boolean {
  const found = TIMELINE_TOOL_LOOP_CASES.find((c) => c.id === caseId);
  if (!found) throw new Error(`no case "${caseId}"`);
  const predicate = found.expect.finalState?.find((p) => p.name === name);
  if (!predicate) throw new Error(`case "${caseId}" has no check "${name}"`);
  return predicate.test;
}

/** A final state built from tracks and clips, with the reduced view derived. */
function stateOf(
  tracks: TimelineTrack[],
  clips: TimelineClip[],
  extra: { markers?: TimelineMarker[]; toolLog?: string[] } = {}
): TimelineBridgeFinalState {
  return {
    fps: 30,
    width: 1080,
    height: 1920,
    durationMs: clips.reduce((m, c) => Math.max(m, c.startMs + c.durationMs), 0),
    playheadMs: 0,
    tracks: tracks.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      index: t.index
    })),
    clips: clips.map((c) => ({
      id: c.id,
      name: c.name,
      trackId: c.trackId,
      mediaType: c.mediaType,
      startMs: c.startMs,
      durationMs: c.durationMs,
      animations: (c.animations ?? []).map((a) => ({
        role: a.role,
        preset: a.preset
      }))
    })),
    documentTracks: tracks,
    documentClips: clips,
    markers: extra.markers ?? [],
    toolLog: extra.toolLog ?? []
  };
}

const overlay = makeTrack({ id: "t_text", type: "overlay", index: 0 });
const scrimTrack = makeTrack({ id: "t_scrim", type: "overlay", index: 1 });
const pictureTrack = makeTrack({ id: "t_pic", type: "video", index: 2 });

function textClip(
  over: Partial<TimelineClip> & { text: string }
): TimelineClip {
  const { text, ...rest } = over;
  return makeClip({
    trackId: overlay.id,
    mediaType: "text",
    textStyle: { text },
    durationMs: 2500,
    ...rest
  });
}

describe("the timeline eval system prompt", () => {
  it("embeds the shipped motion-graphics skill", () => {
    // The suite scores motion the skill teaches, so the model is given that
    // document rather than a paraphrase of it. A build that cannot find the
    // skill would drop it silently.
    const prompt = TIMELINE_TOOL_LOOP_CASES[0].systemPrompt ?? "";
    expect(prompt).toContain("# Motion Graphics");
    expect(prompt).toContain("preview_timeline_frame");
  });
});

describe("motion eval predicates", () => {
  it("kinetic-title-staggered: a stagger that fits passes, one that overruns fails", () => {
    const test = predicateOf("kinetic-title-staggered", "staggerSpanFitsTheCard");
    // "MAKE IT MOVE" is three words: 400 + 300 x 2 = 1000ms inside a 2500ms card.
    const fits = textClip({
      id: "c_fits",
      text: "MAKE IT MOVE",
      animations: [
        {
          id: "a1",
          role: "in",
          preset: "pop",
          durationMs: 400,
          stagger: { unit: "word", offsetMs: 300 }
        }
      ]
    });
    // Same three words at 1200ms apart: the last word starts at 2400 and is
    // still moving when the card leaves.
    const overruns = textClip({
      id: "c_over",
      text: "MAKE IT MOVE",
      animations: [
        {
          id: "a1",
          role: "in",
          preset: "pop",
          durationMs: 400,
          stagger: { unit: "word", offsetMs: 1200 }
        }
      ]
    });
    expect(test(stateOf([overlay], [fits]))).toBe(true);
    expect(test(stateOf([overlay], [overruns]))).toBe(false);
  });

  it("kinetic-title-staggered: an unstaggered entrance is not a stagger", () => {
    const test = predicateOf("kinetic-title-staggered", "staggerSpanFitsTheCard");
    const block = textClip({
      id: "c_block",
      text: "MAKE IT MOVE",
      animations: [{ id: "a1", role: "in", preset: "pop", durationMs: 400 }]
    });
    expect(test(stateOf([overlay], [block]))).toBe(false);
  });

  it("lower-third-layered: the scrim must be under the text and inside the shot", () => {
    const test = predicateOf(
      "lower-third-layered",
      "scrimBehindTextInsideTheShot"
    );
    const host = makeClip({
      id: "c_host",
      trackId: pictureTrack.id,
      mediaType: "video",
      name: "Host",
      startMs: 0,
      durationMs: 6000
    });
    const name = textClip({
      id: "c_name",
      text: "Maya Chen",
      startMs: 1000,
      durationMs: 3000
    });
    const scrim = makeClip({
      id: "c_scrim",
      trackId: scrimTrack.id,
      mediaType: "shape",
      startMs: 1000,
      durationMs: 3000
    });
    const tracks = [overlay, scrimTrack, pictureTrack];
    expect(test(stateOf(tracks, [host, name, scrim]))).toBe(true);

    // Same two clips with the scrim on the front-most track: it covers the
    // words instead of backing them.
    const covering = { ...scrim, trackId: overlay.id };
    const behindText = { ...name, trackId: scrimTrack.id };
    expect(test(stateOf(tracks, [host, behindText, covering]))).toBe(false);

    // Right layering, wrong window: the plate outlives the shot.
    const overrunning = { ...name, startMs: 5000, durationMs: 3000 };
    expect(test(stateOf(tracks, [host, overrunning, scrim]))).toBe(false);
  });

  it("entrance-decelerates: ease-out and spring pass, easeIn and linear fail", () => {
    const test = predicateOf("entrance-decelerates", "everyEntranceDecelerates");
    const withEasing = (id: string, easing?: string): TimelineClip =>
      textClip({
        id,
        text: "Chapter",
        animations: [
          easing === undefined
            ? { id: `${id}_a`, role: "in", preset: "fade" }
            : { id: `${id}_a`, role: "in", preset: "fade", easing }
        ]
      });
    expect(
      test(
        stateOf(
          [overlay],
          [withEasing("c1", "easeOutBack"), withEasing("c2", "spring(180,12,1)")]
        )
      )
    ).toBe(true);
    // No easing at all: `fade` pins easeOut, and the `in` role defaults to it.
    expect(test(stateOf([overlay], [withEasing("c1"), withEasing("c2")]))).toBe(
      true
    );
    expect(
      test(stateOf([overlay], [withEasing("c1", "easeOut"), withEasing("c2", "easeIn")]))
    ).toBe(false);
    expect(
      test(stateOf([overlay], [withEasing("c1", "linear"), withEasing("c2", "easeOut")]))
    ).toBe(false);
  });

  it("beat-cut: boundaries within 60ms of an onset pass, a drifted cut fails", () => {
    const test = predicateOf("beat-cut", "everyBoundaryOnAnOnset");
    const shots = (bounds: [number, number][]): TimelineClip[] =>
      bounds.map(([startMs, endMs], i) =>
        makeClip({
          id: `c${i}`,
          trackId: pictureTrack.id,
          mediaType: "video",
          name: String.fromCharCode(65 + i),
          startMs,
          durationMs: endMs - startMs
        })
      );
    expect(
      test(
        stateOf(
          [pictureTrack],
          shots([
            [0, 2000],
            [2000, 4040],
            [4040, 6000]
          ])
        )
      )
    ).toBe(true);
    expect(
      test(
        stateOf(
          [pictureTrack],
          shots([
            [0, 2180],
            [2180, 4260],
            [4260, 6000]
          ])
        )
      )
    ).toBe(false);
  });

  it("looked-before-done: a preview after the last edit passes, one before it fails", () => {
    const test = predicateOf("looked-before-done", "previewedAfterTheLastEdit");
    const card = textClip({ id: "c_end", text: "END", startMs: 4000 });
    expect(
      test(
        stateOf([overlay], [card], {
          toolLog: [
            "ui_timeline_add_text_clip",
            "ui_timeline_animate_clip",
            "preview_timeline_frame"
          ]
        })
      )
    ).toBe(true);
    // Looked, then kept editing: the frame it saw is not the one it shipped.
    expect(
      test(
        stateOf([overlay], [card], {
          toolLog: [
            "ui_timeline_add_text_clip",
            "preview_timeline_frame",
            "ui_timeline_animate_clip"
          ]
        })
      )
    ).toBe(false);
    // Reads and selections after the preview are not edits.
    expect(
      test(
        stateOf([overlay], [card], {
          toolLog: [
            "ui_timeline_add_text_clip",
            "preview_timeline_frame",
            "ui_timeline_get_state"
          ]
        })
      )
    ).toBe(true);
    expect(test(stateOf([overlay], [card], { toolLog: [] }))).toBe(false);
  });
});

describe("preview_timeline_frame (eval surface)", () => {
  it("reports the layers at a timecode, top of the stack first", async () => {
    const bridge = createTimelineToolBridge({ preview: true });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    await byName["ui_timeline_add_text_clip"].execute({
      text: "END",
      startMs: 0,
      durationMs: 2000
    });

    const result = (await byName["preview_timeline_frame"].execute({
      times_ms: [1000]
    })) as {
      frames: { time_ms: number; layers: { text?: string; z_index: number }[] }[];
    };

    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].layers[0].text).toBe("END");
    expect(bridge.finalState().toolLog).toEqual([
      "ui_timeline_add_text_clip",
      "preview_timeline_frame"
    ]);
  });

  it("is absent unless the case asks for it", () => {
    // `edit_timeline` builds this bridge and reads its ops off the
    // `ui_timeline_` prefix, so the default surface must not carry it.
    const names = createTimelineToolBridge().tools.map((t) => t.name);
    expect(names).not.toContain("preview_timeline_frame");
    expect(names.every((name) => name.startsWith("ui_timeline_"))).toBe(true);
  });
});
