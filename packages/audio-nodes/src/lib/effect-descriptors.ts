import type { SignalEffect } from "./signal-effect.js";
import type {
  BitcrushProperties,
  CompressProperties,
  DistortionProperties,
  LimiterProperties,
  ReverbProperties,
  NoiseGateProperties,
  PhaserProperties,
  GainProperties,
  DelayProperties,
  HighPassFilterProperties,
  LowPassFilterProperties,
  HighShelfFilterProperties,
  LowShelfFilterProperties,
  PeakFilterProperties
} from "./effect-properties.js";

export const BitcrushEffect: SignalEffect<BitcrushProperties> = {
  kernel: "nt_audio_bitcrush_block",
  create: (_n, k, c, r) => k.createBitcrushState(c, r),
  process: (n, k, state, samples, c, _r) =>
    k.bitcrushBlock(state, samples, c, n.bit_depth, n.sample_rate_reduction)
};

export const CompressEffect: SignalEffect<CompressProperties> = {
  kernel: "nt_audio_compress_block",
  create: (_n, k, c, r) => k.createCompressState(c, r),
  process: (n, k, state, samples, c, r) =>
    k.compressBlock(state, samples, c, r, {
      thresholdDb: n.threshold,
      ratio: n.ratio,
      attackMs: n.attack,
      releaseMs: n.release,
      autoGain: n.auto_gain
    })
};

export const DistortionEffect: SignalEffect<DistortionProperties> = {
  kernel: "nt_audio_distortion",
  create: () => new Float64Array(0),
  process: (n, k, _state, samples) => k.distortion(samples, n.drive_db)
};

export const LimiterEffect: SignalEffect<LimiterProperties> = {
  kernel: "nt_audio_limiter_block",
  create: (_n, k, c, r) => k.createLimiterState(c, r),
  process: (n, k, state, samples, c, r) =>
    k.limiterBlock(state, samples, c, r, {
      thresholdDb: n.threshold_db,
      releaseMs: n.release_ms,
      autoGain: n.auto_gain
    })
};

export const ReverbEffect: SignalEffect<ReverbProperties> = {
  kernel: "nt_audio_reverb_block",
  create: (_n, k, c, r) => k.createReverbState(c, r),
  process: (n, k, state, samples, c, r) =>
    k.reverbBlock(state, samples, c, r, {
      roomScale: n.room_scale,
      damping: n.damping,
      wetLevel: n.wet_level,
      dryLevel: n.dry_level
    })
};

export const NoiseGateEffect: SignalEffect<NoiseGateProperties> = {
  kernel: "nt_audio_noise_gate_block",
  create: (_n, k, c, r) => k.createNoiseGateState(c, r),
  process: (n, k, state, samples, c, r) =>
    k.noiseGateBlock(state, samples, c, r, {
      thresholdDb: n.threshold_db,
      attackMs: n.attack_ms,
      releaseMs: n.release_ms
    })
};

export const PhaserEffect: SignalEffect<PhaserProperties> = {
  kernel: "nt_audio_phaser_block",
  create: (_n, k, c, r) => k.createPhaserState(c, r),
  process: (n, k, state, samples, c, r) =>
    k.phaserBlock(state, samples, c, r, {
      rateHz: n.rate_hz,
      depth: n.depth,
      centreFrequencyHz: n.centre_frequency_hz,
      feedback: n.feedback,
      mix: n.mix
    })
};

export const GainEffect: SignalEffect<GainProperties> = {
  kernel: "nt_signal_scale_offset",
  create: () => new Float64Array(0),
  process: (n, k, _state, samples) =>
    k.scaleOffset(samples, Math.pow(10, n.gain_db / 20))
};

export const DelayEffect: SignalEffect<DelayProperties> = {
  kernel: "nt_audio_delay_block",
  create: (_n, k, c, r) => k.createDelayState(c, r, _n.delay_seconds),
  process: (n, k, state, samples, c, r) =>
    k.delayBlock(state, samples, c, r, {
      delaySeconds: n.delay_seconds,
      feedback: n.feedback,
      mix: n.mix
    }),
  structural: (n) => n.delay_seconds,
  tail: (n, r) => Math.floor(n.delay_seconds * r) * 4,
  clip: (n, k, samples, c, r) =>
    k.delay(samples, c, r, {
      delaySeconds: n.delay_seconds,
      feedback: n.feedback,
      mix: n.mix
    })
};

export const HighPassFilterEffect: SignalEffect<HighPassFilterProperties> = {
  kernel: "nt_biquad_process",
  create: (_n, k, c) => k.createBiquadState(c),
  process: (n, k, state, samples, c, r) =>
    k.biquadProcess(
      k.biquadDesign("webaudio", "highpass", r, n.cutoff_frequency_hz, 1, 0),
      state,
      samples,
      c
    )
};

export const LowPassFilterEffect: SignalEffect<LowPassFilterProperties> = {
  kernel: "nt_biquad_process",
  create: (_n, k, c) => k.createBiquadState(c),
  process: (n, k, state, samples, c, r) =>
    k.biquadProcess(
      k.biquadDesign("webaudio", "lowpass", r, n.cutoff_frequency_hz, 1, 0),
      state,
      samples,
      c
    )
};

export const HighShelfFilterEffect: SignalEffect<HighShelfFilterProperties> = {
  kernel: "nt_biquad_process",
  create: (_n, k, c) => k.createBiquadState(c),
  process: (n, k, state, samples, c, r) =>
    k.biquadProcess(
      k.biquadDesign(
        "webaudio",
        "highshelf",
        r,
        n.cutoff_frequency_hz,
        1,
        n.gain_db
      ),
      state,
      samples,
      c
    )
};

export const LowShelfFilterEffect: SignalEffect<LowShelfFilterProperties> = {
  kernel: "nt_biquad_process",
  create: (_n, k, c) => k.createBiquadState(c),
  process: (n, k, state, samples, c, r) =>
    k.biquadProcess(
      k.biquadDesign(
        "webaudio",
        "lowshelf",
        r,
        n.cutoff_frequency_hz,
        1,
        n.gain_db
      ),
      state,
      samples,
      c
    )
};

export const PeakFilterEffect: SignalEffect<PeakFilterProperties> = {
  kernel: "nt_biquad_process",
  create: (_n, k, c) => k.createBiquadState(c),
  process: (n, k, state, samples, c, r) =>
    k.biquadProcess(
      k.biquadDesign(
        "webaudio",
        "peaking",
        r,
        n.cutoff_frequency_hz,
        n.q_factor,
        n.gain_db
      ),
      state,
      samples,
      c
    )
};
