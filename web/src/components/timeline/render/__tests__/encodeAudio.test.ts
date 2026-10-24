/**
 * @jest-environment node
 */
/**
 * The timeline MP3 export: the offline mixdown is faked, the encode is real
 * (mediabunny with the LAME extension), so the frame header proves the
 * bitrate and channel layout the file carries.
 */
import { renderTimelineMp3 } from "../encodeAudio";

const mockRender = jest.fn();
jest.mock("../renderAudio", () => ({
  renderTimelineAudio: (opts: unknown) => mockRender(opts)
}));

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
    this.data = Array.from({ length: numberOfChannels }, (_, c) => {
      const channel = new Float32Array(length);
      for (let i = 0; i < length; i += 1) {
        channel[i] = Math.sin(i / (10 + c)) * 0.5;
      }
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

/** Bitrates of MPEG-1 Layer III by header index, in kbps. */
const MPEG1_L3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG1_RATES = [44_100, 48_000, 32_000];

/** Read the MPEG-1 Layer III frame header at `offset`. */
function frameHeader(bytes: Uint8Array, offset: number) {
  expect(bytes[offset]).toBe(0xff);
  // MPEG-1, Layer III.
  expect(bytes[offset + 1] & 0xfe).toBe(0xfa);
  const bitrateKbps = MPEG1_L3_KBPS[bytes[offset + 2] >> 4];
  const sampleRate = MPEG1_RATES[(bytes[offset + 2] >> 2) & 0x3];
  const padding = (bytes[offset + 2] >> 1) & 0x1;
  return {
    bitrateKbps,
    sampleRate,
    // Channel mode 3 is mono; the other three carry two channels.
    stereo: bytes[offset + 3] >> 6 !== 3,
    length: Math.floor((144_000 * bitrateKbps) / sampleRate) + padding
  };
}

const originalAudioBuffer = globalThis.AudioBuffer;
beforeAll(() => {
  globalThis.AudioBuffer = FakeAudioBuffer as unknown as typeof AudioBuffer;
});
afterAll(() => {
  globalThis.AudioBuffer = originalAudioBuffer;
});
beforeEach(() => mockRender.mockReset());

const options = (signal?: AbortSignal) => ({
  clips: [],
  tracks: [],
  durationMs: 1000,
  resolveUrl: jest.fn(),
  signal
});

describe("renderTimelineMp3", () => {
  it("encodes the whole mixdown as a 320 kbps stereo MP3", async () => {
    mockRender.mockResolvedValue(new FakeAudioBuffer(2, 48_000, 48_000));
    const progress = jest.fn();
    const result = await renderTimelineMp3({
      ...options(),
      onProgress: progress
    });

    expect(mockRender.mock.calls[0][0]).toMatchObject({ durationMs: 1000 });
    expect(result).toMatchObject({ mimeType: "audio/mpeg", extension: "mp3" });
    const bytes = result.bytes;
    // The first frame is the encoder's Xing header; the audio follows it.
    const xing = frameHeader(bytes, 0);
    const audio = frameHeader(bytes, xing.length);
    expect(audio.bitrateKbps).toBe(320);
    expect(audio.sampleRate).toBe(48_000);
    expect(audio.stereo).toBe(true);
    // One second at 320 kbps, give or take the Xing frame and the padding.
    expect(bytes.length).toBeGreaterThan(39_000);
    expect(bytes.length).toBeLessThan(43_000);
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ ratio: 1 })
    );
  });

  it("says there is nothing to export when no clip is audible", async () => {
    mockRender.mockResolvedValue(null);
    await expect(renderTimelineMp3(options())).rejects.toThrow(
      /no MP3 to export/
    );
  });

  it("passes the abort signal into the mix and stops after it", async () => {
    const controller = new AbortController();
    mockRender.mockImplementation(async () => {
      controller.abort();
      return new FakeAudioBuffer(2, 48_000, 48_000);
    });
    await expect(
      renderTimelineMp3(options(controller.signal))
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mockRender.mock.calls[0][0].signal).toBe(controller.signal);
  });
});
