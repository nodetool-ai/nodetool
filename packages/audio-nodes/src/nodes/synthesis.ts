/**
 * Modular synthesis nodes (`nodetool.audio.synth.*`) — a subtractive synth
 * voice operating on streamed signal chunks: oscillator, LFO, ADSR, gate
 * source, VCA, VCF, CV utilities, and a mixer.
 *
 * Timing is sample-domain: time = sample count; the wall clock only paces
 * emission. Free-running generators (Oscillator, LFO, Gate) are realtime
 * modules: they emit forever, paced by `RealtimePacer`, until the run is
 * cancelled (pacing delays emission but never changes signal content).
 * Driven nodes derive all timing from their input chunks (one output chunk
 * per input chunk, same frame count), so a patch driven by one Gate source
 * is sample-aligned by construction.
 *
 * Control voltage (CV) is a first-class socket type riding the chunk wire
 * shape with `encoding: "f32le"` (see ../lib/cv.ts) — interchangeable with
 * audio chunk streams, Eurorack-style. Pitch CV is volts/octave equivalent:
 * `freq = base_frequency * 2^cv`, cv in octaves.
 *
 * Limitation: the workflow graph is a strict DAG — feedback patching (e.g.
 * an envelope modulating its own gate) is not supported.
 */
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type {
  NodeClass,
  StreamingInputs,
  StreamingOutputs
} from "@nodetool-ai/node-sdk";
import { tagAsHybrid } from "@nodetool-ai/nodes-utils";
import { deinterleave, interleave } from "../lib/audio-wav.js";
import {
  alignedSignalStreams,
  CHUNK_PROP_DEFAULT,
  makeDoneSignalChunk,
  makeSignalChunk,
  readSignalChunk,
  RealtimePacer,
  SampleFifo,
  SYNTH_CHUNK_FRAMES,
  SYNTH_SAMPLE_RATE,
  type SignalEncoding
} from "../lib/cv.js";
import {
  biquadCoeffs,
  createBiquadState,
  processBiquad,
  DEFAULT_Q,
  type BiquadState
} from "../lib/biquad.js";
import {
  adsrCoeff,
  adsrStep,
  createAdsrState,
  GATE_THRESHOLD,
  oscSample,
  type Waveform
} from "../lib/synth-dsp.js";

// ── Shared generator scaffolding ───────────────────────────────────

/**
 * Run a free-running generator loop: calls `fill` to produce each chunk's
 * samples, paces emission with the wall clock, and runs until cancellation
 * (`signal`) — free-running synth sources have no other end; they play
 * until the patch is stopped. Pacing is what keeps the infinite stream
 * legal: inbox buffering is unbounded by default, and an unpaced infinite
 * producer would exhaust memory.
 */
async function runGenerator(
  outputs: StreamingOutputs,
  opts: {
    slot: string;
    sampleRate: number;
    encoding: SignalEncoding;
    signal: AbortSignal;
    fill: (buf: Float32Array, startFrame: number) => void;
  }
): Promise<void> {
  const { slot, sampleRate, encoding, signal } = opts;
  const pacer = new RealtimePacer(signal);
  const chunkMs = (SYNTH_CHUNK_FRAMES / sampleRate) * 1000;
  let emitted = 0;
  while (await pacer.waitNext(chunkMs)) {
    const buf = new Float32Array(SYNTH_CHUNK_FRAMES);
    opts.fill(buf, emitted);
    await outputs.emit(
      slot,
      makeSignalChunk(buf, sampleRate, 1, false, encoding)
    );
    emitted += SYNTH_CHUNK_FRAMES;
  }
  await outputs.emit(slot, makeDoneSignalChunk(sampleRate, 1, encoding));
}

/** Channel 0 of an interleaved chunk — CV inputs are conceptually mono. */
function chunkMono(samples: Float32Array, channels: number): Float32Array {
  const ch = Math.max(1, channels);
  if (ch === 1) return samples;
  const frames = Math.floor(samples.length / ch);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) out[i] = samples[i * ch];
  return out;
}

// ── Oscillator (VCO) ───────────────────────────────────────────────

