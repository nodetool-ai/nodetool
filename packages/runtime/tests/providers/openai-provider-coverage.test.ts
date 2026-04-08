/**
 * Additional coverage tests for OpenAIProvider – audio, TTS, ASR,
 * image generation, video generation, embeddings, and helper functions.
 */

import { describe, it, expect, vi } from "vitest";
import { OpenAIProvider } from "../../src/providers/openai-provider.js";
import type { Message } from "../../src/providers/types.js";

function makeAsyncIterable(items: unknown[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
    async close() {
      return;
    }
  };
}

describe("OpenAIProvider – constructor", () => {
  it("throws when OPENAI_API_KEY is missing", () => {
    expect(() => new OpenAIProvider({})).toThrow("OPENAI_API_KEY is required");
  });

  it("uses clientFactory to create client lazily", () => {
    const mockClient = { chat: {} } as any;
    const factory = vi.fn().mockReturnValue(mockClient);
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "test-key" },
      { clientFactory: factory }
    );

    const client = provider.getClient();
    expect(factory).toHaveBeenCalledWith("test-key");
    expect(client).toBe(mockClient);
    // second call should return cached
    provider.getClient();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("returns container env", () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "sk-abc" },
      { client: {} as any }
    );
    expect(provider.getContainerEnv()).toEqual({ OPENAI_API_KEY: "sk-abc" });
  });

  it("requiredSecrets returns OPENAI_API_KEY", () => {
    expect(OpenAIProvider.requiredSecrets()).toEqual(["OPENAI_API_KEY"]);
  });
});

describe("OpenAIProvider – resolveImageSize", () => {
  const provider = new OpenAIProvider(
    { OPENAI_API_KEY: "k" },
    { client: {} as any }
  );

  it("returns null for missing dimensions", () => {
    expect(provider.resolveImageSize(null, null)).toBeNull();
    expect(provider.resolveImageSize(1024, null)).toBeNull();
    expect(provider.resolveImageSize(null, 1024)).toBeNull();
    expect(provider.resolveImageSize(0, 0)).toBeNull();
  });

  it("picks closest supported size", () => {
    expect(provider.resolveImageSize(1024, 1536)).toBe("1024x1536");
    expect(provider.resolveImageSize(1536, 1024)).toBe("1536x1024");
    expect(provider.resolveImageSize(800, 800)).toBe("1024x1024");
    expect(provider.resolveImageSize(2000, 1000)).toBe("1536x1024");
  });
});

describe("OpenAIProvider – resolveVideoSize", () => {
  it("returns null for missing resolution", () => {
    expect(OpenAIProvider.resolveVideoSize("16:9", null)).toBeNull();
    expect(OpenAIProvider.resolveVideoSize("16:9", undefined)).toBeNull();
  });

  it("uses preset for known aspect+resolution", () => {
    expect(OpenAIProvider.resolveVideoSize("9:16", "720p")).toBe("720x1280");
    expect(OpenAIProvider.resolveVideoSize("16:9", "1080p")).toBe("1792x1024");
  });

  it("handles default 16:9 when aspectRatio is null", () => {
    const result = OpenAIProvider.resolveVideoSize(null, "720p");
    expect(result).toBe("1280x720");
  });

  it("falls back to numeric parsing for unknown resolution", () => {
    const result = OpenAIProvider.resolveVideoSize("16:9", "500");
    expect(result).toBeTruthy();
  });

  it("returns null for non-numeric resolution", () => {
    expect(OpenAIProvider.resolveVideoSize("16:9", "abc")).toBeNull();
  });

  it("handles custom aspect ratios", () => {
    const result = OpenAIProvider.resolveVideoSize("4:3", "720p");
    expect(result).toBeTruthy();
  });

  it("handles invalid aspect ratio gracefully", () => {
    expect(OpenAIProvider.resolveVideoSize("0:0", "720p")).toBeNull();
  });
});

describe("OpenAIProvider – secondsFromParams", () => {
  it("returns null for missing/invalid numFrames", () => {
    expect(OpenAIProvider.secondsFromParams({})).toBeNull();
    expect(OpenAIProvider.secondsFromParams({ numFrames: 0 })).toBeNull();
    expect(OpenAIProvider.secondsFromParams({ numFrames: -5 })).toBeNull();
    expect(OpenAIProvider.secondsFromParams({ numFrames: null })).toBeNull();
  });

  it("maps frame counts to video durations", () => {
    expect(OpenAIProvider.secondsFromParams({ numFrames: 12 })).toBe(4);
    expect(OpenAIProvider.secondsFromParams({ numFrames: 100 })).toBe(4);
    expect(OpenAIProvider.secondsFromParams({ numFrames: 200 })).toBe(8);
    expect(OpenAIProvider.secondsFromParams({ numFrames: 500 })).toBe(12);
  });
});

