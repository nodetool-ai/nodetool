import { BaseNode, prop } from "@nodetool-ai/node-sdk";

export abstract class BitcrushProperties extends BaseNode {
  @prop({
    type: "int",
    default: 8,
    title: "Bit Depth",
    description:
      "The bit depth to reduce the audio to. Lower values create more distortion.",
    min: 1,
    max: 16
  })
  declare bit_depth: number;
  @prop({
    type: "int",
    default: 1,
    title: "Sample Rate Reduction",
    description:
      "Factor by which to reduce the sample rate. Higher values create more aliasing.",
    min: 1,
    max: 100
  })
  declare sample_rate_reduction: number;
}

export abstract class CompressProperties extends BaseNode {
  @prop({
    type: "float",
    default: -20,
    title: "Threshold",
    description: "Threshold in dB above which compression is applied.",
    min: -60,
    max: 0
  })
  declare threshold: number;
  @prop({
    type: "float",
    default: 4,
    title: "Ratio",
    description: "Compression ratio. Higher values result in more compression.",
    min: 1,
    max: 20
  })
  declare ratio: number;
  @prop({
    type: "float",
    default: 5,
    title: "Attack",
    description: "Attack time in milliseconds.",
    min: 0.1,
    max: 100
  })
  declare attack: number;
  @prop({
    type: "float",
    default: 50,
    title: "Release",
    description: "Release time in milliseconds.",
    min: 5,
    max: 1000
  })
  declare release: number;
  @prop({
    type: "bool",
    default: true,
    title: "Auto Gain",
    description:
      "Apply automatic makeup gain to compensate for the level lost to compression, keeping the output roughly as loud as the input."
  })
  declare auto_gain: boolean;
}

export abstract class DistortionProperties extends BaseNode {
  @prop({
    type: "float",
    default: 25,
    title: "Drive Db",
    description: "Amount of distortion to apply in decibels.",
    min: 0,
    max: 100
  })
  declare drive_db: number;
}

export abstract class LimiterProperties extends BaseNode {
  @prop({
    type: "float",
    default: -2,
    title: "Threshold Db",
    description: "Threshold in dB above which the limiter is applied.",
    min: -60,
    max: 0
  })
  declare threshold_db: number;
  @prop({
    type: "float",
    default: 250,
    title: "Release Ms",
    description: "Release time in milliseconds.",
    min: 1,
    max: 1000
  })
  declare release_ms: number;
  @prop({
    type: "bool",
    default: true,
    title: "Auto Gain",
    description:
      "Apply automatic makeup gain so the limited peaks reach 0 dBFS, turning the headroom below the ceiling into added loudness (maximizer behaviour)."
  })
  declare auto_gain: boolean;
}

export abstract class ReverbProperties extends BaseNode {
  @prop({
    type: "float",
    default: 0.5,
    title: "Room Scale",
    description:
      "Size of the simulated room. Higher values create larger spaces.",
    min: 0,
    max: 1
  })
  declare room_scale: number;
  @prop({
    type: "float",
    default: 0.5,
    title: "Damping",
    description:
      "Amount of high frequency absorption. Higher values create a duller sound.",
    min: 0,
    max: 1
  })
  declare damping: number;
  @prop({
    type: "float",
    default: 0.15,
    title: "Wet Level",
    description: "Level of the reverb effect in the output.",
    min: 0,
    max: 1
  })
  declare wet_level: number;
  @prop({
    type: "float",
    default: 0.5,
    title: "Dry Level",
    description: "Level of the original signal in the output.",
    min: 0,
    max: 1
  })
  declare dry_level: number;
}

export abstract class NoiseGateProperties extends BaseNode {
  @prop({
    type: "float",
    default: -50,
    title: "Threshold Db",
    description: "Threshold in dB below which the gate is active.",
    min: -90,
    max: 0
  })
  declare threshold_db: number;
  @prop({
    type: "float",
    default: 1,
    title: "Attack Ms",
    description: "Attack time in milliseconds.",
    min: 0.1,
    max: 100
  })
  declare attack_ms: number;
  @prop({
    type: "float",
    default: 100,
    title: "Release Ms",
    description: "Release time in milliseconds.",
    min: 5,
    max: 1000
  })
  declare release_ms: number;
}