export class OscillatorNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.synth.Oscillator";
  static readonly title = "Oscillator";
  static readonly description =
    "Voltage-controlled oscillator generating sine, saw, square, triangle or noise audio.\n    audio, synthesis, oscillator, vco, modular\n\n    Pitch CV is volts/octave: freq = frequency * 2^cv (cv in octaves). With pitch_cv or fm patched, output follows that stream's chunk cadence (sample-aligned); otherwise it free-runs wall-clock paced until the run is stopped. Naive waveforms — saw/square alias at high frequencies.\n\n    Use cases:\n    - Sound source for a modular synth voice\n    - FM/vibrato via the fm input driven by an LFO\n    - Melodic sequences via a pitch CV stream";
  static readonly metadataOutputTypes = { chunk: "chunk" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["pitch_cv", "fm"];
  static readonly isStreamingInput = true;

  @prop({
    type: "cv",
    default: CHUNK_PROP_DEFAULT,
    title: "Pitch CV",
    description:
      "Pitch control stream in octaves (volts/octave): freq = frequency * 2^cv. When patched, drives the output chunk cadence."
  })
  declare pitch_cv: any;

  @prop({
    type: "cv",
    default: CHUNK_PROP_DEFAULT,
    title: "FM",
    description:
      "Linear frequency modulation stream: freq is multiplied by (1 + fm_amount * fm)."
  })
  declare fm: any;

  @prop({
    type: "enum",
    default: "sine",
    title: "Waveform",
    description: "Oscillator waveform.",
    values: ["sine", "saw", "square", "triangle", "noise"]
  })
  declare waveform: any;

  @prop({
    type: "float",
    default: 220,
    title: "Frequency",
    description: "Base frequency in Hz.",
    min: 0.1,
    max: 20000
  })
  declare frequency: any;

  @prop({
    type: "float",
    default: 0.8,
    title: "Amplitude",
    description: "Output amplitude (linear).",
    min: 0,
    max: 1
  })
  declare amplitude: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Pulse Width",
    description: "Duty cycle for the square waveform.",
    min: 0.05,
    max: 0.95
  })
  declare pulse_width: any;

  @prop({
    type: "float",
    default: 0,
    title: "FM Amount",
    description: "Depth of linear frequency modulation from the fm input.",
    min: 0,
    max: 10
  })
  declare fm_amount: any;

  @prop({
    type: "int",
    default: SYNTH_SAMPLE_RATE,
    title: "Sample Rate",
    description: "Free-run sample rate in Hz.",
    min: 8000,
    max: 96000
  })
  declare sample_rate: any;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  /** Current property values — read per chunk so live updates apply. */
  private params(): {
    waveform: Waveform;
    baseFreq: number;
    amplitude: number;
    pulseWidth: number;
    fmAmount: number;
  } {
    return {
      waveform: String(this.waveform ?? "sine") as Waveform,
      baseFreq: Number(this.frequency ?? 220),
      amplitude: Number(this.amplitude ?? 0.8),
      pulseWidth: Number(this.pulse_width ?? 0.5),
      fmAmount: Number(this.fm_amount ?? 0)
    };
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    // Double-precision phase accumulator carried across chunks — no drift.
    // Properties are re-read at every chunk boundary (params()), so live
    // updates pushed via applyProperties land on the next chunk.
    let phase = 0;
    type OscParams = ReturnType<OscillatorNode["params"]>;
    const sampleAt = (
      p: OscParams,
      freq: number,
      sampleRate: number
    ): number => {
      const f = Math.min(Math.max(freq, 0), sampleRate / 2 - 1e-6);
      const out = p.amplitude * oscSample(p.waveform, phase, p.pulseWidth);
      phase = (phase + f / sampleRate) % 1;
      return out;
    };

    const hasPitch = inputs.hasStream("pitch_cv");
    const hasFm = inputs.hasStream("fm");

    if (hasPitch || hasFm) {
      // Clocked: the patched CV stream drives chunk cadence; the other
      // handle (if any) is frame-aligned via zip-with-hold.
      const primary = hasPitch ? "pitch_cv" : "fm";
      const secondary = hasPitch ? "fm" : "pitch_cv";
      let sampleRate = SYNTH_SAMPLE_RATE;
      for await (const frame of alignedSignalStreams(inputs, {
        primary,
        cvHandles: [secondary]
      })) {
        const p = this.params();
        sampleRate = frame.primary.sampleRate;
        const drive = chunkMono(frame.primary.samples, frame.primary.channels);
        const other = frame.cv[secondary];
        const buf = new Float32Array(drive.length);
        for (let i = 0; i < drive.length; i++) {
          const pitch = hasPitch ? drive[i] : (other?.[i] ?? 0);
          const fm = hasPitch ? (other?.[i] ?? 0) : drive[i];
          const freq = p.baseFreq * Math.pow(2, pitch) * (1 + p.fmAmount * fm);
          buf[i] = sampleAt(p, freq, sampleRate);
        }
        await outputs.emit(
          "chunk",
          makeSignalChunk(buf, sampleRate, 1, false, "pcm16le")
        );
      }
      await outputs.emit(
        "chunk",
        makeDoneSignalChunk(sampleRate, 1, "pcm16le")
      );
      return;
    }

    const sampleRate = Number(this.sample_rate ?? SYNTH_SAMPLE_RATE);
    await runGenerator(outputs, {
      slot: "chunk",
      sampleRate,
      encoding: "pcm16le",
      signal: inputs.signal,
      fill: (buf) => {
        const p = this.params();
        for (let i = 0; i < buf.length; i++) {
          buf[i] = sampleAt(p, p.baseFreq, sampleRate);
        }
      }
    });
  }
}

