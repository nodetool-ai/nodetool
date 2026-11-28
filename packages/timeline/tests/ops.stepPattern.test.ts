/**
 * Step Sequencer agent ops (SQ20–SQ22, SQ45, SQ47–SQ54).
 *
 * Tests every op through `applyTimelineOp` and `timelineOpFromToolArgs`.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  findInstrumentPreset,
  makeClip,
  makeTrack,
  midiClipNoteEvents,
  midiClipVoiceEvents,
  patternFromText,
  renderInstrumentEvents,
  renderMidiClip,
  type StepPattern,
  type TimelineClip,
  type TimelineTrack
} from "../src/index.js";
import {
  applyTimelineOp,
  timelineOpFromToolArgs,
  type TimelineOpState
} from "../src/ops/index.js";
import { directContext } from "../src/testing/ops.js";

const BAR_MS = 2000; // 120 BPM, 4/4

function dr1Track(id = "t_drums", name = "Drums"): TimelineTrack {
  return makeTrack({
    id,
    name,
    type: "midi",
    index: 0,
    instrument: findInstrumentPreset("dr1-tr-void")!.instrument
  });
}

function synthTrack(id = "t_synth", name = "Synth"): TimelineTrack {
  return makeTrack({
    id,
    name,
    type: "midi",
    index: 1,
    instrument: DEFAULT_MIDI_INSTRUMENT
  });
}

function makeState(
  tracks: TimelineTrack[] = [dr1Track(), synthTrack()],
  clips: TimelineClip[] = []
): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tempo: { ...DEFAULT_TEMPO },
    tracks,
    clips,
    markers: [],
    mediaTracks: [],
    playheadMs: 0,
    selectedClipIds: []
  };
}

function patClip(
  id: string,
  pattern: StepPattern,
  over: Partial<TimelineClip> = {}
): TimelineClip {
  return makeClip({
    id,
    trackId: "t_drums",
    name: "Beat",
    startMs: 0,
    durationMs: BAR_MS,
    mediaType: "midi",
    sourceType: "imported",
    status: "generated",
    pattern,
    ...over
  });
}

describe("SQ48–SQ54: Step Sequencer agent ops", () => {
  it("SQ48: get_pattern returns settings, rows, text, and 16 velocity values per row; get_state summarizes pattern", async () => {
    const pat = patternFromText(
      [
        "Kick: x... x... x... x...",
        "Snare: .... X... .... o...",
        "Closed Hat: x.x. x.x. x.x. x.x.",
        "Clap: .... x... .... x..."
      ].join("\n"),
      { name: "Four Floor", seed: 42 }
    );
    const state = makeState([dr1Track()], [patClip("c1", pat)]);
    const ctx = directContext(state);

    const read = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("get_pattern" as never, {
        clipId: "c1",
        modes: ["velocity"]
      }),
      ctx
    );
    expect(read.error).toBeUndefined();
    const res = read.result as {
      ok: boolean;
      text: string;
      settings: Record<string, unknown>;
      rows: Array<{
        id: string;
        name: string;
        values?: Record<string, unknown[]>;
      }>;
    };
    expect(res.ok).toBe(true);
    expect(res.rows).toHaveLength(4);
    expect(res.text).toContain("Kick:");
    expect(res.settings.lengthSteps).toBe(16);
    for (const row of res.rows) {
      expect(row.values?.velocity).toHaveLength(16);
    }
    expect(res.rows[1]!.values!.velocity![4]).toBe(127);
    expect(res.rows[1]!.values!.velocity![12]).toBe(50);

    const st = await applyTimelineOp(state, { op: "get_state" }, ctx);
    expect(st.error).toBeUndefined();
    const clipOut = (st.result.clips as Array<Record<string, unknown>>)[0]!;
    expect(clipOut.pattern).toBe("4 rows x 16 @1/16");
    expect(clipOut.patternName).toBe("Four Floor");
  });

  it("SQ49 + SQ42: create_pattern_region defaults to 1 bar, kit rows on DR-1, or text", async () => {
    const state = makeState([dr1Track(), synthTrack()]);
    const ctx = directContext(state);

    // Default DR-1 creation gets kit pad rows.
    const r1 = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("create_pattern_region" as never, {
        trackId: "Drums",
        atBar: 1
      }),
      ctx
    );
    expect(r1.error).toBeUndefined();
    const c1 = r1.state.clips[0]!;
    expect(c1.durationMs).toBe(BAR_MS);
    expect(c1.notes).toBeUndefined();
    expect(c1.pattern).toBeDefined();
    expect(c1.pattern!.rows.length).toBeGreaterThanOrEqual(4);
    expect(c1.pattern!.rows[0]!.assignment).toEqual({ type: "kit", pad: 0 });
    expect(c1.pattern!.rows[0]!.name).toBe("Kick");

    // Creation with text and 2 bars at bar 2.
    const r2 = await applyTimelineOp(
      r1.state,
      timelineOpFromToolArgs("create_pattern_region" as never, {
        trackId: "Drums",
        atBar: 2,
        bars: 2,
        text: "Kick: x... x... x... x...\nSnare: .... x... .... x..."
      }),
      directContext(r1.state)
    );
    expect(r2.error).toBeUndefined();
    const c2 = r2.state.clips[1]!;
    expect(c2.startMs).toBe(BAR_MS);
    expect(c2.durationMs).toBe(BAR_MS * 2);
    expect(c2.pattern!.rows).toHaveLength(2);
  });

  it("SQ20: convert_pattern_to_midi renders identical audio samples before and after (ties, repeats, chance, swing)", async () => {
    const pat = patternFromText("Kick: x-.. x... x... x...", { seed: 7 });
    pat.swing = 45;
    pat.swingDivision = "1/16";
    pat.rows[0]!.steps[4] = { on: true, repeat: 3, distribution: 25, velocity: 110 };
    pat.rows[0]!.steps[8] = { on: true, chance: 50, velocity: 95 };
    const clip = patClip("c1", pat, { velocityOffset: -10 });
    const inst = dr1Track().instrument!;
    const state = makeState([dr1Track()], [clip]);

    const pcmBefore = renderMidiClip({
      clip,
      instrument: inst,
      bpm: 120,
      sampleRate: 22050
    });

    const out = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("convert_pattern_to_midi" as never, {
        clipIds: ["c1"]
      }),
      directContext(state)
    );
    expect(out.error).toBeUndefined();
    const converted = out.state.clips[0]!;
    expect(converted.pattern).toBeUndefined();
    expect(converted.notes!.length).toBeGreaterThan(0);
    expect(converted.velocityOffset).toBe(-10);

    const pcmAfter = renderMidiClip({
      clip: converted,
      instrument: inst,
      bpm: 120,
      sampleRate: 22050
    });
    expect(pcmAfter.length).toBe(pcmBefore.length);
    for (let i = 0; i < pcmBefore.length; i += 1) {
      expect(pcmAfter[i]).toBe(pcmBefore[i]);
    }
  });

  it("SQ21: convert_midi_to_pattern round-trips four-on-the-floor kick and counts drops/collisions", async () => {
    const midiClip = makeClip({
      id: "m1",
      trackId: "t_drums",
      name: "Kick",
      startMs: 0,
      durationMs: BAR_MS,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      notes: [
        { id: "n1", pitch: 36, velocity: 100, startTick: 0, durationTick: 240 },
        { id: "n2", pitch: 36, velocity: 100, startTick: 960, durationTick: 240 },
        { id: "n3", pitch: 36, velocity: 100, startTick: 1920, durationTick: 240 },
        { id: "n4", pitch: 36, velocity: 100, startTick: 2880, durationTick: 240 }
      ]
    });
    const state = makeState([dr1Track()], [midiClip]);
    const toPat = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("convert_midi_to_pattern" as never, {
        clipIds: ["m1"],
        stepRate: "1/16"
      }),
      directContext(state)
    );
    expect(toPat.error).toBeUndefined();
    const asPat = toPat.state.clips[0]!;
    expect(asPat.notes).toBeUndefined();
    expect(asPat.pattern!.rows).toHaveLength(1);
    const onSteps = asPat.pattern!.rows[0]!.steps
      .map((s, i) => (s.on ? i : -1))
      .filter((i) => i >= 0);
    expect(onSteps).toEqual([0, 4, 8, 12]);

    const back = await applyTimelineOp(
      toPat.state,
      timelineOpFromToolArgs("convert_pattern_to_midi" as never, {
        clipIds: ["m1"]
      }),
      directContext(toPat.state)
    );
    expect(back.error).toBeUndefined();
    const origPairs = midiClip.notes!.map((n) => [n.pitch, n.startTick, n.durationTick, n.velocity]);
    const backPairs = back.state.clips[0]!.notes!.map((n) => [
      n.pitch,
      n.startTick,
      n.durationTick,
      n.velocity
    ]);
    expect(backPairs).toEqual(origPairs);
  });

  it("SQ22: separate_pattern_rows splits 4 rows into 4 tracks named after pads with identical mix", async () => {
    const pat = patternFromText(
      [
        "Kick: x... x... x... x...",
        "Snare: .... x... .... x...",
        "Clap: .... .... .... x...",
        "Closed Hat: x.x. x.x. x.x. x.x."
      ].join("\n"),
      { seed: 11, instrument: dr1Track().instrument }
    );
    pat.rows[3]!.steps[2] = { on: true, chance: 50 };
    const clip = patClip("c1", pat);
    const state = makeState([dr1Track()], [clip]);
    const inst = dr1Track().instrument!;
    const beforeMix = renderMidiClip({
      clip,
      instrument: inst,
      bpm: 120,
      sampleRate: 11025
    });

    const out = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("separate_pattern_rows" as never, { clipId: "c1" }),
      directContext(state)
    );
    expect(out.error).toBeUndefined();
    expect(out.state.tracks).toHaveLength(5); // original + 4 new tracks
    expect(out.state.clips).toHaveLength(4);
    expect(out.state.clips.every((c) => c.pattern?.rows.length === 1)).toBe(true);
    expect(out.state.tracks.slice(1).map((t) => t.name)).toEqual([
      "Kick",
      "Snare",
      "Clap",
      "Closed hat"
    ]);

    const beforeEvents = midiClipNoteEvents(clip, 120, Number.NEGATIVE_INFINITY, 0, inst)
      .filter((e) => e.on)
      .map((e) => `${e.timeMs}:${e.pitch}:${e.velocity}`)
      .sort();
    const afterEvents = out.state.clips
      .flatMap((c) => midiClipNoteEvents(c, 120, Number.NEGATIVE_INFINITY, 0, inst).filter((e) => e.on))
      .map((e) => `${e.timeMs}:${e.pitch}:${e.velocity}`)
      .sort();
    expect(afterEvents).toEqual(beforeEvents);

    // Combined voice events from all 4 separated clips render bit-for-bit identically.
    const combinedEvents = out.state.clips.flatMap((c) =>
      midiClipVoiceEvents(
        { ...c, pattern: c.pattern },
        120,
        11025,
        0,
        inst
      )
    );
    const combinedPcm = renderInstrumentEvents(
      combinedEvents,
      beforeMix.length,
      inst,
      11025
    );
    for (let i = 0; i < beforeMix.length; i += 1) {
      expect(combinedPcm[i]).toBeCloseTo(beforeMix[i]!, 5);
    }

    // F35: non-default DR-1 baseNote (48) separates with pad pitch 48, not fallback 36.
    const dr48 = { ...inst, baseNote: 48 } as typeof inst;
    const t48 = makeTrack({
      ...dr1Track(),
      instrument: dr48
    });
    const pat48 = patternFromText("Kick: x... .... .... ....", { seed: 3, instrument: dr48 });
    const c48 = patClip("c48", pat48);
    const s48 = makeState([t48], [c48]);
    const sep48 = await applyTimelineOp(
      s48,
      timelineOpFromToolArgs("separate_pattern_rows" as never, { clipId: "c48" }),
      directContext(s48)
    );
    expect(sep48.error).toBeUndefined();
    const ev48 = midiClipNoteEvents(sep48.state.clips[0]!, 120, Number.NEGATIVE_INFINITY, 0, dr48).filter(
      (e) => e.on
    );
    expect(ev48[0]!.pitch).toBe(48);

    // Every separated track renders audible sound on its own too.
    for (const c of out.state.clips) {
      const t = out.state.tracks.find((tr) => tr.id === c.trackId)!;
      const buf = renderMidiClip({
        clip: c,
        instrument: t.instrument!,
        bpm: 120,
        sampleRate: 11025
      });
      expect(buf.some((v) => Math.abs(v) > 0.01)).toBe(true);
    }
  });

  it("SQ50: set_pattern applies SQ2 write-through, lengthSteps repeat, key transpose, and set_pattern_seed", async () => {
    const pat = patternFromText("Kick: x... x... x... x...", { seed: 5 });
    const state = makeState([dr1Track()], [patClip("c1", pat)]);

    const out1 = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("set_pattern" as never, {
        clipId: "c1",
        lengthSteps: 32,
        stepRate: "1/8",
        swing: 60,
        mono: true,
        loopStart: 1,
        loopEnd: 16
      }),
      directContext(state)
    );
    expect(out1.error).toBeUndefined();
    const p1 = out1.state.clips[0]!.pattern!;
    expect(p1.lengthSteps).toBe(32);
    expect(p1.rows[0]!.lengthSteps).toBe(32);
    expect(p1.rows[0]!.steps[16]!.on).toBe(true); // repeated from step 0 (SQ7)
    expect(p1.stepRate).toBe("1/8");
    expect(p1.rows[0]!.stepRate).toBe("1/8");
    expect(p1.rows[0]!.loopStart).toBe(0);
    expect(p1.rows[0]!.loopEnd).toBe(16);

    const outSeed = await applyTimelineOp(
      out1.state,
      timelineOpFromToolArgs("set_pattern_seed" as never, { clipId: "c1" }),
      directContext(out1.state)
    );
    expect(outSeed.error).toBeUndefined();
    expect(typeof outSeed.result.seed).toBe("number");
    expect(outSeed.result.seed).not.toBe(5);
    expect(outSeed.state.clips[0]!.pattern!.seed).toBe(outSeed.result.seed);
  });

  it("SQ51: row ops add, set, remove, move, sort, copy (kick -> snare keeps snare pitch, 129th refused)", async () => {
    const pat = patternFromText("Kick: x... x... x... x...\nSnare: .... .... .... ....", {
      seed: 1
    });
    const state = makeState([dr1Track()], [patClip("c1", pat)]);

    // copy_pattern_row from Kick to Snare keeps Snare pitch (38) while copying rhythm.
    const copied = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("copy_pattern_row" as never, {
        clipId: "c1",
        row: "Kick",
        toRow: "Snare"
      }),
      directContext(state)
    );
    expect(copied.error).toBeUndefined();
    const snare = copied.state.clips[0]!.pattern!.rows[1]!;
    expect(snare.assignment).toEqual({ type: "note", pitch: 38 });
    expect(snare.steps[0]!.on).toBe(true);
    expect(snare.steps[4]!.on).toBe(true);

    // add_pattern_rows with shorthand cc & melodic + sort_pattern_rows by type.
    const added = await applyTimelineOp(
      copied.state,
      timelineOpFromToolArgs("add_pattern_rows" as never, {
        clipId: "c1",
        rows: [
          { cc: 74, name: "Cutoff" },
          { assignment: { type: "melodic", pitch: 60 }, name: "Lead" }
        ]
      }),
      directContext(copied.state)
    );
    expect(added.error).toBeUndefined();
    expect(added.state.clips[0]!.pattern!.rows).toHaveLength(4);

    const sorted = await applyTimelineOp(
      added.state,
      timelineOpFromToolArgs("sort_pattern_rows" as never, {
        clipId: "c1",
        by: "type"
      }),
      directContext(added.state)
    );
    expect(sorted.error).toBeUndefined();
    expect(sorted.state.clips[0]!.pattern!.rows.map((r) => r.assignment.type)).toEqual([
      "note",
      "note",
      "melodic",
      "automation"
    ]);

    // move_pattern_row & remove_pattern_rows unused.
    const moved = await applyTimelineOp(
      sorted.state,
      timelineOpFromToolArgs("move_pattern_row" as never, {
        clipId: "c1",
        row: "Cutoff",
        toIndex: 0
      }),
      directContext(sorted.state)
    );
    expect(moved.error).toBeUndefined();
    expect(moved.state.clips[0]!.pattern!.rows[0]!.name).toBe("Cutoff");

    const pruned = await applyTimelineOp(
      moved.state,
      timelineOpFromToolArgs("remove_pattern_rows" as never, {
        clipId: "c1",
        unused: true
      }),
      directContext(moved.state)
    );
    expect(pruned.error).toBeUndefined();
    expect(pruned.state.clips[0]!.pattern!.rows.map((r) => r.name)).toEqual([
      "Kick",
      "Snare"
    ]);

    // set_pattern_row refuses duplicate subrows.
    const badSub = await applyTimelineOp(
      pruned.state,
      timelineOpFromToolArgs("set_pattern_row" as never, {
        clipId: "c1",
        row: "Kick",
        subrows: ["velocity", "velocity"]
      }),
      directContext(pruned.state)
    );
    expect(badSub.error).toMatch(/duplicate/i);

    // 129th row refused.
    const tooMany = await applyTimelineOp(
      pruned.state,
      timelineOpFromToolArgs("add_pattern_rows" as never, {
        clipId: "c1",
        rows: Array.from({ length: 127 }, (_, i) => ({ pitch: 36 + (i % 48), name: `R${i}` }))
      }),
      directContext(pruned.state)
    );
    expect(tooMany.error).toMatch(/128/);
  });

  it("SQ52: set_steps ramp 20..80 over 1-4 gives 20,40,60,80; set_pattern_text, clear_pattern, copy_steps, repeat_step", async () => {
    const pat = patternFromText("Kick: .... .... .... ....\nSnare: .... .... .... ....", {
      seed: 1
    });
    const state = makeState([dr1Track()], [patClip("c1", pat)]);

    const ramped = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("set_steps" as never, {
        clipId: "c1",
        row: "Kick",
        steps: "1-4",
        ramp: { field: "velocity", from: 20, to: 80 }
      }),
      directContext(state)
    );
    expect(ramped.error).toBeUndefined();
    const kickSteps = ramped.state.clips[0]!.pattern!.rows[0]!.steps;
    expect(kickSteps.slice(0, 4).map((s) => s.velocity)).toEqual([20, 40, 60, 80]);
    expect(kickSteps.slice(0, 4).every((s) => s.on)).toBe(true);

    // copy_steps & repeat_step.
    const copied = await applyTimelineOp(
      ramped.state,
      timelineOpFromToolArgs("copy_steps" as never, {
        clipId: "c1",
        row: "Kick",
        steps: "1-4",
        toRow: "Snare",
        toStep: 5
      }),
      directContext(ramped.state)
    );
    expect(copied.error).toBeUndefined();
    expect(
      copied.state.clips[0]!.pattern!.rows[1]!.steps.slice(4, 8).map((s) => s.velocity)
    ).toEqual([20, 40, 60, 80]);

    const rep = await applyTimelineOp(
      copied.state,
      timelineOpFromToolArgs("repeat_step" as never, {
        clipId: "c1",
        row: "Kick",
        step: 4
      }),
      directContext(copied.state)
    );
    expect(rep.error).toBeUndefined();
    expect(rep.state.clips[0]!.pattern!.rows[0]!.steps[4]!.velocity).toBe(80);

    // set_pattern_text merge & clear_pattern mode.
    const merged = await applyTimelineOp(
      rep.state,
      timelineOpFromToolArgs("set_pattern_text" as never, {
        clipId: "c1",
        text: "Clap: .... X... .... X...",
        mode: "merge"
      }),
      directContext(rep.state)
    );
    expect(merged.error).toBeUndefined();
    expect(merged.state.clips[0]!.pattern!.rows).toHaveLength(3);

    const cleared = await applyTimelineOp(
      merged.state,
      timelineOpFromToolArgs("clear_pattern" as never, {
        clipId: "c1",
        scope: "row",
        row: "Kick",
        mode: "velocity"
      }),
      directContext(merged.state)
    );
    expect(cleared.error).toBeUndefined();
    expect(cleared.state.clips[0]!.pattern!.rows[0]!.steps[0]!.on).toBe(true);
    expect(cleared.state.clips[0]!.pattern!.rows[0]!.steps[0]!.velocity).toBeUndefined();
  });

  it("SQ53: rotate_pattern velocity keeps on/off; transpose, randomize seeded determinism, nudge, tie_steps", async () => {
    const pat = patternFromText("Kick: X.o. .... .... ....", { seed: 1 });
    const state = makeState([dr1Track()], [patClip("c1", pat)]);

    const rot = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("rotate_pattern" as never, {
        clipId: "c1",
        row: "Kick",
        by: 1,
        mode: "velocity"
      }),
      directContext(state)
    );
    expect(rot.error).toBeUndefined();
    const steps = rot.state.clips[0]!.pattern!.rows[0]!.steps;
    // On/off stayed at 0 and 2; velocity 127 moved from 0 -> 1, velocity 50 moved 2 -> 3.
    expect(steps[0]!.on).toBe(true);
    expect(steps[1]!.on).toBeUndefined();
    expect(steps[1]!.velocity).toBe(127);
    expect(steps[2]!.on).toBe(true);
    expect(steps[3]!.velocity).toBe(50);

    // Seeded randomize determinism.
    const rndA = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("randomize_pattern" as never, {
        clipId: "c1",
        mode: "onOff",
        seed: 99,
        density: 50
      }),
      directContext(state)
    );
    const rndB = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("randomize_pattern" as never, {
        clipId: "c1",
        mode: "onOff",
        seed: 99,
        density: 50
      }),
      directContext(state)
    );
    expect(rndA.error).toBeUndefined();
    expect(rndA.result.seed).toBe(99);
    expect(rndA.state.clips[0]!.pattern).toEqual(rndB.state.clips[0]!.pattern);

    // tie_steps, transpose_pattern, nudge_pattern_values.
    const tied = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("tie_steps" as never, {
        clipId: "c1",
        row: "Kick",
        from: 1,
        to: 3,
        tie: true
      }),
      directContext(state)
    );
    expect(tied.error).toBeUndefined();
    expect(tied.state.clips[0]!.pattern!.rows[0]!.steps[1]!.tie).toBe(true);
    expect(tied.state.clips[0]!.pattern!.rows[0]!.steps[2]!.tie).toBe(true);

    const nudged = await applyTimelineOp(
      tied.state,
      timelineOpFromToolArgs("nudge_pattern_values" as never, {
        clipId: "c1",
        row: "Kick",
        mode: "velocity",
        delta: -10
      }),
      directContext(tied.state)
    );
    expect(nudged.error).toBeUndefined();
    expect(nudged.state.clips[0]!.pattern!.rows[0]!.steps[0]!.velocity).toBe(117);

    const trans = await applyTimelineOp(
      nudged.state,
      timelineOpFromToolArgs("transpose_pattern" as never, {
        clipId: "c1",
        row: "Kick",
        semitones: 2
      }),
      directContext(nudged.state)
    );
    expect(trans.error).toBeUndefined();
    expect(trans.state.clips[0]!.pattern!.rows[0]!.assignment).toEqual({
      type: "note",
      pitch: 38
    });
  });

  it("SQ54 + SQ45: list_step_patterns, apply_step_pattern Boom Bap, save_step_pattern, set_track_step_template", async () => {
    const emptyPat = patternFromText("Kick: .... .... .... ....", { seed: 1 });
    const state = makeState([dr1Track()], [patClip("c1", emptyPat)]);
    const ctx = directContext(state);

    const listed = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("list_step_patterns" as never, { query: "Boom Bap" }),
      ctx
    );
    expect(listed.error).toBeUndefined();
    const entries = listed.result.entries as Array<{ id: string; name: string }>;
    expect(entries.some((e) => e.name === "Boom Bap")).toBe(true);

    const applied = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("apply_step_pattern" as never, {
        clipId: "c1",
        pattern: "Boom Bap"
      }),
      ctx
    );
    expect(applied.error).toBeUndefined();
    expect(applied.state.clips[0]!.pattern!.name).toBe("Boom Bap");
    expect(applied.state.clips[0]!.pattern!.rows.length).toBeGreaterThanOrEqual(3);

    // Save pattern to library and verify it shows up in list & can be applied.
    const saved = await applyTimelineOp(
      applied.state,
      timelineOpFromToolArgs("save_step_pattern" as never, {
        clipId: "c1",
        name: "My Boom Bap",
        kind: "pattern",
        folder: "Custom"
      }),
      ctx
    );
    expect(saved.error).toBeUndefined();
    const listedUser = await applyTimelineOp(
      saved.state,
      timelineOpFromToolArgs("list_step_patterns" as never, { query: "My Boom Bap" }),
      ctx
    );
    expect(
      (listedUser.result.entries as Array<{ name: string; source: string }>).some(
        (e) => e.name === "My Boom Bap" && e.source === "user"
      )
    ).toBe(true);

    // SQ45: store track default template -> create_pattern_region gets stored rows -> clear removes it.
    const stored = await applyTimelineOp(
      applied.state,
      timelineOpFromToolArgs("set_track_step_template" as never, {
        trackId: "Drums",
        fromClipId: "c1"
      }),
      directContext(applied.state)
    );
    expect(stored.error).toBeUndefined();
    expect(stored.state.tracks[0]!.stepTemplate).toBeDefined();
    expect(
      stored.state.tracks[0]!.stepTemplate!.rows.every((r) =>
        r.steps.every((s) => !s.on)
      )
    ).toBe(true);

    const created = await applyTimelineOp(
      stored.state,
      timelineOpFromToolArgs("create_pattern_region" as never, {
        trackId: "Drums",
        atBar: 2
      }),
      directContext(stored.state)
    );
    expect(created.error).toBeUndefined();
    expect(created.state.clips[1]!.pattern!.rows.map((r) => r.name)).toEqual(
      stored.state.tracks[0]!.stepTemplate!.rows.map((r) => r.name)
    );

    const cleared = await applyTimelineOp(
      created.state,
      timelineOpFromToolArgs("set_track_step_template" as never, {
        trackId: "Drums",
        clear: true
      }),
      directContext(created.state)
    );
    expect(cleared.error).toBeUndefined();
    expect(cleared.state.tracks[0]!.stepTemplate).toBeUndefined();
  });
});