export abstract class PhaserProperties extends BaseNode {
  @prop({
    type: "float",
    default: 1,
    title: "Rate Hz",
    description: "Rate of the phaser effect in Hz.",
    min: 0.1,
    max: 10
  })
  declare rate_hz: number;
  @prop({
    type: "float",
    default: 0.5,
    title: "Depth",
    description: "Depth of the phaser effect.",
    min: 0,
    max: 1
  })
  declare depth: number;
  @prop({
    type: "float",
    default: 1300,
    title: "Centre Frequency Hz",
    description: "Centre frequency of the phaser in Hz.",
    min: 100,
    max: 5000
  })
  declare centre_frequency_hz: number;
  @prop({
    type: "float",
    default: 0,
    title: "Feedback",
    description:
      "Feedback of the phaser effect. Negative values invert the phase.",
    min: -1,
    max: 1
  })
  declare feedback: number;
  @prop({
    type: "float",
    default: 0.5,
    title: "Mix",
    description: "Mix between the dry (original) and wet (effected) signals.",
    min: 0,
    max: 1
  })
  declare mix: number;
}

export abstract class GainProperties extends BaseNode {
  @prop({
    type: "float",
    default: 0,
    title: "Gain Db",
    description:
      "Gain to apply in decibels. Positive values increase volume, negative values decrease it.",
    min: -60,
    max: 24
  })
  declare gain_db: number;
}

export abstract class DelayProperties extends BaseNode {
  @prop({
    type: "float",
    default: 0.5,
    title: "Delay Seconds",
    description: "Delay time in seconds.",
    min: 0.01,
    max: 5
  })
  declare delay_seconds: number;
  @prop({
    type: "float",
    default: 0.3,
    title: "Feedback",
    description: "Amount of delayed signal fed back into the effect.",
    min: 0,
    max: 0.99
  })
  declare feedback: number;
  @prop({
    type: "float",
    default: 0.5,
    title: "Mix",
    description: "Mix between the dry (original) and wet (delayed) signals.",
    min: 0,
    max: 1
  })
  declare mix: number;
}

export abstract class HighPassFilterProperties extends BaseNode {
  @prop({
    type: "float",
    default: 80,
    title: "Cutoff Frequency Hz",
    description: "The cutoff frequency of the high-pass filter in Hz.",
    min: 20,
    max: 5000
  })
  declare cutoff_frequency_hz: number;
}

export abstract class LowPassFilterProperties extends BaseNode {
  @prop({
    type: "float",
    default: 5000,
    title: "Cutoff Frequency Hz",
    description: "The cutoff frequency of the low-pass filter in Hz.",
    min: 500,
    max: 20000
  })
  declare cutoff_frequency_hz: number;
}

export abstract class HighShelfFilterProperties extends BaseNode {
  @prop({
    type: "float",
    default: 5000,
    title: "Cutoff Frequency Hz",
    description: "The cutoff frequency of the shelf filter in Hz.",
    min: 1000,
    max: 20000
  })
  declare cutoff_frequency_hz: number;
  @prop({
    type: "float",
    default: 0,
    title: "Gain Db",
    description:
      "The gain to apply to the frequencies above the cutoff, in dB.",
    min: -24,
    max: 24
  })
  declare gain_db: number;
}

export abstract class LowShelfFilterProperties extends BaseNode {
  @prop({
    type: "float",
    default: 200,
    title: "Cutoff Frequency Hz",
    description: "The cutoff frequency of the shelf filter in Hz.",
    min: 20,
    max: 1000
  })
  declare cutoff_frequency_hz: number;
  @prop({
    type: "float",
    default: 0,
    title: "Gain Db",
    description:
      "The gain to apply to the frequencies below the cutoff, in dB.",
    min: -24,
    max: 24
  })
  declare gain_db: number;
}

export abstract class PeakFilterProperties extends BaseNode {
  @prop({
    type: "float",
    default: 1000,
    title: "Cutoff Frequency Hz",
    description: "The cutoff frequency of the band-pass filter in Hz.",
    min: 20,
    max: 20000
  })
  declare cutoff_frequency_hz: number;
  @prop({
    type: "float",
    default: 1,
    title: "Q Factor",
    description:
      "The Q factor, determining the width of the band. Higher values create narrower bands.",
    min: 0.1,
    max: 10
  })
  declare q_factor: number;
  @prop({
    type: "float",
    default: 0,
    title: "Gain Db",
    description:
      "The gain to apply at the centre frequency, in dB. Positive values boost, negative values cut.",
    min: -24,
    max: 24
  })
  declare gain_db: number;
}
