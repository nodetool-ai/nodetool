import type { ProcessingContext } from "@nodetool-ai/runtime";
import { AUDIO_SAMPLE_RATE } from "@nodetool-ai/protocol";
import { getTransport, type AudioTransport } from "../lib/transport.js";
/**
 * Modular synthesis nodes (`nodetool.audio.synth.*`) — a subtractive synth
 * voice operating on streamed signal chunks: oscillator, LFO, ADSR, gate
 * source, VCA, VCF, CV utilities, and a mixer.
 *
 * Timing is sample-domain: time = sample count; the wall clock only paces
 * emission. Free-running generators (Oscillator, LFO, Gate) are realtime
 * modules: they follow the run transport and finish at the render duration or when
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
 * Limitation: audio-rate feedback patching (e.g. an envelope modulating its
 * own gate) is not supported. The only cycles a workflow graph may contain
 * are Loop node iterations (docs/workflow-loops.md), one value per iteration.
 */
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type {
  NodeClass,
  StreamingInputs,
  StreamingOutputs
} from "@nodetool-ai/node-sdk";
import type { Chunk } from "@nodetool-ai/protocol";
import { tagAsHybrid } from "@nodetool-ai/nodes-utils";
import {
  loadKernels,
  STATE_LEN,
  type LfoParams,
  type OscillatorParams,
  type Waveform
} from "@nodetool-ai/kernels";
import {
  alignedSignalStreams,
  CHUNK_PROP_DEFAULT,
  makeDoneSignalChunk,
  makeSignalChunk,
  readSignalChunk,
  SampleFifo,
  type SignalEncoding
} from "../lib/cv.js";
import { DEFAULT_Q } from "../lib/biquad.js";

// ── Shared generator scaffolding ───────────────────────────────────

/** Emit transport-sized blocks, ending at the render frame or cancellation. */
async function runGenerator(
  outputs: StreamingOutputs,
  opts: {
    slot: string;
    transport: AudioTransport;
    encoding: SignalEncoding;
    signal: AbortSignal;
    fill: (count: number, startFrame: number) => Float32Array;
  }
): Promise<void> {
  const { slot, transport, encoding, signal } = opts;
  const sampleRate = transport.sampleRate;
  let emitted = 0;
  while (!signal.aborted && (transport.endFrame === null || emitted < transport.endFrame)) {
    await transport.until(emitted, signal);
    if (signal.aborted) break;
    const count = Math.min(transport.blockFrames, transport.endFrame === null ? transport.blockFrames : transport.endFrame - emitted);
    await outputs.emit(slot, makeSignalChunk(opts.fill(count, emitted), sampleRate, 1, false, encoding));
    emitted += count;
  }
  await outputs.emit(slot, makeDoneSignalChunk(sampleRate, 1, encoding));
}

// ── Oscillator (VCO) ───────────────────────────────────────────────