describe("OpenAIProvider – snapToValidVideoDimensions", () => {
  it("picks landscape for wide images", () => {
    expect(OpenAIProvider.snapToValidVideoDimensions(1920, 1080)).toBe(
      "1280x720"
    );
  });

  it("picks portrait for tall images", () => {
    expect(OpenAIProvider.snapToValidVideoDimensions(1080, 1920)).toBe(
      "720x1280"
    );
  });
});

describe("OpenAIProvider – extractImageDimensions", () => {
  it("extracts PNG dimensions from IHDR", () => {
    // Minimal valid PNG header
    const png = new Uint8Array(24);
    png[0] = 0x89;
    png[1] = 0x50;
    png[2] = 0x4e;
    png[3] = 0x47;
    const view = new DataView(png.buffer);
    view.setUint32(16, 640, false);
    view.setUint32(20, 480, false);
    expect(OpenAIProvider.extractImageDimensions(png)).toEqual([640, 480]);
  });

  it("extracts JPEG dimensions from SOF marker", () => {
    // Construct minimal JPEG with SOF0 marker
    const jpeg = new Uint8Array(20);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8; // SOI
    jpeg[2] = 0xff;
    jpeg[3] = 0xc0; // SOF0
    jpeg[4] = 0x00;
    jpeg[5] = 0x11; // segment length = 17
    jpeg[6] = 0x08; // precision
    jpeg[7] = 0x01;
    jpeg[8] = 0xe0; // height = 480
    jpeg[9] = 0x02;
    jpeg[10] = 0x80; // width = 640
    expect(OpenAIProvider.extractImageDimensions(jpeg)).toEqual([640, 480]);
  });

  it("throws for unsupported format", () => {
    expect(() =>
      OpenAIProvider.extractImageDimensions(new Uint8Array([0, 0, 0]))
    ).toThrow("Unsupported image format");
  });
});

describe("OpenAIProvider – data URI helpers", () => {
  const provider = new OpenAIProvider(
    { OPENAI_API_KEY: "k" },
    { client: {} as any }
  );

  it("normalizeDataUri round-trips base64 data URIs", () => {
    const data = Buffer.from("hello").toString("base64");
    const uri = `data:text/plain;base64,${data}`;
    const result = provider.normalizeDataUri(uri);
    expect(result).toContain("data:text/plain;base64,");
    expect(result).toContain(data);
  });

  it("normalizeDataUri handles non-base64 data URIs", () => {
    const uri = "data:text/plain,hello%20world";
    const result = provider.normalizeDataUri(uri);
    expect(result).toContain("data:text/plain;base64,");
  });

  it("uriToBase64 fetches external URIs", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "image/png" },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
    });

    const p = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any, fetchFn: fetchFn as any }
    );

    const result = await p.uriToBase64("https://example.com/img.png");
    expect(result).toContain("data:image/png;base64,");
    expect(fetchFn).toHaveBeenCalledWith("https://example.com/img.png");
  });

  it("uriToBase64 normalizes data URIs", async () => {
    const p = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any }
    );

    const data = Buffer.from("test").toString("base64");
    const result = await p.uriToBase64(`data:text/plain;base64,${data}`);
    expect(result).toContain("data:text/plain;base64,");
  });

  it("uriToBase64 throws on fetch failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const p = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any, fetchFn: fetchFn as any }
    );

    await expect(
      p.uriToBase64("https://example.com/missing.png")
    ).rejects.toThrow("Failed to fetch URI");
  });
});

