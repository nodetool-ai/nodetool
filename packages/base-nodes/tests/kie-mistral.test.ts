import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ChatComplete,
  CodeComplete,
  Embedding,
  ImageToText,
  OCR
} from "../src/nodes/mistral.js";

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  delete process.env.MISTRAL_API_KEY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.MISTRAL_API_KEY;
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

const secrets = { _secrets: { MISTRAL_API_KEY: "test-key" } };

// ── ChatComplete ───────────────────────────────────────────────────────────

describe("ChatComplete", () => {
  it("returns chat completion", async () => {
    const node = new ChatComplete();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: "Hello back!" } }]
      })
    );

    node.assign({
      prompt: "Hello"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toBe("Hello back!");
  });

  it("includes system prompt when provided", async () => {
    const node = new ChatComplete();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: "response" } }]
      })
    );

    node.assign({
      prompt: "test",
      system_prompt: "You are helpful"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toBe("You are helpful");
  });

  it("throws on empty prompt", async () => {
    const node = new ChatComplete();

    node.assign({
      prompt: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Prompt cannot be empty");
  });

  it("throws when API key missing", async () => {
    const node = new ChatComplete();

    node.assign({
      prompt: "hi"
    });

    await expect(node.process()).rejects.toThrow(
      "Mistral API key not configured"
    );
  });

  it("throws on API error", async () => {
    const node = new ChatComplete();
    mockFetch.mockResolvedValueOnce(jsonResponse("rate limit", 429));

    node.assign({
      prompt: "hi"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Mistral API error 429");
  });

  it("throws on empty choices", async () => {
    const node = new ChatComplete();
    mockFetch.mockResolvedValueOnce(jsonResponse({ choices: [] }));

    node.assign({
      prompt: "hi"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "No response from Mistral API"
    );
  });

  it("handles null content in response", async () => {
    const node = new ChatComplete();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: null } }] })
    );

    node.assign({
      prompt: "hi"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toBe("");
  });

  it("uses env var API key", async () => {
    process.env.MISTRAL_API_KEY = "env-key";
    const node = new ChatComplete();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: "ok" } }] })
    );

    node.assign({
      prompt: "hi"
    });

    const result = await node.process();
    expect(result.output).toBe("ok");
  });
});

// ── CodeComplete ───────────────────────────────────────────────────────────

