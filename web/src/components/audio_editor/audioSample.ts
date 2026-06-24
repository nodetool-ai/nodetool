/**
 * Pure, side-effect-free helpers for editing decoded audio.
 *
 * The editor works on an `AudioSample` — sample-rate plus one Float32Array per
 * channel — rather than the Web Audio `AudioBuffer`, so every edit is a plain
 * array transform that can be unit-tested without an `AudioContext`. Each
 * operation returns a new `AudioSample` and never mutates its input, which lets
 * the undo/redo history hold previous states by reference.
 *
 * Conversions to/from `AudioBuffer` (for decoding and playback) live at the
 * bottom and are the only functions that touch the Web Audio API.
 */

export interface AudioSample {
  readonly sampleRate: number;
  /** One Float32Array per channel; all the same length, at least one channel. */
  readonly channels: Float32Array[];
}

export type FadeDirection = "in" | "out";

export const numFrames = (sample: AudioSample): number =>
  sample.channels[0]?.length ?? 0;

export const numChannels = (sample: AudioSample): number =>
  sample.channels.length;

export const sampleDuration = (sample: AudioSample): number =>
  sample.sampleRate > 0 ? numFrames(sample) / sample.sampleRate : 0;

export const secondsToFrame = (sample: AudioSample, seconds: number): number =>
  Math.round(seconds * sample.sampleRate);

interface FrameRange {
  start: number;
  end: number;
}

const clampFrame = (sample: AudioSample, frame: number): number =>
  Math.max(0, Math.min(numFrames(sample), Math.round(frame)));

/**
 * Resolve a (possibly reversed or out-of-bounds) seconds range to a valid,
 * non-empty frame range, or the whole sample when no range is given. Returns
 * `null` when the range collapses to nothing.
 */
const resolveRange = (
  sample: AudioSample,
  startSec?: number,
  endSec?: number
): FrameRange | null => {
  if (startSec == null || endSec == null) {
    const frames = numFrames(sample);
    return frames > 0 ? { start: 0, end: frames } : null;
  }
  let start = clampFrame(sample, secondsToFrame(sample, startSec));
  let end = clampFrame(sample, secondsToFrame(sample, endSec));
  if (start > end) {
    [start, end] = [end, start];
  }
  return end > start ? { start, end } : null;
};

const mapChannels = (
  sample: AudioSample,
  fn: (channel: Float32Array) => Float32Array
): AudioSample => ({
  sampleRate: sample.sampleRate,
  channels: sample.channels.map(fn)
});

/** Keep only the selected range (trim/crop). */
export const cropToRange = (
  sample: AudioSample,
  startSec: number,
  endSec: number
): AudioSample => {
  const range = resolveRange(sample, startSec, endSec);
  if (!range) return sample;
  return mapChannels(sample, (channel) => channel.slice(range.start, range.end));
};

/** Remove the selected range, joining the surrounding audio. */
export const deleteRange = (
  sample: AudioSample,
  startSec: number,
  endSec: number
): AudioSample => {
  const range = resolveRange(sample, startSec, endSec);
  if (!range) return sample;
  const removed = range.end - range.start;
  const remaining = numFrames(sample) - removed;
  return mapChannels(sample, (channel) => {
    const out = new Float32Array(remaining);
    out.set(channel.subarray(0, range.start), 0);
    out.set(channel.subarray(range.end), range.start);
    return out;
  });
};

/** Replace the selected range (or whole sample) with silence. */
export const silenceRange = (
  sample: AudioSample,
  startSec?: number,
  endSec?: number
): AudioSample => {
  const range = resolveRange(sample, startSec, endSec);
  if (!range) return sample;
  return mapChannels(sample, (channel) => {
    const out = channel.slice();
    out.fill(0, range.start, range.end);
    return out;
  });
};

const gainRange = (
  sample: AudioSample,
  gain: number,
  range: FrameRange
): AudioSample =>
  mapChannels(sample, (channel) => {
    const out = channel.slice();
    for (let i = range.start; i < range.end; i += 1) {
      out[i] = Math.max(-1, Math.min(1, out[i] * gain));
    }
    return out;
  });

