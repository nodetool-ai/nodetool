/**
 * Tests for the provider-backed media generation tools:
 * generate_image, edit_image, generate_video, animate_image,
 * generate_speech, transcribe_audio, embed_text.
 *
 * These wrap `ProcessingContext.runProviderPrediction` /
 * `streamProviderPrediction` / `getProvider` and persist via `persistOutput`
 * (which uses `context.createAsset` / `context.workspaceStorage`). All those
 * surfaces are mocked here — no real providers, network, or filesystem.
 */

import { describe, it, expect, vi } from "vitest";
import {
  GenerateImageTool,
  EditImageTool,
  GenerateVideoTool,
  AnimateImageTool,
  GenerateSpeechTool,
  TranscribeAudioTool,
  EmbedTextTool
} from "../src/tools/media-tools.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);

interface MockCtxOptions {
  runProviderPrediction?: ReturnType<typeof vi.fn>;
  streamProviderPrediction?: ReturnType<typeof vi.fn>;
  getProvider?: ReturnType<typeof vi.fn>;
  createAsset?: ReturnType<typeof vi.fn>;
  workspaceStorage?: unknown;
}

function makeContext(opts: MockCtxOptions = {}): any {
  const createAsset =
    opts.createAsset ?? vi.fn().mockResolvedValue({ id: "asset-1" });
  return {
    runProviderPrediction: opts.runProviderPrediction,
    streamProviderPrediction: opts.streamProviderPrediction,
    getProvider: opts.getProvider,
    createAsset,
    workspaceStorage: opts.workspaceStorage
  };
}