describe("OpenAIProvider – convertMessage edge cases", () => {
  const provider = new OpenAIProvider(
    { OPENAI_API_KEY: "k" },
    { client: {} as any }
  );

  it("converts tool message", async () => {
    const msg: Message = {
      role: "tool",
      content: "result",
      toolCallId: "tc1"
    };
    const result = await provider.convertMessage(msg);
    expect(result).toEqual({
      role: "tool",
      content: "result",
      tool_call_id: "tc1"
    });
  });

  it("tool message throws without toolCallId", async () => {
    await expect(
      provider.convertMessage({ role: "tool", content: "x" })
    ).rejects.toThrow("Tool message requires toolCallId");
  });

  it("tool message JSON-stringifies non-string content", async () => {
    const result = await provider.convertMessage({
      role: "tool",
      content: { ok: true } as any,
      toolCallId: "tc1"
    });
    expect((result as any).content).toBe('{"ok":true}');
  });

  it("converts system message", async () => {
    const result = await provider.convertMessage({
      role: "system",
      content: "You are helpful"
    });
    expect(result).toEqual({ role: "system", content: "You are helpful" });
  });

  it("converts assistant with array content", async () => {
    const result = await provider.convertMessage({
      role: "assistant",
      content: [{ type: "text", text: "hi" }]
    });
    expect(result).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "hi" }]
    });
  });

  it("converts user with array content", async () => {
    const result = await provider.convertMessage({
      role: "user",
      content: [{ type: "text", text: "hello" }]
    });
    expect(result).toEqual({
      role: "user",
      content: [{ type: "text", text: "hello" }]
    });
  });

  it("throws for unsupported role", async () => {
    await expect(
      provider.convertMessage({ role: "unknown" as any, content: "x" })
    ).rejects.toThrow("Unsupported role");
  });

  it("converts user image with data URI", async () => {
    const data = Buffer.from([1, 2, 3]).toString("base64");
    const result = await provider.convertMessage({
      role: "user",
      content: [
        {
          type: "image",
          image: { data: new Uint8Array([1, 2, 3]) }
        }
      ]
    });
    expect((result as any).content[0].type).toBe("image_url");
  });

  it("converts user audio content", async () => {
    const result = await provider.convertMessage({
      role: "user",
      content: [
        {
          type: "audio",
          audio: { data: new Uint8Array([1, 2, 3]) }
        }
      ]
    });
    expect((result as any).content[0].type).toBe("input_audio");
    expect((result as any).content[0].input_audio.format).toBe("mp3");
  });

  it("converts user audio content with URI", async () => {
    const data = Buffer.from("audiodata").toString("base64");
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "audio/mpeg" },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
    });

    const p = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any, fetchFn: fetchFn as any }
    );

    const result = await p.convertMessage({
      role: "user",
      content: [
        {
          type: "audio",
          audio: { uri: "https://example.com/audio.mp3" }
        }
      ]
    });
    expect((result as any).content[0].type).toBe("input_audio");
  });
});

describe("OpenAIProvider – formatTools", () => {
  const provider = new OpenAIProvider(
    { OPENAI_API_KEY: "k" },
    { client: {} as any }
  );

  it("formats code_interpreter tool type", () => {
    const result = provider.formatTools([
      { type: "code_interpreter", name: "code_interpreter" }
    ]);
    expect(result).toEqual([{ type: "code_interpreter" }]);
  });

  it("formats function tool", () => {
    const result = provider.formatTools([
      {
        name: "search",
        description: "Search stuff",
        inputSchema: { type: "object", properties: { q: { type: "string" } } }
      }
    ]);
    expect(result).toEqual([
      {
        type: "function",
        function: {
          name: "search",
          description: "Search stuff",
          parameters: { type: "object", properties: { q: { type: "string" } } }
        }
      }
    ]);
  });
});

describe("OpenAIProvider – convertSystemToUserForOModels", () => {
  it("converts system to user for o-models via streaming", async () => {
    const stream = makeAsyncIterable([
      { choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] }
    ]);
    const create = vi.fn().mockResolvedValue(stream);

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: { chat: { completions: { create } } } as any }
    );

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "o1-mini",
      messages: [
        { role: "system", content: "be concise" },
        { role: "user", content: "hi" }
      ]
    })) {
      out.push(item);
    }

    const callArgs = create.mock.calls[0][0];
    expect(callArgs.messages[0].role).toBe("user");
    expect(callArgs.messages[0].content).toContain("Instructions:");
  });
});

describe("OpenAIProvider – generateMessages with audio", () => {
  it("streams audio chunks", async () => {
    const stream = makeAsyncIterable([
      {
        choices: [
          {
            delta: { audio: { data: "base64audiodata" } },
            finish_reason: null
          }
        ]
      },
      {
        choices: [{ delta: { content: "" }, finish_reason: "stop" }]
      }
    ]);
    const create = vi.fn().mockResolvedValue(stream);

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: { chat: { completions: { create } } } as any }
    );

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "gpt-4o-audio",
      messages: [{ role: "user", content: "hi" }],
      audio: { voice: "alloy", format: "pcm16" }
    })) {
      out.push(item);
    }

    expect(out[0]).toEqual({
      type: "chunk",
      content_type: "audio",
      content: "base64audiodata"
    });
    // audio request sets modalities
    expect(create.mock.calls[0][0].modalities).toEqual(["text", "audio"]);
  });
});

