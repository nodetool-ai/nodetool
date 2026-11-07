/**
 * Request parity for the Hugging Face nodes.
 *
 * The expected requests below were recorded from the pack's own transport
 * before the nodes moved onto the runtime HuggingFaceProvider. Each node runs
 * against the real provider with its fetch injected, so the test pins what
 * reaches the wire: URL, method, headers and body.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HuggingFaceProvider, ProcessingContext } from "@nodetool-ai/runtime";
import { ChatCompletionNode, TextClassificationNode } from "../src/nodes/text.js";
import { ImageToImageNode, TextToImageNode } from "../src/nodes/image.js";
import { AutomaticSpeechRecognitionNode } from "../src/nodes/audio.js";

const TOKEN = "hf_parity";

interface WireRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

const fetchMock = vi.fn<typeof fetch>();

function wire(index = 0): WireRequest {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return {
    url,
    method: String(init.method),
    headers: Object.fromEntries(new Headers(init.headers).entries()),
    body: JSON.parse(String(init.body))
  };
}

function runContext(): ProcessingContext {
  const provider = new HuggingFaceProvider(
    { HF_TOKEN: TOKEN },
    { fetchFn: fetchMock }
  );
  const ctx = new ProcessingContext({ jobId: "job-parity" });
  ctx.setProviderResolver(async () => provider);
  return ctx;
}

function withSecrets<T extends { setDynamic: (k: string, v: unknown) => void }>(
  node: T
): T {
  node.setDynamic("_secrets", { HF_TOKEN: TOKEN });
  return node;
}

const jsonHeaders = {
  authorization: `Bearer ${TOKEN}`,
  "content-type": "application/json"
};

beforeEach(() => {
  fetchMock.mockReset();
  // No request may leave the process: anything that bypasses the provider
  // lands on the same mock.
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Hugging Face request parity", () => {
  it("TextToImage posts the pipeline body with the binary Accept header", async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    fetchMock.mockImplementation(
      async () =>
        new Response(png, { status: 200, headers: { "content-type": "image/png" } })
    );
    const node = withSecrets(
      new TextToImageNode({
        prompt: "a lighthouse at dusk",
        negative_prompt: "blurry",
        width: 768,
        height: 512,
        guidance_scale: 3.5,
        num_inference_steps: 4,
        seed: 7
      })
    );

    const out = await node.process(runContext());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wire()).toEqual({
      url: "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell",
      method: "POST",
      headers: {
        ...jsonHeaders,
        accept: "image/png, video/mp4, application/octet-stream"
      },
      body: {
        inputs: "a lighthouse at dusk",
        parameters: {
          negative_prompt: "blurry",
          width: 768,
          height: 512,
          guidance_scale: 3.5,
          num_inference_steps: 4,
          seed: 7
        }
      }
    });
    expect(out.output).toEqual({
      type: "image",
      data: Buffer.from(png).toString("base64"),
      content_type: "image/png"
    });
  });

  it("ImageToImage sends the source image as base64 inputs", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 1]);
    fetchMock.mockImplementation(
      async () =>
        new Response(png, { status: 200, headers: { "content-type": "image/png" } })
    );
    const source = Buffer.from("source-image").toString("base64");
    const node = withSecrets(
      new ImageToImageNode({
        image: { type: "image", data: source },
        prompt: "make it snow"
      })
    );

    await node.process(runContext());

    expect(wire()).toEqual({
      url: "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-Kontext-dev",
      method: "POST",
      headers: {
        ...jsonHeaders,
        accept: "image/png, video/mp4, application/octet-stream"
      },
      body: { inputs: source, parameters: { prompt: "make it snow" } }
    });
  });

  it("AutomaticSpeechRecognition sends base64 audio and timestamp parameters", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ text: "hello", chunks: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
    );
    const audio = Buffer.from("RIFF-audio").toString("base64");
    const node = withSecrets(
      new AutomaticSpeechRecognitionNode({
        audio: { type: "audio", data: audio },
        return_timestamps: true
      })
    );

    const out = await node.process(runContext());

    expect(wire()).toEqual({
      url: "https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3",
      method: "POST",
      headers: jsonHeaders,
      body: { inputs: audio, parameters: { return_timestamps: true } }
    });
    expect(out).toEqual({ output: "hello", chunks: [] });
  });

  it("TextClassification posts JSON to the pipeline route", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify([{ label: "POSITIVE", score: 0.9 }]), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
    );
    const node = withSecrets(new TextClassificationNode({ inputs: "great" }));

    const out = await node.process(runContext());

    const request = wire();
    expect(request.url).toMatch(
      /^https:\/\/router\.huggingface\.co\/hf-inference\/models\//
    );
    expect(request.method).toBe("POST");
    expect(request.headers).toEqual(jsonHeaders);
    expect(request.body).toMatchObject({ inputs: "great" });
    expect(out.output).toBe("POSITIVE");
  });

  it("ChatCompletion posts the OpenAI-compatible body to /v1/chat/completions", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "Hi there" } }] }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );
    const node = withSecrets(
      new ChatCompletionNode({ prompt: "Say hi", system: "Be brief" })
    );

    const out = await node.process(runContext());

    expect(wire()).toEqual({
      url: "https://router.huggingface.co/v1/chat/completions",
      method: "POST",
      headers: jsonHeaders,
      body: {
        model: "meta-llama/Llama-3.1-8B-Instruct",
        messages: [
          { role: "system", content: "Be brief" },
          { role: "user", content: "Say hi" }
        ],
        max_tokens: 512,
        temperature: 0.7,
        top_p: 1
      }
    });
    expect(out.output).toBe("Hi there");
  });

  it("reports a failed request with the model and status", async () => {
    fetchMock.mockImplementation(
      async () => new Response("model is loading", { status: 503 })
    );
    const node = withSecrets(new TextClassificationNode({ inputs: "x", model: "a/b" }));

    await expect(node.process(runContext())).rejects.toThrow(
      'Hugging Face inference failed for "a/b" (503): model is loading'
    );
  });
});
