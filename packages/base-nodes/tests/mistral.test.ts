import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import {
  ChatComplete,
  CodeComplete,
  Embedding,
  ImageToText,
  OCR,
  MISTRAL_NODES
} from "../src/nodes/mistral.js";

const originalFetch = global.fetch;
const mockFetch = vi.fn();
global.fetch = mockFetch;

afterAll(() => {
  global.fetch = originalFetch;
});

function mockChatResponse(content: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }]
    })
  });
}

// ---------------------------------------------------------------------------
// ChatComplete
// ---------------------------------------------------------------------------
describe("ChatComplete", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(ChatComplete.nodeType).toBe("mistral.text.ChatComplete");
    expect(ChatComplete.title).toBe("Chat Complete");
  });

  it("returns expected defaults", () => {
    const d = new ChatComplete().serialize();
    expect(d.model).toBe("mistral-small-latest");
    expect(d.prompt).toBe("");
    expect(d.temperature).toBe(0.7);
    expect(d.max_tokens).toBe(1024);
  });

  it("throws without API key", async () => {
    const node = new ChatComplete();
    node.assign({ prompt: "hi" });
    await expect(node.process()).rejects.toThrow(/Mistral API key/i);
  });

  it("throws when prompt is empty", async () => {
    const node = new ChatComplete();
    node.assign({ prompt: "" });
    node.setDynamic("_secrets", { MISTRAL_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/Prompt cannot be empty/i);
  });

  it("calls chat/completions and returns output", async () => {
    mockChatResponse("Hello back!");

    const node = new ChatComplete();
    node.assign({
      prompt: "Hello"
    });
    node.setDynamic("_secrets", { MISTRAL_API_KEY: "test-key" });
    const result = await node.process();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.mistral.ai/v1/chat/completions");
    expect(opts.headers.Authorization).toBe("Bearer test-key");

    const body = JSON.parse(opts.body);
    expect(body.model).toBe("mistral-small-latest");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");

    expect(result.output).toBe("Hello back!");
  });

  it("includes system prompt when provided", async () => {
    mockChatResponse("response");

    const node = new ChatComplete();
    node.assign({
      prompt: "Hello",
      system_prompt: "You are helpful"
    });
    node.setDynamic("_secrets", { MISTRAL_API_KEY: "k" });
    await node.process();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toBe("You are helpful");
  });

  it("handles API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "Rate limited"
    });

    const node = new ChatComplete();
    node.assign({ prompt: "hi" });
    node.setDynamic("_secrets", { MISTRAL_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/Mistral API error 429/);
  });
});

// ---------------------------------------------------------------------------
// CodeComplete
// ---------------------------------------------------------------------------
describe("CodeComplete", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(CodeComplete.nodeType).toBe("mistral.text.CodeComplete");
    expect(CodeComplete.title).toBe("Code Complete");
  });

  it("returns expected defaults", () => {
    const d = new CodeComplete().serialize();
    expect(d.prompt).toBe("");
    expect(d.suffix).toBe("");
    expect(d.temperature).toBe(0.0);
    expect(d.max_tokens).toBe(2048);
  });

  it("uses FIM endpoint when suffix is provided", async () => {
    mockChatResponse("completed code");

    const node = new CodeComplete();
    node.assign({
      prompt: "def hello():",
      suffix: "  return result"
    });
    node.setDynamic("_secrets", { MISTRAL_API_KEY: "k" });
    await node.process();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.mistral.ai/v1/fim/completions");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("codestral-latest");
    expect(body.prompt).toBe("def hello():");
    expect(body.suffix).toBe("  return result");
  });

  it("uses chat/completions when no suffix", async () => {
    mockChatResponse("code output");

    const node = new CodeComplete();
    node.assign({
      prompt: "Write a sort function"
    });
    node.setDynamic("_secrets", { MISTRAL_API_KEY: "k" });
    await node.process();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.mistral.ai/v1/chat/completions");
  });
});