// ── LFO ────────────────────────────────────────────────────────────

export class LfoNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.synth.LFO";
  static readonly title = "LFO";
  static readonly description =
    "Low-frequency oscillator emitting a control-voltage stream.\n    cv, synthesis, lfo, modulation, modular\n\n    Output is offset + depth * wave(phase). With a clock patched, emits one chunk per clock chunk (sample-aligned) and resets phase on each clock rising edge; otherwise free-runs wall-clock paced until the run is stopped.\n\n    Use cases:\n    - Vibrato/tremolo via Oscillator fm or VCA cv\n    - Filter sweeps via VCF cutoff_cv\n    - Slow parameter drift in generative patches";
  static readonly metadataOutputTypes = { cv: "cv" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["clock"];
  static readonly isStreamingInput = true;

  @prop({
    type: "cv",
    default: CHUNK_PROP_DEFAULT,
    title: "Clock",
    description:
      "Optional clock stream: drives chunk cadence; phase resets on each rising edge."
  })
  declare clock: any;

  @prop({
    type: "enum",
    default: "sine",
    title: "Waveform",
    description: "LFO waveform.",
    values: ["sine", "triangle", "saw", "square"]
  })
  declare waveform: any;

  @prop({
    type: "float",
    default: 2,
    title: "Rate Hz",
    description: "LFO frequency in Hz.",
    min: 0.01,
    max: 100
  })
  declare rate_hz: any;

  @prop({
    type: "float",
    default: 1,
    title: "Depth",
    description: "Output amplitude scale.",
    min: 0,
    max: 10
  })
  declare depth: any;

  @prop({
    type: "float",
    default: 0,
    title: "Offset",
    description: "Constant added to the output.",
    min: -10,
    max: 10
  })
  declare offset: any;

  @prop({
    type: "int",
    default: SYNTH_SAMPLE_RATE,
    title: "Sample Rate",
    description: "Free-run sample rate in Hz.",
    min: 8000,
    max: 96000
  })
  declare sample_rate: any;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  /** Current property values — read per chunk so live updates apply. */
  private params(): {
    waveform: Waveform;
    rateHz: number;
    depth: number;
    offset: number;
  } {
    return {
      waveform: String(this.waveform ?? "sine") as Waveform,
      rateHz: Number(this.rate_hz ?? 2),
      depth: Number(this.depth ?? 1),
      offset: Number(this.offset ?? 0)
    };
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    let phase = 0;

    if (inputs.hasStream("clock")) {
      let sampleRate = SYNTH_SAMPLE_RATE;
      let clockWasHigh = false;
      for await (const item of inputs.stream("clock")) {
        const chunk = readSignalChunk(item);
        if (!chunk) continue;
        if (chunk.done) break;
        if (chunk.samples.length === 0) continue;
        const p = this.params();
        sampleRate = chunk.sampleRate;
        const clock = chunkMono(chunk.samples, chunk.channels);
        const buf = new Float32Array(clock.length);
        for (let i = 0; i < clock.length; i++) {
          const high = clock[i] >= GATE_THRESHOLD;
          if (high && !clockWasHigh) phase = 0; // sample-accurate reset
          clockWasHigh = high;
          buf[i] = p.offset + p.depth * oscSample(p.waveform, phase);
          phase = (phase + p.rateHz / sampleRate) % 1;
        }
        await outputs.emit(
          "cv",
          makeSignalChunk(buf, sampleRate, 1, false, "f32le")
        );
      }
      await outputs.emit("cv", makeDoneSignalChunk(sampleRate, 1, "f32le"));
      return;
    }

    const sampleRate = Number(this.sample_rate ?? SYNTH_SAMPLE_RATE);
    await runGenerator(outputs, {
      slot: "cv",
      sampleRate,
      encoding: "f32le",
      signal: inputs.signal,
      fill: (buf) => {
        const p = this.params();
        for (let i = 0; i < buf.length; i++) {
          buf[i] = p.offset + p.depth * oscSample(p.waveform, phase);
          phase = (phase + p.rateHz / sampleRate) % 1;
        }
      }
    });
  }
}

