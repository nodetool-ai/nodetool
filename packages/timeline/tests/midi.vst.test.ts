import { describe, expect, it } from "vitest";
import { midiInstrument, VST_STATE_MAX_CHARS } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { midiRenderKey } from "../src/midi/cacheKey.js";
import { instrumentTailMs, VST_TAIL_MS } from "../src/midi/instrument.js";
import { findInstrumentPreset, presetIdForInstrument, VST_PRESET_ID } from "../src/midi/presets.js";
import {
  midiClipFrames,
  midiClipVoiceEvents,
  renderMidiClip
} from "../src/midi/voice.js";
import type { MidiNote, VstMidiInstrument } from "../src/types.js";

const instrument: VstMidiInstrument = {
  type: "vst",
  plugin: {
    uid: "VST3-Pad-1a2b3c4d-5e6f",
    name: "Pad",
    vendor: "Acme",
    path: "/Library/Audio/Plug-Ins/VST3/Pad.vst3"
  },
  state: "AAEC",
  gainDb: 0
};

const note = (id: string, startTick: number, durationTick: number, pitch = 60): MidiNote => ({
  id,
  pitch,
  velocity: 100,
  startTick,
  durationTick
});

describe("vst instruments", () => {
  it("round-trips through the document schema", () => {
    expect(midiInstrument.parse(instrument)).toEqual(instrument);
    expect(midiInstrument.parse({ ...instrument, plugin: null, state: null })).toMatchObject({ plugin: null });
    expect(midiInstrument.safeParse({ ...instrument, state: "A".repeat(VST_STATE_MAX_CHARS + 1) }).success).toBe(false);
  });

  it("renders silence in the shared renderer, at the window's length", () => {
    const clip = { notes: [note("a", 0, 960)], durationMs: 1000 };
    const samples = renderMidiClip({ clip, bpm: 120, instrument, sampleRate: 48000 });
    expect(samples.length).toBe(midiClipFrames(clip, 48000));
    expect(samples.every((s) => s === 0)).toBe(true);
  });

  it("hands a host the same note frames the built-in voices play", () => {
    // 120 bpm, 960 ticks per beat: one beat is 500 ms.
    const clip = {
      notes: [note("a", 0, 960), note("b", 960, 1920, 64), note("c", 3840, 960)],
      inPointMs: 250,
      durationMs: 1500
    };
    const events = midiClipVoiceEvents(clip, 120, 48000);
    // "a" starts before the window and is not struck; "c" starts after it.
    expect(events).toEqual([
      { pitch: 64, velocity: 100, startFrame: 12000, gateOffFrame: 60000 }
    ]);
  });

  it("re-renders when the plug-in state changes", () => {
    const clip = { notes: [note("a", 0, 960)], durationMs: 1000 };
    const key = (state: string | null) =>
      midiRenderKey({ clip, bpm: 120, instrument: { ...instrument, state }, sampleRate: 48000 });
    expect(key("AAEC")).toBe(key("AAEC"));
    expect(key("AAED")).not.toBe(key("AAEC"));
    expect(key(null)).not.toBe(key("AAEC"));
  });

  it("reads back as the VST preset whatever plug-in it loads", () => {
    expect(presetIdForInstrument(instrument)).toBe(VST_PRESET_ID);
    expect(findInstrumentPreset(VST_PRESET_ID)?.instrument).toEqual({
      type: "vst",
      plugin: null,
      state: null,
      gainDb: 0
    });
  });

  it("lets an audition ring past the note", () => {
    expect(instrumentTailMs(instrument)).toBe(VST_TAIL_MS);
  });
});
