import { describe, it, expect } from "vitest";
import type { StreamingInputs, StreamingOutputs } from "@nodetool-ai/node-sdk";
import {
  OscillatorNode,
  LfoNode,
  AdsrNode,
  GateNode,
  VcaNode,
  VcfNode,
  AttenuverterNode,
  MixerNode,
  SampleHoldNode,
  applyBiquadToWav,
  makeSignalChunk,
  makeDoneSignalChunk,
  readSignalChunk,
  DEFAULT_Q,
  SYNTH_CHUNK_FRAMES
} from "@nodetool-ai/audio-nodes";

const SR = 24000;

/**
 * Multi-handle streaming fake. A handle is "patched" iff its key exists in
 * `handles`. `any()` interleaves round-robin (one item per handle per turn)
 * unless an explicit `order` of [handle, itemIndex] pairs is scripted.
 */
function makeInputs(opts: {
  handles: Record<string, unknown[]>;
  order?: Array<[string, number]>;
  signal?: AbortSignal;
}): StreamingInputs {
  const { handles, order } = opts;
  return {
    signal: opts.signal ?? new AbortController().signal,
    hasStream: (name: string) => name in handles,
    async *stream(name: string) {
      for (const item of handles[name] ?? []) yield item;
    },
    async *any() {
      if (order) {
        for (const [h, i] of order) yield [h, handles[h][i]];
        return;
      }
      const keys = Object.keys(handles);
      const idx: Record<string, number> = {};
      for (const k of keys) idx[k] = 0;
      let progressed = true;
      while (progressed) {
        progressed = false;
        for (const k of keys) {
          if (idx[k] < handles[k].length) {
            yield [k, handles[k][idx[k]++]] as [string, unknown];
            progressed = true;
          }
        }
      }
    }
  } as unknown as StreamingInputs;
}

function recordingOutputs(): {
  outputs: StreamingOutputs;
  emitted: Array<[string, unknown]>;
} {
  const emitted: Array<[string, unknown]> = [];
  const outputs = {
    async emit(slot: string, value: unknown) {
      emitted.push([slot, value]);
    }
  } as unknown as StreamingOutputs;
  return { outputs, emitted };
}

/**
 * Recording outputs that abort the run signal after `n` data chunks — the
 * free-running generators never end on their own, so tests bound them via
 * cancellation, exactly like a stopped patch.
 */
function abortAfter(n: number): {
  outputs: StreamingOutputs;
  emitted: Array<[string, unknown]>;
  signal: AbortSignal;
} {
  const controller = new AbortController();
  const emitted: Array<[string, unknown]> = [];
  let count = 0;
  const outputs = {
    async emit(slot: string, value: unknown) {
      emitted.push([slot, value]);
      const chunk = readSignalChunk(value);
      if (chunk && !chunk.done && chunk.samples.length > 0) {
        count++;
        if (count >= n) controller.abort();
      }
    }
  } as unknown as StreamingOutputs;
  return { outputs, emitted, signal: controller.signal };
}

/** Decode all non-done chunks on a slot into one concatenated Float32Array. */
function concatEmitted(emitted: Array<[string, unknown]>): Float32Array {
  const parts: Float32Array[] = [];
  for (const [, value] of emitted) {
    const chunk = readSignalChunk(value);
    if (chunk && !chunk.done) parts.push(chunk.samples);
  }
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function signChanges(samples: Float32Array): number {
  let count = 0;
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i] >= 0) !== (samples[i - 1] >= 0)) count++;
  }
  return count;
}