// ── ADSR ───────────────────────────────────────────────────────────

export class AdsrNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.synth.ADSR";
  static readonly title = "ADSR";
  static readonly description =
    "ADSR envelope generator driven by a gate CV stream.\n    cv, synthesis, envelope, adsr, modular\n\n    Gate edges (threshold 0.5) are detected at exact sample offsets inside chunks; attack/decay/release run as exponential one-pole segments counted in samples, so timing is sample-accurate without any clock. Emits one envelope chunk per gate chunk (same frame count). Retriggering mid-release continues from the current level.\n\n    Use cases:\n    - Amplitude envelope via VCA cv\n    - Filter envelope via VCF cutoff_cv\n    - Click-free gating of any signal";
  static readonly metadataOutputTypes = { cv: "cv" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["gate"];
  static readonly isStreamingInput = true;

  @prop({
    type: "cv",
    default: CHUNK_PROP_DEFAULT,
    title: "Gate",
    description: "Gate CV stream — values ≥ 0.5 count as gate-high."
  })
  declare gate: any;

  @prop({
    type: "float",
    default: 0.01,
    title: "Attack",
    description: "Attack time in seconds.",
    min: 0.0005,
    max: 10
  })
  declare attack: any;

  @prop({
    type: "float",
    default: 0.1,
    title: "Decay",
    description: "Decay time in seconds.",
    min: 0.0005,
    max: 10
  })
  declare decay: any;

  @prop({
    type: "float",
    default: 0.7,
    title: "Sustain",
    description: "Sustain level (0–1).",
    min: 0,
    max: 1
  })
  declare sustain: any;

  @prop({
    type: "float",
    default: 0.3,
    title: "Release",
    description: "Release time in seconds.",
    min: 0.0005,
    max: 10
  })
  declare release: any;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    const state = createAdsrState();
    let sampleRate = SYNTH_SAMPLE_RATE;

    for await (const item of inputs.stream("gate")) {
      const chunk = readSignalChunk(item);
      if (!chunk) continue;
      if (chunk.done) break;
      if (chunk.samples.length === 0) continue;
      sampleRate = chunk.sampleRate;
      // Coefficients recomputed per chunk from the current property values
      // (three exp() calls per ~21 ms chunk) so live updates apply.
      const params = {
        attackCoeff: adsrCoeff(Number(this.attack ?? 0.01), sampleRate),
        decayCoeff: adsrCoeff(Number(this.decay ?? 0.1), sampleRate),
        releaseCoeff: adsrCoeff(Number(this.release ?? 0.3), sampleRate),
        sustain: Number(this.sustain ?? 0.7)
      };
      const gate = chunkMono(chunk.samples, chunk.channels);
      const buf = new Float32Array(gate.length);
      for (let i = 0; i < gate.length; i++) {
        buf[i] = adsrStep(state, gate[i] >= GATE_THRESHOLD, params);
      }
      await outputs.emit(
        "cv",
        makeSignalChunk(buf, sampleRate, 1, false, "f32le")
      );
    }
    await outputs.emit("cv", makeDoneSignalChunk(sampleRate, 1, "f32le"));
  }
}

// ── Gate ───────────────────────────────────────────────────────────

