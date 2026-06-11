import { describe, it, expect } from "vitest";
import type { StreamingInputs, StreamingOutputs } from "@nodetool-ai/node-sdk";
import {
  OscillatorNode,
  LfoNode,
  AdsrNode,
  GateNode,
  VcaNode,
  MixerNode,
  SampleHoldNode,
  makeSignalChunk,
  makeDoneSignalChunk,
  readSignalChunk,
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
  it("renders the requested duration in 512-frame chunks plus a done marker", async () => {
    const node = new OscillatorNode({
      waveform: "sine",
      frequency: 100,
      amplitude: 1,
      duration: 1,
      sample_rate: SR
    });
    const { outputs, emitted } = recordingOutputs();
    await node.run(makeInputs({ handles: {} }), outputs);

    const expectedChunks = Math.ceil(SR / SYNTH_CHUNK_FRAMES);
    expect(emitted).toHaveLength(expectedChunks + 1);
    const last = readSignalChunk(emitted[emitted.length - 1][1])!;
    expect(last.done).toBe(true);

    const samples = concatEmitted(emitted);
    expect(samples.length).toBe(SR);
    // 100 Hz over 1 s → ~200 zero crossings.
    expect(Math.abs(signChanges(samples) - 200)).toBeLessThanOrEqual(2);
  });

  it("keeps phase continuous across chunk boundaries", async () => {
    const node = new OscillatorNode({
      waveform: "sine",
      frequency: 440,
      amplitude: 1,
      duration: 0.5,
      sample_rate: SR
    });
    const { outputs, emitted } = recordingOutputs();
    await node.run(makeInputs({ handles: {} }), outputs);

    const samples = concatEmitted(emitted);
    // Max per-sample step of a 440 Hz sine @ 24 kHz, with quantization slack.
    const maxStep = 2 * Math.PI * (440 / SR) + 1e-3;
    for (let i = 1; i < samples.length; i++) {
      expect(Math.abs(samples[i] - samples[i - 1])).toBeLessThanOrEqual(
        maxStep
      );
    }
  });

  it("throws on duration 0 without realtime", async () => {
    const node = new OscillatorNode({ duration: 0, sample_rate: SR });
    const { outputs } = recordingOutputs();
    await expect(
      node.run(makeInputs({ handles: {} }), outputs)
    ).rejects.toThrow(/realtime/);
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
      repeats: 2,
      amplitude: 1,
      sample_rate: SR
    });
    const { outputs, emitted } = recordingOutputs();
    await node.run(makeInputs({ handles: {} }), outputs);
    const cv = concatEmitted(emitted);
    expect(cv.length).toBe(2 * 480);
    expect(cv[0]).toBe(1);
    expect(cv[239]).toBe(1);
    expect(cv[240]).toBe(0);
    expect(cv[479]).toBe(0);
    expect(cv[480]).toBe(1); // second cycle
  });

  it("realtime pacing delays emission without changing content", async () => {
    const props = {
      on_duration: 0.02,
      off_duration: 0.02,
      repeats: 2,
      amplitude: 1,
      sample_rate: SR
    };
    const free = recordingOutputs();
    await new GateNode({ ...props }).run(makeInputs({ handles: {} }), free.outputs);

    const paced = recordingOutputs();
    const startMs = Date.now();
    await new GateNode({ ...props, realtime: true }).run(
      makeInputs({ handles: {} }),
      paced.outputs
    );
    const elapsedMs = Date.now() - startMs;

    // 1920 frames @ 24 kHz = 80 ms of audio in 512-frame chunks → the paced
    // run must take at least ~3 chunk periods (loose bound against CI jitter).
    expect(elapsedMs).toBeGreaterThan(40);
    expect(concatEmitted(paced.emitted)).toEqual(concatEmitted(free.emitted));
  });

  it("infinite (repeats 0) requires realtime and stops on abort", async () => {
    const { outputs } = recordingOutputs();
    await expect(
      new GateNode({ repeats: 0, sample_rate: SR }).run(
        makeInputs({ handles: {} }),
        outputs
      )
    ).rejects.toThrow(/realtime/);

    const controller = new AbortController();
    const paced = recordingOutputs();
    const run = new GateNode({
      repeats: 0,
      realtime: true,
      sample_rate: SR
    }).run(makeInputs({ handles: {}, signal: controller.signal }), paced.outputs);
    setTimeout(() => controller.abort(), 80);
    await expect(run).resolves.toBeUndefined();
    expect(paced.emitted.length).toBeGreaterThan(0);
    const last = readSignalChunk(paced.emitted[paced.emitted.length - 1][1])!;
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
