import { describe, it, expect } from "vitest";
import { ProcessingContext, ScriptedProvider } from "@nodetool-ai/runtime";
import type { ScriptedEndpointReply } from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import {
  createTogetherNodeClass,
  type TogetherManifestEntry
} from "../src/together-factory.js";

/** A context whose `together` provider answers from one scripted reply. */
function scripted(
  reply: ScriptedEndpointReply,
  storage: InMemoryStorageAdapter | null = null
): { provider: ScriptedProvider; context: ProcessingContext } {
  const provider = new ScriptedProvider([], {
    providerId: "together",
    endpoints: { "*": reply }
  });
  const context = new ProcessingContext({ jobId: "job-1", storage });
  context.setProviderResolver(() => provider);
  return { provider, context };
}

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
    const storage = new InMemoryStorageAdapter();
    const { provider, context } = scripted(
      { output: { data: [{ b64_json: "aGk=" }] } },
      storage
    );

    const node = instantiate(t2i, { prompt: "a fox", width: "512" });
    node.__node_id = "t2i-1";
    const out = (await node.process(context)) as {
      output: { type: string; uri: string };
    };

    expect(provider.endpointCalls[0]).toMatchObject({
      model: "black-forest-labs/FLUX.1-schnell",
      route: "images",
      input: {
        model: "black-forest-labs/FLUX.1-schnell",
        prompt: "a fox",
        width: 512, // coerced from "512"
        height: 1024
      }
    });
    expect(out.output.type).toBe("image");
    expect(out.output.uri).toMatch(/together-image-\d+\.png$/);
    expect(
      Buffer.from((await storage.retrieve(out.output.uri)) ?? []).toString()
    ).toBe("hi");
  });

  it("emits a prediction for the together provider, capability and model", async () => {
    const { context } = scripted({ output: { data: [{ b64_json: "aGk=" }] } });
    const node = instantiate(t2i, { prompt: "a fox" });
    node.__node_id = "t2i-1";
    await node.process(context);
    const prediction = context
      .getMessages()
      .filter((m) => m.type === "prediction")
      .at(-1);
    expect(prediction).toMatchObject({
      status: "completed",
      provider: "together",
      capability: "text_to_image",
      model: "black-forest-labs/FLUX.1-schnell",
      node_id: "t2i-1"
    });
  });

  it("falls back to base64 embed when storage is unavailable", async () => {
    const { context } = scripted({ output: { data: [{ b64_json: "aGk=" }] } });
    const node = instantiate(t2i, { prompt: "a fox" });
    const out = (await node.process(context)) as {
      output: { type: string; uri: string; data: string };
    };
    expect(out.output.type).toBe("image");
    expect(out.output.uri).toBe("");
    expect(Buffer.from(out.output.data, "base64").toString()).toBe("hi");
  });

  it("needs a processing context to reach the provider", async () => {
    const node = instantiate(t2i, { prompt: "a fox" });
    await expect(node.process(undefined as never)).rejects.toThrow(
      "requires a processing context"
    );
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

  it("synthesizes audio and stores it with the right extension", async () => {
    const storage = new InMemoryStorageAdapter();
    const { provider, context } = scripted(
      { output: Uint8Array.from([1, 2]) },
      storage
    );

    const node = instantiate(tts, { text: "hello", voice: "leo" });
    const out = (await node.process(context)) as {
      output: { type: string; uri: string };
    };

    expect(provider.endpointCalls[0]).toMatchObject({
      route: "audio/speech",
      input: {
        model: "canopylabs/orpheus-3b-0.1-ft",
        input: "hello",
        voice: "leo",
        response_format: "mp3"
      }
    });
    expect(out.output.type).toBe("audio");
    expect(out.output.uri).toMatch(/\.mp3$/);
    expect([...((await storage.retrieve(out.output.uri)) ?? [])]).toEqual([
      1, 2
    ]);
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
    const { provider, context } = scripted({
      output: { text: "the quick brown fox" }
    });

    const node = instantiate(asr, { audio: { data: "aGVsbG8=" } });
    const out = await node.process(context);
    expect(out).toEqual({ text: "the quick brown fox" });
    expect(provider.endpointCalls[0]).toMatchObject({
      route: "audio/transcriptions",
      input: { file: new TextEncoder().encode("hello") }
    });
  });

  it("throws a clear error when the required audio input is missing", async () => {
    const { context } = scripted({ output: {} });
    const node = instantiate(asr, {});
    await expect(node.process(context)).rejects.toThrow(
      "audio input is required"
    );
  });
});