// ---------------------------------------------------------------------------
// Embedding
// ---------------------------------------------------------------------------
describe("Embedding (Mistral)", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(Embedding.nodeType).toBe("mistral.embeddings.Embedding");
    expect(Embedding.title).toBe("Embedding");
  });

  it("returns expected defaults", () => {
    const d = new Embedding().serialize();
    expect(d.input).toBe("");
    expect(d.model).toBe("mistral-embed");
    expect(d.chunk_size).toBe(4096);
  });

  it("throws when input is empty", async () => {
    const node = new Embedding();
    node.assign({ input: "" });
    node.setDynamic("_secrets", { MISTRAL_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/Input text cannot be empty/i);
  });

  it("returns embedding data with shape", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.1, 0.2, 0.3] }]
      })
    });

    const node = new Embedding();
    node.assign({
      input: "test"
    });
    node.setDynamic("_secrets", { MISTRAL_API_KEY: "k" });
    const result = await node.process();

    const output = result.output as Record<string, unknown>;
    expect(output.data).toEqual([0.1, 0.2, 0.3]);
    expect(output.shape).toEqual([3]);
    expect(output.dtype).toBe("float32");
  });

  it("chunks long input and averages embeddings", async () => {
    // With chunk_size=4, "abcdefgh" becomes 2 chunks
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: [1.0, 2.0] }, { embedding: [3.0, 4.0] }]
      })
    });

    const node = new Embedding();
    node.assign({
      input: "abcdefgh",
      chunk_size: 4
    });
    node.setDynamic("_secrets", { MISTRAL_API_KEY: "k" });
    const result = await node.process();

    const output = result.output as Record<string, unknown>;
    const data = output.data as number[];
    expect(data[0]).toBe(2.0); // (1+3)/2
    expect(data[1]).toBe(3.0); // (2+4)/2
  });
});

// ---------------------------------------------------------------------------
// ImageToText
// ---------------------------------------------------------------------------
describe("ImageToText (Mistral)", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(ImageToText.nodeType).toBe("mistral.vision.ImageToText");
    expect(ImageToText.title).toBe("Image To Text");
  });

  it("returns expected defaults", () => {
    const d = new ImageToText().serialize();
    expect(d.model).toBe("pixtral-large-latest");
    expect(d.temperature).toBe(0.3);
  });

  it("throws when image has no data or uri", async () => {
    const node = new ImageToText();
    node.assign({ image: {} });
    node.setDynamic("_secrets", { MISTRAL_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/Image is required/i);
  });

  it("sends image as data URI and returns text", async () => {
    mockChatResponse("A cat sitting on a mat");

    const node = new ImageToText();
    node.assign({
      image: { data: "abc123" },
      prompt: "What is this?"
    });
    node.setDynamic("_secrets", { MISTRAL_API_KEY: "k" });
    const result = await node.process();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("pixtral-large-latest");
    const content = body.messages[0].content;
    expect(content[0].type).toBe("image_url");
    expect(content[0].image_url.url).toContain("data:image/png;base64,abc123");
    expect(content[1].type).toBe("text");

    expect(result.output).toBe("A cat sitting on a mat");
  });

  it("handles image with uri", async () => {
    mockChatResponse("description");

    const node = new ImageToText();
    node.assign({
      image: { uri: "https://example.com/img.png" }
    });
    node.setDynamic("_secrets", { MISTRAL_API_KEY: "k" });
    await node.process();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const imgUrl = body.messages[0].content[0].image_url.url;
    expect(imgUrl).toBe("https://example.com/img.png");
  });
});

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------
describe("OCR (Mistral)", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(OCR.nodeType).toBe("mistral.vision.OCR");
    expect(OCR.title).toBe("OCR");
  });

  it("returns expected defaults", () => {
    const d = new OCR().serialize();
    expect(d.model).toBe("pixtral-large-latest");
  });

  it("throws when image has no data or uri", async () => {
    const node = new OCR();
    node.assign({ image: {} });
    node.setDynamic("_secrets", { MISTRAL_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/Image is required/i);
  });

  it("extracts text from image", async () => {
    mockChatResponse("Extracted document text");

    const node = new OCR();
    node.assign({
      image: { data: "imgdata" }
    });
    node.setDynamic("_secrets", { MISTRAL_API_KEY: "k" });
    const result = await node.process();

    expect(result.output).toBe("Extracted document text");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.0);
    expect(body.max_tokens).toBe(8192);
  });
});

// ---------------------------------------------------------------------------
// MISTRAL_NODES export
// ---------------------------------------------------------------------------
describe("MISTRAL_NODES", () => {
  it("exports all 5 nodes", () => {
    expect(MISTRAL_NODES).toHaveLength(5);
    const types = MISTRAL_NODES.map((n) => n.nodeType);
    expect(types).toContain("mistral.text.ChatComplete");
    expect(types).toContain("mistral.text.CodeComplete");
    expect(types).toContain("mistral.embeddings.Embedding");
    expect(types).toContain("mistral.vision.ImageToText");
    expect(types).toContain("mistral.vision.OCR");
  });
});
