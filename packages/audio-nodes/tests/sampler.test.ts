import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { StreamingInputs, StreamingOutputs } from "@nodetool-ai/node-sdk";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { AUDIO_RUN_KEY, AUDIO_SAMPLE_RATE } from "@nodetool-ai/protocol";
import {
  ChunksToAudioNode,
  GateNode,
  MAX_SAMPLER_SECONDS,
  SamplerNode,
  SYNTHESIS_NODES,
  encodeWav,
  makeDoneSignalChunk,
  makeSignalChunk,
  parseWavBytes,
  readSignalChunk
} from "../src/index.js";

const SR = AUDIO_SAMPLE_RATE;

function context(mode: "render" | "live", seconds = 2): ProcessingContext {
  const ctx = new ProcessingContext({
    jobId: "sampler-test",
    inheritHostDefaults: false
  });
  ctx.set(AUDIO_RUN_KEY, {
    mode,
    endFrame: mode === "render" ? Math.round(seconds * SR) : null
  });
  return ctx;
}

/**
 * Streaming fake. A handle is patched when its key is in `handles`. `any()`
 * takes one item from each handle in turn, and `first()` takes the first
 * item of a handle.
 */
function makeInputs(
  handles: Record<string, unknown[]>,
  signal: AbortSignal = new AbortController().signal
): StreamingInputs {
  const next: Record<string, number> = {};
  for (const key of Object.keys(handles)) {
    next[key] = 0;
  }
  return {
    signal,
    hasStream: (name: string) => name in handles,
    async first(name: string, defaultValue?: unknown) {
      const items = handles[name] ?? [];
      return next[name] < items.length ? items[next[name]++] : defaultValue;
    },
    async *any() {
      let progressed = true;
      while (progressed) {
        progressed = false;
        for (const key of Object.keys(handles)) {
          if (next[key] < handles[key].length) {
            yield [key, handles[key][next[key]++]] as [string, unknown];
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
  const out = new Float32Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** CV chunks of `size` frames over `signal`, with the end marker. */
function cvChunks(signal: Float32Array, size: number): unknown[] {
  const chunks: unknown[] = [];
  for (let offset = 0; offset < signal.length; offset += size) {
    chunks.push(
      makeSignalChunk(signal.subarray(offset, offset + size), SR, 1, false, "f32le")
    );
  }
  chunks.push(makeDoneSignalChunk(SR, 1, "f32le"));
  return chunks;
}

/** A gate that is high for ten frames at each start frame. */
function gateAt(frames: number, starts: readonly number[]): Float32Array {
  const gate = new Float32Array(frames);
  for (const start of starts) {
    gate.fill(1, start, start + 10);
  }
  return gate;
}

/** The samples of a clip after its 16-bit WAV encoding. */
function clipOf(samples: Float32Array, rate = SR, channels = 1) {
  const data = encodeWav(samples, rate, channels);
  return { audio: { type: "audio", data }, samples: parseWavBytes(data)!.samples };
}

// A clip that ends at zero, so a voice that reaches the end leaves no decay.
const clip = clipOf(
  Float32Array.from({ length: 300 }, (_, i) =>
    i === 299 ? 0 : Math.sin(i * 0.37) * 0.6
  )
);

async function runSampler(
  node: SamplerNode,
  handles: Record<string, unknown[]>,
  ctx?: ProcessingContext
): Promise<Array<[string, unknown]>> {
  const out = recordingOutputs();
  await node.run(makeInputs(handles), out.outputs, ctx);
  return out.emitted;
}

describe("Sampler", () => {
  it("is a synthesis node with one chunk output", () => {
    expect(SYNTHESIS_NODES).toContain(SamplerNode);
    const metadata = getNodeMetadata(SamplerNode);
    expect(metadata.outputs.map((o) => o.name)).toEqual(["chunk"]);
    expect(metadata.audio_sink).toBeUndefined();
    // The description states the limit as text, so it must follow the constant.
    const length = metadata.properties.find((p) => p.name === "length");
    expect(length?.max).toBe(MAX_SAMPLER_SECONDS);
    expect(length?.description).toContain(`at most ${MAX_SAMPLER_SECONDS} s`);
  });

  it("plays the clip one time when no gate is patched", async () => {
    const emitted = await runSampler(
      new SamplerNode({ audio: clip.audio }),
      {},
      context("render")
    );
    // Every emitted key is the declared output.
    expect(emitted.every(([slot]) => slot === "chunk")).toBe(true);
    const samples = concatEmitted(emitted);
    expect(samples.subarray(0, 300)).toEqual(clip.samples);
    expect(samples.subarray(300).every((s) => s === 0)).toBe(true);
    const last = readSignalChunk(emitted[emitted.length - 1][1]);
    expect(last?.done).toBe(true);
    expect(last?.sampleRate).toBe(SR);
  });

  it("starts a voice at each gate edge and keeps the pitch of the trigger", async () => {
    const frames = 512;
    const pitch = new Float32Array(frames);
    pitch.fill(1, 100);
    const emitted = await runSampler(new SamplerNode(), {
      audio: [clip.audio],
      gate: cvChunks(gateAt(frames, [0, 100]), 128),
      pitch_cv: cvChunks(pitch, 128)
    });
    const samples = concatEmitted(emitted);
    for (let i = 0; i < 250; i++) {
      // The second voice starts at frame 100, one octave up.
      const second = i >= 100 ? clip.samples[(i - 100) * 2] : 0;
      expect(samples[i]).toBeCloseTo(clip.samples[i] + second, 6);
    }
  });

  it("plays the voices out after the gate stream ends", async () => {
    const emitted = await runSampler(new SamplerNode({ audio: clip.audio }), {
      gate: cvChunks(gateAt(64, [0]), 64)
    });
    const samples = concatEmitted(emitted);
    expect(samples.length).toBeGreaterThanOrEqual(300);
    expect(samples.subarray(0, 300)).toEqual(clip.samples);
  });

  it("replaces the oldest voice when all voices sound", async () => {
    const emitted = await runSampler(
      new SamplerNode({ audio: clip.audio, voices: 1 }),
      { gate: cvChunks(gateAt(512, [0, 100]), 512) }
    );
    const samples = concatEmitted(emitted);
    // The first voice stops at frame 100. Its level decays under the new voice.
    expect(samples[100]).toBeCloseTo(clip.samples[0] + clip.samples[100], 6);
    expect(samples[220]).toBeCloseTo(
      clip.samples[120] + clip.samples[100] * (1 - 1 / 128) ** 120,
      6
    );
  });

  it("fades a gated voice out and repeats a looped region", async () => {
    const ones = clipOf(new Float32Array(2000).fill(0.5));
    const gate = new Float32Array(1024);
    gate.fill(1, 0, 400);
    const gated = concatEmitted(
      await runSampler(
        new SamplerNode({ audio: ones.audio, mode: "gated", release: 200 / SR }),
        { gate: cvChunks(gate, 256) }
      )
    );
    expect(gated[399]).toBeCloseTo(0.5, 4);
    expect(gated[500]).toBeCloseTo(0.25, 4);
    expect(gated[700]).toBe(0);

    const four = clipOf(new Float32Array([0.1, 0.2, 0.3, 0.4]));
    const looped = concatEmitted(
      await runSampler(
        new SamplerNode({ audio: four.audio, mode: "loop" }),
        {},
        context("render", 10 / SR)
      )
    );
    expect(looped.length).toBe(10);
    for (let i = 0; i < 10; i++) {
      expect(looped[i]).toBe(four.samples[i % 4]);
    }
  });

  it("plays the region that start and length select", async () => {
    const emitted = await runSampler(
      new SamplerNode({ audio: clip.audio, start: 100 / SR, length: 50 / SR }),
      {},
      context("render")
    );
    const samples = concatEmitted(emitted);
    expect(samples.subarray(0, 50)).toEqual(clip.samples.subarray(100, 150));
    // The region ends above zero, so the level decays instead of a jump.
    expect(samples[50]).toBeCloseTo(clip.samples[149], 6);
    expect(Math.abs(samples[600])).toBeLessThan(Math.abs(samples[50]) * 0.05);
  });

  it("limits the region to the maximum length", async () => {
    const long = clipOf(new Float32Array((MAX_SAMPLER_SECONDS + 1) * 8000).fill(0.5), 8000);
    const emitted = await runSampler(
      new SamplerNode({ audio: long.audio, tune: 48 }),
      { gate: cvChunks(gateAt(8000, [0]), 8000).map((chunk) => atRate(chunk, 8000)) }
    );
    // Four octaves up, the 30 s region lasts 30 / 16 s at the clip's rate.
    // The whole clip would last 31 / 16 s.
    const samples = concatEmitted(emitted);
    const end = (MAX_SAMPLER_SECONDS * 8000) / 16;
    expect(samples[end - 1]).toBeCloseTo(0.5, 4);
    expect(samples[end + 400]).toBeLessThan(0.05);
  });

  it("resamples the clip to the rate of the stream", async () => {
    const slow = clipOf(
      Float32Array.from({ length: 2000 }, (_, i) => Math.sin(i * 0.05) * 0.5),
      SR / 2
    );
    const samples = concatEmitted(
      await runSampler(new SamplerNode({ audio: slow.audio }), {}, context("render"))
    );
    // Twice the rate: each clip frame is two output frames.
    for (let i = 200; i < 1800; i += 100) {
      expect(samples[i * 2]).toBeCloseTo(slow.samples[i], 3);
    }
  });

  it("keeps the channels of the clip", async () => {
    const stereo = clipOf(
      Float32Array.from({ length: 200 }, (_, i) =>
        i >= 198 ? 0 : i % 2 === 0 ? 0.25 : -0.5
      ),
      SR,
      2
    );
    const emitted = await runSampler(
      new SamplerNode({ audio: stereo.audio }),
      {},
      context("render")
    );
    expect(readSignalChunk(emitted[0][1])?.channels).toBe(2);
    expect(concatEmitted(emitted).subarray(0, 200)).toEqual(stereo.samples);
  });

  it("reads the controls at each block", async () => {
    const node = new SamplerNode({ audio: clip.audio });
    const chunks = cvChunks(gateAt(1024, [0, 512]), 512);
    const inputs = makeInputs({ gate: [] });
    inputs.any = async function* () {
      yield ["gate", chunks[0]];
      node.tune = 12;
      yield ["gate", chunks[1]];
      yield ["gate", chunks[2]];
    };
    const out = recordingOutputs();
    await node.run(inputs, out.outputs);
    const samples = concatEmitted(out.emitted);
    expect(samples.subarray(0, 300)).toEqual(clip.samples);
    for (let i = 0; i < 100; i++) {
      expect(samples[512 + i]).toBe(clip.samples[i * 2]);
    }
  });

  it("ends a render at the transport end and stops when the run stops", async () => {
    const ones = clipOf(new Float32Array(4000).fill(0.5));
    const rendered = concatEmitted(
      await runSampler(
        new SamplerNode({ audio: ones.audio }),
        { gate: cvChunks(gateAt(2048, [0]), 1024) },
        context("render", 2048 / SR)
      )
    );
    // The gate ends at the render end, so no voice plays past it.
    expect(rendered.length).toBe(2048);

    const controller = new AbortController();
    controller.abort();
    const out = recordingOutputs();
    await new SamplerNode({ audio: ones.audio, mode: "loop" }).run(
      makeInputs({}, controller.signal),
      out.outputs,
      context("live")
    );
    expect(concatEmitted(out.emitted).length).toBe(0);
    expect(readSignalChunk(out.emitted[0][1])?.done).toBe(true);
  });

  it("rejects a missing or empty clip", async () => {
    await expect(runSampler(new SamplerNode(), {})).rejects.toThrow(
      /No audio connected/
    );
    await expect(
      runSampler(new SamplerNode({ audio: clipOf(new Float32Array(0)).audio }), {})
    ).rejects.toThrow(/no audio frames/);
  });
});

/** The same chunk with another sample rate in its metadata. */
function atRate(chunk: unknown, rate: number): unknown {
  const value = chunk as { content_metadata: Record<string, unknown> };
  return { ...value, content_metadata: { ...value.content_metadata, sample_rate: rate } };
}

/** The clip of a WAV audio ref, as the recorder emits it. */
function recordedSamples(emitted: Array<[string, unknown]>): Float32Array {
  const ref = emitted[0][1];
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

it("matches the native sampler render fixture", async () => {
  const read = (name: string): string =>
    readFileSync(
      new URL(`../../../native/graph-runner/tests/graphs/${name}`, import.meta.url),
      "utf8"
    );
  const graph: {
    nodes: { id: string; properties: Record<string, unknown> }[];
  } = JSON.parse(read("audio-sampler-render.json"));
  const properties = (id: string): Record<string, unknown> => {
    const node = graph.nodes.find((n) => n.id === id);
    if (!node) {
      throw new Error(`The fixture has no node ${id}`);
    }
    return node.properties;
  };
  const ctx = context("render", Number(properties("out").duration));
  const source = async (id: string): Promise<unknown[]> => {
    const out = recordingOutputs();
    await new GateNode(properties(id)).run(makeInputs({}), out.outputs, ctx);
    return out.emitted.map((item) => item[1]);
  };
  const voices = await runSampler(
    new SamplerNode(properties("sampler")),
    {
      audio: [properties("clip").value],
      gate: await source("gate"),
      pitch_cv: await source("step")
    },
    ctx
  );
  const recorded = recordingOutputs();
  await new ChunksToAudioNode(properties("out")).run(
    { ...makeInputs({}), stream: async function* () { yield* voices.map((item) => item[1]); } } as StreamingInputs,
    recorded.outputs,
    ctx
  );
  const samples = recordedSamples(recorded.emitted);
  const expected: { frames: number; pcm_sha256: string } = JSON.parse(
    read("audio-sampler-render.expected.json")
  );
  expect(samples.length).toBe(expected.frames);
  expect(
    createHash("sha256")
      .update(encodeWav(samples, SR, 1).subarray(44))
      .digest("hex")
  ).toBe(expected.pcm_sha256);
});
