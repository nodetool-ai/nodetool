import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/external-media-fetch.js", () => ({
  fetchExternalMedia: vi.fn()
}));

import { fetchExternalMedia } from "../../src/external-media-fetch.js";
import { ProcessingContext } from "../../src/context.js";
import { HuggingFaceProvider } from "../../src/providers/huggingface-provider.js";

function jsonResponse(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers }
  });
}

function providerWith(fetchFn: typeof fetch): HuggingFaceProvider {
  return new HuggingFaceProvider({ HF_TOKEN: "hf_tok" }, { fetchFn });
}

function sent(fetchFn: ReturnType<typeof vi.fn>, index = 0) {
  const [url, init] = fetchFn.mock.calls[index] as [string, RequestInit];
  return {
    url,
    init,
    headers: Object.fromEntries(new Headers(init.headers).entries()),
    body: JSON.parse(String(init.body)) as unknown
  };
}

describe("HuggingFaceProvider endpoint calls", () => {
  it("supports endpoint calls", () => {
    expect(providerWith(vi.fn()).supportsEndpointCalls()).toBe(true);
  });

  it("posts a JSON task to the hf-inference model route", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse([{ label: "POSITIVE", score: 0.9 }], { "x-request-id": "hf-req-1" })
    );
    const result = await providerWith(fetchFn).callEndpoint({
      model: "org/model",
      route: "text-classification",
      input: { inputs: "great", parameters: { top_k: 2 } }
    });

    expect(result).toEqual({
      output: [{ label: "POSITIVE", score: 0.9 }],
      requestId: "hf-req-1"
    });
    const request = sent(fetchFn);
    expect(request.url).toBe(
      "https://router.huggingface.co/hf-inference/models/org/model"
    );
    expect(request.init.method).toBe("POST");
    expect(request.headers).toEqual({
      authorization: "Bearer hf_tok",
      "content-type": "application/json"
    });
    expect(request.body).toEqual({ inputs: "great", parameters: { top_k: 2 } });
  });

  it("posts chat completion to the OpenAI-compatible route with the model", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "hi" } }] })
    );
    const result = await providerWith(fetchFn).callEndpoint({
      model: "meta/llama",
      route: "chat-completion",
      input: { messages: [{ role: "user", content: "hello" }], max_tokens: 5 }
    });

    expect(result.requestId).toBeNull();
    const request = sent(fetchFn);
    expect(request.url).toBe("https://router.huggingface.co/v1/chat/completions");
    expect(request.body).toEqual({
      model: "meta/llama",
      messages: [{ role: "user", content: "hello" }],
      max_tokens: 5
    });
  });

  it("returns media task bytes as { data, mimeType } and asks for media", async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const fetchFn = vi.fn(
      async () =>
        new Response(png, { status: 200, headers: { "content-type": "image/png" } })
    );
    const result = await providerWith(fetchFn).callEndpoint({
      model: "flux/schnell",
      route: "text-to-image",
      input: { inputs: "a cat" }
    });

    expect(result.output).toEqual({ data: png, mimeType: "image/png" });
    expect(sent(fetchFn).headers.accept).toBe(
      "image/png, video/mp4, application/octet-stream"
    );
  });

  it("decodes a base64 JSON envelope from a media task", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ video: Buffer.from("MP4DATA").toString("base64") })
    );
    const result = await providerWith(fetchFn).callEndpoint({
      model: "wan/t2v",
      route: "text-to-video",
      input: { inputs: "a dog" }
    });

    const output = result.output as { data: Uint8Array; mimeType: string };
    expect(Buffer.from(output.data).toString()).toBe("MP4DATA");
    expect(output.mimeType).toBe("video/mp4");
  });

  it("rejects a media task's JSON answer that carries no media", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ error: "busy" }));
    await expect(
      providerWith(fetchFn).callEndpoint({
        model: "img/model",
        route: "image-to-image",
        input: { inputs: "x" }
      })
    ).rejects.toThrow('Hugging Face returned JSON without media for "img/model"');
  });

  it("reports the model, status and body of a failed call", async () => {
    const fetchFn = vi.fn(async () => new Response("model not found", { status: 404 }));
    await expect(
      providerWith(fetchFn).callEndpoint({
        model: "bad/model",
        route: "fill-mask",
        input: { inputs: "x" }
      })
    ).rejects.toThrow('Hugging Face inference failed for "bad/model" (404): model not found');
  });

  it("rejects a missing or unknown route before any request", async () => {
    const fetchFn = vi.fn();
    const provider = providerWith(fetchFn);
    await expect(
      provider.callEndpoint({ model: "m", input: {} })
    ).rejects.toThrow(/route must be a task id .* got none/);
    await expect(
      provider.callEndpoint({ model: "m", route: "text-to-3d", input: {} })
    ).rejects.toThrow(/got "text-to-3d"/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("passes the abort signal to fetch", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}));
    const controller = new AbortController();
    await providerWith(fetchFn).callEndpoint({
      model: "m",
      route: "summarization",
      input: { inputs: "x" },
      signal: controller.signal
    });
    expect(sent(fetchFn).init.signal).toBe(controller.signal);
  });

  it("keeps media bytes out of the prediction message through the seam", async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const fetchFn = vi.fn(
      async () =>
        new Response(png, {
          status: 200,
          headers: { "content-type": "image/png", "x-request-id": "hf-req-9" }
        })
    );
    const provider = providerWith(fetchFn);
    const ctx = new ProcessingContext({ jobId: "job-1" });
    ctx.setProviderResolver(async () => provider);
    const longBase64 = "A".repeat(5000);

    const result = await ctx.callProviderEndpoint({
      provider: "huggingface",
      capability: "image_to_image",
      model: "img/model",
      route: "image-to-image",
      input: { inputs: longBase64 }
    });

    expect(result.requestId).toBe("hf-req-9");
    const completed = ctx
      .getMessages()
      .filter((message) => message.type === "prediction")
      .at(-1);
    expect(completed).toMatchObject({
      status: "completed",
      provider: "huggingface",
      capability: "image_to_image",
      model: "img/model",
      data: null,
      params: { inputs: { truncated: true, length: 5000 } },
      receipt: { provider_request_id: "hf-req-9" }
    });
  });
});

describe("HuggingFaceProvider media transfer", () => {
  it("has no upload step: media travels inline as base64", async () => {
    await expect(
      providerWith(vi.fn()).uploadMedia({
        bytes: new Uint8Array([1]),
        mimeType: "image/png"
      })
    ).rejects.toThrow("huggingface does not support media uploads");
  });

  it("downloads a result URL through the media egress policy", async () => {
    vi.mocked(fetchExternalMedia).mockResolvedValueOnce(
      new Response(new Uint8Array([4, 5, 6]), { status: 200 })
    );
    const bytes = await providerWith(vi.fn()).downloadMedia(
      "https://cdn.example/out.png"
    );
    expect(Array.from(bytes)).toEqual([4, 5, 6]);
    expect(fetchExternalMedia).toHaveBeenCalledWith(
      "https://cdn.example/out.png",
      undefined
    );
  });
});