export class GateNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.synth.Gate";
  static readonly title = "Gate";
  static readonly description =
    "Generates a repeating on/off gate CV pattern — the patch's master clock.\n    cv, synthesis, gate, trigger, clock, modular\n\n    Emits `amplitude` for on_duration seconds, 0 for off_duration, cycling wall-clock paced until the run is stopped. Drive an ADSR with it; every node downstream is sample-aligned to it by construction and paced with it.\n\n    Use cases:\n    - Trigger envelopes rhythmically\n    - Master clock for clocked LFOs and sample & hold\n    - Heartbeat of a live patch";
  static readonly metadataOutputTypes = { cv: "cv" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = [];
  static readonly isStreamingInput = true;

  @prop({
    type: "float",
    default: 0.25,
    title: "On Duration",
    description: "Gate-high time per cycle in seconds.",
    min: 0.001,
    max: 60
  })
  declare on_duration: any;

  @prop({
    type: "float",
    default: 0.25,
    title: "Off Duration",
    description: "Gate-low time per cycle in seconds.",
    min: 0.001,
    max: 60
  })
  declare off_duration: any;

  @prop({
    type: "float",
    default: 1,
    title: "Amplitude",
    description: "Gate-high output level.",
    min: 0,
    max: 10
  })
  declare amplitude: any;

  @prop({
    type: "int",
    default: SYNTH_SAMPLE_RATE,
    title: "Sample Rate",
    description: "Output sample rate in Hz.",
    min: 8000,
    max: 96000
  })
  declare sample_rate: any;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    const sampleRate = Number(this.sample_rate ?? SYNTH_SAMPLE_RATE);

    await runGenerator(outputs, {
      slot: "cv",
      sampleRate,
      encoding: "f32le",
      signal: inputs.signal,
      fill: (buf, startFrame) => {
        // Timing re-read per chunk so live updates apply; the phase derives
        // from the absolute frame counter, so a period change just re-grids
        // the pattern instead of glitching it.
        const onFrames = Math.max(
          1,
          Math.round(Number(this.on_duration ?? 0.25) * sampleRate)
        );
        const periodFrames =
          onFrames +
          Math.max(
            1,
            Math.round(Number(this.off_duration ?? 0.25) * sampleRate)
          );
        const amplitude = Number(this.amplitude ?? 1);
        for (let i = 0; i < buf.length; i++) {
          buf[i] =
            (startFrame + i) % periodFrames < onFrames ? amplitude : 0;
        }
      }
    });
  }
}

// ── VCA ────────────────────────────────────────────────────────────

export class VcaNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.synth.VCA";
  static readonly title = "VCA";
  static readonly description =
    "Voltage-controlled amplifier: multiplies an audio stream by a CV stream.\n    audio, cv, synthesis, vca, amplifier, modular\n\n    Output = audio * gain * max(0, cv) per sample (negative CV is clamped — a VCA doesn't invert). The audio input drives chunk cadence; the CV is frame-aligned with hold-last when it lags or ends. With nothing patched into cv, acts as a plain gain.\n\n    Use cases:\n    - Shape a note with an ADSR envelope\n    - Tremolo via an LFO\n    - Sidechain-style ducking from any CV source";
  static readonly metadataOutputTypes = { chunk: "chunk" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio", "cv"];
  static readonly isStreamingInput = true;

  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "Audio",
    description: "Audio chunk stream to amplify (drives chunk cadence)."
  })
  declare audio: any;

  @prop({
    type: "cv",
    default: CHUNK_PROP_DEFAULT,
    title: "CV",
    description: "Amplitude control stream; negative values clamp to 0."
  })
  declare cv: any;

  @prop({
    type: "float",
    default: 1,
    title: "Gain",
    description: "Constant gain multiplier.",
    min: 0,
    max: 10
  })
  declare gain: any;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    let sampleRate = SYNTH_SAMPLE_RATE;
    let channels = 1;

    for await (const frame of alignedSignalStreams(inputs, {
      primary: "audio",
      cvHandles: ["cv"]
    })) {
      const gain = Number(this.gain ?? 1); // per chunk — live updates apply
      sampleRate = frame.primary.sampleRate;
      channels = frame.primary.channels;
      const input = frame.primary.samples;
      const cv = frame.cv["cv"];
      const buf = new Float32Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const level =
          cv !== undefined ? Math.max(0, cv[Math.floor(i / channels)]) : 1;
        buf[i] = input[i] * gain * level;
      }
      await outputs.emit(
        "chunk",
        makeSignalChunk(buf, sampleRate, channels, false, "pcm16le")
      );
    }
    await outputs.emit(
      "chunk",
      makeDoneSignalChunk(sampleRate, channels, "pcm16le")
    );
  }
}

// ── VCF ────────────────────────────────────────────────────────────