function makeStorage(files: Record<string, Uint8Array> = {}): any {
  const store = vi.fn().mockResolvedValue(undefined);
  return {
    store,
    uriForKey: (key: string) => `ws://${key}`,
    retrieve: vi.fn(async (uri: string) => {
      const key = uri.replace(/^ws:\/\//, "");
      return files[key] ?? null;
    })
  };
}

/* ---------------- parseModelArgs validation (shared) ---------------- */

describe("model-arg validation (shared across tools)", () => {
  it("generate_image rejects a missing provider", async () => {
    const tool = new GenerateImageTool();
    const r = (await tool.process(makeContext(), {
      model: "m",
      prompt: "p"
    })) as { error?: string };
    expect(r.error).toContain("provider must be a non-empty string");
  });

  it("generate_image rejects an empty provider", async () => {
    const tool = new GenerateImageTool();
    const r = (await tool.process(makeContext(), {
      provider: "",
      model: "m",
      prompt: "p"
    })) as { error?: string };
    expect(r.error).toContain("provider must be a non-empty string");
  });

  it("generate_image rejects a non-string model", async () => {
    const tool = new GenerateImageTool();
    const r = (await tool.process(makeContext(), {
      provider: "openai",
      model: 42,
      prompt: "p"
    })) as { error?: string };
    expect(r.error).toContain("model must be a non-empty string");
  });
});

/* ---------------- GenerateImageTool ---------------- */

describe("GenerateImageTool", () => {
  it("declares name, schema and userMessage", () => {
    const tool = new GenerateImageTool();
    expect(tool.name).toBe("generate_image");
    expect(tool.inputSchema.required).toEqual(["provider", "model", "prompt"]);
    expect(tool.userMessage({ provider: "openai", model: "gpt-image-1" })).toBe(
      "Generating image with openai:gpt-image-1"
    );
  });

  it("returns error when prompt is missing", async () => {
    const tool = new GenerateImageTool();
    const r = (await tool.process(makeContext(), {
      provider: "openai",
      model: "m"
    })) as { error?: string };
    expect(r.error).toBe("prompt is required");
  });

  it("generates and persists an asset on success", async () => {
    const runProviderPrediction = vi.fn().mockResolvedValue(PNG);
    const createAsset = vi.fn().mockResolvedValue({ id: "img-9" });
    const tool = new GenerateImageTool();
    const r = (await tool.process(
      makeContext({ runProviderPrediction, createAsset }),
      {
        provider: "openai",
        model: "gpt-image-1",
        prompt: "a fox",
        negative_prompt: "blurry",
        width: 512,
        height: 512,
        quality: "high"
      }
    )) as { type?: string; asset_id?: string; asset_uri?: string };
    expect(r.type).toBe("image");
    expect(r.asset_id).toBe("img-9");
    expect(r.asset_uri).toBe("asset://img-9.png");
    const call = runProviderPrediction.mock.calls[0][0];
    expect(call.capability).toBe("text_to_image");
    expect(call.params.prompt).toBe("a fox");
    expect(call.params.negative_prompt).toBe("blurry");
    expect(call.params.width).toBe(512);
  });

  it("wraps provider errors into a text_to_image error", async () => {
    const runProviderPrediction = vi
      .fn()
      .mockRejectedValue(new Error("upstream 500"));
    const tool = new GenerateImageTool();
    const r = (await tool.process(makeContext({ runProviderPrediction }), {
      provider: "openai",
      model: "m",
      prompt: "p"
    })) as { error?: string };
    expect(r.error).toBe("text_to_image failed: upstream 500");
  });

  it("passes output_file through to workspace storage", async () => {
    const runProviderPrediction = vi.fn().mockResolvedValue(PNG);
    const storage = makeStorage();
    const tool = new GenerateImageTool();
    const r = (await tool.process(
      makeContext({
        runProviderPrediction,
        createAsset: vi.fn().mockResolvedValue({ id: "img-1" }),
        workspaceStorage: storage
      }),
      { provider: "openai", model: "m", prompt: "p", output_file: "out.png" }
    )) as { path?: string };
    expect(storage.store).toHaveBeenCalledWith("out.png", PNG, "image/png");
    expect(r.path).toBe("out.png");
  });
});

/* ---------------- EditImageTool ---------------- */

describe("EditImageTool", () => {
  it("declares name and required params", () => {
    const tool = new EditImageTool();
    expect(tool.name).toBe("edit_image");
    expect(tool.inputSchema.required).toEqual([
      "provider",
      "model",
      "input_file",
      "prompt"
    ]);
    expect(tool.userMessage({ provider: "fal", model: "x" })).toBe(
      "Editing image with fal:x"
    );
  });

  it("returns error when input_file is missing", async () => {
    const tool = new EditImageTool();
    const r = (await tool.process(makeContext(), {
      provider: "fal",
      model: "m",
      prompt: "p"
    })) as { error?: string };
    expect(r.error).toBe("input_file is required");
  });

  it("returns error when prompt is missing", async () => {
    const tool = new EditImageTool();
    const r = (await tool.process(makeContext(), {
      provider: "fal",
      model: "m",
      input_file: "in.png"
    })) as { error?: string };
    expect(r.error).toBe("prompt is required");
  });

  it("reads source file, runs image_to_image, persists asset", async () => {
    const src = new Uint8Array([1, 2, 3]);
    const runProviderPrediction = vi.fn().mockResolvedValue(PNG);
    const tool = new EditImageTool();
    const r = (await tool.process(
      makeContext({
        runProviderPrediction,
        createAsset: vi.fn().mockResolvedValue({ id: "e1" }),
        workspaceStorage: makeStorage({ "in.png": src })
      }),
      {
        provider: "fal",
        model: "m",
        input_file: "in.png",
        prompt: "make it blue",
        strength: 0.6
      }
    )) as { type?: string; asset_id?: string };
    expect(r.type).toBe("image");
    expect(r.asset_id).toBe("e1");
    const call = runProviderPrediction.mock.calls[0][0];
    expect(call.capability).toBe("image_to_image");
    expect(call.params.image).toBe(src);
    expect(call.params.strength).toBe(0.6);
  });

  it("errors when workspace storage is not configured", async () => {
    const tool = new EditImageTool();
    const r = (await tool.process(
      makeContext({ runProviderPrediction: vi.fn() }),
      { provider: "fal", model: "m", input_file: "in.png", prompt: "p" }
    )) as { error?: string };
    expect(r.error).toContain("image_to_image failed");
    expect(r.error).toContain("No workspace storage configured");
  });

  it("errors when the source file is not found", async () => {
    const tool = new EditImageTool();
    const r = (await tool.process(
      makeContext({
        runProviderPrediction: vi.fn(),
        workspaceStorage: makeStorage({})
      }),
      { provider: "fal", model: "m", input_file: "missing.png", prompt: "p" }
    )) as { error?: string };
    expect(r.error).toContain("Input file not found in workspace storage");
  });
});

/* ---------------- GenerateVideoTool ---------------- */

describe("GenerateVideoTool", () => {
  it("declares name and userMessage", () => {
    const tool = new GenerateVideoTool();
    expect(tool.name).toBe("generate_video");
    expect(tool.userMessage({ provider: "p", model: "m" })).toBe(
      "Generating video with p:m"
    );
  });

  it("returns error when prompt missing", async () => {
    const tool = new GenerateVideoTool();
    const r = (await tool.process(makeContext(), {
      provider: "p",
      model: "m"
    })) as { error?: string };
    expect(r.error).toBe("prompt is required");
  });

  it("generates video and persists with video/mp4 mime", async () => {
    const bytes = new Uint8Array([9, 9, 9]);
    const runProviderPrediction = vi.fn().mockResolvedValue(bytes);
    const createAsset = vi.fn().mockResolvedValue({ id: "v1" });
    const tool = new GenerateVideoTool();
    const r = (await tool.process(
      makeContext({ runProviderPrediction, createAsset }),
      { provider: "p", model: "m", prompt: "a wave", num_frames: 24 }
    )) as { type?: string; asset_uri?: string; mime_type?: string };
    expect(r.type).toBe("video");
    expect(r.asset_uri).toBe("asset://v1.mp4");
    expect(r.mime_type).toBe("video/mp4");
    expect(createAsset).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "video/mp4" })
    );
  });

  it("wraps errors", async () => {
    const runProviderPrediction = vi.fn().mockRejectedValue("boom-str");
    const tool = new GenerateVideoTool();
    const r = (await tool.process(makeContext({ runProviderPrediction }), {
      provider: "p",
      model: "m",
      prompt: "p"
    })) as { error?: string };
    expect(r.error).toBe("text_to_video failed: boom-str");
  });
});

