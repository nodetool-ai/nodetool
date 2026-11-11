import { biquadCoeffs, createBiquadState, processBiquad } from '@nodetool-ai/audio-nodes/lib/biquad';
import { nativeAudioData } from './media-decode.mjs';

const DECODE_MAX_BYTES = 256 * 1024 * 1024;

// The offline buffer/filter subset used by the batch DSP nodes. WebAudio
// specifies low/high-pass Q in dB, unlike the RBJ fallback's linear Q.
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
    const source = { connect() {}, start() {}, buffer: null };
    this.source = source;
    return source;
  }
  createBiquadFilter() {
    const filter = { type: 'lowpass', frequency: { value: 350 }, Q: { value: 1 }, gain: { value: 0 }, connect() {} };
    this.filter = filter;
    return filter;
  }
  async startRendering() {
    const f = this.filter;
    if (!f || !this.source?.buffer) throw new Error('Unsupported offline audio graph');
    const q = f.type === 'lowpass' || f.type === 'highpass'
      ? Math.pow(10, f.Q.value / 20)
      : f.type === 'lowshelf' || f.type === 'highshelf' ? Math.SQRT1_2 : f.Q.value;
    const coeffs = biquadCoeffs(f.type, this.sampleRate, f.frequency.value, q, f.gain.value);
    const out = this.createBuffer(this.channels, this.length);
    for (let ch = 0; ch < this.channels; ch++) {
      out.getChannelData(ch).set(processBiquad(coeffs, createBiquadState(), this.source.buffer.getChannelData(ch)));
    }
    return out;
  }
}
export async function loadOfflineAudioContext() { return OfflineAudioContext; }
