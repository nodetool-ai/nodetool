import { describe, it, expect } from "vitest";
import type {
  AudioRef,
  StreamingInputs,
  StreamingOutputs
} from "@nodetool-ai/node-sdk";
import {
  AudioOutputNode,
  AudioToChunksNode,
  ChunksToAudioNode,
  StreamingGainNode,
  StreamingLowPassNode,
  applyBiquadToWav,
  encodeWav,
  parseWavBytes,
  pcm16ToFloat32,
  float32ToPcm16,
  DEFAULT_Q
} from "@nodetool-ai/audio-nodes";

const SAMPLE_RATE = 16000;

/** Base64 helpers for assertions (mirror the node-internal encoding). */
function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Minimal StreamingInputs fake: yields the given items on every handle. */
function inputsFrom(items: unknown[]): StreamingInputs {
  return {
    async *stream(_name: string) {
      for (const item of items) yield item;
    },
    async *any() {
      for (const item of items) yield ["chunk", item] as [string, unknown];
    }
  } as unknown as StreamingInputs;
}

/** Minimal StreamingOutputs fake recording every emit. */
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

type ChunkShape = {
  type: string;
  /** Native Float32Array in-process; "" for done markers. */
  content: Float32Array | string;
  done: boolean;
  content_type: string;
  content_metadata: {
    encoding: string;
    sample_rate: number;
    channels: number;
    format: string;
    duration_seconds: number;
  };
};

function makeChunk(
  pcm: Uint8Array,
  sampleRate: number,
  channels: number,
  done = false
): ChunkShape {
  return {
    type: "chunk",
    content: pcm.length > 0 ? bytesToB64(pcm) : "",
    done,
    content_type: "audio",
    content_metadata: {
      encoding: "pcm16le",
      sample_rate: sampleRate,
      channels,
      format: "pcm",
      duration_seconds: pcm.length / 2 / channels / sampleRate
    }
  };
}

/** Samples of an emitted chunk (native Float32Array payload). */
function chunkSamples(chunk: ChunkShape): Float32Array {
  expect(chunk.content).toBeInstanceOf(Float32Array);
  return chunk.content as Float32Array;
}

/** 1 s of quantization-stable mono samples (already on the PCM16 grid). */
function testSamples(count = SAMPLE_RATE): Float32Array {
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    samples[i] = Math.round(Math.sin(i / 50) * 16000) / 0x7fff;
  }
  return samples;
}

async function collectGen(
  gen: AsyncGenerator<Record<string, unknown>>
): Promise<ChunkShape[]> {
  const out: ChunkShape[] = [];
  for await (const item of gen) out.push(item.chunk as ChunkShape);
  return out;
}

describe("AudioToChunks", () => {
  it("slices 1 s of mono audio into 4 × 0.25 s chunks plus a done chunk", async () => {
    const samples = testSamples();
    const node = new AudioToChunksNode({
      audio: { type: "audio", uri: "", data: encodeWav(samples, SAMPLE_RATE, 1) },
      chunk_duration: 0.25
    });

    const chunks = await collectGen(node.genProcess());
    expect(chunks).toHaveLength(5);

    const data = chunks.slice(0, 4);
    for (const chunk of data) {
      expect(chunk.done).toBe(false);
      expect(chunk.content_type).toBe("audio");
      expect(chunk.content_metadata.encoding).toBe("pcm16le");
      expect(chunk.content_metadata.sample_rate).toBe(SAMPLE_RATE);
      expect(chunk.content_metadata.channels).toBe(1);
      expect(chunk.content_metadata.duration_seconds).toBeCloseTo(0.25, 6);
      expect(chunkSamples(chunk).length).toBe(SAMPLE_RATE * 0.25);
    }

    const last = chunks[4];
    expect(last.done).toBe(true);
    expect(last.content).toBe("");

    // The concatenated samples equal the original (PCM16-quantized by the
    // WAV round-trip on input; chunk payloads themselves are lossless).
    const decoded = Float32Array.from(data.flatMap((c) => [...chunkSamples(c)]));
    expect(decoded.length).toBe(samples.length);
    for (let i = 0; i < samples.length; i += 997) {
      expect(decoded[i]).toBeCloseTo(samples[i], 4);
    }
  });

  it("throws on non-WAV input", async () => {
    const node = new AudioToChunksNode({
      audio: { type: "audio", uri: "", data: new Uint8Array([1, 2, 3]) },
      chunk_duration: 0.25
    });
    await expect(collectGen(node.genProcess())).rejects.toThrow(/WAV/);
  });
});

