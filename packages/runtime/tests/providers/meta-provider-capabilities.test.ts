import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { MetaProvider } from "../../src/providers/meta-provider.js";
import {
  isTranscribeReadyWav,
  keywordsFromPrompt,
  languageBiasName,
  toTranscribeWav
} from "../../src/providers/meta-transcription.js";
import { samPromptText } from "../../src/providers/meta-segmentation.js";
import type { Message, ProviderTool } from "../../src/providers/types.js";

const IMAGE_MODEL = { id: "muse-image-1.0", name: "Muse Image", provider: "meta" as const };
const SAM_MODEL = { id: "sam-3.1", name: "SAM 3.1", provider: "meta" as const };

function providerWithCreate(create: ReturnType<typeof vi.fn>): MetaProvider {
  return new MetaProvider(
    { META_API_KEY: "k" },
    { client: { responses: { create } } as any }
  );
}

function providerWithFetch(fetchMock: ReturnType<typeof vi.fn>): MetaProvider {
  return new MetaProvider(
    { META_API_KEY: "k" },
    { client: {} as any, fetchFn: fetchMock as unknown as typeof fetch }
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function textResponseCreate() {
  return vi.fn().mockResolvedValue({ id: "resp_1", output_text: "ok", output: [] });
}

/** A RIFF/WAVE PCM file: an optional `LIST` chunk, `fmt `, then silent `data`. */
function wav(options: {
  channels?: number;
  sampleRate?: number;
  bitsPerSample?: number;
  audioFormat?: number;
  listChunk?: string;
}): Uint8Array {
  const {
    channels = 1,
    sampleRate = 24000,
    bitsPerSample = 16,
    audioFormat = 1,
    listChunk
  } = options;
  const parts: Buffer[] = [];
  if (listChunk !== undefined) {
    const body = Buffer.from(listChunk, "latin1");
    const header = Buffer.alloc(8);
    header.write("LIST", 0, "latin1");
    header.writeUInt32LE(body.length, 4);
    parts.push(header, body);
    if (body.length % 2 === 1) parts.push(Buffer.alloc(1));
  }
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0, "latin1");
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(audioFormat, 8);
  fmt.writeUInt16LE(channels, 10);
  fmt.writeUInt32LE(sampleRate, 12);
  fmt.writeUInt32LE((sampleRate * channels * bitsPerSample) / 8, 16);
  fmt.writeUInt16LE((channels * bitsPerSample) / 8, 20);
  fmt.writeUInt16LE(bitsPerSample, 22);
  const samples = Buffer.alloc(((sampleRate / 10) * channels * bitsPerSample) / 8);
  const data = Buffer.alloc(8);
  data.write("data", 0, "latin1");
  data.writeUInt32LE(samples.length, 4);
  parts.push(fmt, data, samples);
  const body = Buffer.concat(parts);
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "latin1");
  riff.writeUInt32LE(body.length + 4, 4);
  riff.write("WAVE", 8, "latin1");
  return new Uint8Array(Buffer.concat([riff, body]));
}

// Frame 0 of a 320×334 image, prompt "button", two objects — the sample
// output from Meta's `@meta-sam/parser` README.
const SAM_OUTPUT =
  "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|>" +
  "<|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>" +
  ",1<|box;x1=155;y1=228;x2=202;y2=254;w=320;h=334|>" +
  "<|mask;x=0;y=0;data=27,48,~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@|>\n";

async function blankPng(width: number, height: number): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } }
    })
      .png()
      .toBuffer()
  );
}

describe("MetaProvider search grounding", () => {
  it("answers web_search with Meta's hosted search", async () => {
    const create = textResponseCreate();
    const provider = providerWithCreate(create);
    expect(provider.supportsNativeWebSearch).toBe(true);

    await provider.generateMessage({
      model: "muse-spark-1.3",
      messages: [{ role: "user", content: "Who won the last F1 race?" }],
      tools: [{ name: "web_search", description: "Search the web" }],
      toolChoice: "web_search"
    });

    expect(create.mock.calls[0][0]).toMatchObject({
      tools: [{ type: "web_search" }],
      tool_choice: { type: "web_search" }
    });
  });

  it("keeps image_generation a function tool, since Muse Spark has no hosted one", async () => {
    const create = textResponseCreate();
    const provider = providerWithCreate(create);
    expect(provider.supportsNativeImageGeneration).toBe(false);

    await provider.generateMessage({
      model: "muse-spark-1.3",
      messages: [{ role: "user", content: "draw" }],
      tools: [{ name: "image_generation", description: "Make an image" }]
    });

    expect(create.mock.calls[0][0].tools).toEqual([
      expect.objectContaining({ type: "function", name: "image_generation" })
    ]);
  });
});