describe("CodeComplete", () => {
  it("returns code completion without suffix (chat mode)", async () => {
    const node = new CodeComplete();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: "def hello(): pass" } }]
      })
    );

    node.assign({
      prompt: "write hello"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toBe("def hello(): pass");
  });

  it("uses FIM endpoint with suffix", async () => {
    const node = new CodeComplete();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: "middle part" } }]
      })
    );

    node.assign({
      prompt: "def hello():",
      suffix: "return result"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("fim/completions");
  });

  it("uses chat endpoint without suffix", async () => {
    const node = new CodeComplete();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: "code" } }]
      })
    );

    node.assign({
      prompt: "code"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("chat/completions");
  });

  it("throws on empty prompt", async () => {
    const node = new CodeComplete();

    node.assign({
      prompt: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Prompt cannot be empty");
  });

  it("throws on empty choices", async () => {
    const node = new CodeComplete();
    mockFetch.mockResolvedValueOnce(jsonResponse({ choices: [] }));

    node.assign({
      prompt: "code"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "No response from Mistral API"
    );
  });
});

// ── Embedding ──────────────────────────────────────────────────────────────

describe("Embedding", () => {
  it("returns embedding for single chunk", async () => {
    const node = new Embedding();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [{ embedding: [0.1, 0.2, 0.3] }]
      })
    );

    node.assign({
      input: "hello"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.data).toEqual([0.1, 0.2, 0.3]);
    expect(output.shape).toEqual([3]);
    expect(output.dtype).toBe("float32");
  });

  it("averages multiple chunk embeddings", async () => {
    const node = new Embedding();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [{ embedding: [2.0, 4.0] }, { embedding: [4.0, 6.0] }]
      })
    );

    node.assign({
      input: "a".repeat(5000),
      chunk_size: 4096
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect((output.data as number[])[0]).toBeCloseTo(3.0);
    expect((output.data as number[])[1]).toBeCloseTo(5.0);
  });

  it("throws on empty input", async () => {
    const node = new Embedding();

    node.assign({
      input: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Input text cannot be empty");
  });

  it("throws on empty embeddings response", async () => {
    const node = new Embedding();
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

    node.assign({
      input: "hi"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "No embeddings from Mistral API"
    );
  });
});

// ── ImageToText ────────────────────────────────────────────────────────────

describe("ImageToText", () => {
  it("returns text description from base64 image", async () => {
    const node = new ImageToText();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: "A cat sitting on a mat" } }]
      })
    );
    const b64 = Buffer.from("fake-image").toString("base64");

    node.assign({
      image: { data: b64 },
      prompt: "Describe this"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toBe("A cat sitting on a mat");
  });

  it("handles Uint8Array image data", async () => {
    const node = new ImageToText();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: "description" } }]
      })
    );

    node.assign({
      image: { data: new Uint8Array([1, 2, 3]) },
      prompt: "Describe"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toBe("description");
  });

  it("handles image with uri", async () => {
    const node = new ImageToText();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: "from uri" } }]
      })
    );

    node.assign({
      image: { uri: "https://example.com/img.png" },
      prompt: "Describe"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toBe("from uri");
  });

  it("throws when image has no data or uri", async () => {
    const node = new ImageToText();

    node.assign({
      image: {},
      prompt: "Describe"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Image is required");
  });

  it("throws on empty prompt", async () => {
    const node = new ImageToText();
    const b64 = Buffer.from("img").toString("base64");

    node.assign({
      image: { data: b64 },
      prompt: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Prompt cannot be empty");
  });

  it("throws on empty choices", async () => {
    const node = new ImageToText();
    const b64 = Buffer.from("img").toString("base64");
    mockFetch.mockResolvedValueOnce(jsonResponse({ choices: [] }));

    node.assign({
      image: { data: b64 },
      prompt: "desc"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "No response from Mistral API"
    );
  });
});

// ── OCR ────────────────────────────────────────────────────────────────────

describe("OCR", () => {
  it("returns extracted text", async () => {
    const node = new OCR();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: "Hello World" } }]
      })
    );
    const b64 = Buffer.from("screenshot").toString("base64");

    node.assign({
      image: { data: b64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toBe("Hello World");
  });

  it("throws when image has no data or uri", async () => {
    const node = new OCR();

    node.assign({
      image: {}
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Image is required");
  });

  it("throws on empty choices", async () => {
    const node = new OCR();
    const b64 = Buffer.from("img").toString("base64");
    mockFetch.mockResolvedValueOnce(jsonResponse({ choices: [] }));

    node.assign({
      image: { data: b64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "No response from Mistral API"
    );
  });

  it("throws on API error", async () => {
    const node = new OCR();
    const b64 = Buffer.from("img").toString("base64");
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 500));

    node.assign({
      image: { data: b64 }
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Mistral API error 500");
  });
});

// ── Defaults coverage ────────────────────────────────────────────────────

describe("Node defaults coverage", () => {
  it("ChatComplete defaults", () => {
    const node = new ChatComplete();
    const d = node.serialize();
    expect(d.model).toBe("mistral-small-latest");
    expect(d.prompt).toBe("");
    expect(d.system_prompt).toBe("");
    expect(d.temperature).toBe(0.7);
    expect(d.max_tokens).toBe(1024);
  });

  it("CodeComplete defaults", () => {
    const node = new CodeComplete();
    const d = node.serialize();
    expect(d.prompt).toBe("");
    expect(d.suffix).toBe("");
    expect(d.temperature).toBe(0.0);
    expect(d.max_tokens).toBe(2048);
  });

  it("Embedding defaults", () => {
    const node = new Embedding();
    const d = node.serialize();
    expect(d.input).toBe("");
    expect(d.model).toBe("mistral-embed");
    expect(d.chunk_size).toBe(4096);
  });

  it("ImageToText defaults", () => {
    const node = new ImageToText();
    const d = node.serialize();
    expect(d.prompt).toBe("Describe this image in detail.");
    expect(d.model).toBe("pixtral-large-latest");
    expect(d.temperature).toBe(0.3);
    expect(d.max_tokens).toBe(1024);
  });

  it("OCR defaults", () => {
    const node = new OCR();
    const d = node.serialize();
    expect(d.model).toBe("pixtral-large-latest");
  });

  it("imageToDataUri throws when image has no data or uri", async () => {
    const node = new ImageToText();

    node.assign({
      image: { data: 42 },
      prompt: "desc"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "Image must include data or uri"
    );
  });
});