// responseFormat/jsonSchema removed from provider interface — structured output
// is handled at the caller level via extractJson or result tools.

describe("OpenAIProvider – generateMessage with options", () => {
  it("passes temperature, topP, presencePenalty, frequencyPenalty", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "ok" } }]
    });

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: { chat: { completions: { create } } } as any }
    );

    await provider.generateMessage({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.5,
      topP: 0.9,
      presencePenalty: 0.1,
      frequencyPenalty: 0.2
    });

    const req = create.mock.calls[0][0];
    expect(req.temperature).toBe(0.5);
    expect(req.top_p).toBe(0.9);
    expect(req.presence_penalty).toBe(0.1);
    expect(req.frequency_penalty).toBe(0.2);
  });

  it("throws when no choices returned", async () => {
    const create = vi.fn().mockResolvedValue({ choices: [] });

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: { chat: { completions: { create } } } as any }
    );

    await expect(
      provider.generateMessage({
        model: "gpt-4o",
        messages: [{ role: "user", content: "hi" }]
      })
    ).rejects.toThrow("no choices");
  });
});

describe("OpenAIProvider – textToImage", () => {
  it("generates image from b64_json response", async () => {
    const imageData = Buffer.from("fake-image").toString("base64");
    const generate = vi.fn().mockResolvedValue({
      data: [{ b64_json: imageData }]
    });

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      {
        client: { images: { generate } } as any
      }
    );

    const result = await provider.textToImage({
      prompt: "a cat",
      model: { id: "gpt-image-1", name: "GPT Image 1", provider: "openai" },
      width: 1024,
      height: 1024
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0].prompt).toBe("a cat");
  });

  it("generates image from URL response", async () => {
    const generate = vi.fn().mockResolvedValue({
      data: [{ url: "https://example.com/image.png" }]
    });

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
    });

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      {
        client: { images: { generate } } as any,
        fetchFn: fetchFn as any
      }
    );

    const result = await provider.textToImage({
      prompt: "a dog",
      model: { id: "gpt-image-1", name: "GPT Image 1", provider: "openai" }
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(fetchFn).toHaveBeenCalledWith("https://example.com/image.png");
  });

  it("throws on empty prompt", async () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any }
    );

    await expect(
      provider.textToImage({
        prompt: "",
        model: { id: "gpt-image-1", name: "GPT Image 1", provider: "openai" }
      })
    ).rejects.toThrow("prompt cannot be empty");
  });

  it("throws when no image data returned", async () => {
    const generate = vi.fn().mockResolvedValue({ data: [{}] });
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: { images: { generate } } as any }
    );

    await expect(
      provider.textToImage({
        prompt: "a cat",
        model: { id: "gpt-image-1", name: "GPT Image 1", provider: "openai" }
      })
    ).rejects.toThrow("no image data");
  });

  it("includes negative prompt", async () => {
    const imageData = Buffer.from("fake").toString("base64");
    const generate = vi.fn().mockResolvedValue({
      data: [{ b64_json: imageData }]
    });

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: { images: { generate } } as any }
    );

    await provider.textToImage({
      prompt: "a cat",
      negativePrompt: "blurry",
      model: { id: "gpt-image-1", name: "GPT Image 1", provider: "openai" }
    });

    expect(generate.mock.calls[0][0].prompt).toContain(
      "Do not include: blurry"
    );
  });
});