/* ---------------- AnimateImageTool ---------------- */

describe("AnimateImageTool", () => {
  it("declares name and required params (no prompt required)", () => {
    const tool = new AnimateImageTool();
    expect(tool.name).toBe("animate_image");
    expect(tool.inputSchema.required).toEqual([
      "provider",
      "model",
      "input_file"
    ]);
    expect(tool.userMessage({ provider: "p", model: "m" })).toBe(
      "Animating image with p:m"
    );
  });

  it("returns error when input_file missing", async () => {
    const tool = new AnimateImageTool();
    const r = (await tool.process(makeContext(), {
      provider: "p",
      model: "m"
    })) as { error?: string };
    expect(r.error).toBe("input_file is required");
  });

  it("reads source and runs image_to_video", async () => {
    const src = new Uint8Array([7, 7]);
    const runProviderPrediction = vi.fn().mockResolvedValue(new Uint8Array([1]));
    const tool = new AnimateImageTool();
    const r = (await tool.process(
      makeContext({
        runProviderPrediction,
        createAsset: vi.fn().mockResolvedValue({ id: "a1" }),
        workspaceStorage: makeStorage({ "src.png": src })
      }),
      { provider: "p", model: "m", input_file: "src.png", prompt: "spin" }
    )) as { type?: string };
    expect(r.type).toBe("video");
    const call = runProviderPrediction.mock.calls[0][0];
    expect(call.capability).toBe("image_to_video");
    expect(call.params.image).toBe(src);
    expect(call.params.prompt).toBe("spin");
  });

  it("wraps read errors", async () => {
    const tool = new AnimateImageTool();
    const r = (await tool.process(
      makeContext({
        runProviderPrediction: vi.fn(),
        workspaceStorage: makeStorage({})
      }),
      { provider: "p", model: "m", input_file: "gone.png" }
    )) as { error?: string };
    expect(r.error).toContain("image_to_video failed");
  });
});

/* ---------------- GenerateSpeechTool ---------------- */

