/**
 * AudioWorklet processor for realtime chunk playback.
 *
 * Receives interleaved Float32Array sample chunks over its MessagePort and
 * renders them on the audio rendering thread — playback is immune to
 * main-thread jank (canvas drags, React renders, GC). Replaces the old
 * AudioBufferSourceNode-per-chunk scheduling, which glitched whenever the
 * main thread stalled past the scheduled lead.
 *
 * Behavior:
 * - Primes a small jitter buffer before starting (and re-primes after an
 *   underrun) so a single late chunk doesn't crackle.
 * - In live mode, drops the oldest buffered audio when the backlog exceeds
 *   the max lead — a live patch monitors "now", stale audio is worse than a
 *   dropped instant.
 * - Linear-interpolation resampling from the chunk sample rate to the
 *   context rate (the context is created at the chunk rate when the browser
 *   allows it, making this a pass-through).
 *
 * Port protocol (all main→worklet):
 *   { type: "config", sampleRate, channels, live, primeSeconds, maxLeadSeconds }
 *   { type: "chunk", samples: Float32Array }   interleaved samples
 *   { type: "reset" }                          drop all buffered audio
 */

/* global AudioWorkletProcessor, registerProcessor, sampleRate */

class NodetoolChunkPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    /** Queued interleaved sample chunks (FIFO). */
    this.segments = [];
    /** Frames already consumed from segments[0]. */
    this.segOffset = 0;
    /** Total buffered source frames across all segments. */
    this.buffered = 0;

    this.srcRate = sampleRate;
    this.channels = 1;
    this.live = false;
    this.primeFrames = Math.round(0.04 * sampleRate);
    this.maxFrames = Infinity;

    /** True while primed and emitting audio. */
    this.rolling = false;
    /** Fractional source-frame position between prevFrame (0) and currFrame (1). */
    this.pos = 1;
    this.prevFrame = null;
    this.currFrame = null;

    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  handleMessage(d) {
    if (!d || typeof d !== "object") return;
    if (d.type === "config") {
      if (typeof d.sampleRate === "number" && d.sampleRate > 0) {
        this.srcRate = d.sampleRate;
      }
      if (typeof d.channels === "number" && d.channels >= 1) {
        this.channels = Math.floor(d.channels);
      }
      this.live = Boolean(d.live);
      const prime =
        typeof d.primeSeconds === "number" && d.primeSeconds > 0
          ? d.primeSeconds
          : 0.04;
      this.primeFrames = Math.max(1, Math.round(prime * this.srcRate));
      const maxLead =
        typeof d.maxLeadSeconds === "number" && d.maxLeadSeconds > 0
          ? d.maxLeadSeconds
          : 0;
      this.maxFrames =
        this.live && maxLead > 0
          ? Math.round(maxLead * this.srcRate)
          : Infinity;
      return;
    }
    if (d.type === "reset") {
      this.segments = [];
      this.segOffset = 0;
      this.buffered = 0;
      this.rolling = false;
      this.pos = 1;
      this.prevFrame = null;
      this.currFrame = null;
      return;
    }
    if (d.type === "chunk" && d.samples instanceof Float32Array) {
      const frames = Math.floor(d.samples.length / this.channels);
      if (frames <= 0) return;
      this.segments.push(d.samples);
      this.buffered += frames;
      // Live monitoring: a backlog beyond the max lead is stale — drop the
      // oldest whole segments down to the prime level (jump to "now").
      if (this.buffered > this.maxFrames) {
        while (this.segments.length > 1) {
          const seg = this.segments[0];
          const remaining =
            Math.floor(seg.length / this.channels) - this.segOffset;
          if (this.buffered - remaining < this.primeFrames) break;
          this.segments.shift();
          this.segOffset = 0;
          this.buffered -= remaining;
        }
      }
    }
  }

  /** Copy the next source frame into `target`; false on underrun. */
  pullFrame(target) {
    while (this.segments.length > 0) {
      const seg = this.segments[0];
      const framesInSeg = Math.floor(seg.length / this.channels);
      if (this.segOffset < framesInSeg) {
        const base = this.segOffset * this.channels;
        for (let c = 0; c < this.channels; c++) {
          target[c] = seg[base + c];
        }
        this.segOffset++;
        this.buffered--;
        return true;
      }
      this.segments.shift();
      this.segOffset = 0;
    }
    return false;
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const frames = out[0].length;

    if (!this.rolling) {
      if (this.buffered >= this.primeFrames) {
        this.rolling = true;
        this.pos = 1; // force pulling the first frame
        this.prevFrame = new Float32Array(this.channels);
        this.currFrame = new Float32Array(this.channels);
      } else {
        return true; // output buffers are pre-zeroed → silence
      }
    }

    const ratio = this.srcRate / sampleRate;
    for (let i = 0; i < frames; i++) {
      this.pos += ratio;
      while (this.pos >= 1) {
        const tmp = this.prevFrame;
        this.prevFrame = this.currFrame;
        this.currFrame = tmp;
        if (!this.pullFrame(this.currFrame)) {
          // Underrun: go silent for the rest of the block and re-prime.
          this.rolling = false;
          return true;
        }
        this.pos -= 1;
      }
      const t = this.pos;
      for (let c = 0; c < out.length; c++) {
        const src = c < this.channels ? c : 0;
        out[c][i] =
          this.prevFrame[src] + (this.currFrame[src] - this.prevFrame[src]) * t;
      }
    }
    return true;
  }
}

registerProcessor("nodetool-chunk-player", NodetoolChunkPlayer);