describe("OpenAIProvider – imageToImage", () => {
  it("edits image with b64_json response", async () => {
    const imageData = Buffer.from("edited").toString("base64");
    const edit = vi.fn().mockResolvedValue({
      data: [{ b64_json: imageData }]
    });

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: { images: { edit } } as any }
    );

    const result = await provider.imageToImage(new Uint8Array([1, 2, 3]), {
      prompt: "make it red",
      model: { id: "gpt-image-1", name: "GPT Image 1", provider: "openai" }
    });

    expect(result).toBeInstanceOf(Uint8Array);
  });

  it("throws on empty image", async () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any }
    );

    await expect(
      provider.imageToImage(new Uint8Array(), {
        prompt: "test",
        model: { id: "m", name: "m", provider: "openai" }
      })
    ).rejects.toThrow("must not be empty");
  });

  it("throws on empty prompt", async () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any }
    );

    await expect(
      provider.imageToImage(new Uint8Array([1]), {
        prompt: "",
        model: { id: "m", name: "m", provider: "openai" }
      })
    ).rejects.toThrow("prompt cannot be empty");
  });

  it("fetches image from URL response", async () => {
    const edit = vi.fn().mockResolvedValue({
      data: [{ url: "https://example.com/edited.png" }]
    });
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([4, 5, 6]).buffer
    });

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: { images: { edit } } as any, fetchFn: fetchFn as any }
    );

    const result = await provider.imageToImage(new Uint8Array([1, 2, 3]), {
      prompt: "edit",
      model: { id: "m", name: "m", provider: "openai" }
    });

    expect(result).toBeInstanceOf(Uint8Array);
  });

  it("throws when no data returned", async () => {
    const edit = vi.fn().mockResolvedValue({ data: [{}] });
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: { images: { edit } } as any }
    );

    await expect(
      provider.imageToImage(new Uint8Array([1]), {
        prompt: "test",
        model: { id: "m", name: "m", provider: "openai" }
      })
    ).rejects.toThrow("no image data");
  });
});

describe("OpenAIProvider – textToSpeech", () => {
  it("streams PCM audio chunks via with_streaming_response", async () => {
    const pcmData = new Uint8Array([0, 1, 0, 2]);

    const iterBytes = async function* (chunkSize: number) {
      yield pcmData;
    };

    const speechApi = {
      with_streaming_response: {
        create: vi.fn().mockResolvedValue({ iterBytes })
      }
    };

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      {
        client: { audio: { speech: speechApi } } as any
      }
    );

    const chunks: unknown[] = [];
    for await (const chunk of provider.textToSpeech({
      text: "Hello world",
      model: "tts-1",
      voice: "nova",
      speed: 1.5
    })) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect((chunks[0] as any).samples).toBeInstanceOf(Int16Array);
    expect(speechApi.with_streaming_response.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "tts-1",
        voice: "nova",
        speed: 1.5,
        response_format: "pcm"
      })
    );
  });

  it("falls back to non-streaming create", async () => {
    const pcmData = new Uint8Array([0, 1, 0, 2]);
    const speechApi = {
      create: vi.fn().mockResolvedValue({
        arrayBuffer: async () => pcmData.buffer
      })
    };

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: { audio: { speech: speechApi } } as any }
    );

    const chunks: unknown[] = [];
    for await (const chunk of provider.textToSpeech({
      text: "hi",
      model: "tts-1"
    })) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(1);
    expect(speechApi.create).toHaveBeenCalled();
  });

  it("throws on empty text", async () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any }
    );

    const gen = provider.textToSpeech({ text: "", model: "tts-1" });
    await expect(gen.next()).rejects.toThrow("text must not be empty");
  });

  it("clamps speed to valid range", async () => {
    const speechApi = {
      create: vi.fn().mockResolvedValue({
        arrayBuffer: async () => new Uint8Array([0, 0]).buffer
      })
    };

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: { audio: { speech: speechApi } } as any }
    );

    for await (const _ of provider.textToSpeech({
      text: "hi",
      model: "tts-1",
      speed: 10.0 // should clamp to 4.0
    })) {
    }

    expect(speechApi.create.mock.calls[0][0].speed).toBe(4.0);
  });
});

describe("OpenAIProvider – automaticSpeechRecognition", () => {
  it("transcribes audio", async () => {
    const create = vi.fn().mockResolvedValue({ text: "Hello world" });

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      {
        client: { audio: { transcriptions: { create } } } as any
      }
    );

    const result = await provider.automaticSpeechRecognition({
      audio: new Uint8Array([1, 2, 3]),
      model: "whisper-1",
      language: "en"
    });

    expect(result).toBe("Hello world");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("throws on empty audio", async () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any }
    );

    await expect(
      provider.automaticSpeechRecognition({
        audio: new Uint8Array(),
        model: "whisper-1"
      })
    ).rejects.toThrow("audio must not be empty");
  });
});