describe("GenerateSpeechTool", () => {
  it("declares name and userMessage", () => {
    const tool = new GenerateSpeechTool();
    expect(tool.name).toBe("generate_speech");
    expect(tool.userMessage({ provider: "openai", model: "tts" })).toBe(
      "Synthesizing speech with openai:tts"
    );
  });

  it("returns error when text missing", async () => {
    const tool = new GenerateSpeechTool();
    const r = (await tool.process(makeContext(), {
      provider: "openai",
      model: "tts"
    })) as { error?: string };
    expect(r.error).toBe("text is required");
  });

  it("uses the encoded TTS path when the provider supports it", async () => {
    const encodedData = new Uint8Array([1, 2, 3]);
    const textToSpeechEncoded = vi
      .fn()
      .mockResolvedValue({ data: encodedData, mimeType: "audio/mpeg" });
    const getProvider = vi.fn().mockResolvedValue({ textToSpeechEncoded });
    const createAsset = vi.fn().mockResolvedValue({ id: "sp1" });
    const streamProviderPrediction = vi.fn();
    const tool = new GenerateSpeechTool();
    const r = (await tool.process(
      makeContext({
        getProvider,
        createAsset,
        streamProviderPrediction
      }),
      { provider: "openai", model: "tts", text: "hello", voice: "alloy", speed: 1.2 }
    )) as { type?: string; asset_id?: string; mime_type?: string };
    expect(r.type).toBe("audio");
    expect(r.asset_id).toBe("sp1");
    expect(r.mime_type).toBe("audio/mpeg");
    expect(textToSpeechEncoded).toHaveBeenCalledWith(
      expect.objectContaining({ text: "hello", voice: "alloy", speed: 1.2 })
    );
    // Encoded path short-circuits streaming.
    expect(streamProviderPrediction).not.toHaveBeenCalled();
  });

  it("derives the audio format from the output_file extension", async () => {
    const textToSpeechEncoded = vi
      .fn()
      .mockResolvedValue({ data: new Uint8Array([1]), mimeType: "audio/wav" });
    const getProvider = vi.fn().mockResolvedValue({ textToSpeechEncoded });
    const tool = new GenerateSpeechTool();
    await tool.process(
      makeContext({
        getProvider,
        createAsset: vi.fn().mockResolvedValue({ id: "x" })
      }),
      { provider: "openai", model: "tts", text: "hi", output_file: "a.flac" }
    );
    expect(textToSpeechEncoded).toHaveBeenCalledWith(
      expect.objectContaining({ audioFormat: "flac" })
    );
  });

  it("falls back to streaming pre-encoded chunks when encoded path unsupported", async () => {
    const getProvider = vi.fn().mockResolvedValue({
      textToSpeechEncoded: vi.fn().mockResolvedValue(null)
    });
    async function* stream() {
      yield { data: new Uint8Array([1, 2]), mimeType: "audio/mpeg" };
      yield { data: new Uint8Array([3, 4]), mimeType: "audio/mpeg" };
    }
    const streamProviderPrediction = vi.fn(() => stream());
    const createAsset = vi.fn().mockResolvedValue({ id: "st1" });
    const tool = new GenerateSpeechTool();
    const r = (await tool.process(
      makeContext({ getProvider, streamProviderPrediction, createAsset }),
      { provider: "openai", model: "tts", text: "hello" }
    )) as { type?: string; mime_type?: string; asset_id?: string };
    expect(r.type).toBe("audio");
    expect(r.mime_type).toBe("audio/mpeg");
    expect(r.asset_id).toBe("st1");
  });

  it("decodes base64 string chunks from the streaming path", async () => {
    const getProvider = vi.fn().mockResolvedValue({
      textToSpeechEncoded: vi.fn().mockRejectedValue(new Error("nope"))
    });
    const b64 = Buffer.from([10, 20, 30]).toString("base64");
    async function* stream() {
      yield { data: b64, mimeType: "audio/mpeg" };
    }
    const createAsset = vi.fn().mockResolvedValue({ id: "b64" });
    const tool = new GenerateSpeechTool();
    const r = (await tool.process(
      makeContext({
        getProvider,
        streamProviderPrediction: vi.fn(() => stream()),
        createAsset
      }),
      { provider: "openai", model: "tts", text: "hi" }
    )) as { type?: string };
    expect(r.type).toBe("audio");
    const assetCall = createAsset.mock.calls[0][0];
    expect(Array.from(assetCall.content as Uint8Array)).toEqual([10, 20, 30]);
  });

  it("wraps raw int16 PCM samples in a WAV container and renames output to .wav", async () => {
    const getProvider = vi.fn().mockResolvedValue({
      textToSpeechEncoded: vi.fn().mockResolvedValue(null)
    });
    const samples = new Int16Array([0, 100, -100, 200]);
    async function* stream() {
      yield { samples };
    }
    const storage = makeStorage();
    const createAsset = vi.fn().mockResolvedValue({ id: "wav1" });
    const tool = new GenerateSpeechTool();
    const r = (await tool.process(
      makeContext({
        getProvider,
        streamProviderPrediction: vi.fn(() => stream()),
        createAsset,
        workspaceStorage: storage
      }),
      { provider: "openai", model: "tts", text: "hi", output_file: "out.mp3" }
    )) as { type?: string; mime_type?: string; path?: string };
    expect(r.mime_type).toBe("audio/wav");
    // .mp3 renamed to .wav because bytes are now WAV.
    expect(r.path).toBe("out.wav");
    const stored = storage.store.mock.calls[0];
    expect(stored[0]).toBe("out.wav");
    // RIFF header present.
    const wav = stored[1] as Uint8Array;
    expect(String.fromCharCode(wav[0], wav[1], wav[2], wav[3])).toBe("RIFF");
  });

  it("returns error when streaming yields no audio data", async () => {
    const getProvider = vi.fn().mockResolvedValue({
      textToSpeechEncoded: vi.fn().mockResolvedValue(null)
    });
    async function* stream() {
      // no yields
    }
    const tool = new GenerateSpeechTool();
    const r = (await tool.process(
      makeContext({
        getProvider,
        streamProviderPrediction: vi.fn(() => stream())
      }),
      { provider: "openai", model: "tts", text: "hi" }
    )) as { error?: string };
    expect(r.error).toBe("Provider returned no audio data");
  });

  it("wraps top-level failures into a text_to_speech error", async () => {
    const getProvider = vi.fn().mockResolvedValue({
      textToSpeechEncoded: vi.fn().mockResolvedValue(null)
    });
    const streamProviderPrediction = vi.fn(() => {
      throw new Error("stream setup failed");
    });
    const tool = new GenerateSpeechTool();
    const r = (await tool.process(
      makeContext({ getProvider, streamProviderPrediction }),
      { provider: "openai", model: "tts", text: "hi" }
    )) as { error?: string };
    expect(r.error).toBe("text_to_speech failed: stream setup failed");
  });
});

