/**
 * An audition plays one note through the same voice playback uses, on its own
 * context — so it is audible while the timeline is paused and never joins the
 * mix the export reads.
 */
import { DEFAULT_MIDI_INSTRUMENT } from "@nodetool-ai/timeline";
import { AUDITION_NOTE_MS, playAuditionNote } from "../audition";

function mockContext() {
  const channels: Float32Array[] = [];
  const source = {
    buffer: null as unknown,
    connect: jest.fn(),
    start: jest.fn(),
    onended: null as null | (() => void)
  };
  return {
    channels,
    source,
    sampleRate: 48_000,
    destination: {},
    createBuffer: jest.fn((_channels: number, length: number) => {
      const channel = new Float32Array(length);
      channels.push(channel);
      return { length, getChannelData: () => channel };
    }),
    createBufferSource: jest.fn(() => source)
  };
}

describe("playAuditionNote", () => {
  it("renders the note plus its release tail and starts it", async () => {
    const ctx = mockContext();
    await playAuditionNote(
      DEFAULT_MIDI_INSTRUMENT,
      60,
      100,
      () => ctx as never
    );

    const expectedFrames = Math.round(
      ((AUDITION_NOTE_MS + DEFAULT_MIDI_INSTRUMENT.releaseMs) / 1000) *
        ctx.sampleRate
    );
    expect(ctx.createBuffer).toHaveBeenCalledWith(1, expectedFrames, 48_000);
    expect(ctx.source.connect).toHaveBeenCalledWith(ctx.destination);
    expect(ctx.source.start).toHaveBeenCalled();
  });

  it("renders audible samples", async () => {
    const ctx = mockContext();
    await playAuditionNote(DEFAULT_MIDI_INSTRUMENT, 60, 100, () => ctx as never);
    expect(ctx.channels[0].some((s) => Math.abs(s) > 0.001)).toBe(true);
  });

  it("plays a different pitch differently", async () => {
    const low = mockContext();
    const high = mockContext();
    await playAuditionNote(DEFAULT_MIDI_INSTRUMENT, 48, 100, () => low as never);
    await playAuditionNote(DEFAULT_MIDI_INSTRUMENT, 72, 100, () => high as never);
    expect(Array.from(low.channels[0].slice(0, 200))).not.toEqual(
      Array.from(high.channels[0].slice(0, 200))
    );
  });
});
