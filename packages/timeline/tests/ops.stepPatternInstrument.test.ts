/**
 * SQ43 Step Pattern Saved Instrument — Timeline ops tests.
 *
 * When a step pattern is applied to a new or empty MIDI track (with unset or
 * default instrument), the track takes the pattern's saved instrument or
 * preset. Tracks that already hold clips or a user-chosen instrument keep
 * their existing voice.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  findInstrumentPreset,
  makeClip,
  makeTrack,
  patternFromText,
  presetIdForInstrument,
  type BassMidiInstrument,
  type TimelineClip,
  type TimelineTrack,
  type WavetableMidiInstrument
} from "../src/index.js";
import {
  applyTimelineOp,
  createMemoryStepPatternLibrary,
  timelineOpFromToolArgs,
  type TimelineOpContext,
  type TimelineOpState
} from "../src/ops/index.js";

function makeState(
  tracks: TimelineTrack[],
  clips: TimelineClip[] = []
): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tempo: { ...DEFAULT_TEMPO, bpm: 120 },
    tracks,
    clips,
    markers: [],
    playheadMs: 0,
    selectedClipIds: []
  };
}

function makeCtx(
  overrides: Partial<TimelineOpContext> = {}
): TimelineOpContext {
  let seq = 0;
  return {
    newId: (kind) => `${kind}_${++seq}`,
    stepPatternLibrary: createMemoryStepPatternLibrary(),
    ...overrides
  };
}

describe("SQ43 apply_step_pattern saved instrument & preset", () => {
  it("applies factory pattern instrumentPreset on a new MIDI track created by add_track (default and host default)", async () => {
    const dr1 = findInstrumentPreset("dr1-tr-void")!.instrument;
    const bl1 = findInstrumentPreset("bl1-acid")!.instrument;
    const wt1Lead = findInstrumentPreset("wt1-prime-lead")!.instrument;

    // 1. Default headless host (DEFAULT_MIDI_INSTRUMENT)
    const ctx1 = makeCtx();
    const added1 = await applyTimelineOp(
      makeState([]),
      timelineOpFromToolArgs("add_track", { type: "midi", name: "Drums" }),
      ctx1
    );
    expect(added1.error).toBeUndefined();
    const newTrackId1 = (added1.result.track as { id: string }).id;
    expect(added1.state.tracks[0]!.instrument).toEqual(DEFAULT_MIDI_INSTRUMENT);

    const applied1 = await applyTimelineOp(
      added1.state,
      timelineOpFromToolArgs("apply_step_pattern", {
        trackId: newTrackId1,
        atBar: 1,
        pattern: "Boom Bap"
      }),
      ctx1
    );
    expect(applied1.error).toBeUndefined();
    expect(applied1.state.tracks[0]!.instrument).toEqual(dr1);
    expect(applied1.result.instrumentApplied).toBe(true);
    expect(applied1.result.instrumentPreset).toBe("dr1-tr-void");
    expect((applied1.result.track as { presetId?: string }).presetId).toBe(
      "dr1-tr-void"
    );

    // 2. Host with browser defaultMidiInstrument (wt1-prime-lead)
    const ctx2 = makeCtx({ defaultMidiInstrument: wt1Lead });
    const added2 = await applyTimelineOp(
      makeState([]),
      timelineOpFromToolArgs("add_track", { type: "midi", name: "Bass" }),
      ctx2
    );
    const newTrackId2 = (added2.result.track as { id: string }).id;
    expect(added2.state.tracks[0]!.instrument).toEqual(wt1Lead);

    const applied2 = await applyTimelineOp(
      added2.state,
      timelineOpFromToolArgs("apply_step_pattern", {
        trackId: newTrackId2,
        atBar: 1,
        pattern: "Acid 303 Bass"
      }),
      ctx2
    );
    expect(applied2.error).toBeUndefined();
    expect(applied2.state.tracks[0]!.instrument).toEqual(bl1);
    expect(applied2.result.instrumentApplied).toBe(true);
    expect(applied2.result.instrumentPreset).toBe("bl1-acid");

    // 3. Empty MIDI track with undefined instrument
    const emptyNoInstr = makeTrack({
      id: "t_empty",
      type: "midi",
      name: "Keys",
      index: 0
    });
    const applied3 = await applyTimelineOp(
      makeState([emptyNoInstr]),
      timelineOpFromToolArgs("apply_step_pattern", {
        trackId: "t_empty",
        atBar: 1,
        pattern: "Deep House Chords"
      }),
      makeCtx()
    );
    expect(applied3.error).toBeUndefined();
    expect(applied3.state.tracks[0]!.instrument).toEqual(
      findInstrumentPreset("wt1-soft-keys")!.instrument
    );
  });

  it("saves track instrument and preset in save_step_pattern and applies them to an empty MIDI track", async () => {
    const library = createMemoryStepPatternLibrary();
    const ctx = makeCtx({ stepPatternLibrary: library });

    // A. Factory preset voice (dr1-cinematic)
    const cinematic = findInstrumentPreset("dr1-cinematic")!.instrument;
    const srcTrack = makeTrack({
      id: "t_src",
      type: "midi",
      name: "Cinematic Drums",
      index: 0,
      instrument: structuredClone(cinematic)
    });
    const srcClip = makeClip({
      id: "c_src",
      trackId: "t_src",
      name: "Hit",
      startMs: 0,
      durationMs: 2000,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      pattern: patternFromText("Kick: X... .... X... ....", { name: "Epic" })
    });
    const savedPreset = await applyTimelineOp(
      makeState([srcTrack], [srcClip]),
      timelineOpFromToolArgs("save_step_pattern", {
        clipId: "c_src",
        name: "My Epic Kit",
        kind: "pattern"
      }),
      ctx
    );
    expect(savedPreset.error).toBeUndefined();

    // B. Customized instrument (tweaked bl1-acid cutoffHz, not matching any factory preset)
    const customBass: BassMidiInstrument = {
      ...(structuredClone(
        findInstrumentPreset("bl1-acid")!.instrument
      ) as BassMidiInstrument),
      cutoffHz: 2450
    };
    expect(presetIdForInstrument(customBass)).toBeUndefined();
    const bassTrack = makeTrack({
      id: "t_bass",
      type: "midi",
      name: "Custom Bass",
      index: 0,
      instrument: customBass
    });
    const bassClip = makeClip({
      id: "c_bass",
      trackId: "t_bass",
      name: "Acid",
      startMs: 0,
      durationMs: 2000,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      pattern: patternFromText("C2: x.x. .... x.x. ....", { name: "Custom Acid" })
    });
    const savedCustom = await applyTimelineOp(
      makeState([bassTrack], [bassClip]),
      timelineOpFromToolArgs("save_step_pattern", {
        clipId: "c_bass",
        name: "My Custom Acid",
        kind: "pattern"
      }),
      ctx
    );
    expect(savedCustom.error).toBeUndefined();

    // Apply saved preset pattern to a brand-new MIDI track
    const fresh1 = await applyTimelineOp(
      makeState([]),
      timelineOpFromToolArgs("add_track", { type: "midi", name: "New 1" }),
      ctx
    );
    const appliedPreset = await applyTimelineOp(
      fresh1.state,
      timelineOpFromToolArgs("apply_step_pattern", {
        trackId: (fresh1.result.track as { id: string }).id,
        atBar: 1,
        pattern: "My Epic Kit"
      }),
      ctx
    );
    expect(appliedPreset.error).toBeUndefined();
    expect(appliedPreset.state.tracks[0]!.instrument).toEqual(cinematic);
    expect(appliedPreset.result.instrumentPreset).toBe("dr1-cinematic");

    // Apply saved customized instrument pattern to a brand-new MIDI track
    const fresh2 = await applyTimelineOp(
      makeState([]),
      timelineOpFromToolArgs("add_track", { type: "midi", name: "New 2" }),
      ctx
    );
    const appliedCustom = await applyTimelineOp(
      fresh2.state,
      timelineOpFromToolArgs("apply_step_pattern", {
        trackId: (fresh2.result.track as { id: string }).id,
        atBar: 1,
        pattern: "My Custom Acid"
      }),
      ctx
    );
    expect(appliedCustom.error).toBeUndefined();
    expect(appliedCustom.state.tracks[0]!.instrument).toEqual(customBass);
    expect(appliedCustom.result.instrumentApplied).toBe(true);
    expect(appliedCustom.result.instrumentPreset).toBeUndefined();
  });

  it("supports preset-only user patterns and ignores unknown preset ids safely", async () => {
    const library = createMemoryStepPatternLibrary({
      entries: [
        {
          id: "00000001a0a000000000000000000001",
          name: "Preset Only Bells",
          kind: "pattern",
          pattern: patternFromText("C4: x... x... x... x...", { name: "Bells" }),
          instrumentPreset: "wt1-chime-bell"
        },
        {
          id: "00000002a0a000000000000000000002",
          name: "Unknown Preset Pattern",
          kind: "pattern",
          pattern: patternFromText("C4: x... .... .... ....", { name: "Unknown" }),
          instrumentPreset: "no-such-preset-id"
        }
      ]
    });
    const ctx = makeCtx({ stepPatternLibrary: library });

    const trackA = makeTrack({
      id: "t_a",
      type: "midi",
      name: "A",
      index: 0,
      instrument: DEFAULT_MIDI_INSTRUMENT
    });
    const appliedKnown = await applyTimelineOp(
      makeState([trackA]),
      timelineOpFromToolArgs("apply_step_pattern", {
        trackId: "t_a",
        atBar: 1,
        pattern: "Preset Only Bells"
      }),
      ctx
    );
    expect(appliedKnown.error).toBeUndefined();
    expect(appliedKnown.state.tracks[0]!.instrument).toEqual(
      findInstrumentPreset("wt1-chime-bell")!.instrument
    );

    const trackB = makeTrack({
      id: "t_b",
      type: "midi",
      name: "B",
      index: 0,
      instrument: DEFAULT_MIDI_INSTRUMENT
    });
    const appliedUnknown = await applyTimelineOp(
      makeState([trackB]),
      timelineOpFromToolArgs("apply_step_pattern", {
        trackId: "t_b",
        atBar: 1,
        pattern: "Unknown Preset Pattern"
      }),
      ctx
    );
    expect(appliedUnknown.error).toBeUndefined();
    expect(appliedUnknown.state.tracks[0]!.instrument).toEqual(
      DEFAULT_MIDI_INSTRUMENT
    );
    expect(appliedUnknown.result.instrumentApplied).toBeUndefined();
  });

  it("never overwrites the instrument on a track with existing clips, on clipId replacement, or when the user chose a voice", async () => {
    const wt1Lead = findInstrumentPreset("wt1-prime-lead")!.instrument;
    const wt1Keys = findInstrumentPreset("wt1-soft-keys")!.instrument;
    const tweakedLead: WavetableMidiInstrument = {
      ...(structuredClone(wt1Lead) as WavetableMidiInstrument),
      cutoffHz: 1800
    };

    // 1. Track already has a clip (even with DEFAULT_MIDI_INSTRUMENT)
    const busyTrack = makeTrack({
      id: "t_busy",
      type: "midi",
      name: "Busy",
      index: 0,
      instrument: DEFAULT_MIDI_INSTRUMENT
    });
    const existingClip = makeClip({
      id: "c_existing",
      trackId: "t_busy",
      name: "Existing",
      startMs: 0,
      durationMs: 2000,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      notes: []
    });
    const onBusy = await applyTimelineOp(
      makeState([busyTrack], [existingClip]),
      timelineOpFromToolArgs("apply_step_pattern", {
        trackId: "t_busy",
        atBar: 2,
        pattern: "Boom Bap"
      }),
      makeCtx()
    );
    expect(onBusy.error).toBeUndefined();
    expect(onBusy.state.tracks[0]!.instrument).toEqual(DEFAULT_MIDI_INSTRUMENT);
    expect(onBusy.result.instrumentApplied).toBeUndefined();

    // 2. Applying via clipId replaces the clip's pattern without changing track instrument
    const patTrack = makeTrack({
      id: "t_pat",
      type: "midi",
      name: "Pat",
      index: 0,
      instrument: DEFAULT_MIDI_INSTRUMENT
    });
    const patClip = makeClip({
      id: "c_pat",
      trackId: "t_pat",
      name: "Empty Pat",
      startMs: 0,
      durationMs: 2000,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      pattern: patternFromText("Kick: .... .... .... ....")
    });
    const onClip = await applyTimelineOp(
      makeState([patTrack], [patClip]),
      timelineOpFromToolArgs("apply_step_pattern", {
        clipId: "c_pat",
        pattern: "Boom Bap"
      }),
      makeCtx()
    );
    expect(onClip.error).toBeUndefined();
    expect(onClip.state.tracks[0]!.instrument).toEqual(DEFAULT_MIDI_INSTRUMENT);
    expect(onClip.result.instrumentApplied).toBeUndefined();

    // 3. Empty track where user chose an instrument (via set_track_instrument)
    const chosenTrack = makeTrack({
      id: "t_chosen",
      type: "midi",
      name: "Chosen",
      index: 0,
      instrument: structuredClone(wt1Keys)
    });
    const onChosen = await applyTimelineOp(
      makeState([chosenTrack]),
      timelineOpFromToolArgs("apply_step_pattern", {
        trackId: "t_chosen",
        atBar: 1,
        pattern: "Boom Bap"
      }),
      makeCtx({ defaultMidiInstrument: wt1Lead })
    );
    expect(onChosen.error).toBeUndefined();
    expect(onChosen.state.tracks[0]!.instrument).toEqual(wt1Keys);
    expect(onChosen.result.instrumentApplied).toBeUndefined();

    // 4. Empty track where user tweaked the host default instrument
    const tweakedTrack = makeTrack({
      id: "t_tweaked",
      type: "midi",
      name: "Tweaked",
      index: 0,
      instrument: tweakedLead
    });
    const onTweaked = await applyTimelineOp(
      makeState([tweakedTrack]),
      timelineOpFromToolArgs("apply_step_pattern", {
        trackId: "t_tweaked",
        atBar: 1,
        pattern: "Boom Bap"
      }),
      makeCtx({ defaultMidiInstrument: wt1Lead })
    );
    expect(onTweaked.error).toBeUndefined();
    expect(onTweaked.state.tracks[0]!.instrument).toEqual(tweakedLead);
    expect(onTweaked.result.instrumentApplied).toBeUndefined();

    // 5. Template with no saved instrument leaves empty track instrument intact
    const emptyTrack = makeTrack({
      id: "t_tpl",
      type: "midi",
      name: "Tpl",
      index: 0,
      instrument: DEFAULT_MIDI_INSTRUMENT
    });
    const onTpl = await applyTimelineOp(
      makeState([emptyTrack]),
      timelineOpFromToolArgs("apply_step_pattern", {
        trackId: "t_tpl",
        atBar: 1,
        pattern: "tpl-4-piece-kit"
      }),
      makeCtx()
    );
    expect(onTpl.error).toBeUndefined();
    expect(onTpl.state.tracks[0]!.instrument).toEqual(DEFAULT_MIDI_INSTRUMENT);
    expect(onTpl.result.instrumentApplied).toBeUndefined();
  });

  it("reports instrumentPreset in list_step_patterns for factory and saved user patterns", async () => {
    const library = createMemoryStepPatternLibrary();
    const ctx = makeCtx({ stepPatternLibrary: library });
    const listed = await applyTimelineOp(
      makeState([]),
      timelineOpFromToolArgs("list_step_patterns", { query: "Boom Bap" }),
      ctx
    );
    expect(listed.error).toBeUndefined();
    const boomBap = (
      listed.result.entries as Array<{ id: string; instrumentPreset?: string }>
    ).find((e) => e.id === "boom-bap");
    expect(boomBap?.instrumentPreset).toBe("dr1-tr-void");
  });
});