/** Multiply amplitude by `gain` over the range (or the whole sample). */
export const applyGain = (
  sample: AudioSample,
  gain: number,
  startSec?: number,
  endSec?: number
): AudioSample => {
  const range = resolveRange(sample, startSec, endSec);
  if (!range) return sample;
  return gainRange(sample, gain, range);
};

/** Scale so the loudest sample in the range (or whole) hits full scale. */
export const normalize = (
  sample: AudioSample,
  startSec?: number,
  endSec?: number
): AudioSample => {
  const range = resolveRange(sample, startSec, endSec);
  if (!range) return sample;
  let peak = 0;
  for (const channel of sample.channels) {
    for (let i = range.start; i < range.end; i += 1) {
      const v = Math.abs(channel[i]);
      if (v > peak) peak = v;
    }
  }
  if (peak === 0) return sample;
  return gainRange(sample, 1 / peak, range);
};

/** Apply a linear fade in or out across the range. */
export const fade = (
  sample: AudioSample,
  startSec: number,
  endSec: number,
  direction: FadeDirection
): AudioSample => {
  const range = resolveRange(sample, startSec, endSec);
  if (!range) return sample;
  const span = range.end - range.start;
  const denom = span > 1 ? span - 1 : 1;
  return mapChannels(sample, (channel) => {
    const out = channel.slice();
    for (let i = 0; i < span; i += 1) {
      const t = i / denom;
      out[range.start + i] *= direction === "in" ? t : 1 - t;
    }
    return out;
  });
};

/** Reverse the samples in the range (or the whole sample). */
export const reverseRange = (
  sample: AudioSample,
  startSec?: number,
  endSec?: number
): AudioSample => {
  const range = resolveRange(sample, startSec, endSec);
  if (!range) return sample;
  return mapChannels(sample, (channel) => {
    const out = channel.slice();
    let lo = range.start;
    let hi = range.end - 1;
    while (lo < hi) {
      const tmp = out[lo];
      out[lo] = out[hi];
      out[hi] = tmp;
      lo += 1;
      hi -= 1;
    }
    return out;
  });
};

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

const writeAscii = (view: DataView, offset: number, text: string): void => {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
};

/** Encode the sample as a 16-bit PCM WAV file. */
export const encodeWav = (sample: AudioSample): ArrayBuffer => {
  const channels = sample.channels;
  const channelCount = Math.max(1, channels.length);
  const frames = numFrames(sample);
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sample.sampleRate, true);
  view.setUint32(28, sample.sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < channelCount; c += 1) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      offset += 2;
    }
  }
  return buffer;
};

/** Base64-encode an ArrayBuffer, chunked to stay within argument limits. */
export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...Array.from(chunk));
  }
  return btoa(binary);
};

// ---------------------------------------------------------------------------
// Web Audio interop
// ---------------------------------------------------------------------------

/** Copy a decoded AudioBuffer into a detached AudioSample. */
export const audioBufferToSample = (buffer: AudioBuffer): AudioSample => {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    channels.push(Float32Array.from(buffer.getChannelData(c)));
  }
  if (channels.length === 0) {
    channels.push(new Float32Array(buffer.length));
  }
  return { sampleRate: buffer.sampleRate, channels };
};

/** Build a playable AudioBuffer from a sample (length forced to at least 1). */
export const sampleToAudioBuffer = (
  sample: AudioSample,
  ctx: BaseAudioContext
): AudioBuffer => {
  const frames = Math.max(1, numFrames(sample));
  const buffer = ctx.createBuffer(numChannels(sample), frames, sample.sampleRate);
  sample.channels.forEach((channel, i) => {
    if (channel.length > 0) {
      // Channels are always ArrayBuffer-backed at runtime; the cast narrows the
      // default ArrayBufferLike element type that copyToChannel rejects.
      buffer.copyToChannel(channel as Float32Array<ArrayBuffer>, i);
    }
  });
  return buffer;
};