describe("OpenAIProvider – generateEmbedding", () => {
  it("generates embeddings", async () => {
    const create = vi.fn().mockResolvedValue({
      data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }]
    });

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: { embeddings: { create } } as any }
    );

    const result = await provider.generateEmbedding({
      text: ["hello", "world"],
      model: "text-embedding-3-small"
    });

    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4]
    ]);
  });

  it("accepts single string", async () => {
    const create = vi.fn().mockResolvedValue({
      data: [{ embedding: [0.1] }]
    });

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: { embeddings: { create } } as any }
    );

    const result = await provider.generateEmbedding({
      text: "hello",
      model: "text-embedding-3-small"
    });

    expect(result).toEqual([[0.1]]);
  });

  it("throws on empty text", async () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any }
    );

    await expect(
      provider.generateEmbedding({ text: "", model: "text-embedding-3-small" })
    ).rejects.toThrow("text must not be empty");
  });

  it("passes dimensions when provided", async () => {
    const create = vi.fn().mockResolvedValue({
      data: [{ embedding: [0.1] }]
    });

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: { embeddings: { create } } as any }
    );

    await provider.generateEmbedding({
      text: "hello",
      model: "text-embedding-3-small",
      dimensions: 512
    });

    expect(create.mock.calls[0][0].dimensions).toBe(512);
  });
});

describe("OpenAIProvider – getAvailableLanguageModels", () => {
  it("fetches and maps models", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: "gpt-4o" }, { id: "gpt-3.5-turbo" }, {}]
      })
    });

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any, fetchFn: fetchFn as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([
      { id: "gpt-4o", name: "gpt-4o", provider: "openai" },
      { id: "gpt-3.5-turbo", name: "gpt-3.5-turbo", provider: "openai" }
    ]);
  });

  it("returns empty array on API failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401 });

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any, fetchFn: fetchFn as any }
    );

    const models = await provider.getAvailableLanguageModels();
    expect(models).toEqual([]);
  });
});

describe("OpenAIProvider – isContextLengthError", () => {
  const provider = new OpenAIProvider(
    { OPENAI_API_KEY: "k" },
    { client: {} as any }
  );

  it("detects context length errors", () => {
    expect(provider.isContextLengthError("context length exceeded")).toBe(true);
    expect(provider.isContextLengthError("maximum context")).toBe(true);
    expect(provider.isContextLengthError("rate limit")).toBe(false);
  });
});

describe("OpenAIProvider – asUint8Array edge cases", () => {
  const provider = new OpenAIProvider(
    { OPENAI_API_KEY: "k" },
    { client: {} as any }
  );

  it("converts integer array to Uint8Array in convertMessage", async () => {
    // This exercises the Array.isArray branch of asUint8Array via image data
    const result = await provider.convertMessage({
      role: "user",
      content: [{ type: "image", image: { data: [1, 2, 3] as any } }]
    });
    expect((result as any).content[0].type).toBe("image_url");
  });

  it("converts string base64 to Uint8Array in convertMessage", async () => {
    // This exercises the typeof data === "string" branch of asUint8Array via audio data
    const base64 = Buffer.from("test").toString("base64");
    const result = await provider.convertMessage({
      role: "user",
      content: [{ type: "audio", audio: { data: base64 } }]
    });
    expect((result as any).content[0].type).toBe("input_audio");
  });
});

describe("OpenAIProvider – image content with no uri (data only)", () => {
  it("uses makeDataUri for image with Uint8Array data and no uri", async () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any }
    );
    const result = await provider.convertMessage({
      role: "user",
      content: [
        {
          type: "image",
          image: { data: new Uint8Array([1, 2, 3]), mimeType: "image/png" }
        }
      ]
    });
    expect((result as any).content[0].image_url.url).toContain(
      "data:image/png;base64,"
    );
  });
});