describe("Oscillator (free run)", () => {
  it("emits 512-frame chunks until cancelled, then a done marker", async () => {
    const node = new OscillatorNode({
      waveform: "sine",
      frequency: 100,
      amplitude: 1,
      sample_rate: SR
    });
    const chunks = 8;
    const { outputs, emitted, signal } = abortAfter(chunks);
    await node.run(makeInputs({ handles: {}, signal }), outputs);

    expect(emitted).toHaveLength(chunks + 1);
    const last = readSignalChunk(emitted[emitted.length - 1][1])!;
    expect(last.done).toBe(true);

    const samples = concatEmitted(emitted);
    expect(samples.length).toBe(chunks * SYNTH_CHUNK_FRAMES);
    // 100 Hz sine → 2 zero crossings per period.
    const expected = Math.round((2 * 100 * samples.length) / SR);
    expect(Math.abs(signChanges(samples) - expected)).toBeLessThanOrEqual(2);
  });

  it("picks up live property updates between chunks", async () => {
    const node = new OscillatorNode({
      waveform: "sine",
      frequency: 100,
      amplitude: 1,
      sample_rate: SR
    });
    // Retune mid-run via the live-parameter path (applyProperties → assign);
    // the generator reads properties per chunk, so chunks 5+ are at 800 Hz.
    const controller = new AbortController();
    const emitted: Array<[string, unknown]> = [];
    let count = 0;
    const outputs = {
      async emit(slot: string, value: unknown) {
        emitted.push([slot, value]);
        const c = readSignalChunk(value);
        if (c && !c.done && c.samples.length > 0) {
          count++;
          if (count === 4) node.assign({ frequency: 800 });
          if (count >= 8) controller.abort();
        }
      }
    } as unknown as StreamingOutputs;
    await node.run(
      makeInputs({ handles: {}, signal: controller.signal }),
      outputs
    );

    const data = emitted
      .map(([, v]) => readSignalChunk(v)!)
      .filter((c) => !c.done && c.samples.length > 0);
    const concat = (chunks: typeof data) => {
      const total = chunks.reduce((s, c) => s + c.samples.length, 0);
      const out = new Float32Array(total);
      let off = 0;
      for (const c of chunks) {
        out.set(c.samples, off);
        off += c.samples.length;
      }
      return out;
    };
    const head = concat(data.slice(0, 4)); // 100 Hz
    const tail = concat(data.slice(4)); // 800 Hz
    expect(signChanges(tail)).toBeGreaterThan(signChanges(head) * 4);
  });

  it("keeps phase continuous across chunk boundaries", async () => {
    const node = new OscillatorNode({
      waveform: "sine",
      frequency: 440,
      amplitude: 1,
      sample_rate: SR
    });
    const { outputs, emitted, signal } = abortAfter(6);
    await node.run(makeInputs({ handles: {}, signal }), outputs);

    const samples = concatEmitted(emitted);
    // Max per-sample step of a 440 Hz sine @ 24 kHz, with quantization slack.
    const maxStep = 2 * Math.PI * (440 / SR) + 1e-3;
    for (let i = 1; i < samples.length; i++) {
      expect(Math.abs(samples[i] - samples[i - 1])).toBeLessThanOrEqual(
        maxStep
      );
    }
  });
});

describe("Oscillator (clocked by pitch CV)", () => {
  async function crossingsForCv(cvValue: number): Promise<number> {
    const frames = 512;
    const chunks = [0, 1, 2].map(() =>
      makeSignalChunk(
        new Float32Array(frames).fill(cvValue),
        SR,
        1,
        false,
        "f32le"
      )
    );
    chunks.push(makeDoneSignalChunk(SR, 1, "f32le"));
    const node = new OscillatorNode({
      waveform: "sine",
      frequency: 220,
      amplitude: 1
    });
    const { outputs, emitted } = recordingOutputs();
    await node.run(makeInputs({ handles: { pitch_cv: chunks } }), outputs);

    // One output chunk per input chunk, same frame count, plus done.
    expect(emitted).toHaveLength(4);
    for (let i = 0; i < 3; i++) {
      expect(readSignalChunk(emitted[i][1])!.samples.length).toBe(frames);
    }
    expect(readSignalChunk(emitted[3][1])!.done).toBe(true);
    return signChanges(concatEmitted(emitted));
  }

  it("pins freq = base * 2^cv (cv = 1 doubles the frequency)", async () => {
    const base = await crossingsForCv(0);
    const octaveUp = await crossingsForCv(1);
    const ratio = octaveUp / base;
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.2);
  });
});

