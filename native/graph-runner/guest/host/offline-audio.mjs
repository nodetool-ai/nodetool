import { biquadCoeffs, createBiquadState, processBiquad } from '@nodetool-ai/audio-nodes/lib/biquad';

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