/** Control-rate block size for cutoff recomputation (frames). */
const VCF_CONTROL_BLOCK = 64;

export class VcfNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.synth.VCF";
  static readonly title = "VCF";
  static readonly description =
    "Voltage-controlled filter: a biquad whose cutoff is modulated by a CV stream.\n    audio, cv, synthesis, vcf, filter, modular\n\n    Cutoff = cutoff_hz * 2^(cv * cv_amount) (volts/octave), recomputed every 64 samples (control rate); filter state persists across chunks so chunked output equals a single pass. The audio input drives chunk cadence; CV is frame-aligned with hold-last.\n\n    Use cases:\n    - Classic envelope filter sweeps (ADSR → cutoff_cv)\n    - Wah/auto-filter via an LFO\n    - Static tone shaping with nothing patched into cutoff_cv";
  static readonly metadataOutputTypes = { chunk: "chunk" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio", "cutoff_cv"];
  static readonly isStreamingInput = true;

  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "Audio",
    description: "Audio chunk stream to filter (drives chunk cadence)."
  })
  declare audio: any;

  @prop({
    type: "cv",
    default: CHUNK_PROP_DEFAULT,
    title: "Cutoff CV",
    description:
      "Cutoff modulation in octaves: cutoff = cutoff_hz * 2^(cv * cv_amount)."
  })
  declare cutoff_cv: any;

  @prop({
    type: "enum",
    default: "lowpass",
    title: "Mode",
    description: "Filter mode.",
    values: ["lowpass", "highpass"]
  })
  declare mode: any;

  @prop({
    type: "float",
    default: 1000,
    title: "Cutoff Hz",
    description: "Base cutoff frequency in Hz.",
    min: 20,
    max: 20000
  })
  declare cutoff_hz: any;

  @prop({
    type: "float",
    default: DEFAULT_Q,
    title: "Q",
    description: "Filter resonance (quality factor).",
    min: 0.1,
    max: 10
  })
  declare q: any;

  @prop({
    type: "float",
    default: 1,
    title: "CV Amount",
    description: "Octaves of cutoff shift per unit of CV.",
    min: 0,
    max: 5
  })
  declare cv_amount: any;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    let sampleRate = SYNTH_SAMPLE_RATE;
    let channels = 1;
    let states: BiquadState[] = [];

    for await (const frame of alignedSignalStreams(inputs, {
      primary: "audio",
      cvHandles: ["cutoff_cv"]
    })) {
      // Per chunk — live updates apply (coefficients are recomputed per
      // 64-frame control block below anyway).
      const mode = String(this.mode ?? "lowpass") as "lowpass" | "highpass";
      const cutoffHz = Number(this.cutoff_hz ?? 1000);
      const q = Number(this.q ?? DEFAULT_Q);
      const cvAmount = Number(this.cv_amount ?? 1);
      sampleRate = frame.primary.sampleRate;
      if (states.length !== frame.primary.channels) {
        channels = frame.primary.channels;
        states = Array.from({ length: channels }, createBiquadState);
      }
      const cv = frame.cv["cutoff_cv"];
      const planes = deinterleave(frame.primary.samples, channels);
      const outPlanes = planes.map(() => new Float32Array(planes[0].length));

      // Control-rate cutoff: recompute coefficients per 64-frame block from
      // the CV value at block start (biquadCoeffs clamps to Nyquist).
      const frames = planes[0].length;
      for (let block = 0; block < frames; block += VCF_CONTROL_BLOCK) {
        const end = Math.min(block + VCF_CONTROL_BLOCK, frames);
        const fc =
          cv !== undefined
            ? cutoffHz * Math.pow(2, cv[block] * cvAmount)
            : cutoffHz;
        const coeffs = biquadCoeffs(mode, sampleRate, fc, q, 0);
        for (let ch = 0; ch < channels; ch++) {
          const filtered = processBiquad(
            coeffs,
            states[ch],
            planes[ch].subarray(block, end)
          );
          outPlanes[ch].set(filtered, block);
        }
      }

      await outputs.emit(
        "chunk",
        makeSignalChunk(
          interleave(outPlanes),
          sampleRate,
          channels,
          false,
          "pcm16le"
        )
      );
    }
    await outputs.emit(
      "chunk",
      makeDoneSignalChunk(sampleRate, channels, "pcm16le")
    );
  }
}

// ── Attenuverter ───────────────────────────────────────────────────