/* ---------------- TranscribeAudioTool ---------------- */

describe("TranscribeAudioTool", () => {
  it("declares name and userMessage", () => {
    const tool = new TranscribeAudioTool();
    expect(tool.name).toBe("transcribe_audio");
    expect(tool.userMessage({ provider: "openai", model: "whisper" })).toBe(
      "Transcribing audio with openai:whisper"
    );
  });

  it("returns error when input_file missing", async () => {
    const tool = new TranscribeAudioTool();
    const r = (await tool.process(makeContext(), {
      provider: "openai",
      model: "whisper"
    })) as { error?: string };
    expect(r.error).toBe("input_file is required");
  });

  it("transcribes a short result inline", async () => {
    const audio = new Uint8Array([5, 5]);
    const runProviderPrediction = vi
      .fn()
      .mockResolvedValue({ text: "hello world", chunks: [1, 2, 3] });
    const tool = new TranscribeAudioTool();
    const r = (await tool.process(
      makeContext({
        runProviderPrediction,
        workspaceStorage: makeStorage({ "a.wav": audio })
      }),
      { provider: "openai", model: "whisper", input_file: "a.wav", language: "en" }
    )) as { type?: string; text?: string; full_length?: number; chunks?: number };
    expect(r.type).toBe("transcription");
    expect(r.text).toBe("hello world");
    expect(r.full_length).toBe(11);
    expect(r.chunks).toBe(3);
    const call = runProviderPrediction.mock.calls[0][0];
    expect(call.capability).toBe("automatic_speech_recognition");
    expect(call.params.audio).toBe(audio);
    expect(call.params.language).toBe("en");
  });

  it("truncates long transcripts to the preview budget", async () => {
    const long = "x".repeat(600);
    const runProviderPrediction = vi
      .fn()
      .mockResolvedValue({ text: long });
    const tool = new TranscribeAudioTool();
    const r = (await tool.process(
      makeContext({
        runProviderPrediction,
        workspaceStorage: makeStorage({ "a.wav": new Uint8Array([1]) })
      }),
      { provider: "openai", model: "whisper", input_file: "a.wav" }
    )) as { text?: string; full_length?: number; chunks?: number };
    expect(r.full_length).toBe(600);
    expect(r.text).toContain("100 chars truncated");
    expect(r.text!.startsWith("x".repeat(500))).toBe(true);
    expect(r.chunks).toBe(0);
  });

  it("handles a missing text field by returning empty string", async () => {
    const runProviderPrediction = vi.fn().mockResolvedValue({});
    const tool = new TranscribeAudioTool();
    const r = (await tool.process(
      makeContext({
        runProviderPrediction,
        workspaceStorage: makeStorage({ "a.wav": new Uint8Array([1]) })
      }),
      { provider: "openai", model: "whisper", input_file: "a.wav" }
    )) as { text?: string; full_length?: number };
    expect(r.text).toBe("");
    expect(r.full_length).toBe(0);
  });

  it("wraps errors into a transcribe error", async () => {
    const runProviderPrediction = vi
      .fn()
      .mockRejectedValue(new Error("asr down"));
    const tool = new TranscribeAudioTool();
    const r = (await tool.process(
      makeContext({
        runProviderPrediction,
        workspaceStorage: makeStorage({ "a.wav": new Uint8Array([1]) })
      }),
      { provider: "openai", model: "whisper", input_file: "a.wav" }
    )) as { error?: string };
    expect(r.error).toBe("transcribe failed: asr down");
  });
});