describe("ChunksToAudio", () => {
  it("accumulates a chunk stream back into the original audio", async () => {
    const samples = testSamples();
    const source = new AudioToChunksNode({
      audio: { type: "audio", uri: "", data: encodeWav(samples, SAMPLE_RATE, 1) },
      chunk_duration: 0.25
    });
    const chunks = await collectGen(source.genProcess());

    const sink = new ChunksToAudioNode({});
    const { outputs, emitted } = recordingOutputs();
    await sink.run(inputsFrom(chunks), outputs);

    expect(emitted).toHaveLength(1);
    const [slot, audio] = emitted[0];
    expect(slot).toBe("audio");

    const ref = audio as AudioRef;
    expect(ref.type).toBe("audio");
    const wav = parseWavBytes(b64ToBytes(String(ref.data)));
    expect(wav).not.toBeNull();
    expect(wav?.sampleRate).toBe(SAMPLE_RATE);
    expect(wav?.numChannels).toBe(1);
    expect(wav?.samples.length).toBe(samples.length);
    for (let i = 0; i < samples.length; i += 997) {
      expect(wav!.samples[i]).toBeCloseTo(samples[i], 4);
    }
  });

  it("skips non-audio chunks", async () => {
    const pcm = float32ToPcm16(testSamples(1024));
    const sink = new ChunksToAudioNode({});
    const { outputs, emitted } = recordingOutputs();
    await sink.run(
      inputsFrom([
        { type: "chunk", content: "hello", content_type: "text", done: false },
        makeChunk(pcm, SAMPLE_RATE, 1),
        makeChunk(new Uint8Array(), SAMPLE_RATE, 1, true)
      ]),
      outputs
    );
    const ref = emitted[0][1] as AudioRef;
    const wav = parseWavBytes(b64ToBytes(String(ref.data)));
    expect(wav?.samples.length).toBe(1024);
  });
});

describe("AudioOutput", () => {
  it("passes audio chunks through verbatim and stops on done", async () => {
    const pcm = float32ToPcm16(testSamples(512));
    const items = [
      { type: "chunk", content: "ignored", content_type: "text", done: false },
      makeChunk(pcm, SAMPLE_RATE, 1),
      makeChunk(pcm, SAMPLE_RATE, 1),
      makeChunk(new Uint8Array(), SAMPLE_RATE, 1, true)
    ];
    const node = new AudioOutputNode({});
    const { outputs, emitted } = recordingOutputs();
    await node.run(inputsFrom(items), outputs);

    // Non-audio chunk skipped; the two data chunks + done pass through
    // as the exact same objects.
    expect(emitted).toHaveLength(3);
    expect(emitted[0][0]).toBe("chunk");
    expect(emitted[0][1]).toBe(items[1]);
    expect(emitted[1][1]).toBe(items[2]);
    expect((emitted[2][1] as ChunkShape).done).toBe(true);
  });
});

describe("StreamingGain", () => {
  it("+6.0206 dB doubles sample values and forwards the done chunk", async () => {
    const samples = new Float32Array(512).fill(0.25);
    const node = new StreamingGainNode({ gain_db: 6.0206 });
    const { outputs, emitted } = recordingOutputs();
    await node.run(
      inputsFrom([
        makeChunk(float32ToPcm16(samples), SAMPLE_RATE, 1),
        makeChunk(new Uint8Array(), SAMPLE_RATE, 1, true)
      ]),
      outputs
    );

    expect(emitted).toHaveLength(2);
    const first = emitted[0][1] as ChunkShape;
    expect(first.done).toBe(false);
    expect(first.content_metadata.sample_rate).toBe(SAMPLE_RATE);
    const out = chunkSamples(first);
    for (let i = 0; i < out.length; i += 37) {
      expect(out[i]).toBeCloseTo(0.5, 3);
    }

    const last = emitted[1][1] as ChunkShape;
    expect(last.done).toBe(true);
    expect(last.content).toBe("");
  });
});

describe("StreamingLowPass", () => {
  it("chunked filtering equals whole-buffer applyBiquadToWav (state continuity)", async () => {
    const samples = testSamples(4096);
    const pcm = float32ToPcm16(samples);

    // Stream the PCM in 8 chunks of 512 samples.
    const chunks: ChunkShape[] = [];
    for (let i = 0; i < 8; i++) {
      chunks.push(
        makeChunk(pcm.subarray(i * 1024, (i + 1) * 1024), SAMPLE_RATE, 1)
      );
    }
    chunks.push(makeChunk(new Uint8Array(), SAMPLE_RATE, 1, true));

    const node = new StreamingLowPassNode({
      cutoff_frequency_hz: 1000,
      q: DEFAULT_Q
    });
    const { outputs, emitted } = recordingOutputs();
    await node.run(inputsFrom(chunks), outputs);

    expect(emitted).toHaveLength(9);
    const streamed: number[] = [];
    for (const [, value] of emitted.slice(0, 8)) {
      streamed.push(...chunkSamples(value as ChunkShape));
    }

    // Reference: the same quantized input filtered in a single pass.
    const reference = applyBiquadToWav(
      { samples: pcm16ToFloat32(pcm), sampleRate: SAMPLE_RATE, numChannels: 1 },
      "lowpass",
      1000,
      DEFAULT_Q,
      0
    ).samples;

    expect(streamed.length).toBe(reference.length);
    // Only output PCM16 quantization separates the two paths.
    for (let i = 0; i < reference.length; i++) {
      expect(Math.abs(streamed[i] - reference[i])).toBeLessThan(1e-3);
    }
  });
});
