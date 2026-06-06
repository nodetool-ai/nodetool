import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanParams,
  getHfToken,
  hfChatCompletion,
  hfPipelineBinary,
  hfPipelineJson,
  imageRefFromBase64,
  imageRefFromBytes,
  isRefSet,
  refToBase64,
  refToBytes,
  videoRefFromBytes
} from "../src/huggingface-base.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getHfToken", () => {
  it("reads HF_TOKEN from secrets", () => {
    expect(getHfToken({ HF_TOKEN: "hf_abc" })).toBe("hf_abc");
  });

  it("throws a helpful error when missing", () => {
    const prev = process.env.HF_TOKEN;
    delete process.env.HF_TOKEN;
    try {
      expect(() => getHfToken({})).toThrow(/HF_TOKEN is not configured/);
    } finally {
      if (prev !== undefined) process.env.HF_TOKEN = prev;
    }
  });
});

describe("media ref helpers", () => {
  it("isRefSet detects data/uri presence", () => {
    expect(isRefSet(undefined)).toBe(false);
    expect(isRefSet({ type: "image" })).toBe(false);
    expect(isRefSet({ type: "image", uri: "http://x" })).toBe(true);
    expect(isRefSet({ type: "image", data: "abc" })).toBe(true);
  });

  it("refToBytes decodes a data URI", async () => {
    const bytes = await refToBytes({
      data: "data:image/png;base64," + Buffer.from("hello").toString("base64")
    });
    expect(Buffer.from(bytes).toString()).toBe("hello");
  });

  it("refToBytes decodes raw base64 in data", async () => {
    const bytes = await refToBytes({
      data: Buffer.from("world").toString("base64")
    });
    expect(Buffer.from(bytes).toString()).toBe("world");
  });

  it("refToBytes passes Uint8Array through", async () => {
    const src = new Uint8Array([1, 2, 3]);
    expect(await refToBytes({ data: src })).toBe(src);
  });

  it("refToBase64 round-trips bytes", async () => {
    const b64 = await refToBase64({ data: new Uint8Array([1, 2, 3]) });
    expect(Buffer.from(b64, "base64")).toEqual(Buffer.from([1, 2, 3]));
  });

  it("refToBytes throws on empty ref", async () => {
    await expect(refToBytes({})).rejects.toThrow(/empty/);
  });
});

describe("output ref builders", () => {
  it("imageRefFromBytes emits raw base64 with content_type (no data: prefix)", () => {
    const ref = imageRefFromBytes(new Uint8Array([1, 2, 3]), "image/jpeg");
    expect(ref.type).toBe("image");
    expect(ref.content_type).toBe("image/jpeg");
    expect(String(ref.data)).not.toMatch(/^data:/);
    expect(ref.data).toBe(Buffer.from([1, 2, 3]).toString("base64"));
  });

  it("videoRefFromBytes emits raw base64 with content_type and format", () => {
    const ref = videoRefFromBytes(new Uint8Array([1]), "video/webm");
    expect(ref.type).toBe("video");
    expect(ref.content_type).toBe("video/webm");
    expect(ref.format).toBe("webm");
    expect(String(ref.data)).not.toMatch(/^data:/);
    expect(ref.data).toBe(Buffer.from([1]).toString("base64"));
  });

  it("imageRefFromBase64 strips an existing data prefix and stores raw base64", () => {
    const ref = imageRefFromBase64("data:image/png;base64,QUJD");
    expect(ref.data).toBe("QUJD");
    expect(ref.content_type).toBe("image/png");
  });
});

describe("cleanParams", () => {
  it("drops null/undefined/empty values", () => {
    expect(
      cleanParams({ a: 1, b: null, c: undefined, d: "", e: 0, f: false })
    ).toEqual({ a: 1, e: 0, f: false });
  });
});

describe("HTTP helpers", () => {
  it("hfPipelineJson posts to the hf-inference route and parses JSON", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify([{ label: "POSITIVE", score: 0.9 }]), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );

    const out = await hfPipelineJson("hf_tok", "some/model", { inputs: "hi" });
    expect(out).toEqual([{ label: "POSITIVE", score: 0.9 }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://router.huggingface.co/hf-inference/models/some/model");
    expect((init as RequestInit).method).toBe("POST");
    expect(
      (init as RequestInit).headers as Record<string, string>
    ).toMatchObject({ Authorization: "Bearer hf_tok" });
  });

  it("hfPipelineJson surfaces API errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("model not found", { status: 404 })
    );
    await expect(
      hfPipelineJson("hf_tok", "bad/model", { inputs: "hi" })
    ).rejects.toThrow(/bad\/model.*404/);
  });

  it("hfPipelineBinary returns bytes and mime type", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: { "content-type": "image/png" }
      })
    );
    const result = await hfPipelineBinary("hf_tok", "img/model", {
      inputs: "a cat"
    });
    expect(result.mimeType).toBe("image/png");
    expect(Array.from(result.bytes)).toEqual([137, 80, 78, 71]);
  });

  it("hfPipelineBinary decodes a base64 JSON envelope", async () => {
    const payload = { image: Buffer.from("PNGDATA").toString("base64") };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const result = await hfPipelineBinary("hf_tok", "img/model", {
      inputs: "a cat"
    });
    expect(Buffer.from(result.bytes).toString()).toBe("PNGDATA");
  });

  it("hfChatCompletion posts to the OpenAI-compatible route", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Hello there" } }],
          usage: { prompt_tokens: 3, completion_tokens: 2 }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const result = await hfChatCompletion("hf_tok", {
      model: "m",
      messages: [{ role: "user", content: "hi" }]
    });
    expect(result.content).toBe("Hello there");
    expect(result.usage?.prompt_tokens).toBe(3);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://router.huggingface.co/v1/chat/completions"
    );
  });
});