describe("ADSR", () => {
  it("detects gate edges at exact sample offsets and times segments in samples", async () => {
    const frames = 2048;
    const edgeAt = 100;
    const releaseAt = 1500;
    const gate = new Float32Array(frames);
    gate.fill(1, edgeAt, releaseAt);
    const attack = 0.01; // 240 samples @ 24 kHz
    const node = new AdsrNode({
      attack,
      decay: 0.01, // settles to sustain well before the falling edge
      sustain: 0.7,
      release: 0.01
    });
    const { outputs, emitted } = recordingOutputs();
    await node.run(
      makeInputs({
        handles: {
          gate: [
            makeSignalChunk(gate, SR, 1, false, "f32le"),
            makeDoneSignalChunk(SR, 1, "f32le")
          ]
        }
      }),
      outputs
    );

    const env = concatEmitted(emitted);
    expect(env.length).toBe(frames);
    // Silent before the rising edge…
    for (let i = 0; i < edgeAt; i++) expect(env[i]).toBe(0);
    // …rising right after it.
    expect(env[edgeAt + 5]).toBeGreaterThan(0);

    // Attack peaks at exactly 1.0 within a loose multiple of the named time.
    const peakAt = env.indexOf(1);
    expect(peakAt).toBeGreaterThan(edgeAt + attack * SR * 0.5);
    expect(peakAt).toBeLessThan(edgeAt + attack * SR * 3);

    // Sustain plateau before release.
    expect(env[releaseAt - 1]).toBeCloseTo(0.7, 2);
    // Release decays from the exact falling-edge offset.
    expect(env[releaseAt + 200]).toBeLessThan(env[releaseAt - 1]);
    expect(env[frames - 1]).toBeLessThan(0.2);
  });

  it("retriggers mid-release from the current level, not from 0", async () => {
    const frames = 4096;
    const gate = new Float32Array(frames);
    gate.fill(1, 0, 1000); // first note
    gate.fill(1, 1100, 4096); // retrigger 100 samples into the release
    const node = new AdsrNode({
      attack: 0.01,
      decay: 0.05,
      sustain: 0.7,
      release: 0.1
    });
    const { outputs, emitted } = recordingOutputs();
    await node.run(
      makeInputs({
        handles: {
          gate: [
            makeSignalChunk(gate, SR, 1, false, "f32le"),
            makeDoneSignalChunk(SR, 1, "f32le")
          ]
        }
      }),
      outputs
    );
    const env = concatEmitted(emitted);
    const levelAtRetrigger = env[1100];
    expect(levelAtRetrigger).toBeGreaterThan(0.3); // still mid-release
    // The very next samples continue upward from that level — no reset to 0.
    expect(env[1101]).toBeGreaterThanOrEqual(levelAtRetrigger);
    expect(env[1110]).toBeGreaterThan(levelAtRetrigger);
  });
});

describe("Gate", () => {
  it("emits the on/off pattern with sample-exact period", async () => {
    const node = new GateNode({
      on_duration: 0.01, // 240 frames
      off_duration: 0.01,
      amplitude: 1,
      sample_rate: SR
    });
    // 2 chunks = 1024 frames, covering two full 480-frame cycles.
    const { outputs, emitted, signal } = abortAfter(2);
    await node.run(makeInputs({ handles: {}, signal }), outputs);
    const cv = concatEmitted(emitted);
    expect(cv.length).toBe(2 * SYNTH_CHUNK_FRAMES);
    expect(cv[0]).toBe(1);
    expect(cv[239]).toBe(1);
    expect(cv[240]).toBe(0);
    expect(cv[479]).toBe(0);
    expect(cv[480]).toBe(1); // second cycle
    expect(cv[719]).toBe(1);
    expect(cv[720]).toBe(0);
    expect(cv[960]).toBe(1); // third cycle
  });

  it("paces emission with the wall clock", async () => {
    const node = new GateNode({
      on_duration: 0.02,
      off_duration: 0.02,
      amplitude: 1,
      sample_rate: SR
    });
    const { outputs, emitted, signal } = abortAfter(4);
    const startMs = Date.now();
    await node.run(makeInputs({ handles: {}, signal }), outputs);
    const elapsedMs = Date.now() - startMs;

    // 4 chunks = 2048 frames @ 24 kHz ≈ 85 ms of audio; the first chunk is
    // unpaced, so the run must take at least ~3 chunk periods (loose bound
    // against CI jitter).
    expect(elapsedMs).toBeGreaterThan(40);
    expect(concatEmitted(emitted).length).toBe(4 * SYNTH_CHUNK_FRAMES);
  });

  it("stops on abort and terminates the stream with a done marker", async () => {
    const controller = new AbortController();
    const { outputs, emitted } = recordingOutputs();
    const run = new GateNode({ sample_rate: SR }).run(
      makeInputs({ handles: {}, signal: controller.signal }),
      outputs
    );
    setTimeout(() => controller.abort(), 80);
    await expect(run).resolves.toBeUndefined();
    expect(emitted.length).toBeGreaterThan(0);
    const last = readSignalChunk(emitted[emitted.length - 1][1])!;
    expect(last.done).toBe(true);
  });
});

