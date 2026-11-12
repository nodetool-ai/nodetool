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
  StreamingLowPassNode,
  StreamingHighPassNode,
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
import { AudioTransport, getTransport } from "../src/lib/transport.js";
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
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
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
  { name: "LowPassFilter", clip: dsp.LowPassFilterNode, signal: StreamingLowPassNode },
  { name: "HighPassFilter", clip: dsp.HighPassFilterNode, signal: StreamingHighPassNode },
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
    name: "HighShelfFilter",
    clip: dsp.HighShelfFilterNode,
    signal: signals.StreamingHighShelfFilterNode
  },
  {
    name: "LowShelfFilter",
    clip: dsp.LowShelfFilterNode,
    signal: signals.StreamingLowShelfFilterNode
  },
  {
    name: "PeakFilter",
    clip: dsp.PeakFilterNode,
    signal: signals.StreamingPeakFilterNode
  }
];

for (const effect of effects.filter(effect => effect.name !== "LowPassFilter" && effect.name !== "HighPassFilter")) {
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
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
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


it("keeps foreign chunks without rate metadata at 24 kHz through effects and recording", async () => {
  const chunk = { content_type: "audio", content: new Float32Array(240), done: false };
  expect(readSignalChunk(chunk)?.sampleRate).toBe(24000);
  const amplified = recordingOutputs();
  await new StreamingGainNode().run(makeInputs({ handles: { chunk: [chunk] } }), amplified.outputs);
  expect(readSignalChunk(amplified.emitted[0][1])?.sampleRate).toBe(24000);
  const out = recordingOutputs();
  await new ChunksToAudioNode().run(makeInputs({ handles: { chunk: [chunk] } }), out.outputs);
  const ref = out.emitted[0][1];
  expect(parseWavBytes(Buffer.from(String(typeof ref === "object" && ref !== null && "data" in ref ? ref.data : ""), "base64"))?.sampleRate).toBe(24000);
});

it("yields bounded renders so timer cancellation can reach the source", async () => {
  const ctx = context("render", 600);
  const controller = new AbortController();
  let emitted = 0;
  const out = recordingOutputs();
  out.outputs.emit = async (_slot, value) => { if (!readSignalChunk(value)?.done) emitted++; };
  const timer = setTimeout(() => controller.abort(), 0);
  try {
    await new OscillatorNode().run(makeInputs({ handles: {}, signal: controller.signal }), out.outputs, ctx);
    expect(controller.signal.aborted).toBe(true);
    expect(emitted).toBeGreaterThan(0);
    expect(emitted).toBeLessThan(600 * SR / 1024);
  } finally { clearTimeout(timer); }
});

it("yields at least once per 32 render blocks without wall-clock pacing", async () => {
  const immediate = vi.spyOn(globalThis, "setImmediate");
  const transport = new AudioTransport({ mode: "render", endFrame: SR });
  for (let i = 0; i < 96; i++) await transport.until(i * 1024);
  expect(immediate).toHaveBeenCalledTimes(3);
  immediate.mockRestore();
});

it("asserts the exact native effect fixture against TypeScript PCM", async () => {
  const base = new URL("../../../native/graph-runner/tests/graphs/", import.meta.url);
  const graph: { nodes: Array<{ id: string; type: string; properties: Record<string, unknown> }> } = JSON.parse(readFileSync(new URL("audio-effects.json", base), "utf8"));
  const expected: Record<string, { frames: number; pcm_sha256: string }> = JSON.parse(readFileSync(new URL("audio-effects.expected.json", base), "utf8"));
  expect(Object.keys(expected).sort()).toEqual(effects.map(effect => effect.name).sort());
  const player = new AudioToChunksNode({ audio: graph.nodes.find(node => node.id === "source")?.properties.value, chunk_duration: 127 / SR });
  const chunks = [];
  for await (const item of player.genProcess()) chunks.push(item.chunk);
  for (const effect of effects) {
    const props = graph.nodes.find(node => node.id === effect.name)?.properties;
    expect(props).toBeDefined();
    const out = recordingOutputs();
    await new effect.signal(props).run(makeInputs({ handles: { chunk: chunks } }), out.outputs);
    const pcm = concatEmitted(out.emitted);
    expect({ frames: pcm.length, pcm_sha256: createHash("sha256").update(encodeWav(pcm, SR, 1).subarray(44)).digest("hex") }).toEqual(expected[effect.name]);
  }
});

for (const Effect of [StreamingGainNode, signals.StreamingHighShelfFilterNode, signals.StreamingLowShelfFilterNode, signals.StreamingPeakFilterNode]) {
  it(`${Effect.name} preserves the existing neutral clip default`, async () => {
    const out = recordingOutputs();
    await new Effect().run(makeInputs({ handles: { chunk: [makeSignalChunk(decodedInput, SR, 1, false, "pcm16le")] } }), out.outputs);
    expect(concatEmitted(out.emitted)).toEqual(decodedInput);
  });
}


for (const mode of ["render", "live"] as const) {
  it(`${mode} players decode foreign audio and resample a 48 kHz WAV`, async () => {
    const { loadKernels } = await import("@nodetool-ai/kernels");
    const { decodeAudioToWav } = await import("../src/lib/audio-wav.js");
    const base = new URL("../../../native/graph-runner/tests/graphs/audio-subgraph-render.json", import.meta.url);
    const graph = JSON.parse(readFileSync(base, "utf8"));
    const wavRef = graph.nodes[0].properties.graph.nodes[0].properties.value;
    const flac = readFileSync(new URL("./fixtures/player-48k.flac", import.meta.url));
    for (const data of [Buffer.from(wavRef.data, "base64"), flac]) {
      const decoded = await decodeAudioToWav(data);
      const expected = (await loadKernels()).resample(decoded.samples, decoded.numChannels, decoded.sampleRate, SR);
      const player = new AudioToChunksNode({ audio: { type: "audio", data }, chunk_duration: 0.01 });
      const emitted: Array<[string, unknown]> = [];
      const running = (async () => {
        for await (const item of player.genProcess(context(mode, 1))) {
          expect(readSignalChunk(item.chunk)?.sampleRate).toBe(SR);
          emitted.push(["chunk", item.chunk]);
        }
      })();
      await running;
      expect(encodeWav(concatEmitted(emitted), SR, decoded.numChannels)).toEqual(encodeWav(expected, SR, decoded.numChannels));
    }
  });
}

for (const effect of effects.filter(effect => !["Gain", "LowShelfFilter", "HighShelfFilter", "PeakFilter"].includes(effect.name))) {
  it(`${effect.name} changes samples at its default controls`, async () => {
    const out = recordingOutputs();
    await new effect.signal().run(makeInputs({ handles: { chunk: [makeSignalChunk(decodedInput, SR, 1, false, "pcm16le")] } }), out.outputs);
    expect(concatEmitted(out.emitted)).not.toEqual(decodedInput);
  });
}
