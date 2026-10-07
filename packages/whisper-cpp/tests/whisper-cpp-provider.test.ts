import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeWav } from "@nodetool-ai/transformers-js-nodes";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  transcribe: vi.fn(),
  release: vi.fn(async () => {})
}));
vi.mock("@nodetool-ai/config", async (original) => ({
  ...(await original<typeof import("@nodetool-ai/config")>()),
  importOptionalModule: mocks.load
}));
let dir: string;
beforeEach(async () => {
  vi.resetModules();
  mocks.load.mockReset();
  mocks.transcribe.mockReset();
  mocks.release.mockClear();
  dir = await mkdtemp(join(tmpdir(), "whisper-provider-"));
  vi.stubEnv("HF_HUB_CACHE", dir);
  await writeFile(join(dir, "ggml-base.en.bin"), "model");
  mocks.transcribe.mockImplementation(() => ({
    stop: async () => {},
    promise: Promise.resolve({
      result: " Hello ",
      segments: [{ t0: 100, t1: 1500, text: " Hello " }],
      isAborted: false
    })
  }));
  mocks.load.mockResolvedValue({
    initWhisper: vi.fn(async () => ({
      transcribeData: mocks.transcribe,
      release: mocks.release
    }))
  });
});
afterEach(async () => {
  const { contextCache } = await import("../src/context-cache.js");
  await contextCache.dispose();
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});
it("accepts the discovery id unchanged, maps milliseconds and shares one model load", async () => {
  const { WhisperCppProvider } = await import("../src/whisper-cpp-provider.js");
  const provider = new WhisperCppProvider({ WHISPER_CPP_MODELS_DIR: dir });
  const [model] = await provider.getAvailableASRModels();
  const audio = encodeWav(new Float32Array(16000), 16000);
  const args = { audio, model: model.id };
  expect(await provider.automaticSpeechRecognition(args)).toEqual({
    text: "Hello",
    chunks: [{ timestamp: [0.1, 1.5], text: " Hello " }]
  });
  await provider.automaticSpeechRecognition({
    ...args,
    prompt: "names",
    temperature: 0.2,
    word_timestamps: true
  });
  const binding = await mocks.load.mock.results[0].value;
  expect(binding.initWhisper).toHaveBeenCalledTimes(1);
  expect(mocks.transcribe.mock.calls[0][1]).toMatchObject({
    language: "auto",
    tokenTimestamps: false
  });
  expect(mocks.transcribe.mock.calls[1][1]).toMatchObject({
    prompt: "names",
    temperature: 0.2,
    tokenTimestamps: true
  });
});
it("serializes concurrent transcriptions", async () => {
  const { WhisperCppProvider } = await import("../src/whisper-cpp-provider.js");
  let finish: (() => void) | undefined;
  const first = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let started: (() => void) | undefined;
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  mocks.transcribe.mockImplementationOnce(() => {
    started?.();
    return {
      stop: async () => {},
      promise: first.then(() => ({
        result: "first",
        segments: [],
        isAborted: false
      }))
    };
  });
  const provider = new WhisperCppProvider({ WHISPER_CPP_MODELS_DIR: dir });
  const audio = encodeWav(new Float32Array(16000), 16000);
  const a = provider.automaticSpeechRecognition({
    audio,
    model: join(dir, "ggml-base.en.bin")
  });
  await start;
  const b = provider.automaticSpeechRecognition({
    audio,
    model: join(dir, "ggml-base.en.bin")
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(mocks.transcribe).toHaveBeenCalledTimes(1);
  finish?.();
  await Promise.all([a, b]);
  expect(mocks.transcribe).toHaveBeenCalledTimes(2);
});
it("rejects unknown paths and empty audio", async () => {
  const { WhisperCppProvider } = await import("../src/whisper-cpp-provider.js");
  const provider = new WhisperCppProvider({ WHISPER_CPP_MODELS_DIR: dir });
  await expect(
    provider.automaticSpeechRecognition({
      audio: new Uint8Array([1]),
      model: "/etc/passwd"
    })
  ).rejects.toThrow("Unknown whisper.cpp model");
  await expect(
    provider.automaticSpeechRecognition({ audio: new Uint8Array(), model: "" })
  ).rejects.toThrow("audio must not be empty");
});
it("stops active transcription on cancellation", async () => {
  const { WhisperCppProvider } = await import("../src/whisper-cpp-provider.js");
  const controller = new AbortController();
  let started: (() => void) | undefined;
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  let finish: (() => void) | undefined;
  const wait = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const stop = vi.fn(async () => {
    finish?.();
  });
  mocks.transcribe.mockImplementationOnce(() => {
    started?.();
    return {
      stop,
      promise: wait.then(() => ({ result: "", segments: [], isAborted: true }))
    };
  });
  const provider = new WhisperCppProvider();
  const task = provider.transcribePcm(
    join(dir, "ggml-base.en.bin"),
    new ArrayBuffer(32000),
    {},
    controller.signal
  );
  const rejected = expect(task).rejects.toThrow();
  await start;
  controller.abort();
  await rejected;
  expect(stop).toHaveBeenCalledOnce();
});
it("reports the install message without failing discovery and retries imports", async () => {
  mocks.load.mockRejectedValue(new Error("not installed"));
  const { WhisperCppProvider } = await import("../src/whisper-cpp-provider.js");
  const provider = new WhisperCppProvider({ WHISPER_CPP_MODELS_DIR: dir });
  expect(await provider.unavailableReason()).toContain(
    "Install it from the Package Manager"
  );
  expect(await provider.getAvailableASRModels()).toEqual([]);
  await expect(
    provider.automaticSpeechRecognition({
      audio: new Uint8Array([1]),
      model: ""
    })
  ).rejects.toThrow("Install it from the Package Manager");
  expect(mocks.load).toHaveBeenCalledTimes(3);
});
it("names the runtime package to install when the binding is missing", async () => {
  mocks.load.mockRejectedValue(new Error("not installed"));
  const { missingRuntimePackageOf } = await import("@nodetool-ai/protocol");
  const { WhisperCppProvider } = await import("../src/whisper-cpp-provider.js");
  const provider = new WhisperCppProvider({ WHISPER_CPP_MODELS_DIR: dir });
  const error = await provider
    .automaticSpeechRecognition({ audio: new Uint8Array([1]), model: "" })
    .catch((err: unknown) => err);
  expect(missingRuntimePackageOf(error)).toBe("whisper-cpp");
});