describe("VCA", () => {
  it("multiplies audio by frame-aligned CV", async () => {
    const frames = 512;
    const audio = new Float32Array(frames).fill(1);
    const ramp = new Float32Array(frames);
    for (let i = 0; i < frames; i++) ramp[i] = i / frames;

    const node = new VcaNode({ gain: 1 });
    const { outputs, emitted } = recordingOutputs();
    await node.run(
      makeInputs({
        handles: {
          audio: [
            makeSignalChunk(audio, SR, 1, false, "pcm16le"),
            makeDoneSignalChunk(SR, 1, "pcm16le")
          ],
          cv: [
            makeSignalChunk(ramp, SR, 1, false, "f32le"),
            makeDoneSignalChunk(SR, 1, "f32le")
          ]
        }
      }),
      outputs
    );

    const out = concatEmitted(emitted);
    expect(out.length).toBe(frames);
    for (let i = 0; i < frames; i += 37) {
      expect(out[i]).toBeCloseTo(ramp[i], 3); // pcm16 quantization tolerance
    }
  });

  it("holds the last CV value when the CV stream ends early", async () => {
    const frames = 256;
    const audio = new Float32Array(frames).fill(1);
    const cv = new Float32Array(frames).fill(0.5);
    cv[frames - 1] = 0.25;

    const node = new VcaNode({ gain: 1 });
    const { outputs, emitted } = recordingOutputs();
    await node.run(
      makeInputs({
        handles: {
          audio: [
            makeSignalChunk(audio, SR, 1, false, "pcm16le"),
            makeSignalChunk(audio, SR, 1, false, "pcm16le"),
            makeDoneSignalChunk(SR, 1, "pcm16le")
          ],
          cv: [
            makeSignalChunk(cv, SR, 1, false, "f32le"),
            makeDoneSignalChunk(SR, 1, "f32le")
          ]
        }
      }),
      outputs
    );

    const out = concatEmitted(emitted);
    expect(out.length).toBe(frames * 2);
    expect(out[0]).toBeCloseTo(0.5, 3);
    // Second audio chunk is covered by holding the CV's final value.
    for (let i = frames; i < frames * 2; i += 31) {
      expect(out[i]).toBeCloseTo(0.25, 3);
    }
  });

  it("acts as a plain gain when cv is unpatched", async () => {
    const frames = 128;
    const audio = new Float32Array(frames).fill(0.5);
    const node = new VcaNode({ gain: 2 });
    const { outputs, emitted } = recordingOutputs();
    await node.run(
      makeInputs({
        handles: {
          audio: [
            makeSignalChunk(audio, SR, 1, false, "pcm16le"),
            makeDoneSignalChunk(SR, 1, "pcm16le")
          ]
        }
      }),
      outputs
    );
    const out = concatEmitted(emitted);
    for (let i = 0; i < frames; i += 17) expect(out[i]).toBeCloseTo(1, 3);
  });
});

