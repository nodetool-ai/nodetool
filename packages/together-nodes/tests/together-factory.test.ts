import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createTogetherNodeClass,
  type TogetherManifestEntry
} from "../src/together-factory.js";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

type TestNode = {
  setDynamic: (k: string, v: unknown) => void;
  process: (ctx: unknown) => Promise<Record<string, unknown>>;
} & Record<string, unknown>;

function instantiate(
  spec: TogetherManifestEntry,
  props: Record<string, unknown>
): TestNode {
  const Cls = createTogetherNodeClass(spec) as unknown as new () => TestNode;
  const node = new Cls();
  node.setDynamic("_secrets", { TOGETHER_API_KEY: "tk" });
  for (const [k, v] of Object.entries(props)) node[k] = v;
  return node;
}

const t2i: TogetherManifestEntry = {
  className: "FluxSchnellTextToImage",
  moduleName: "image",
  modality: "text_to_image",
  modelId: "black-forest-labs/FLUX.1-schnell",
  outputType: "image",
  supportedTasks: ["text_to_image"],
  title: "FLUX.1 Schnell — Text to Image",
  description: "t2i",
  fields: [
    { name: "prompt", type: "str", default: "", required: true },
    { name: "width", type: "int", default: 1024 },
    { name: "height", type: "int", default: 1024 },
    { name: "steps", type: "int", default: null }
  ]
};

describe("createTogetherNodeClass — statics", () => {
  it("declares provider statics on the generated class", () => {
    const Cls = createTogetherNodeClass(t2i) as unknown as {
      nodeType: string;
      title: string;
      requiredSettings: string[];
      autoSaveAsset: boolean;
      metadataOutputTypes: Record<string, string>;
    };
    expect(Cls.nodeType).toBe("together.image.FluxSchnellTextToImage");
    expect(Cls.requiredSettings).toEqual(["TOGETHER_API_KEY"]);
    expect(Cls.autoSaveAsset).toBe(true);
    expect(Cls.metadataOutputTypes).toEqual({ output: "image" });
  });

  it("marks a transcription node as a text output (no asset save)", () => {
    const Cls = createTogetherNodeClass({
      ...t2i,
      className: "WhisperTranscribe",
      moduleName: "transcription",
      modality: "automatic_speech_recognition",
      outputType: "string",
      supportedTasks: undefined,
      fields: [{ name: "audio", type: "audio", required: true }]
    }) as unknown as { autoSaveAsset: boolean; metadataOutputTypes: unknown };
    expect(Cls.autoSaveAsset).toBe(false);
    expect(Cls.metadataOutputTypes).toEqual({ text: "str" });
  });
});

describe("text_to_image.process", () => {
  it("generates an image, coerces string ints, and persists via storage", async () => {
    let body: Record<string, unknown> | null = null;
    global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.together.xyz/v1/images/generations");
      body = JSON.parse(init!.body as string);
      return { ok: true, json: async () => ({ data: [{ b64_json: "aGk=" }] }) } as Response;
    }) as unknown as typeof fetch;

    const node = instantiate(t2i, { prompt: "a fox", width: "512" });
    const storage = { store: vi.fn().mockResolvedValue("memory://together-image-1.png") };
    const out = await node.process({ storage });

    expect(body).toMatchObject({
      model: "black-forest-labs/FLUX.1-schnell",
      prompt: "a fox",
      width: 512, // coerced from "512"
      height: 1024
    });
    expect(storage.store).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ output: { type: "image", uri: "memory://together-image-1.png" } });
  });

  it("falls back to base64 embed when storage is unavailable", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ b64_json: "aGk=" }] })
    })) as unknown as typeof fetch;
    const node = instantiate(t2i, { prompt: "a fox" });
    const out = (await node.process(undefined)) as {
      output: { type: string; uri: string; data: string };
    };
    expect(out.output.type).toBe("image");
    expect(out.output.uri).toBe("");
    expect(Buffer.from(out.output.data, "base64").toString()).toBe("hi");
  });
});

describe("text_to_speech.process", () => {
  const tts: TogetherManifestEntry = {
    className: "Orpheus3BTextToSpeech",
    moduleName: "audio",
    modality: "text_to_speech",
    modelId: "canopylabs/orpheus-3b-0.1-ft",
    outputType: "audio",
    title: "Orpheus 3B — Text to Speech",
    description: "tts",
    fields: [
      { name: "text", type: "str", default: "", required: true },
      { name: "voice", type: "enum", default: "tara", values: ["tara", "leo"] },
      { name: "format", type: "enum", default: "mp3", values: ["mp3", "wav"] }
    ]
  };

  it("synthesizes audio and stores it with the right mime", async () => {
    let body: Record<string, unknown> | null = null;
    global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.together.xyz/v1/audio/speech");
      body = JSON.parse(init!.body as string);
      return { ok: true, arrayBuffer: async () => Uint8Array.from([1, 2]).buffer } as Response;
    }) as unknown as typeof fetch;

    const node = instantiate(tts, { text: "hello", voice: "leo" });
    const storage = { store: vi.fn().mockResolvedValue("memory://together-audio-1.mp3") };
    const out = await node.process({ storage });

    expect(body).toMatchObject({
      model: "canopylabs/orpheus-3b-0.1-ft",
      input: "hello",
      voice: "leo",
      response_format: "mp3"
    });
    expect(storage.store).toHaveBeenCalledWith(
      expect.stringContaining(".mp3"),
      expect.any(Uint8Array),
      "audio/mpeg"
    );
    expect(out).toEqual({ output: { type: "audio", uri: "memory://together-audio-1.mp3" } });
  });
});

describe("automatic_speech_recognition.process", () => {
  const asr: TogetherManifestEntry = {
    className: "WhisperLargeV3Transcribe",
    moduleName: "transcription",
    modality: "automatic_speech_recognition",
    modelId: "openai/whisper-large-v3",
    outputType: "string",
    title: "Whisper Large v3 — Transcribe",
    description: "asr",
    fields: [
      { name: "audio", type: "audio", required: true },
      { name: "language", type: "str", default: "" }
    ]
  };

  it("transcribes inline audio and returns text", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: "the quick brown fox" })
    })) as unknown as typeof fetch;

    const node = instantiate(asr, { audio: { data: "aGVsbG8=" } });
    const out = await node.process(undefined);
    expect(out).toEqual({ text: "the quick brown fox" });
  });

  it("throws a clear error when the required audio input is missing", async () => {
    const node = instantiate(asr, {});
    await expect(node.process(undefined)).rejects.toThrow("audio input is required");
  });
});