describe("MetaProvider tool search", () => {
  const lookup: ProviderTool = {
    name: "lookup_order",
    description: "Look up an order",
    inputSchema: { type: "object", properties: { id: { type: "string" } } }
  };

  it("defers tools marked deferLoading and adds the hosted tool_search", async () => {
    const create = textResponseCreate();
    const provider = providerWithCreate(create);

    await provider.generateMessage({
      model: "muse-spark-1.3",
      messages: [{ role: "user", content: "List open orders" }],
      tools: [
        { name: "finish", description: "Done" },
        { ...lookup, deferLoading: true }
      ]
    });

    expect(create.mock.calls[0][0].tools).toEqual([
      { type: "function", name: "finish", description: "Done", parameters: { type: "object", properties: {} } },
      {
        type: "function",
        name: "lookup_order",
        description: "Look up an order",
        parameters: lookup.inputSchema,
        defer_loading: true
      },
      { type: "tool_search" }
    ]);
  });

  it("sends no tool_search when nothing is deferred", async () => {
    const create = textResponseCreate();
    const provider = providerWithCreate(create);

    await provider.generateMessage({
      model: "muse-spark-1.3",
      messages: [{ role: "user", content: "hi" }],
      tools: [lookup]
    });

    const tools = create.mock.calls[0][0].tools as Array<Record<string, unknown>>;
    expect(tools).toHaveLength(1);
    expect(tools[0]).not.toHaveProperty("defer_loading");
  });
});

describe("MetaProvider video and audio understanding", () => {
  it("reads video natively instead of sampling frames", () => {
    expect(providerWithCreate(vi.fn()).supportsVideoInput).toBe(true);
  });

  it("sends video and audio parts as Responses input parts", async () => {
    const create = textResponseCreate();
    const provider = providerWithCreate(create);
    const audio = wav({});
    const messages: Message[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this clip and the recording." },
          {
            type: "video",
            video: { data: new Uint8Array([1, 2, 3]), mimeType: "video/mp4" }
          },
          { type: "video", video: { uri: "https://example.com/clip.mp4" } },
          { type: "audio", audio: { data: audio } }
        ]
      }
    ];

    await provider.generateMessage({ model: "muse-spark-1.3", messages });

    expect(create.mock.calls[0][0].input[0].content).toEqual([
      { type: "input_text", text: "Describe this clip and the recording." },
      { type: "input_video", video_url: "data:video/mp4;base64,AQID" },
      { type: "input_video", video_url: "https://example.com/clip.mp4" },
      {
        type: "input_audio",
        input_audio: {
          data: Buffer.from(audio).toString("base64"),
          format: "wav"
        }
      }
    ]);
  });
});

