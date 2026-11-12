import { nativeAudioData } from './media-decode.mjs';

const DECODE_MAX_BYTES = 256 * 1024 * 1024;

// The decode subset of OfflineAudioContext used by the audio nodes. The
// filter nodes run the kernel library, so no graph is rendered here.
class OfflineAudioContext {
  constructor(channels, length, sampleRate) {
    this.channels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.destination = {};
  }
  createBuffer(channels, length) {
    const planes = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, getChannelData: (ch) => planes[ch] };
  }
  // Compressed input decodes through the native media host, which stages the
  // bytes in the granted workspace. Without one this rejects, and callers
  // report that the format is unreadable. As in WebAudio, the result is
  // resampled to the context's rate.
  async decodeAudioData(arrayBuffer) {
    const { samples, channels, sampleRate } = await nativeAudioData(new Uint8Array(arrayBuffer), undefined, DECODE_MAX_BYTES, this.sampleRate);
    const length = samples.length / channels;
    const planes = Array.from({ length: channels }, () => new Float32Array(length));
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < channels; ch++) planes[ch][i] = samples[i * channels + ch];
    }
    return { length, sampleRate, numberOfChannels: channels, duration: length / sampleRate, getChannelData: (ch) => planes[ch] };
  }
  createBufferSource() {
    return { connect() {}, start() {}, buffer: null };
  }
  async startRendering() {
    throw new Error('Unsupported offline audio graph');
  }
}
export async function loadOfflineAudioContext() { return OfflineAudioContext; }
