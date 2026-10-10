/**
 * Regression tests for the fourth timeline audit: snap trims, lock checks on
 * every clip-writing op, linked partners on speed, slip and transition edits,
 * and MIDI note caps.
 */

import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "../src/defaults.js";
import { applyTimelineOp, applyTimelineTrackOp } from "../src/ops/apply.js";
import type { TimelineOp } from "../src/ops/op.js";
import type { TimelineOpContext, TimelineOpState } from "../src/ops/types.js";
import type { TimelineClip, TimelineTrack } from "../src/types.js";

function context(
  overrides: Partial<TimelineOpContext> = {}
): TimelineOpContext {
  let n = 0;
  return { newId: (kind) => `${kind}_${++n}`, ...overrides };
}

function state(
  clips: TimelineClip[],
  tracks: TimelineTrack[] = [
    makeTrack({ id: "track_v", type: "video", name: "Video", index: 0 }),
    makeTrack({ id: "track_a", type: "audio", name: "Audio", index: 1 })
  ],
  extra: Partial<TimelineOpState> = {}
): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks,
    clips,
    markers: [],
    playheadMs: 0,
    selectedClipIds: [],
    ...extra
  };
}

function video(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return makeClip({
    id: "clip_v",
    trackId: "track_v",
    name: "Shot",
    startMs: 0,
    durationMs: 2000,
    inPointMs: 0,
    outPointMs: 2000,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "asset_v",
    ...overrides
  });
}

function audio(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return makeClip({
    id: "clip_a",
    trackId: "track_a",
    name: "Sound",
    startMs: 0,
    durationMs: 2000,
    inPointMs: 0,
    outPointMs: 2000,
    mediaType: "audio",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "asset_a",
    ...overrides
  });
}

async function run(
  s: TimelineOpState,
  op: TimelineOp,
  ctx: TimelineOpContext = context()
) {
  return applyTimelineOp(s, op, ctx);
}

function clipOf(s: TimelineOpState, id: string): TimelineClip {
  const clip = s.clips.find((c) => c.id === id);
  if (!clip) {
    throw new Error(`no clip ${id}`);
  }
  return clip;
}

describe("snap_to_beats trim moves the edge it snaps (M1)", () => {
  it("trims the head when the start snaps", async () => {
    const outcome = await run(
      state([
        audio({ startMs: 970, durationMs: 2000, inPointMs: 500, outPointMs: 2500 })
      ]),
      { op: "snap_to_beats", bpm: 60, mode: "start", action: "trim" }
    );
    expect(outcome.error).toBeUndefined();
    expect(clipOf(outcome.state, "clip_a")).toMatchObject({
      startMs: 1000,
      durationMs: 1970,
      inPointMs: 530,
      outPointMs: 2500
    });
  });
});

describe("trim_clip with an in-point alone slips the link group (O5)", () => {
  it("moves both partners' windows and keeps out = in + duration", async () => {
    const outcome = await run(
      state([
        video({ outPointMs: 2000, linkId: "link" }),
        audio({ outPointMs: 2000, linkId: "link" })
      ]),
      { op: "trim_clip", target: "clip_v", inPointMs: 500 }
    );
    expect(outcome.error).toBeUndefined();
    for (const id of ["clip_v", "clip_a"]) {
      expect(clipOf(outcome.state, id)).toMatchObject({
        startMs: 0,
        durationMs: 2000,
        inPointMs: 500,
        outPointMs: 2500
      });
    }
  });

  it("refuses a slip of a locked partner", async () => {
    const outcome = await run(
      state([
        video({ linkId: "link" }),
        audio({ linkId: "link", locked: true })
      ]),
      { op: "trim_clip", target: "clip_v", inPointMs: 500 }
    );
    expect(outcome.error).toMatch(/locked/);
  });
});

describe("delete_track respects locks (O2)", () => {
  it("refuses a locked track", async () => {
    const outcome = applyTimelineTrackOp(
      state(
        [],
        [makeTrack({ id: "track_v", type: "video", name: "Video", index: 0, locked: true })]
      ),
      { op: "delete_track", target: "track_v" },
      context()
    );
    expect(outcome.error).toMatch(/locked/);
    expect(outcome.state.tracks).toHaveLength(1);
  });

  it("refuses to delete a locked clip with its track", async () => {
    const outcome = applyTimelineTrackOp(
      state([video({ locked: true })]),
      { op: "delete_track", target: "track_v", deleteClips: true },
      context()
    );
    expect(outcome.error).toMatch(/locked/);
    expect(outcome.state.clips).toHaveLength(1);
  });
});

