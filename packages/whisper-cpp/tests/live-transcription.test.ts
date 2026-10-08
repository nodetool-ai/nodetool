import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { StreamingInputs, StreamingOutputs } from "@nodetool-ai/runtime";
import { LiveTranscriptionNode } from "../src/nodes/live-transcription.js";

const mocks = vi.hoisted(() => ({
  transcribe: vi.fn(),
  detect: vi.fn(),
  release: vi.fn(async () => {}),
  vadModels: vi.fn()
}));
vi.mock("../src/model-discovery.js", () => ({
  discoverVadModels: mocks.vadModels
}));
vi.mock("../src/binding.js", () => ({
  resolveVariant: () => "default",
  loadWhisperNode: async () => ({
    initWhisperVad: async () => ({
      detectSpeechData: mocks.detect,
      release: mocks.release
    })
  })
}));
vi.mock("../src/whisper-cpp-provider.js", () => ({
  WhisperCppProvider: class {
    resolveModel = async () => "/model.bin";
    transcribePcm = mocks.transcribe;
  }
}));

function inputs(
  items: unknown[],
  signal = new AbortController().signal
): StreamingInputs {
  return {
    signal,
    async *any() {
      for (const item of items) {
        yield ["chunk", item];
      }
    },
    async *stream() {},
    async *streamWithEnvelope() {},
    async *anyWithEnvelope() {},
    first: async () => undefined,
    scopeFor: () => [],
    invocationScope: () => [],
    hasStream: () => true
  };
}
function audio(seconds: number, done = false): unknown {
  return {
    content_type: "audio",
    content: Buffer.alloc(24000 * 2 * seconds).toString("base64"),
    content_metadata: { sample_rate: 24000 },
    done
  };
}
let emitted: [string, unknown][];
let outputs: StreamingOutputs;
beforeEach(() => {
  emitted = [];
  outputs = {
    emit: async (handle, value) => {
      emitted.push([handle, value]);
    }
  } as unknown as StreamingOutputs;
  mocks.transcribe.mockReset();
  mocks.detect.mockReset();
  mocks.release.mockClear();
  mocks.vadModels.mockReset();
  mocks.vadModels.mockResolvedValue([{ id: "/vad.bin" }]);
  mocks.transcribe.mockImplementation(async () => ({
    text: String(mocks.transcribe.mock.calls.length),
    chunks: []
  }));
});
afterEach(() => vi.restoreAllMocks());
it("cuts on silence using centisecond VAD times, resamples and stops on done", async () => {
  mocks.detect
    .mockResolvedValueOnce([{ t0: 0, t1: 100 }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    // The final flush holds speech that has not ended yet.
    .mockResolvedValueOnce([{ t0: 150, t1: 200 }]);
  const node = new LiveTranscriptionNode();
  await node.run(inputs([audio(2), audio(1, true), audio(10)]), outputs);
  expect(mocks.transcribe.mock.calls.map((call) => call[1].byteLength)).toEqual(
    [32000, 64000]
  );
  expect(emitted).toEqual([
    [
      "chunk",
      { type: "chunk", content: "1", content_type: "text", done: false }
    ],
    [
      "chunk",
      { type: "chunk", content: "2", content_type: "text", done: false }
    ],
    ["chunk", { type: "chunk", content: "", content_type: "text", done: true }],
    ["text", "1 2"]
  ]);
  expect(mocks.release).toHaveBeenCalledOnce();
});
it("drops windows in which VAD finds no speech", async () => {
  mocks.detect.mockResolvedValue([]);
  const node = new LiveTranscriptionNode({ max_segment_s: 1 });
  await node.run(inputs([audio(3, true)]), outputs);
  expect(mocks.transcribe).not.toHaveBeenCalled();
  expect(emitted.at(-1)).toEqual(["text", ""]);
});
it("uses fixed windows without VAD and emits both declared outputs", async () => {
  mocks.vadModels.mockResolvedValue([]);
  const node = new LiveTranscriptionNode({ max_segment_s: 1 });
  await node.run(inputs([audio(3, true)]), outputs);
  expect(mocks.transcribe.mock.calls.map((call) => call[1].byteLength)).toEqual(
    [32000, 32000, 32000]
  );
  expect(emitted.at(-1)).toEqual(["text", "1 2 3"]);
  expect(new Set(emitted.map(([handle]) => handle))).toEqual(
    new Set(Object.keys(LiveTranscriptionNode.metadataOutputTypes))
  );
});
it("keeps consuming audio while a transcription runs", async () => {
  mocks.vadModels.mockResolvedValue([]);
  let finish: (() => void) | undefined;
  const wait = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let consumed = 0;
  mocks.transcribe.mockImplementationOnce(async () => {
    await wait;
    return { text: "first" };
  });
  const incoming = inputs([]);
  incoming.any = async function* () {
    for (let i = 0; i < 3; i++) {
      consumed++;
      yield ["chunk", audio(1)];
    }
    finish?.();
  };
  await new LiveTranscriptionNode({ max_segment_s: 1 }).run(incoming, outputs);
  expect(consumed).toBe(3);
  expect(mocks.transcribe).toHaveBeenCalledTimes(3);
});
it("passes cancellation to the transcription and releases VAD", async () => {
  const controller = new AbortController();
  mocks.detect.mockResolvedValue([{ t0: 0, t1: 100 }]);
  mocks.transcribe.mockImplementationOnce(
    async (_model, _audio, _options, signal: AbortSignal) => {
      controller.abort();
      signal.throwIfAborted();
    }
  );
  await expect(
    new LiveTranscriptionNode().run(
      inputs([audio(1, true)], controller.signal),
      outputs
    )
  ).rejects.toThrow();
  expect(mocks.transcribe.mock.calls[0][3].aborted).toBe(true);
  expect(mocks.release).toHaveBeenCalledOnce();
  expect(emitted).toEqual([]);
});