describe("OpenAIProvider – textToVideo", () => {
  it("generates video and polls until completed", async () => {
    const videoId = "vid_123";
    const videosCreate = vi.fn().mockResolvedValue({
      id: videoId,
      status: "completed"
    });
    const videosRetrieve = vi.fn();
    const getContent = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));

    const mockClient = {
      videos: {
        create: videosCreate,
        retrieve: videosRetrieve
      },
      get: getContent
    };

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: mockClient as any }
    );

    const result = await provider.textToVideo({
      prompt: "A cat",
      model: { id: "sora", name: "sora", provider: "openai" },
      aspectRatio: "16:9",
      resolution: "720p",
      numFrames: 100
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(videosCreate).toHaveBeenCalled();
  });

  it("throws on empty prompt", async () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any }
    );

    await expect(
      provider.textToVideo({
        prompt: "",
        model: { id: "sora", name: "sora", provider: "openai" }
      })
    ).rejects.toThrow("cannot be empty");
  });

  it("throws when video create returns no id", async () => {
    const mockClient = {
      videos: { create: vi.fn().mockResolvedValue({}) }
    };
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: mockClient as any }
    );

    await expect(
      provider.textToVideo({
        prompt: "test",
        model: { id: "sora", name: "sora", provider: "openai" }
      })
    ).rejects.toThrow("did not contain a video id");
  });

  it("throws on non-completed status", async () => {
    const mockClient = {
      videos: {
        create: vi
          .fn()
          .mockResolvedValue({ id: "v1", status: "failed", error: "bad" }),
        retrieve: vi.fn()
      }
    };
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: mockClient as any }
    );

    await expect(
      provider.textToVideo({
        prompt: "test",
        model: { id: "sora", name: "sora", provider: "openai" }
      })
    ).rejects.toThrow("bad");
  });

  it("polls in_progress status until completed", async () => {
    let callCount = 0;
    const mockClient = {
      videos: {
        create: vi.fn().mockResolvedValue({ id: "v1", status: "in_progress" }),
        retrieve: vi.fn().mockImplementation(async () => {
          callCount++;
          return callCount >= 2
            ? { id: "v1", status: "completed" }
            : { id: "v1", status: "in_progress" };
        })
      },
      get: vi.fn().mockResolvedValue(new Uint8Array([1, 2]))
    };

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: mockClient as any }
    );

    const result = await provider.textToVideo({
      prompt: "test",
      model: { id: "sora", name: "sora", provider: "openai" }
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(mockClient.videos.retrieve).toHaveBeenCalled();
  });
});

describe("OpenAIProvider – imageToVideo", () => {
  it("generates video from image", async () => {
    // Minimal PNG
    const png = new Uint8Array(24);
    png[0] = 0x89;
    png[1] = 0x50;
    png[2] = 0x4e;
    png[3] = 0x47;
    const view = new DataView(png.buffer);
    view.setUint32(16, 640, false);
    view.setUint32(20, 480, false);

    const mockClient = {
      videos: {
        create: vi.fn().mockResolvedValue({ id: "v1", status: "completed" }),
        retrieve: vi.fn()
      },
      get: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
    };

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: mockClient as any }
    );

    const result = await provider.imageToVideo(png, {
      prompt: "make it move",
      model: { id: "sora", name: "sora", provider: "openai" }
    });

    expect(result).toBeInstanceOf(Uint8Array);
  });

  it("throws on empty image", async () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: {} as any }
    );

    await expect(
      provider.imageToVideo(new Uint8Array(), {
        prompt: "test",
        model: { id: "sora", name: "sora", provider: "openai" }
      })
    ).rejects.toThrow("cannot be empty");
  });

  it("throws on no video id", async () => {
    const png = new Uint8Array(24);
    png[0] = 0x89;
    png[1] = 0x50;
    png[2] = 0x4e;
    png[3] = 0x47;
    const view = new DataView(png.buffer);
    view.setUint32(16, 640, false);
    view.setUint32(20, 480, false);

    const mockClient = {
      videos: { create: vi.fn().mockResolvedValue({}) }
    };
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: mockClient as any }
    );

    await expect(
      provider.imageToVideo(png, {
        prompt: "test",
        model: { id: "sora", name: "sora", provider: "openai" }
      })
    ).rejects.toThrow("did not contain a video id");
  });

  it("throws on failed status", async () => {
    const png = new Uint8Array(24);
    png[0] = 0x89;
    png[1] = 0x50;
    png[2] = 0x4e;
    png[3] = 0x47;
    const view = new DataView(png.buffer);
    view.setUint32(16, 640, false);
    view.setUint32(20, 480, false);

    const mockClient = {
      videos: {
        create: vi
          .fn()
          .mockResolvedValue({ id: "v1", status: "failed", error: "err" }),
        retrieve: vi.fn()
      }
    };
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: mockClient as any }
    );

    await expect(
      provider.imageToVideo(png, {
        prompt: "test",
        model: { id: "sora", name: "sora", provider: "openai" }
      })
    ).rejects.toThrow("err");
  });

  it("polls queued then completed", async () => {
    const png = new Uint8Array(24);
    png[0] = 0x89;
    png[1] = 0x50;
    png[2] = 0x4e;
    png[3] = 0x47;
    const view = new DataView(png.buffer);
    view.setUint32(16, 640, false);
    view.setUint32(20, 480, false);

    const mockClient = {
      videos: {
        create: vi.fn().mockResolvedValue({ id: "v1", status: "queued" }),
        retrieve: vi.fn().mockResolvedValue({ id: "v1", status: "completed" })
      },
      get: vi.fn().mockResolvedValue(new Uint8Array([4, 5]))
    };

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: mockClient as any }
    );

    const result = await provider.imageToVideo(png, {
      prompt: "test",
      model: { id: "sora", name: "sora", provider: "openai" }
    });

    expect(result).toBeInstanceOf(Uint8Array);
  });
});