describe("Attenuverter", () => {
  it("applies out = in * scale + offset, preserving values beyond ±1 (f32le)", async () => {
    const signal = new Float32Array([0, 0.5, -0.5, 1]);
    const node = new AttenuverterNode({ scale: -2, offset: 1 });
    const { outputs, emitted } = recordingOutputs();
    await node.run(
      makeInputs({
        handles: {
          signal: [
            makeSignalChunk(signal, SR, 1, false, "f32le"),
            makeDoneSignalChunk(SR, 1, "f32le")
          ]
        }
      }),
      outputs
    );
    const out = concatEmitted(emitted);
    // -2 * 1 + 1 = -1 and -2 * -0.5 + 1 = 2: inversion and >1 survive on the
    // f32le wire (pcm16 would clamp the 2).
    expect([...out]).toEqual([1, 0, 2, -1]);
    const last = readSignalChunk(emitted[emitted.length - 1][1])!;
    expect(last.done).toBe(true);
  });
});

describe("VCF", () => {
  function nyquistTone(frames: number): Float32Array {
    const samples = new Float32Array(frames);
    for (let i = 0; i < frames; i++) samples[i] = i % 2 === 0 ? 0.8 : -0.8;
    return samples;
  }

  function rms(samples: Float32Array, skip = 256): number {
    let sum = 0;
    for (let i = skip; i < samples.length; i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / (samples.length - skip));
  }

  async function runVcf(
    audio: Float32Array,
    props: Record<string, unknown>,
    cv?: Float32Array
  ): Promise<Float32Array> {
    const handles: Record<string, unknown[]> = {
      audio: [
        makeSignalChunk(audio, SR, 1, false, "pcm16le"),
        makeDoneSignalChunk(SR, 1, "pcm16le")
      ]
    };
    if (cv) {
      handles.cutoff_cv = [
        makeSignalChunk(cv, SR, 1, false, "f32le"),
        makeDoneSignalChunk(SR, 1, "f32le")
      ];
    }
    const node = new VcfNode(props);
    const { outputs, emitted } = recordingOutputs();
    await node.run(makeInputs({ handles }), outputs);
    return concatEmitted(emitted);
  }

  it("static lowpass matches the whole-buffer biquad (state persists across control blocks)", async () => {
    const audio = nyquistTone(2048);
    const out = await runVcf(audio, {
      mode: "lowpass",
      cutoff_hz: 1000,
      q: DEFAULT_Q
    });
    const reference = applyBiquadToWav(
      { samples: audio, sampleRate: SR, numChannels: 1 },
      "lowpass",
      1000,
      DEFAULT_Q,
      0
    ).samples;
    expect(out.length).toBe(reference.length);
    for (let i = 0; i < out.length; i++) {
      expect(Math.abs(out[i] - reference[i])).toBeLessThan(1e-3); // pcm16 LSB
    }
  });

  it("cutoff CV opens the filter: cutoff = cutoff_hz * 2^(cv * cv_amount)", async () => {
    // 3 kHz sine — well inside the passband once the CV lifts the cutoff.
    // (A Nyquist tone won't do: the RBJ lowpass has a double zero at
    // Nyquist, so it is annihilated at any cutoff.)
    const audio = new Float32Array(2048);
    for (let i = 0; i < audio.length; i++) {
      audio[i] = 0.8 * Math.sin((2 * Math.PI * 3000 * i) / SR);
    }
    const closed = await runVcf(audio, {
      mode: "lowpass",
      cutoff_hz: 500,
      cv_amount: 1
    });
    const opened = await runVcf(
      audio,
      { mode: "lowpass", cutoff_hz: 500, cv_amount: 1 },
      new Float32Array(2048).fill(4) // +4 octaves → 8 kHz cutoff
    );
    expect(rms(closed)).toBeLessThan(0.1);
    expect(rms(opened)).toBeGreaterThan(0.3);
    expect(rms(opened)).toBeGreaterThan(rms(closed) * 4);
  });
});

describe("LFO (clocked)", () => {
  it("matches the clock's chunk cadence and resets phase on rising edges", async () => {
    const sizes = [512, 256, 128];
    const clocks = sizes.map((n, idx) => {
      const buf = new Float32Array(n);
      if (idx === 1) buf.fill(1); // rising edge at the start of chunk 2
      return makeSignalChunk(buf, SR, 1, false, "f32le");
    });
    clocks.push(makeDoneSignalChunk(SR, 1, "f32le"));

    const node = new LfoNode({
      waveform: "saw",
      rate_hz: 10,
      depth: 1,
      offset: 0
    });
    const { outputs, emitted } = recordingOutputs();
    await node.run(makeInputs({ handles: { clock: clocks } }), outputs);

    expect(emitted).toHaveLength(4);
    for (let i = 0; i < 3; i++) {
      expect(readSignalChunk(emitted[i][1])!.samples.length).toBe(sizes[i]);
    }
    expect(readSignalChunk(emitted[3][1])!.done).toBe(true);

    // Saw at phase 0 is -1: the reset lands exactly at chunk 2's first sample.
    const secondChunk = readSignalChunk(emitted[1][1])!.samples;
    expect(secondChunk[0]).toBe(-1);
  });
});

