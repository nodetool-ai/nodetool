import {
  applyGain,
  arrayBufferToBase64,
  cropToRange,
  deleteRange,
  encodeWav,
  fade,
  normalize,
  numFrames,
  reverseRange,
  sampleDuration,
  secondsToFrame,
  silenceRange,
  type AudioSample
} from "../audioSample";

const makeSample = (channels: number[][], sampleRate = 4): AudioSample => ({
  sampleRate,
  channels: channels.map((c) => Float32Array.from(c))
});

/** Decode a 16-bit PCM WAV produced by encodeWav back into channels. */
const decodeWav = (
  buffer: ArrayBuffer
): { sampleRate: number; channels: Float32Array[] } => {
  const view = new DataView(buffer);
  const channelCount = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const dataSize = view.getUint32(40, true);
  const frames = dataSize / (channelCount * 2);
  const channels = Array.from(
    { length: channelCount },
    () => new Float32Array(frames)
  );
  let offset = 44;
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < channelCount; c += 1) {
      channels[c][i] = view.getInt16(offset, true) / 0x8000;
      offset += 2;
    }
  }
  return { sampleRate, channels };
};

describe("audioSample frame helpers", () => {
  it("reports frame count and duration", () => {
    const sample = makeSample([[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]], 8);
    expect(numFrames(sample)).toBe(8);
    expect(sampleDuration(sample)).toBe(1);
    expect(secondsToFrame(sample, 0.5)).toBe(4);
  });
});

describe("makeAudioSample", () => {
  it("hides channel data from enumeration (React dev-mode prop walks)", () => {
    const result = cropToRange(makeSample([[0, 1, 2, 3]], 4), 0, 0.5);
    expect(Object.keys(result)).toEqual(["sampleRate"]);
    expect(Array.from(result.channels[0])).toEqual([0, 1]);
  });
});

describe("cropToRange", () => {
  it("keeps only the selected range", () => {
    const sample = makeSample([[0, 1, 2, 3, 4, 5, 6, 7]], 8);
    const cropped = cropToRange(sample, 0.25, 0.625); // frames 2..5
    expect(Array.from(cropped.channels[0])).toEqual([2, 3, 4]);
  });

  it("does not mutate the input", () => {
    const sample = makeSample([[0, 1, 2, 3]], 4);
    cropToRange(sample, 0, 0.5);
    expect(Array.from(sample.channels[0])).toEqual([0, 1, 2, 3]);
  });
});

describe("deleteRange", () => {
  it("removes the range and joins surrounding audio across channels", () => {
    const sample = makeSample(
      [
        [0, 1, 2, 3, 4, 5, 6, 7],
        [10, 11, 12, 13, 14, 15, 16, 17]
      ],
      8
    );
    const result = deleteRange(sample, 0.25, 0.625); // remove frames 2..5
    expect(Array.from(result.channels[0])).toEqual([0, 1, 5, 6, 7]);
    expect(Array.from(result.channels[1])).toEqual([10, 11, 15, 16, 17]);
  });
});

describe("silenceRange", () => {
  it("zeroes the selected range only", () => {
    const sample = makeSample([[1, 1, 1, 1]], 4);
    const result = silenceRange(sample, 0.25, 0.75); // frames 1..3
    expect(Array.from(result.channels[0])).toEqual([1, 0, 0, 1]);
  });
});

describe("normalize", () => {
  it("scales the loudest sample to full scale", () => {
    const sample = makeSample([[0, 0.25, -0.5, 0.25]], 4);
    const result = normalize(sample);
    expect(Array.from(result.channels[0])).toEqual([0, 0.5, -1, 0.5]);
  });

  it("leaves silent audio untouched", () => {
    const sample = makeSample([[0, 0, 0]], 4);
    expect(Array.from(normalize(sample).channels[0])).toEqual([0, 0, 0]);
  });
});

describe("applyGain", () => {
  it("multiplies and clamps to [-1, 1]", () => {
    const sample = makeSample([[0.5, -0.5, 0.8]], 4);
    const result = applyGain(sample, 2);
    expect(Array.from(result.channels[0])).toEqual([1, -1, 1]);
  });
});

describe("fade", () => {
  it("ramps up linearly for a fade in", () => {
    const sample = makeSample([[1, 1, 1, 1, 1]], 5);
    const result = fade(sample, 0, 1, "in");
    const values = Array.from(result.channels[0]);
    expect(values[0]).toBeCloseTo(0);
    expect(values[4]).toBeCloseTo(1);
    expect(values[2]).toBeCloseTo(0.5);
  });
});

describe("reverseRange", () => {
  it("reverses the whole sample when no range is given", () => {
    const sample = makeSample([[1, 2, 3, 4]], 4);
    expect(Array.from(reverseRange(sample).channels[0])).toEqual([4, 3, 2, 1]);
  });
});

describe("encodeWav", () => {
  it("writes a valid header and round-trips samples within 16-bit precision", () => {
    const sample = makeSample(
      [
        [0, 0.5, -0.5, 1],
        [0.25, -0.25, 0.75, -1]
      ],
      44100
    );
    const wav = encodeWav(sample);
    const view = new DataView(wav);

    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe("RIFF");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(2); // channels
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(34, true)).toBe(16); // bits per sample

    const decoded = decodeWav(wav);
    expect(decoded.sampleRate).toBe(44100);
    expect(decoded.channels[0][0]).toBeCloseTo(0, 4);
    expect(decoded.channels[0][1]).toBeCloseTo(0.5, 3);
    expect(decoded.channels[1][2]).toBeCloseTo(0.75, 3);
  });
});

describe("arrayBufferToBase64", () => {
  it("encodes bytes to base64", () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(arrayBufferToBase64(bytes.buffer)).toBe("SGVsbG8=");
  });
});
