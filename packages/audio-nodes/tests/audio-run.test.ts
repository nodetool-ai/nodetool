import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StreamingInputs, StreamingOutputs } from "@nodetool-ai/node-sdk";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import { ProcessingContext } from "@nodetool-ai/runtime";
import {
  AUDIO_RUN_KEY,
  AUDIO_SAMPLE_RATE,
  resolveAudioRun
} from "@nodetool-ai/protocol";
import {
  AdsrNode,
  AudioOutputNode,
  AudioToChunksNode,
  ChunksToAudioNode,
  GateNode,
  LfoNode,
  OscillatorNode,
  VcaNode,
  REALTIME_AUDIO_NODES,
  SYNTHESIS_NODES,
  makeSignalChunk,
  makeDoneSignalChunk,
  readSignalChunk,
  encodeWav,
  parseWavBytes
} from "../src/index.js";
import { getTransport } from "../src/lib/transport.js";
import * as clips from "../src/nodes/lib-audio-effects.js";
import * as dsp from "../src/nodes/lib-audio-dsp.js";
import * as signals from "../src/nodes/signal-effects.js";
import { StreamingGainNode } from "../src/nodes/realtime-audio.js";
const SR = AUDIO_SAMPLE_RATE;
afterEach(() => vi.useRealTimers());
function context(mode: "render" | "live", seconds = 2): ProcessingContext {
  const ctx = new ProcessingContext({
    jobId: "audio-test",
    inheritHostDefaults: false
  });
  ctx.set(AUDIO_RUN_KEY, {
    mode,
    endFrame: mode === "render" ? Math.round(seconds * SR) : null
  });
  return ctx;
}
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
      for (const item of handles[name] ?? []) {
        yield item;
      }
    },
    async *any() {
      if (order) {
        for (const [h, i] of order) {
          yield [h, handles[h][i]];
        }
        return;
      }
      const keys = Object.keys(handles);
      const idx: Record<string, number> = {};
      for (const k of keys) {
        idx[k] = 0;
      }
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

function concatEmitted(emitted: Array<[string, unknown]>): Float32Array {
  const parts: Float32Array[] = [];
  for (const [, value] of emitted) {
    const chunk = readSignalChunk(value);
    if (chunk && !chunk.done) {
      parts.push(chunk.samples);
    }
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

describe("audio run", () => {
  it("resolves all sink combinations and bounds render memory", () => {
    expect(resolveAudioRun([])).toEqual({ mode: "free", endFrame: null });
    expect(
      resolveAudioRun([{ audio_sink: "render", properties: { duration: 0 } }])
        .mode
    ).toBe("free");
    expect(
      resolveAudioRun([
        { audio_sink: "render", properties: { duration: 1 } },
        { audio_sink: "render", properties: { duration: 2 } }
      ])
    ).toEqual({ mode: "render", endFrame: 88200 });
    expect(
      resolveAudioRun([
        { audio_sink: "render", properties: { duration: 2 } },
        { audio_sink: "live" }
      ])
    ).toEqual({ mode: "live", endFrame: null });
    expect(
      resolveAudioRun([
        { audio_sink: "render", properties: { duration: 1000 } }
      ]).endFrame
    ).toBe(600 * SR);
    expect(
      resolveAudioRun([{ audio_sink: "render", properties: { duration: NaN } }])
        .mode
    ).toBe("free");
  });
  it("carries audio_sink only on the two sink classes", () => {
    for (const cls of [...REALTIME_AUDIO_NODES, ...SYNTHESIS_NODES]) {
      expect(getNodeMetadata(cls).audio_sink).toBe(
        cls === AudioOutputNode
          ? "live"
          : cls === ChunksToAudioNode
            ? "render"
            : undefined
      );
    }
  });
  it("shares one clock and leaves contexts without a run in free mode", () => {
    const ctx = new ProcessingContext({
      jobId: "audio-test",
      inheritHostDefaults: false
    });
    expect(getTransport(ctx)).toBe(getTransport(ctx));
    expect(getTransport(ctx).mode).toBe("free");
  });
});

async function source(
  node: GateNode | OscillatorNode,
  ctx: ProcessingContext,
  live: boolean
): Promise<Array<[string, unknown]>> {
  const controller = new AbortController();
  const out = recordingOutputs();
  if (live) {
    const emit = out.outputs.emit.bind(out.outputs);
    let frames = 0;
    out.outputs.emit = async (slot, value) => {
      const chunk = readSignalChunk(value);
      if (chunk && !chunk.done) {
        const length = Math.min(chunk.samples.length, 88200 - frames);
        await emit(
          slot,
          makeSignalChunk(chunk.samples.slice(0, length), SR, 1, false, "f32le")
        );
        frames += length;
        if (frames >= 88200) {
          controller.abort();
        }
      } else {
        await emit(slot, value);
      }
    };
  }
  const running = node.run(
    makeInputs({ handles: {}, signal: controller.signal }),
    out.outputs,
    ctx
  );
  if (live) {
    await vi.runAllTimersAsync();
  }
  await running;
  return out.emitted;
}
async function patch(
  ctx: ProcessingContext,
  live = false
): Promise<Float32Array> {
  const gate = await source(new GateNode(), ctx, live);
  const env = recordingOutputs();
  await new AdsrNode().run(
    makeInputs({ handles: { gate: gate.map((x) => x[1]) } }),
    env.outputs
  );
  const osc = await source(new OscillatorNode(), ctx, live);
  const amp = recordingOutputs();
  await new VcaNode().run(
    makeInputs({
      handles: { audio: osc.map((x) => x[1]), cv: env.emitted.map((x) => x[1]) }
    }),
    amp.outputs
  );
  const recorded = recordingOutputs();
  await new ChunksToAudioNode({ duration: 2 }).run(
    makeInputs({ handles: { chunk: amp.emitted.map((x) => x[1]) } }),
    recorded.outputs
  );
  const ref = recorded.emitted[0][1];
  if (
    typeof ref !== "object" ||
    ref === null ||
    !("data" in ref) ||
    typeof ref.data !== "string"
  ) {
    throw new Error("Expected audio ref");
  }
  const wav = parseWavBytes(
    Uint8Array.from(atob(ref.data), (ch) => ch.charCodeAt(0))
  );
  if (!wav) {
    throw new Error("Expected WAV");
  }
  return wav.samples;
}

it("renders a two-second synth without timers and matches live samples", async () => {
  vi.useFakeTimers();
  const timer = vi.spyOn(globalThis, "setTimeout");
  const rendered = await patch(context("render"));
  const expected: { frames: number; pcm_sha256: string } = JSON.parse(
    readFileSync(
      new URL(
        "../../../native/graph-runner/tests/graphs/audio-render.expected.json",
        import.meta.url
      ),
      "utf8"
    )
  );
  expect(rendered.length).toBe(expected.frames);
  expect(
    createHash("sha256")
      .update(encodeWav(rendered, SR, 1).subarray(44))
      .digest("hex")
  ).toBe(expected.pcm_sha256);
  expect(timer).not.toHaveBeenCalled();
  const live = await patch(context("live"), true);
  expect(live).toEqual(rendered);
});

const inputSamples = Float32Array.from(
  { length: 8192 },
  (_, i) => Math.sin(i * 0.19) * 0.7
);
const audio = { type: "audio", data: encodeWav(inputSamples, SR, 1) };
const decodedInput = parseWavBytes(audio.data)!.samples;
const effects = [
  {
    name: "Bitcrush",
    clip: clips.BitcrushNode,
    signal: signals.StreamingBitcrushNode
  },
  {
    name: "Compress",
    clip: clips.CompressNode,
    signal: signals.StreamingCompressNode
  },
  {
    name: "Distortion",
    clip: clips.DistortionNode,
    signal: signals.StreamingDistortionNode
  },
  {
    name: "Limiter",
    clip: clips.LimiterNode,
    signal: signals.StreamingLimiterNode
  },
  {
    name: "NoiseGate",
    clip: clips.NoiseGateNode,
    signal: signals.StreamingNoiseGateNode
  },
  {
    name: "Reverb",
    clip: clips.ReverbNode,
    signal: signals.StreamingReverbNode
  },
  {
    name: "Phaser",
    clip: clips.PhaserNode,
    signal: signals.StreamingPhaserNode
  },
  { name: "Delay", clip: dsp.DelayNode_, signal: signals.StreamingDelayNode },
  { name: "Gain", clip: dsp.GainNode_, signal: StreamingGainNode },
  {
    name: "HighShelf",
    clip: dsp.HighShelfFilterNode,
    signal: signals.StreamingHighShelfFilterNode
  },
  {
    name: "LowShelf",
    clip: dsp.LowShelfFilterNode,
    signal: signals.StreamingLowShelfFilterNode
  },
  {
    name: "Peak",
    clip: dsp.PeakFilterNode,
    signal: signals.StreamingPeakFilterNode
  }
];

for (const effect of effects) {
  it(`${effect.name} preserves clip samples across irregular signal blocks and fan-out`, async () => {
    const props = { audio, gain_db: 6, delay_seconds: 0.01 };
    const clip = await new effect.clip(props).process();
    const signal = new effect.signal(props);
    // Inherited prop decorators carry the same defaults and metadata.
    for (const prop of getNodeMetadata(effect.clip).properties.filter(
      (x) => x.name !== "audio"
    )) {
      expect(
        getNodeMetadata(effect.signal).properties.find(
          (x) => x.name === prop.name
        )?.default
      ).toEqual(prop.default);
    }
    const chunks: unknown[] = [];
    for (let offset = 0; offset < decodedInput.length; offset += 127) {
      chunks.push(
        makeSignalChunk(
          decodedInput.subarray(offset, offset + 127),
          SR,
          1,
          false,
          "pcm16le"
        )
      );
    }
    chunks.push(makeDoneSignalChunk(SR, 1, "pcm16le"));
    const original = decodedInput.slice();
    const out = recordingOutputs();
    await signal.run(makeInputs({ handles: { chunk: chunks } }), out.outputs);
    expect(decodedInput).toEqual(original);
    const joined = concatEmitted(out.emitted);
    const encoded = encodeWav(joined, SR, 1);
    const expected = Uint8Array.from(atob(String(clip.output.data)), (ch) =>
      ch.charCodeAt(0)
    );
    expect(encoded).toEqual(expected);
    expect(joined).not.toEqual(decodedInput);
  });
}
it("reads gain changes at the next block", async () => {
  const node = new StreamingGainNode();
  const samples = new Float32Array([0.1, 0.2]);
  const inputs = makeInputs({ handles: { chunk: [] } });
  inputs.stream = async function* () {
    yield makeSignalChunk(samples, SR, 1, false, "pcm16le");
    node.gain_db = 6.020599913279624;
    yield makeSignalChunk(samples, SR, 1, false, "pcm16le");
  };
  const out = recordingOutputs();
  await node.run(inputs, out.outputs);
  expect([...concatEmitted(out.emitted)]).toEqual([
    ...samples,
    ...Float32Array.from(samples, (x) => x * 2)
  ]);
});
it("paces a player by chunk start time and ends looped renders exactly", async () => {
  vi.useFakeTimers();
  const player = new AudioToChunksNode({
    audio,
    loop: true,
    chunk_duration: 0.1
  });
  const ctx = context("live");
  const gen = player.genProcess(ctx);
  await gen.next();
  let settled = false;
  const second = gen.next().then((result) => {
    settled = true;
    return result;
  });
  await vi.advanceTimersByTimeAsync(99);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await second;
  const wrapped = gen.next();
  await vi.advanceTimersByTimeAsync(100);
  const looped = await wrapped;
  expect(readSignalChunk(looped.value?.chunk)?.samples.subarray(0, 23)).toEqual(
    decodedInput.subarray(0, 23)
  );
  await gen.return({});
  const rendered = [];
  for await (const value of player.genProcess(context("render", 0.5))) {
    rendered.push(["chunk", value.chunk] as [string, unknown]);
  }
  expect(concatEmitted(rendered).length).toBe(22050);
});

it("renders a clip through the player and signal reverb with clip parity", async () => {
  vi.useFakeTimers();
  const timer = vi.spyOn(globalThis, "setTimeout");
  const player = new AudioToChunksNode({ audio, chunk_duration: 127 / SR });
  const chunks = [];
  for await (const item of player.genProcess(context("render", 1))) {
    chunks.push(item.chunk);
  }
  const out = recordingOutputs();
  await new signals.StreamingReverbNode().run(
    makeInputs({ handles: { chunk: chunks } }),
    out.outputs
  );
  const expected = await new clips.ReverbNode({ audio }).process();
  expect(encodeWav(concatEmitted(out.emitted), SR, 1)).toEqual(
    Uint8Array.from(atob(String(expected.output.data)), (ch) =>
      ch.charCodeAt(0)
    )
  );
  expect(timer).not.toHaveBeenCalled();
});

it("resets effect state when rate or channels change", async () => {
  const out = recordingOutputs();
  const next = makeSignalChunk(
    decodedInput.subarray(0, 1024),
    48000,
    2,
    false,
    "pcm16le"
  );
  await new signals.StreamingPhaserNode().run(
    makeInputs({
      handles: {
        chunk: [makeSignalChunk(decodedInput, SR, 1, false, "pcm16le"), next]
      }
    }),
    out.outputs
  );
  const fresh = recordingOutputs();
  await new signals.StreamingPhaserNode().run(
    makeInputs({ handles: { chunk: [next] } }),
    fresh.outputs
  );
  expect(readSignalChunk(out.emitted[1][1])?.samples).toEqual(
    readSignalChunk(fresh.emitted[0][1])?.samples
  );
});

it("limits the signal delay control without narrowing the clip control", () => {
  expect(
    getNodeMetadata(signals.StreamingDelayNode).properties.find(
      (p) => p.name === "delay_seconds"
    )?.max
  ).toBe(2);
  expect(
    getNodeMetadata(dsp.DelayNode_).properties.find(
      (p) => p.name === "delay_seconds"
    )?.max
  ).toBe(5);
});

it("matches the native LFO-driven render fixture", async () => {
  const ctx = context("render", 0.05);
  const lfo = recordingOutputs();
  await new LfoNode().run(makeInputs({ handles: {} }), lfo.outputs, ctx);
  const osc = recordingOutputs();
  await new OscillatorNode().run(
    makeInputs({ handles: { pitch_cv: lfo.emitted.map((item) => item[1]) } }),
    osc.outputs,
    ctx
  );
  const samples = concatEmitted(osc.emitted);
  const expected: { frames: number; pcm_sha256: string } = JSON.parse(
    readFileSync(
      new URL(
        "../../../native/graph-runner/tests/graphs/audio-lfo-render.expected.json",
        import.meta.url
      ),
      "utf8"
    )
  );
  expect(samples.length).toBe(expected.frames);
  expect(
    createHash("sha256")
      .update(encodeWav(samples, SR, 1).subarray(44))
      .digest("hex")
  ).toBe(expected.pcm_sha256);
});

it("emits a bounded live recording before input ends and drains later chunks", async () => {
  const out = recordingOutputs();
  let drained = false;
  const input = makeInputs({ handles: { chunk: [] } });
  input.stream = async function* () {
    yield makeSignalChunk(
      new Float32Array([0.1, 0.2, 0.3, 0.4]),
      SR,
      1,
      false,
      "pcm16le"
    );
    expect(out.emitted).toHaveLength(1);
    drained = true;
    yield makeSignalChunk(
      new Float32Array([0.5, 0.6]),
      SR,
      1,
      false,
      "pcm16le"
    );
    yield makeDoneSignalChunk(SR, 1, "pcm16le");
  };
  await new ChunksToAudioNode({ duration: 2 / SR }).run(
    input,
    out.outputs,
    context("live")
  );
  expect(drained).toBe(true);
  expect(out.emitted).toHaveLength(1);
  const value = out.emitted[0][1];
  if (typeof value !== "object" || value === null || !("data" in value))
    throw new Error("Expected audio");
  const wav = parseWavBytes(
    Uint8Array.from(atob(String(value.data)), (ch) => ch.charCodeAt(0))
  );
  expect(wav?.samples.length).toBe(2);
});

it("uses the file rate when looping without a resolved graph transport", async () => {
  vi.useFakeTimers();
  const player = new AudioToChunksNode({
    audio: {
      type: "audio",
      data: encodeWav(new Float32Array(16000), 16000, 1)
    },
    loop: true,
    chunk_duration: 0.1
  });
  const gen = player.genProcess();
  const first = await gen.next();
  expect(readSignalChunk(first.value?.chunk)?.sampleRate).toBe(16000);
  let settled = false;
  const next = gen.next().then((value) => {
    settled = true;
    return value;
  });
  await vi.advanceTimersByTimeAsync(99);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await next;
  await gen.return({});
});