describe("LFO (free run)", () => {
  it("free-runs paced chunks until cancelled, then a done marker", async () => {
    const node = new LfoNode({
      waveform: "saw",
      rate_hz: 10,
      depth: 1,
      offset: 0,
      sample_rate: SR
    });
    const { outputs, emitted, signal } = abortAfter(3);
    await node.run(makeInputs({ handles: {}, signal }), outputs);

    expect(emitted).toHaveLength(4);
    const cv = concatEmitted(emitted);
    expect(cv.length).toBe(3 * SYNTH_CHUNK_FRAMES);
    expect(cv[0]).toBe(-1); // saw starts at phase 0
    // Phase advances across chunk boundaries: 10 Hz over 1536 frames stays
    // within the first period, so the saw rises monotonically throughout.
    for (let i = 1; i < cv.length; i++) {
      expect(cv[i]).toBeGreaterThan(cv[i - 1]);
    }
    expect(readSignalChunk(emitted[3][1])!.done).toBe(true);
  });
});

describe("SampleHold", () => {
  it("samples on trigger rising edges and holds between them", async () => {
    const frames = 8;
    const signal = new Float32Array([10, 20, 30, 40, 50, 60, 70, 80]);
    const trigger = new Float32Array([0, 1, 0, 0, 1, 1, 0, 1]);
    const node = new SampleHoldNode({});
    const { outputs, emitted } = recordingOutputs();
    await node.run(
      makeInputs({
        handles: {
          signal: [
            makeSignalChunk(signal, SR, 1, false, "f32le"),
            makeDoneSignalChunk(SR, 1, "f32le")
          ],
          trigger: [
            makeSignalChunk(trigger, SR, 1, false, "f32le"),
            makeDoneSignalChunk(SR, 1, "f32le")
          ]
        }
      }),
      outputs
    );
    const out = concatEmitted(emitted);
    expect([...out]).toEqual([0, 20, 20, 20, 50, 50, 50, 80]);
    expect(out.length).toBe(frames);
  });
});

describe("Mixer", () => {
  it("sums while open, contributes silence after a handle ends, and ends after all end", async () => {
    // Levels chosen so the sum stays below 1 — the pcm16le output clamps.
    const ones = new Float32Array(4).fill(0.5);
    const halves = new Float32Array(4).fill(0.25);
    const handles = {
      in1: [
        makeSignalChunk(ones, SR, 1, false, "pcm16le"),
        makeSignalChunk(ones, SR, 1, false, "pcm16le"),
        makeDoneSignalChunk(SR, 1, "pcm16le")
      ],
      in2: [
        makeSignalChunk(halves, SR, 1, false, "pcm16le"),
        makeDoneSignalChunk(SR, 1, "pcm16le")
      ]
    };
    const order: Array<[string, number]> = [
      ["in1", 0],
      ["in2", 0],
      ["in2", 1], // in2 done
      ["in1", 1],
      ["in1", 2] // in1 done
    ];
    const node = new MixerNode({});
    const { outputs, emitted } = recordingOutputs();
    await node.run(makeInputs({ handles, order }), outputs);

    const chunks = emitted.map(([, v]) => readSignalChunk(v)!);
    expect(chunks[chunks.length - 1].done).toBe(true);
    const out = concatEmitted(emitted);
    expect(out.length).toBe(8);
    for (let i = 0; i < 4; i++) expect(out[i]).toBeCloseTo(0.75, 3);
    // in2 has ended — it contributes silence.
    for (let i = 4; i < 8; i++) expect(out[i]).toBeCloseTo(0.5, 3);
  });
});
