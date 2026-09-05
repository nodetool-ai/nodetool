/**
 * A midi clip's render, and the cache in front of it.
 *
 * The cache key is the whole contract: hand back a previous render only when
 * every input the samples depend on is unchanged. A key that missed an input
 * would play the pre-edit notes with no visible symptom, so each case here
 * changes exactly one input and asserts a fresh render.
 *
 * jsdom defines no `Worker`, so these exercise the inline path — the same pure
 * renderer the worker runs.
 */
import { DEFAULT_MIDI_INSTRUMENT } from "@nodetool-ai/timeline";
import type { MidiNote } from "@nodetool-ai/timeline";
import { clearMidiRenderCache, getMidiClipBuffer } from "../midiRender";

const note = (overrides: Partial<MidiNote> = {}): MidiNote => ({
  id: "n1",
  pitch: 60,
  velocity: 100,
  startTick: 0,
  durationTick: 480,
  ...overrides
});

/** A context that records every buffer it was asked to allocate. */
function mockContext(sampleRate = 48_000) {
  const created: Float32Array[] = [];
  return {
    created,
    sampleRate,
    createBuffer: jest.fn((_channels: number, length: number) => {
      const channel = new Float32Array(length);
      created.push(channel);
      return {
        length,
        sampleRate,
        numberOfChannels: 1,
        getChannelData: () => channel
      };
    })
  };
}

const clip = { notes: [note()], inPointMs: 0, durationMs: 1000 };

describe("getMidiClipBuffer", () => {
  beforeEach(() => {
    clearMidiRenderCache();
  });

  it("renders the clip's window, not its notes", async () => {
    const ctx = mockContext();
    const buffer = await getMidiClipBuffer(
      ctx as never,
      clip,
      120,
      DEFAULT_MIDI_INSTRUMENT
    );
    // 1000ms at 48 kHz — the window decides the length.
    expect(buffer.length).toBe(48_000);
  });

  it("renders audible samples for a note inside the window", async () => {
    const ctx = mockContext();
    await getMidiClipBuffer(ctx as never, clip, 120, DEFAULT_MIDI_INSTRUMENT);
    const rendered = ctx.created[0];
    expect(rendered.some((s) => Math.abs(s) > 0.001)).toBe(true);
  });

  it("hands back the cached buffer for the same inputs", async () => {
    const ctx = mockContext();
    const first = await getMidiClipBuffer(
      ctx as never,
      clip,
      120,
      DEFAULT_MIDI_INSTRUMENT
    );
    const second = await getMidiClipBuffer(
      ctx as never,
      { ...clip },
      120,
      DEFAULT_MIDI_INSTRUMENT
    );
    expect(second).toBe(first);
    expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
  });

  it("re-renders when a note changed", async () => {
    const ctx = mockContext();
    await getMidiClipBuffer(ctx as never, clip, 120, DEFAULT_MIDI_INSTRUMENT);
    await getMidiClipBuffer(
      ctx as never,
      { ...clip, notes: [note({ pitch: 67 })] },
      120,
      DEFAULT_MIDI_INSTRUMENT
    );
    expect(ctx.createBuffer).toHaveBeenCalledTimes(2);
  });

  it("re-renders when the tempo changed", async () => {
    const ctx = mockContext();
    await getMidiClipBuffer(ctx as never, clip, 120, DEFAULT_MIDI_INSTRUMENT);
    await getMidiClipBuffer(ctx as never, clip, 90, DEFAULT_MIDI_INSTRUMENT);
    expect(ctx.createBuffer).toHaveBeenCalledTimes(2);
  });

  it("re-renders when the instrument changed", async () => {
    const ctx = mockContext();
    await getMidiClipBuffer(ctx as never, clip, 120, DEFAULT_MIDI_INSTRUMENT);
    await getMidiClipBuffer(ctx as never, clip, 120, {
      ...DEFAULT_MIDI_INSTRUMENT,
      waveform: "square"
    });
    expect(ctx.createBuffer).toHaveBeenCalledTimes(2);
  });

  it("re-renders when the window moved", async () => {
    const ctx = mockContext();
    await getMidiClipBuffer(ctx as never, clip, 120, DEFAULT_MIDI_INSTRUMENT);
    await getMidiClipBuffer(
      ctx as never,
      { ...clip, inPointMs: 250 },
      120,
      DEFAULT_MIDI_INSTRUMENT
    );
    expect(ctx.createBuffer).toHaveBeenCalledTimes(2);
  });

  it("re-renders for a context at another sample rate", async () => {
    const a = mockContext(48_000);
    const b = mockContext(44_100);
    await getMidiClipBuffer(a as never, clip, 120, DEFAULT_MIDI_INSTRUMENT);
    await getMidiClipBuffer(b as never, clip, 120, DEFAULT_MIDI_INSTRUMENT);
    expect(b.createBuffer).toHaveBeenCalledTimes(1);
  });

  it("shares one render between concurrent callers", async () => {
    const ctx = mockContext();
    const [first, second] = await Promise.all([
      getMidiClipBuffer(ctx as never, clip, 120, DEFAULT_MIDI_INSTRUMENT),
      getMidiClipBuffer(ctx as never, clip, 120, DEFAULT_MIDI_INSTRUMENT)
    ]);
    expect(second).toBe(first);
    expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
  });
});