describe("OpenAIProvider – JPEG SOF scan edge cases", () => {
  it("handles JPEG with non-FF bytes before SOF marker", () => {
    const jpeg = new Uint8Array(30);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;
    // Insert non-0xFF byte (skip branch)
    jpeg[2] = 0x00;
    // Then a valid marker
    jpeg[3] = 0xff;
    jpeg[4] = 0xc0;
    jpeg[5] = 0x00;
    jpeg[6] = 0x11;
    jpeg[7] = 0x08;
    jpeg[8] = 0x00;
    jpeg[9] = 0xf0; // height=240
    jpeg[10] = 0x01;
    jpeg[11] = 0x40; // width=320
    expect(OpenAIProvider.extractImageDimensions(jpeg)).toEqual([320, 240]);
  });

  it("handles JPEG with non-SOF marker before SOF (skips segment)", () => {
    const jpeg = new Uint8Array(30);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;
    // APP0 marker (not SOF)
    jpeg[2] = 0xff;
    jpeg[3] = 0xe0;
    jpeg[4] = 0x00;
    jpeg[5] = 0x04; // size=4
    jpeg[6] = 0x00;
    jpeg[7] = 0x00;
    // SOF0 marker
    jpeg[8] = 0xff;
    jpeg[9] = 0xc0;
    jpeg[10] = 0x00;
    jpeg[11] = 0x11;
    jpeg[12] = 0x08;
    jpeg[13] = 0x01;
    jpeg[14] = 0xe0; // height=480
    jpeg[15] = 0x02;
    jpeg[16] = 0x80; // width=640
    expect(OpenAIProvider.extractImageDimensions(jpeg)).toEqual([640, 480]);
  });

  it("throws for JPEG with size < 2 in segment", () => {
    const jpeg = new Uint8Array(10);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;
    jpeg[2] = 0xff;
    jpeg[3] = 0xe0;
    jpeg[4] = 0x00;
    jpeg[5] = 0x01; // size=1 (< 2, triggers break)
    expect(() => OpenAIProvider.extractImageDimensions(jpeg)).toThrow(
      "Unsupported image format"
    );
  });
});

describe("OpenAIProvider – resolveVideoSize invalid aspect", () => {
  it("returns null for aspect ratio that produces non-finite values", () => {
    expect(OpenAIProvider.resolveVideoSize("abc:def", "720p")).toBeNull();
  });

  it("falls back to 1:1 when aspect has no colon", () => {
    const result = OpenAIProvider.resolveVideoSize("square", "720p");
    expect(result).toBeTruthy();
  });
});

describe("OpenAIProvider – generateMessages with tools", () => {
  it("includes tools in streaming request", async () => {
    const stream = makeAsyncIterable([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "tc1",
                  function: { name: "search", arguments: '{"q":"x"}' }
                }
              ]
            },
            finish_reason: null
          }
        ]
      },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] }
    ]);
    const create = vi.fn().mockResolvedValue(stream);

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: { chat: { completions: { create } } } as any }
    );

    const out: unknown[] = [];
    for await (const item of provider.generateMessages({
      model: "gpt-4o",
      messages: [{ role: "user", content: "search" }],
      tools: [{ name: "search", description: "Search" }]
    })) {
      out.push(item);
    }

    expect(create.mock.calls[0][0].tools).toBeDefined();
    expect(out.length).toBeGreaterThan(0);
  });

  it("passes temperature/topP/presencePenalty/frequencyPenalty in streaming", async () => {
    const stream = makeAsyncIterable([
      { choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] }
    ]);
    const create = vi.fn().mockResolvedValue(stream);

    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      { client: { chat: { completions: { create } } } as any }
    );

    for await (const _ of provider.generateMessages({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.5,
      topP: 0.9,
      presencePenalty: 0.1,
      frequencyPenalty: 0.2
    })) {
    }

    const req = create.mock.calls[0][0];
    expect(req.temperature).toBe(0.5);
    expect(req.top_p).toBe(0.9);
    expect(req.presence_penalty).toBe(0.1);
    expect(req.frequency_penalty).toBe(0.2);
  });
});