export class AttenuverterNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.synth.Attenuverter";
  static readonly title = "Attenuverter";
  static readonly description =
    "Scales and offsets a CV (or audio) stream: out = in * scale + offset.\n    cv, synthesis, utility, attenuverter, modular\n\n    Negative scale inverts the signal. The Swiss-army CV utility — adapt an LFO's range to a pitch input, invert an envelope, add a constant bias.\n\n    Use cases:\n    - Reduce LFO depth before a pitch input\n    - Invert an envelope for ducking\n    - Add a DC offset to centre a modulation";
  static readonly metadataOutputTypes = { cv: "cv" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["signal"];
  static readonly isStreamingInput = true;

  @prop({
    type: "cv",
    default: CHUNK_PROP_DEFAULT,
    title: "Signal",
    description: "Input CV or audio stream."
  })
  declare signal: any;

  @prop({
    type: "float",
    default: 1,
    title: "Scale",
    description: "Multiplier; negative values invert.",
    min: -10,
    max: 10
  })
  declare scale: any;

  @prop({
    type: "float",
    default: 0,
    title: "Offset",
    description: "Constant added after scaling.",
    min: -10,
    max: 10
  })
  declare offset: any;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    let sampleRate = SYNTH_SAMPLE_RATE;
    let channels = 1;

    for await (const item of inputs.stream("signal")) {
      const chunk = readSignalChunk(item);
      if (!chunk) continue;
      if (chunk.done) break;
      if (chunk.samples.length === 0) continue;
      const scale = Number(this.scale ?? 1); // per chunk — live updates apply
      const offset = Number(this.offset ?? 0);
      sampleRate = chunk.sampleRate;
      channels = chunk.channels;
      const buf = chunk.samples;
      for (let i = 0; i < buf.length; i++) buf[i] = buf[i] * scale + offset;
      await outputs.emit(
        "cv",
        makeSignalChunk(buf, sampleRate, channels, false, "f32le")
      );
    }
    await outputs.emit(
      "cv",
      makeDoneSignalChunk(sampleRate, channels, "f32le")
    );
  }
}

// ── Sample & Hold ──────────────────────────────────────────────────

export class SampleHoldNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.synth.SampleHold";
  static readonly title = "Sample & Hold";
  static readonly description =
    "Samples the signal input on each trigger rising edge and holds it.\n    cv, synthesis, sample-hold, modular\n\n    On a trigger rising edge (≥ 0.5) at sample k, the held value becomes signal[k]; the output is the held value every sample. The signal input drives chunk cadence; the trigger is frame-aligned with hold-last.\n\n    Use cases:\n    - Classic random-stepped CV (noise → signal, clock → trigger)\n    - Quantize an LFO into steps\n    - Freeze a modulation value on demand";
  static readonly metadataOutputTypes = { cv: "cv" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["signal", "trigger"];
  static readonly isStreamingInput = true;

  @prop({
    type: "cv",
    default: CHUNK_PROP_DEFAULT,
    title: "Signal",
    description: "Stream to sample (drives chunk cadence)."
  })
  declare signal: any;

  @prop({
    type: "cv",
    default: CHUNK_PROP_DEFAULT,
    title: "Trigger",
    description: "Sampling clock — samples on each rising edge (≥ 0.5)."
  })
  declare trigger: any;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    let sampleRate = SYNTH_SAMPLE_RATE;
    let held = 0;
    let triggerWasHigh = false;

    for await (const frame of alignedSignalStreams(inputs, {
      primary: "signal",
      cvHandles: ["trigger"]
    })) {
      sampleRate = frame.primary.sampleRate;
      const signal = chunkMono(frame.primary.samples, frame.primary.channels);
      const trigger = frame.cv["trigger"];
      const buf = new Float32Array(signal.length);
      for (let i = 0; i < signal.length; i++) {
        const high = trigger !== undefined && trigger[i] >= GATE_THRESHOLD;
        if (high && !triggerWasHigh) held = signal[i];
        triggerWasHigh = high;
        buf[i] = held;
      }
      await outputs.emit(
        "cv",
        makeSignalChunk(buf, sampleRate, 1, false, "f32le")
      );
    }
    await outputs.emit("cv", makeDoneSignalChunk(sampleRate, 1, "f32le"));
  }
}

// ── Mixer ──────────────────────────────────────────────────────────

const MIXER_HANDLES = ["in1", "in2", "in3", "in4"] as const;