export class OscillatorNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.synth.Oscillator";
  static readonly title = "Oscillator";
  static readonly description =
    "Voltage-controlled oscillator generating sine, saw, square, triangle or noise audio.\n    audio, synthesis, oscillator, vco, modular\n\n    Pitch CV is volts/octave: freq = frequency * 2^cv (cv in octaves). With pitch_cv or fm patched, output follows that stream's chunk cadence (sample-aligned); otherwise it follows the run transport until the render ends or the run is stopped. Naive waveforms — saw/square alias at high frequencies.\n\n    Use cases:\n    - Sound source for a modular synth voice\n    - FM/vibrato via the fm input driven by an LFO\n    - Melodic sequences via a pitch CV stream";
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
  declare pitch_cv: Chunk;

  @prop({
    type: "cv",
    default: CHUNK_PROP_DEFAULT,
    title: "FM",
    description:
      "Linear frequency modulation stream: freq is multiplied by (1 + fm_amount * fm)."
  })
  declare fm: Chunk;

  @prop({
    type: "enum",
    default: "sine",
    title: "Waveform",
    description: "Oscillator waveform.",
    values: ["sine", "saw", "square", "triangle", "noise"]
  })
  declare waveform: Waveform;

  @prop({
    type: "float",
    default: 220,
    title: "Frequency",
    description: "Base frequency in Hz.",
    min: 0.1,
    max: 20000
  })
  declare frequency: number;

  @prop({
    type: "float",
    default: 0.8,
    title: "Amplitude",
    description: "Output amplitude (linear).",
    min: 0,
    max: 1
  })
  declare amplitude: number;

  @prop({
    type: "float",
    default: 0.5,
    title: "Pulse Width",
    description: "Duty cycle for the square waveform.",
    min: 0.05,
    max: 0.95
  })
  declare pulse_width: number;

  @prop({
    type: "float",
    default: 0,
    title: "FM Amount",
    description: "Depth of linear frequency modulation from the fm input.",
    min: 0,
    max: 10
  })
  declare fm_amount: number;


  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  /** Current property values — read per chunk so live updates apply. */
  private params(): OscillatorParams {
    return {
      waveform: this.waveform,
      frequency: this.frequency,
      amplitude: this.amplitude,
      pulseWidth: this.pulse_width,
      fmAmount: this.fm_amount
    };
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs, context?: ProcessingContext): Promise<void> {
    // The kernel carries the double-precision phase (no drift) and the noise
    // seed across chunks in `state`. Properties are re-read at every chunk
    // boundary (params()), so live updates pushed via applyProperties land
    // on the next chunk.
    const kernels = await loadKernels();
    const state = kernels.createOscillatorState(Math.floor(Math.random() * 2 ** 32));

    const hasPitch = inputs.hasStream("pitch_cv");
    const hasFm = inputs.hasStream("fm");

    if (hasPitch || hasFm) {
      // Clocked: the patched CV stream drives chunk cadence; the other
      // handle (if any) is frame-aligned via zip-with-hold.
      const primary = hasPitch ? "pitch_cv" : "fm";
      const secondary = hasPitch ? "fm" : "pitch_cv";
      let sampleRate = AUDIO_SAMPLE_RATE;
      for await (const frame of alignedSignalStreams(inputs, {
        primary,
        cvHandles: [secondary]
      })) {
        sampleRate = frame.primary.sampleRate;
        const drive = kernels.extractChannel(frame.primary.samples, frame.primary.channels);
        const other = frame.cv[secondary];
        const buf = kernels.oscillator(
          state,
          this.params(),
          sampleRate,
          drive.length,
          hasPitch ? drive : other,
          hasPitch ? other : drive
        );
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

    const transport = getTransport(context);
    const sampleRate = transport.sampleRate;
    await runGenerator(outputs, {
      slot: "chunk",
      transport,
      encoding: "pcm16le",
      signal: inputs.signal,
      fill: (count) => kernels.oscillator(state, this.params(), sampleRate, count)
    });
  }
}

// ── LFO ────────────────────────────────────────────────────────────

export class LfoNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.synth.LFO";
  static readonly title = "LFO";
  static readonly description =
    "Low-frequency oscillator emitting a control-voltage stream.\n    cv, synthesis, lfo, modulation, modular\n\n    Output is offset + depth * wave(phase). With a clock patched, emits one chunk per clock chunk (sample-aligned) and resets phase on each clock rising edge; otherwise free-runs paced by the run transport, or ending at the render duration.\n\n    Use cases:\n    - Vibrato/tremolo via Oscillator fm or VCA cv\n    - Filter sweeps via VCF cutoff_cv\n    - Slow parameter drift in generative patches";
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
  declare clock: Chunk;

  @prop({
    type: "enum",
    default: "sine",
    title: "Waveform",
    description: "LFO waveform.",
    values: ["sine", "triangle", "saw", "square"]
  })
  declare waveform: "sine" | "triangle" | "saw" | "square";

  @prop({
    type: "float",
    default: 2,
    title: "Rate Hz",
    description: "LFO frequency in Hz.",
    min: 0.01,
    max: 100
  })
  declare rate_hz: number;

  @prop({
    type: "float",
    default: 1,
    title: "Depth",
    description: "Output amplitude scale.",
    min: 0,
    max: 10
  })
  declare depth: number;

  @prop({
    type: "float",
    default: 0,
    title: "Offset",
    description: "Constant added to the output.",
    min: -10,
    max: 10
  })
  declare offset: number;


  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  /** Current property values — read per chunk so live updates apply. */
  private params(): LfoParams {
    return {
      waveform: this.waveform,
      rateHz: this.rate_hz,
      depth: this.depth,
      offset: this.offset
    };
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs, context?: ProcessingContext): Promise<void> {
    const kernels = await loadKernels();
    // {phase, clock was high}, carried across chunks by the kernel.
    const state = new Float64Array(STATE_LEN.lfo);

    if (inputs.hasStream("clock")) {
      let sampleRate = AUDIO_SAMPLE_RATE;
      for await (const item of inputs.stream("clock")) {
        const chunk = readSignalChunk(item);
        if (!chunk) continue;
        if (chunk.done) break;
        if (chunk.samples.length === 0) continue;
        sampleRate = chunk.sampleRate;
        // A clock rising edge resets the phase at that sample.
        const clock = kernels.extractChannel(chunk.samples, chunk.channels);
        const buf = kernels.lfo(state, this.params(), sampleRate, clock.length, clock);
        await outputs.emit(
          "cv",
          makeSignalChunk(buf, sampleRate, 1, false, "f32le")
        );
      }
      await outputs.emit("cv", makeDoneSignalChunk(sampleRate, 1, "f32le"));
      return;
    }

    const transport = getTransport(context);
    const sampleRate = transport.sampleRate;
    await runGenerator(outputs, {
      slot: "cv",
      transport,
      encoding: "f32le",
      signal: inputs.signal,
      fill: (count) => kernels.lfo(state, this.params(), sampleRate, count)
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
  declare gate: Chunk;

  @prop({
    type: "float",
    default: 0.01,
    title: "Attack",
    description: "Attack time in seconds.",
    min: 0.0005,
    max: 10
  })
  declare attack: number;

  @prop({
    type: "float",
    default: 0.1,
    title: "Decay",
    description: "Decay time in seconds.",
    min: 0.0005,
    max: 10
  })
  declare decay: number;

  @prop({
    type: "float",
    default: 0.7,
    title: "Sustain",
    description: "Sustain level (0–1).",
    min: 0,
    max: 1
  })
  declare sustain: number;

  @prop({
    type: "float",
    default: 0.3,
    title: "Release",
    description: "Release time in seconds.",
    min: 0.0005,
    max: 10
  })
  declare release: number;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs, _context?: ProcessingContext): Promise<void> {
    const kernels = await loadKernels();
    // {stage, envelope, gate was high}, carried across chunks by the kernel.
    const state = new Float64Array(STATE_LEN.adsr);
    let sampleRate = AUDIO_SAMPLE_RATE;

    for await (const item of inputs.stream("gate")) {
      const chunk = readSignalChunk(item);
      if (!chunk) continue;
      if (chunk.done) break;
      if (chunk.samples.length === 0) continue;
      sampleRate = chunk.sampleRate;
      // Times are read per chunk from the current property values, so live
      // updates apply.
      const gate = kernels.extractChannel(chunk.samples, chunk.channels);
      const buf = kernels.adsr(
        state,
        {
          attack: this.attack,
          decay: this.decay,
          sustain: this.sustain,
          release: this.release
        },
        sampleRate,
        gate
      );
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
    "Generates a repeating on/off gate CV pattern — the patch's master clock.\n    cv, synthesis, gate, trigger, clock, modular\n\n    Emits `amplitude` for on_duration seconds, 0 for off_duration, cycling until the render ends or the run is stopped. Drive an ADSR with it; every node downstream is sample-aligned to it by construction and paced with it.\n\n    Use cases:\n    - Trigger envelopes rhythmically\n    - Master clock for clocked LFOs and sample & hold\n    - Heartbeat of a live patch";
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
  declare on_duration: number;

  @prop({
    type: "float",
    default: 0.25,
    title: "Off Duration",
    description: "Gate-low time per cycle in seconds.",
    min: 0.001,
    max: 60
  })
  declare off_duration: number;

  @prop({
    type: "float",
    default: 1,
    title: "Amplitude",
    description: "Gate-high output level.",
    min: 0,
    max: 10
  })
  declare amplitude: number;


  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs, context?: ProcessingContext): Promise<void> {
    const kernels = await loadKernels();
    const transport = getTransport(context);
    const sampleRate = transport.sampleRate;

    await runGenerator(outputs, {
      slot: "cv",
      transport,
      encoding: "f32le",
      signal: inputs.signal,
      // Timing re-read per chunk so live updates apply; the phase derives
      // from the absolute frame counter, so a period change just re-grids
      // the pattern instead of glitching it.
      fill: (count, startFrame) =>
        kernels.gate(
          startFrame,
          this.on_duration,
          this.off_duration,
          this.amplitude,
          sampleRate,
          count
        )
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
  declare audio: Chunk;

  @prop({
    type: "cv",
    default: CHUNK_PROP_DEFAULT,
    title: "CV",
    description: "Amplitude control stream; negative values clamp to 0."
  })
  declare cv: Chunk;

  @prop({
    type: "float",
    default: 1,
    title: "Gain",
    description: "Constant gain multiplier.",
    min: 0,
    max: 10
  })
  declare gain: number;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs, _context?: ProcessingContext): Promise<void> {
    const kernels = await loadKernels();
    let sampleRate = AUDIO_SAMPLE_RATE;
    let channels = 1;

    for await (const frame of alignedSignalStreams(inputs, {
      primary: "audio",
      cvHandles: ["cv"]
    })) {
      sampleRate = frame.primary.sampleRate;
      channels = frame.primary.channels;
      // Gain per chunk — live updates apply. Negative CV is clamped to 0.
      const buf = kernels.vca(frame.primary.samples, frame.cv["cv"], channels, this.gain);
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
  declare audio: Chunk;

  @prop({
    type: "cv",
    default: CHUNK_PROP_DEFAULT,
    title: "Cutoff CV",
    description:
      "Cutoff modulation in octaves: cutoff = cutoff_hz * 2^(cv * cv_amount)."
  })
  declare cutoff_cv: Chunk;

  @prop({
    type: "enum",
    default: "lowpass",
    title: "Mode",
    description: "Filter mode.",
    values: ["lowpass", "highpass"]
  })
  declare mode: "lowpass" | "highpass";

  @prop({
    type: "float",
    default: 1000,
    title: "Cutoff Hz",
    description: "Base cutoff frequency in Hz.",
    min: 20,
    max: 20000
  })
  declare cutoff_hz: number;

  @prop({
    type: "float",
    default: DEFAULT_Q,
    title: "Q",
    description: "Filter resonance (quality factor).",
    min: 0.1,
    max: 10
  })
  declare q: number;

  @prop({
    type: "float",
    default: 1,
    title: "CV Amount",
    description: "Octaves of cutoff shift per unit of CV.",
    min: 0,
    max: 5
  })
  declare cv_amount: number;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs, _context?: ProcessingContext): Promise<void> {
    const kernels = await loadKernels();
    let sampleRate = AUDIO_SAMPLE_RATE;
    let channels = 1;
    let state: Float64Array | undefined;

    for await (const frame of alignedSignalStreams(inputs, {
      primary: "audio",
      cvHandles: ["cutoff_cv"]
    })) {
      sampleRate = frame.primary.sampleRate;
      if (!state || channels !== frame.primary.channels) {
        channels = frame.primary.channels;
        state = kernels.createBiquadState(channels);
      }
      // Properties per chunk — live updates apply. The kernel recomputes the
      // cutoff every 64 frames from the CV value at the block start.
      const buf = kernels.vcf(
        state,
        this.mode,
        sampleRate,
        this.cutoff_hz,
        this.q,
        this.cv_amount,
        frame.cv["cutoff_cv"],
        frame.primary.samples,
        channels
      );
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
  declare signal: Chunk;

  @prop({
    type: "float",
    default: 1,
    title: "Scale",
    description: "Multiplier; negative values invert.",
    min: -10,
    max: 10
  })
  declare scale: number;

  @prop({
    type: "float",
    default: 0,
    title: "Offset",
    description: "Constant added after scaling.",
    min: -10,
    max: 10
  })
  declare offset: number;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs, _context?: ProcessingContext): Promise<void> {
    const kernels = await loadKernels();
    let sampleRate = AUDIO_SAMPLE_RATE;
    let channels = 1;

    for await (const item of inputs.stream("signal")) {
      const chunk = readSignalChunk(item);
      if (!chunk) continue;
      if (chunk.done) break;
      if (chunk.samples.length === 0) continue;
      sampleRate = chunk.sampleRate;
      channels = chunk.channels;
      // Scale and offset per chunk — live updates apply.
      const buf = kernels.scaleOffset(chunk.samples, this.scale, this.offset);
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
  declare signal: Chunk;

  @prop({
    type: "cv",
    default: CHUNK_PROP_DEFAULT,
    title: "Trigger",
    description: "Sampling clock — samples on each rising edge (≥ 0.5)."
  })
  declare trigger: Chunk;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs, _context?: ProcessingContext): Promise<void> {
    const kernels = await loadKernels();
    // {held value, trigger was high}, carried across chunks by the kernel.
    const state = new Float64Array(STATE_LEN.sampleHold);
    let sampleRate = AUDIO_SAMPLE_RATE;

    for await (const frame of alignedSignalStreams(inputs, {
      primary: "signal",
      cvHandles: ["trigger"]
    })) {
      sampleRate = frame.primary.sampleRate;
      const signal = kernels.extractChannel(frame.primary.samples, frame.primary.channels);
      const buf = kernels.sampleHold(state, signal, frame.cv["trigger"]);
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
  declare in1: Chunk;

  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "In 2",
    description: "Audio input 2."
  })
  declare in2: Chunk;

  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "In 3",
    description: "Audio input 3."
  })
  declare in3: Chunk;

  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "In 4",
    description: "Audio input 4."
  })
  declare in4: Chunk;

  @prop({
    type: "float",
    default: 1,
    title: "Level 1",
    description: "Gain for input 1.",
    min: 0,
    max: 2
  })
  declare level1: number;

  @prop({
    type: "float",
    default: 1,
    title: "Level 2",
    description: "Gain for input 2.",
    min: 0,
    max: 2
  })
  declare level2: number;

  @prop({
    type: "float",
    default: 1,
    title: "Level 3",
    description: "Gain for input 3.",
    min: 0,
    max: 2
  })
  declare level3: number;

  @prop({
    type: "float",
    default: 1,
    title: "Level 4",
    description: "Gain for input 4.",
    min: 0,
    max: 2
  })
  declare level4: number;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs, _context?: ProcessingContext): Promise<void> {
    const kernels = await loadKernels();
    // Read per emitted block — live updates apply.
    const levels = () => ({
      in1: this.level1,
      in2: this.level2,
      in3: this.level3,
      in4: this.level4
    });
    const connected = MIXER_HANDLES.filter((h) => inputs.hasStream(h));
    const fifos = new Map<string, SampleFifo>(
      connected.map((h) => [h, new SampleFifo()])
    );
    const done = new Map<string, boolean>(connected.map((h) => [h, false]));
    let sampleRate = AUDIO_SAMPLE_RATE;
    let channels = 1;
    let formatSeen = false;

    const emitMixed = async (n: number): Promise<void> => {
      if (n <= 0) return;
      const lv = levels();
      const buf = new Float32Array(n);
      for (const h of connected) {
        // Ended/short inputs contribute zeros — silence is correct for
        // finished audio, unlike CV's hold-last.
        kernels.mixAdd(buf, fifos.get(h)!.pull(n, "zero"), lv[h]);
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