describe("MetaProvider image generation", () => {
  it("generates images on /images/generations and prices them per image", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: [{ b64_json: "AQID" }, { b64_json: "BAUG" }] })
    );
    const provider = providerWithFetch(fetchMock);

    const images = await provider.textToImages(
      {
        model: IMAGE_MODEL,
        prompt: "a red fox in snow",
        negativePrompt: "people",
        aspectRatio: "16:9"
      },
      2
    );

    expect(images).toEqual([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.meta.ai/v1/images/generations");
    expect(init.headers).toMatchObject({ Authorization: "Bearer k" });
    expect(JSON.parse(init.body)).toEqual({
      model: "muse-image-1.0",
      prompt: "a red fox in snow\n\nDo not include: people",
      n: 2,
      response_format: "b64_json",
      output_format: "png",
      size: "1820x1024"
    });
    expect(provider.getTotalCost()).toBeCloseTo(0.02);
  });

  it("sends pixel sizes through unchanged", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: [{ b64_json: "AQID" }] }));
    const provider = providerWithFetch(fetchMock);

    await provider.textToImage({
      model: IMAGE_MODEL,
      prompt: "portrait",
      width: 1024,
      height: 1536
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).size).toBe("1024x1536");
  });

  it("edits with every source image as a data URL on /images/edits", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: [{ b64_json: "AQID" }] }));
    const provider = providerWithFetch(fetchMock);
    const png = await blankPng(2, 2);

    const result = await provider.imageToImage([png, png], {
      model: IMAGE_MODEL,
      prompt: "put a hat on the fox"
    });

    expect(result).toEqual(new Uint8Array([1, 2, 3]));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.meta.ai/v1/images/edits");
    const body = JSON.parse(init.body);
    expect(body.images).toHaveLength(2);
    expect(body.images[0].image_url).toMatch(/^data:image\/png;base64,/);
    expect(body).not.toHaveProperty("size");
  });

  it("rejects more than ten images per request", async () => {
    const provider = providerWithFetch(vi.fn());
    await expect(
      provider.textToImages({ model: IMAGE_MODEL, prompt: "x" }, 11)
    ).rejects.toThrow("1 to 10 images");
  });

  it("reports the status and body of a failed request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('{"error":{"message":"unsupported size"}}', { status: 400 })
      );
    const provider = providerWithFetch(fetchMock);

    await expect(
      provider.textToImage({ model: IMAGE_MODEL, prompt: "x" })
    ).rejects.toThrow('Meta image request failed: 400 {"error":{"message":"unsupported size"}}');
  });

  it("fails when the response carries no image", async () => {
    const provider = providerWithFetch(
      vi.fn().mockResolvedValue(jsonResponse({ data: [] }))
    );
    await expect(
      provider.textToImage({ model: IMAGE_MODEL, prompt: "x" })
    ).rejects.toThrow("returned no image data");
  });
});

describe("MetaProvider speech to text", () => {
  it("posts WAV audio and settings as multipart and returns timed turns", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        sessionId: "s1",
        transcript: "How is the weather? It is raining.",
        audioDurationMs: 8240,
        turns: [
          { turnId: 1, startMs: 1520, endMs: 4640, transcript: "How is the weather?" },
          { turnId: 2, startMs: 5900, endMs: 8240, transcript: "It is raining." }
        ]
      })
    );
    const provider = providerWithFetch(fetchMock);
    const audio = wav({ sampleRate: 16000 });

    const result = await provider.automaticSpeechRecognition({
      audio,
      model: "muse-voice-transcribe-1.0",
      language: "en",
      prompt: "Acme Mobile, eSIM"
    });

    expect(result).toEqual({
      text: "How is the weather? It is raining.",
      chunks: [
        { timestamp: [1.52, 4.64], text: "How is the weather?" },
        { timestamp: [5.9, 8.24], text: "It is raining." }
      ]
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.meta.ai/v1/asr/transcribe");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer k",
      Accept: "application/json"
    });
    const form = init.body as FormData;
    expect(JSON.parse(await (form.get("request") as Blob).text())).toEqual({
      mode: "ENDPOINTING",
      model: "muse-voice-transcribe-1.0",
      audioEncoding: "WAV",
      languageBias: ["English"],
      keywords: ["Acme Mobile", "eSIM"]
    });
    const sent = new Uint8Array(await (form.get("audio") as Blob).arrayBuffer());
    expect(sent).toEqual(audio);
    // $0.18 per hour, billed on 8 whole seconds.
    expect(provider.getTotalCost()).toBeCloseTo((8 / 3600) * 0.18);
  });

  it("refuses word timestamps, which Meta does not produce", async () => {
    const provider = providerWithFetch(vi.fn());
    await expect(
      provider.automaticSpeechRecognition({
        audio: wav({}),
        model: "muse-voice-transcribe-1.0",
        word_timestamps: true
      })
    ).rejects.toThrow("no word-level timestamps");
  });

  it("returns no chunks when the mode reports no turns", async () => {
    const provider = providerWithFetch(
      vi.fn().mockResolvedValue(jsonResponse({ transcript: "hi", turns: [] }))
    );
    expect(
      await provider.automaticSpeechRecognition({
        audio: wav({}),
        model: "muse-voice-transcribe-1.0"
      })
    ).toEqual({ text: "hi" });
  });
});