describe("apply_transition_at_cut (O3)", () => {
  const OUT = "0a0a0a0a0a0a0000000000000000000a";
  const IN = "0b0b0b0b0b0b0000000000000000000b";
  const cut = (overrides: Partial<TimelineClip> = {}) =>
    state([
      video({ id: OUT, name: "Out", startMs: 0, durationMs: 2000, outPointMs: 2000, ...overrides }),
      video({ id: IN, name: "In", startMs: 2000, durationMs: 2000 })
    ]);
  const resolveAsset: TimelineOpContext["resolveAsset"] = async () => ({
    id: "asset_v",
    name: "shot.mp4",
    contentType: "video/mp4",
    durationMs: 10000
  });

  it("accepts 12-character id prefixes", async () => {
    const outcome = await run(
      cut(),
      {
        op: "apply_transition_at_cut",
        outgoingClipId: OUT.slice(0, 12),
        incomingClipId: IN.slice(0, 12),
        durationMs: 500
      },
      context({ resolveAsset })
    );
    expect(outcome.error).toBeUndefined();
    expect(clipOf(outcome.state, OUT).durationMs).toBe(2500);
    expect(clipOf(outcome.state, IN).transitionIn?.durationMs).toBe(500);
  });

  it("refuses to grow a locked outgoing clip", async () => {
    const outcome = await run(
      cut({ locked: true }),
      { op: "apply_transition_at_cut", outgoingClipId: OUT, incomingClipId: IN, durationMs: 500 },
      context({ resolveAsset })
    );
    expect(outcome.error).toMatch(/locked/);
  });

  it("grows the outgoing clip's linked partner with it", async () => {
    const s = cut({ linkId: "link" });
    s.clips.push(audio({ linkId: "link", durationMs: 2000, outPointMs: 2000 }));
    const outcome = await run(
      s,
      { op: "apply_transition_at_cut", outgoingClipId: OUT, incomingClipId: IN, durationMs: 500 },
      context({ resolveAsset })
    );
    expect(outcome.error).toBeUndefined();
    expect(clipOf(outcome.state, OUT).durationMs).toBe(2500);
    expect(clipOf(outcome.state, "clip_a").durationMs).toBe(2500);
  });

  it("does not grow the outgoing clip past its source", async () => {
    const outcome = await run(
      cut({ outPointMs: 2000 }),
      { op: "apply_transition_at_cut", outgoingClipId: OUT, incomingClipId: IN, durationMs: 500 },
      context({
        resolveAsset: async () => ({
          id: "asset_v",
          name: "shot.mp4",
          contentType: "video/mp4",
          durationMs: 2000
        })
      })
    );
    expect(outcome.error).toBeUndefined();
    expect(clipOf(outcome.state, OUT)).toMatchObject({ durationMs: 2000, outPointMs: 2000 });
  });
});

describe("set_clip_params speedMultiplier retimes the link group (O4)", () => {
  it("keeps the source window and scales duration on both partners", async () => {
    const outcome = await run(
      state([
        video({ linkId: "link", durationMs: 2000, outPointMs: 2000 }),
        audio({ linkId: "link", durationMs: 2000, outPointMs: 2000 })
      ]),
      { op: "set_clip_params", target: "clip_v", patch: { speedMultiplier: 2 } }
    );
    expect(outcome.error).toBeUndefined();
    for (const id of ["clip_v", "clip_a"]) {
      expect(clipOf(outcome.state, id)).toMatchObject({
        speedMultiplier: 2,
        durationMs: 1000,
        inPointMs: 0,
        outPointMs: 2000
      });
    }
  });

  it("refuses a locked clip", async () => {
    const outcome = await run(state([video({ locked: true })]), {
      op: "set_clip_params",
      target: "clip_v",
      patch: { speedMultiplier: 2 }
    });
    expect(outcome.error).toMatch(/locked/);
  });

  it("refuses a time-remapped clip", async () => {
    const outcome = await run(
      state([
        video({
          timeRemap: {
            keyframes: [
              { t: 0, sourceMs: 0 },
              { t: 1, sourceMs: 2000 }
            ]
          }
        } as Partial<TimelineClip>)
      ]),
      { op: "set_clip_params", target: "clip_v", patch: { speedMultiplier: 2 } }
    );
    expect(outcome.error).toMatch(/remap/i);
  });
});

describe("set_transition and set_time_remap respect locks (O8)", () => {
  it("refuses set_transition on a locked clip", async () => {
    const outcome = await run(state([video({ locked: true })]), {
      op: "set_transition",
      target: "clip_v",
      transition: null
    });
    expect(outcome.error).toMatch(/locked/);
  });

  it("refuses set_time_remap on a locked clip", async () => {
    const outcome = await run(state([video({ locked: true })]), {
      op: "set_time_remap",
      target: "clip_v",
      timeRemap: null
    });
    expect(outcome.error).toMatch(/locked/);
  });
});

describe("MIDI ops respect locks and the note cap (M3)", () => {
  const midiTrack = (locked = false) =>
    makeTrack({ id: "track_m", type: "midi", name: "Keys", index: 0, locked });
  const midiClip = (overrides: Partial<TimelineClip> = {}) =>
    makeClip({
      id: "clip_m",
      trackId: "track_m",
      name: "Phrase",
      startMs: 0,
      durationMs: 2000,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      notes: [{ id: "n1", pitch: 60, velocity: 100, startTick: 0, durationTick: 480 }],
      ...overrides
    });
  const ops: TimelineOp[] = [
    { op: "set_notes", clip: "clip_m", notes: [] },
    { op: "transpose_clip", clip: "clip_m", semitones: 2 },
    { op: "quantize_notes", clip: "clip_m", division: "1/16" },
    { op: "scale_velocity", clip: "clip_m", factor: 0.5 }
  ] as TimelineOp[];

  for (const op of ops) {
    it(`${op.op} refuses a locked clip`, async () => {
      const outcome = await run(
        state([midiClip({ locked: true })], [midiTrack()]),
        op
      );
      expect(outcome.error).toMatch(/locked/);
    });
  }

  it("set_track_instrument refuses a locked track", async () => {
    const outcome = await run(state([], [midiTrack(true)]), {
      op: "set_track_instrument",
      track: "track_m",
      instrument: { preset: "saw-lead" }
    } as TimelineOp);
    expect(outcome.error).toMatch(/locked/);
  });

  it("set_notes refuses more notes than a clip can store", async () => {
    const notes = Array.from({ length: 4097 }, (_, i) => ({
      pitch: 60,
      start_tick: i * 10,
      duration_tick: 10
    }));
    const outcome = await run(state([midiClip()], [midiTrack()]), {
      op: "set_notes",
      clip: "clip_m",
      notes
    } as TimelineOp);
    expect(outcome.error).toMatch(/at most 4096/);
  });
});