export class MixerNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.synth.Mixer";
  static readonly title = "Mixer";
  static readonly description =
    "Sums up to four audio streams with per-input levels.\n    audio, synthesis, mixer, modular\n\n    Output = Σ level_i * in_i, emitted as soon as every still-open input can cover the frames; inputs that have ended contribute silence. The stream ends when all connected inputs end. Assumes matching sample rates and channel counts (no resampling).\n\n    Use cases:\n    - Combine oscillators into a richer voice\n    - Mix a dry signal with a filtered copy\n    - Sub-mix several synth voices";
  static readonly metadataOutputTypes = { chunk: "chunk" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = [...MIXER_HANDLES];
  static readonly isStreamingInput = true;

  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "In 1",
    description: "Audio input 1."
  })
  declare in1: any;

  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "In 2",
    description: "Audio input 2."
  })
  declare in2: any;

  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "In 3",
    description: "Audio input 3."
  })
  declare in3: any;

  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "In 4",
    description: "Audio input 4."
  })
  declare in4: any;

  @prop({
    type: "float",
    default: 1,
    title: "Level 1",
    description: "Gain for input 1.",
    min: 0,
    max: 2
  })
  declare level1: any;

  @prop({
    type: "float",
    default: 1,
    title: "Level 2",
    description: "Gain for input 2.",
    min: 0,
    max: 2
  })
  declare level2: any;

  @prop({
    type: "float",
    default: 1,
    title: "Level 3",
    description: "Gain for input 3.",
    min: 0,
    max: 2
  })
  declare level3: any;

  @prop({
    type: "float",
    default: 1,
    title: "Level 4",
    description: "Gain for input 4.",
    min: 0,
    max: 2
  })
  declare level4: any;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    // Read per emitted block — live updates apply.
    const levels = (): Record<string, number> => ({
      in1: Number(this.level1 ?? 1),
      in2: Number(this.level2 ?? 1),
      in3: Number(this.level3 ?? 1),
      in4: Number(this.level4 ?? 1)
    });
    const connected: string[] = MIXER_HANDLES.filter((h) =>
      inputs.hasStream(h)
    );
    const fifos = new Map<string, SampleFifo>(
      connected.map((h) => [h, new SampleFifo()])
    );
    const done = new Map<string, boolean>(connected.map((h) => [h, false]));
    let sampleRate = SYNTH_SAMPLE_RATE;
    let channels = 1;
    let formatSeen = false;

    const emitMixed = async (n: number): Promise<void> => {
      if (n <= 0) return;
      const lv = levels();
      const buf = new Float32Array(n);
      for (const h of connected) {
        // Ended/short inputs contribute zeros — silence is correct for
        // finished audio, unlike CV's hold-last.
        const part = fifos.get(h)!.pull(n, "zero");
        const level = lv[h];
        for (let i = 0; i < n; i++) buf[i] += level * part[i];
      }
      await outputs.emit(
        "chunk",
        makeSignalChunk(buf, sampleRate, channels, false, "pcm16le")
      );
    };

    for await (const [handle, item] of inputs.any()) {
      if (!fifos.has(handle)) continue;
      const chunk = readSignalChunk(item);
      if (!chunk) continue;
      if (!formatSeen && chunk.samples.length > 0) {
        sampleRate = chunk.sampleRate;
        channels = chunk.channels;
        formatSeen = true;
      }
      if (chunk.done) done.set(handle, true);
      else fifos.get(handle)!.push(chunk.samples);

      const open = connected.filter((h) => !done.get(h));
      if (open.length === 0) break;
      const n = Math.min(...open.map((h) => fifos.get(h)!.available));
      if (n > 0 && Number.isFinite(n)) await emitMixed(n);
    }

    // All inputs ended — flush the remainder zero-padded to the longest.
    const remaining = Math.max(
      0,
      ...connected.map((h) => fifos.get(h)!.available)
    );
    await emitMixed(remaining);
    await outputs.emit(
      "chunk",
      makeDoneSignalChunk(sampleRate, channels, "pcm16le")
    );
  }
}

export const SYNTHESIS_NODES: readonly NodeClass[] = tagAsHybrid([
  OscillatorNode,
  LfoNode,
  AdsrNode,
  GateNode,
  VcaNode,
  VcfNode,
  AttenuverterNode,
  SampleHoldNode,
  MixerNode
]);
