/**
 * @jest-environment node
 */
import type {
  ScriptDraft,
  ScriptLine,
  ScriptTake
} from "../../../stores/script/ScriptStore";
import { encodeScriptAudio, renderScriptAudio } from "../exportScriptAudio";

const mockRender = jest.fn();
jest.mock("../../timeline/render/renderAudio", () => ({
  renderTimelineAudio: (opts: unknown) => mockRender(opts)
}));

const take = (id: string, durationMs: number): ScriptTake => ({
  id: `${id}-take`,
  assetId: `asset-${id}`,
  durationMs,
  words: [],
  textSnapshot: id,
  voiceSnapshot: null,
  createdAt: "2026-01-01T00:00:00.000Z"
});

const voiced = (
  id: string,
  durationMs: number,
  pauseAfterMs?: number
): ScriptLine => {
  const t = take(id, durationMs);
  return { id, text: id, takes: [t], currentTakeId: t.id, pauseAfterMs };
};

const script = (lines: ScriptLine[]): ScriptDraft => ({
  id: "script-1",
  title: "My script",
  cast: [],
  sections: [{ id: "s1", lines }],
  timelineId: null,
  storyboardId: null,
  updatedAt: 0
});

/** Enough of an AudioBuffer for mediabunny's AudioBufferSource. */
class FakeAudioBuffer {
  readonly duration: number;
  private readonly data: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number
  ) {
    this.duration = length / sampleRate;
    this.data = Array.from({ length: numberOfChannels }, () => {
      const channel = new Float32Array(length);
      for (let i = 0; i < length; i += 1) channel[i] = Math.sin(i / 10) * 0.5;
      return channel;
    });
  }
  getChannelData(channel: number): Float32Array {
    return this.data[channel];
  }
  copyFromChannel(dest: Float32Array, channel: number, offset = 0): void {
    dest.set(this.data[channel].subarray(offset, offset + dest.length));
  }
}

describe("renderScriptAudio", () => {
  beforeEach(() => mockRender.mockReset());

  it("mixes the current takes end to end with the authored pauses", async () => {
    const mixed = {} as AudioBuffer;
    mockRender.mockResolvedValue(mixed);
    const resolveUrl = jest.fn();

    const result = await renderScriptAudio(
      script([
        voiced("a", 1000, 500),
        { id: "draft", text: "not voiced", takes: [] },
        voiced("b", 2000)
      ]),
      { resolveUrl }
    );

    expect(result).toBe(mixed);
    const opts = mockRender.mock.calls[0][0];
    expect(opts.resolveUrl).toBe(resolveUrl);
    expect(opts.durationMs).toBe(3500);
    expect(
      opts.clips.map((c: { currentAssetId: string; startMs: number }) => [
        c.currentAssetId,
        c.startMs
      ])
    ).toEqual([
      ["asset-a", 0],
      ["asset-b", 1500]
    ]);
  });

  it("returns null without rendering when no line is voiced", async () => {
    const result = await renderScriptAudio(
      script([{ id: "draft", text: "not voiced", takes: [] }]),
      { resolveUrl: jest.fn() }
    );
    expect(result).toBeNull();
    expect(mockRender).not.toHaveBeenCalled();
  });
});

describe("encodeScriptAudio", () => {
  const buffer = new FakeAudioBuffer(2, 48_000, 48_000);
  const originalAudioBuffer = globalThis.AudioBuffer;
  beforeAll(() => {
    globalThis.AudioBuffer = FakeAudioBuffer as unknown as typeof AudioBuffer;
  });
  afterAll(() => {
    globalThis.AudioBuffer = originalAudioBuffer;
  });

  it("writes a 16-bit stereo PCM WAV", async () => {
    const bytes = await encodeScriptAudio(
      buffer as unknown as AudioBuffer,
      "wav"
    );
    const ascii = (from: number, to: number): string =>
      String.fromCharCode(...bytes.subarray(from, to));
    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 12)).toBe("WAVE");
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint16(34, true)).toBe(16);
    // One second of 2-channel 16-bit samples after the 44-byte header.
    expect(bytes.length).toBe(44 + 48_000 * 2 * 2);
  });

  it("writes an MP3 that starts on a frame sync", async () => {
    const bytes = await encodeScriptAudio(
      buffer as unknown as AudioBuffer,
      "mp3"
    );
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1] & 0xe0).toBe(0xe0);
  });
});