/* ---------------- EmbedTextTool ---------------- */

describe("EmbedTextTool", () => {
  it("declares name and userMessage", () => {
    const tool = new EmbedTextTool();
    expect(tool.name).toBe("embed_text");
    expect(tool.userMessage({ provider: "openai", model: "embed" })).toBe(
      "Embedding text with openai:embed"
    );
  });

  it("returns error when text is neither string nor array", async () => {
    const tool = new EmbedTextTool();
    const r = (await tool.process(makeContext(), {
      provider: "openai",
      model: "embed",
      text: 123
    })) as { error?: string };
    expect(r.error).toBe("text must be a string or array of strings");
  });

  it("embeds a single string", async () => {
    const runProviderPrediction = vi
      .fn()
      .mockResolvedValue([[0.1, 0.2, 0.3]]);
    const tool = new EmbedTextTool();
    const r = (await tool.process(makeContext({ runProviderPrediction }), {
      provider: "openai",
      model: "embed",
      text: "hello"
    })) as {
      type?: string;
      count?: number;
      dimensions?: number;
      embeddings?: number[][];
    };
    expect(r.type).toBe("embedding");
    expect(r.count).toBe(1);
    expect(r.dimensions).toBe(3);
    expect(r.embeddings).toEqual([[0.1, 0.2, 0.3]]);
    const call = runProviderPrediction.mock.calls[0][0];
    expect(call.capability).toBe("generate_embedding");
    expect(call.params.text).toBe("hello");
  });

  it("embeds an array and reports dimensions from the first vector", async () => {
    const runProviderPrediction = vi
      .fn()
      .mockResolvedValue([[1, 2], [3, 4]]);
    const tool = new EmbedTextTool();
    const r = (await tool.process(makeContext({ runProviderPrediction }), {
      provider: "openai",
      model: "embed",
      text: ["a", "b"],
      dimensions: 2
    })) as { count?: number; dimensions?: number };
    expect(r.count).toBe(2);
    expect(r.dimensions).toBe(2);
    expect(runProviderPrediction.mock.calls[0][0].params.dimensions).toBe(2);
  });

  it("reports 0 dimensions for an empty result", async () => {
    const runProviderPrediction = vi.fn().mockResolvedValue([]);
    const tool = new EmbedTextTool();
    const r = (await tool.process(makeContext({ runProviderPrediction }), {
      provider: "openai",
      model: "embed",
      text: "hi"
    })) as { count?: number; dimensions?: number };
    expect(r.count).toBe(0);
    expect(r.dimensions).toBe(0);
  });

  it("wraps errors into a generate_embedding error", async () => {
    const runProviderPrediction = vi
      .fn()
      .mockRejectedValue(new Error("embed down"));
    const tool = new EmbedTextTool();
    const r = (await tool.process(makeContext({ runProviderPrediction }), {
      provider: "openai",
      model: "embed",
      text: "hi"
    })) as { error?: string };
    expect(r.error).toBe("generate_embedding failed: embed down");
  });
});