describe("Meta transcription audio", () => {
  it.each([
    ["mono 24 kHz", wav({}), true],
    ["mono 16 kHz", wav({ sampleRate: 16000 }), true],
    ["fmt after an odd-sized LIST chunk", wav({ listChunk: "INFOabc" }), true],
    ["stereo", wav({ channels: 2 }), false],
    ["44.1 kHz", wav({ sampleRate: 44100 }), false],
    ["8-bit", wav({ bitsPerSample: 8 }), false],
    ["float", wav({ audioFormat: 3, bitsPerSample: 32 }), false],
    ["not RIFF", new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 0, 0]), false],
    ["truncated", wav({}).subarray(0, 30), false]
  ])("%s is ready as is: %s", (_name, bytes, ready) => {
    expect(isTranscribeReadyWav(bytes)).toBe(ready);
  });

  it("transcodes other audio to mono 16-bit WAV at 24 kHz", async () => {
    const converted = await toTranscribeWav(wav({ channels: 2, sampleRate: 44100 }));
    expect(isTranscribeReadyWav(converted)).toBe(true);
    expect(new DataView(converted.buffer, converted.byteOffset).getUint32(24, true)).toBe(24000);
  });

  it("names languages the way languageBias expects", () => {
    expect(languageBiasName("en")).toBe("English");
    expect(languageBiasName("fr-CA")).toBe("French");
    expect(languageBiasName("English")).toBe("English");
  });

  it("splits a prompt into recognition keywords", () => {
    expect(keywordsFromPrompt("Acme, eSIM\n5G, ")).toEqual(["Acme", "eSIM", "5G"]);
  });
});

describe("MetaProvider segmentation", () => {
  it("segments with a noun phrase and returns full-frame masks", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: "resp_1", output_text: SAM_OUTPUT }));
    const provider = providerWithFetch(fetchMock);
    const image = await blankPng(320, 334);

    const masks = await provider.segmentImage(image, {
      model: SAM_MODEL,
      prompt: "button"
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.meta.ai/v1/responses");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("sam-3.1");
    expect(body.input[0].content[0]).toEqual({ type: "input_text", text: "button" });
    expect(body.input[0].content[1].image_url).toMatch(/^data:image\/png;base64,/);

    expect(masks.map((m) => m.box)).toEqual([
      { x: 211, y: 228, width: 60, height: 27 },
      { x: 155, y: 228, width: 48, height: 27 }
    ]);
    expect(masks[0]).toMatchObject({
      mimeType: "image/png",
      width: 320,
      height: 334,
      label: "button"
    });
    const { data, info } = await sharp(Buffer.from(masks[0].mask))
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([320, 334]);
    const white = (x: number, y: number) =>
      data[(y * info.width + x) * info.channels] === 255;
    // Everything outside the first object's box stays black.
    expect(white(10, 10)).toBe(false);
    expect(white(160, 240)).toBe(false);
    let inside = 0;
    for (let y = 228; y < 255; y++) {
      for (let x = 211; x < 271; x++) if (white(x, y)) inside++;
    }
    expect(inside).toBeGreaterThan(0);
  });

  it("applies maxMasks after decoding", async () => {
    const provider = providerWithFetch(
      vi.fn().mockResolvedValue(jsonResponse({ output_text: SAM_OUTPUT }))
    );
    const masks = await provider.segmentImage(await blankPng(320, 334), {
      model: SAM_MODEL,
      prompt: "button",
      maxMasks: 1
    });
    expect(masks).toHaveLength(1);
  });

  it("answers no match with an empty list", async () => {
    const provider = providerWithFetch(
      vi.fn().mockResolvedValue(
        jsonResponse({ output: [{ type: "message", content: [] }] })
      )
    );
    expect(
      await provider.segmentImage(await blankPng(32, 32), {
        model: SAM_MODEL,
        prompt: "unicorn"
      })
    ).toEqual([]);
  });

  it("builds an object prompt from a box and points", () => {
    expect(
      samPromptText(
        {
          box: { x: 10, y: 20, width: 30, height: 40 },
          points: [
            { x: 20, y: 40, include: true },
            { x: 30, y: 50, include: false }
          ]
        },
        { width: 640, height: 480 }
      )
    ).toBe(
      "<0f>1<|box;x1=10;y1=20;x2=39;y2=59;w=640;h=480|>" +
        "<|point;x=20;y=40;w=640;h=480|>-<|point;x=30;y=50;w=640;h=480|>"
    );
  });

  it("prefers the noun phrase over a box, since SAM refuses both at once", () => {
    expect(
      samPromptText(
        { prompt: " red hat ", box: { x: 0, y: 0, width: 5, height: 5 } },
        { width: 10, height: 10 }
      )
    ).toBe("red hat");
  });

  it("needs a prompt, a box, or points", () => {
    expect(() => samPromptText({}, { width: 10, height: 10 })).toThrow(
      "needs a text prompt"
    );
  });
});
