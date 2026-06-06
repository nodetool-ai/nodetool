import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import {
  ChatComplete,
  WebSearch,
  ImageToText,
  GenerateImage,
  XAI_NODES
} from "@nodetool-ai/llm-nodes/xai";

const originalFetch = global.fetch;
const mockFetch = vi.fn();
global.fetch = mockFetch;

const savedXaiKey = process.env.XAI_API_KEY;

afterAll(() => {
  global.fetch = originalFetch;
  if (savedXaiKey === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = savedXaiKey;
});

function mockChatResponse(content: string, extra: Record<string, unknown> = {}) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }], ...extra })
  });
}

// ---------------------------------------------------------------------------
// ChatComplete
// ---------------------------------------------------------------------------
describe("ChatComplete", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    delete process.env.XAI_API_KEY;
  });

  it("has correct metadata", () => {
    expect(ChatComplete.nodeType).toBe("xai.text.ChatComplete");
    expect(ChatComplete.title).toBe("Chat Complete");
    expect(ChatComplete.requiredSettings).toEqual(["XAI_API_KEY"]);
  });

  it("returns expected defaults", () => {
    const d = new ChatComplete().serialize();
    expect(d.model).toBe("grok-4");
    expect(d.prompt).toBe("");
    expect(d.temperature).toBe(0.7);
    expect(d.max_tokens).toBe(1024);
  });

  it("throws without API key", async () => {
    const node = new ChatComplete();
    node.assign({ prompt: "hi" });
    await expect(node.process()).rejects.toThrow(/XAI_API_KEY/i);
  });

  it("throws when prompt is empty", async () => {
    const node = new ChatComplete();
    node.assign({ prompt: "" });
    node.setDynamic("_secrets", { XAI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/Prompt cannot be empty/i);
  });

  it("calls chat/completions and returns output", async () => {
    mockChatResponse("Hello from Grok!");

    const node = new ChatComplete();
    node.assign({ prompt: "Hello" });
    node.setDynamic("_secrets", { XAI_API_KEY: "test-key" });
    const result = await node.process();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.x.ai/v1/chat/completions");
    expect(opts.headers.Authorization).toBe("Bearer test-key");

    const body = JSON.parse(opts.body);
    expect(body.model).toBe("grok-4");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");

    expect(result.output).toBe("Hello from Grok!");
  });

  it("includes system prompt when provided", async () => {
    mockChatResponse("response");

    const node = new ChatComplete();
    node.assign({ prompt: "Hello", system_prompt: "You are helpful" });
    node.setDynamic("_secrets", { XAI_API_KEY: "k" });
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
    node.setDynamic("_secrets", { XAI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/xAI API error 429/);
  });
});

// ---------------------------------------------------------------------------
// WebSearch
// ---------------------------------------------------------------------------
describe("WebSearch", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    delete process.env.XAI_API_KEY;
  });

  it("has correct metadata", () => {
    expect(WebSearch.nodeType).toBe("xai.text.WebSearch");
    expect(WebSearch.title).toBe("Web Search");
  });

  it("sends search_parameters and returns citations", async () => {
    mockChatResponse("Answer with sources", {
      citations: ["https://x.ai", "https://example.com"]
    });

    const node = new WebSearch();
    node.assign({ query: "What is xAI?" });
    node.setDynamic("_secrets", { XAI_API_KEY: "k" });
    const result = await node.process();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.x.ai/v1/chat/completions");
    const body = JSON.parse(opts.body);
    expect(body.search_parameters.mode).toBe("auto");
    expect(body.search_parameters.return_citations).toBe(true);
    expect(body.search_parameters.max_search_results).toBe(10);

    expect(result.output).toBe("Answer with sources");
    expect(result.citations).toEqual(["https://x.ai", "https://example.com"]);
  });

  it("returns empty citations when none present", async () => {
    mockChatResponse("No sources");

    const node = new WebSearch();
    node.assign({ query: "hi" });
    node.setDynamic("_secrets", { XAI_API_KEY: "k" });
    const result = await node.process();

    expect(result.citations).toEqual([]);
  });

  it("throws when query is empty", async () => {
    const node = new WebSearch();
    node.assign({ query: "" });
    node.setDynamic("_secrets", { XAI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/Search query cannot be empty/i);
  });
});

// ---------------------------------------------------------------------------
// ImageToText
// ---------------------------------------------------------------------------
describe("ImageToText", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    delete process.env.XAI_API_KEY;
  });

  it("has correct metadata", () => {
    expect(ImageToText.nodeType).toBe("xai.vision.ImageToText");
    expect(ImageToText.title).toBe("Image To Text");
  });

  it("throws when image missing", async () => {
    const node = new ImageToText();
    node.setDynamic("_secrets", { XAI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/Image is required/i);
  });

  it("sends image_url content and returns text", async () => {
    mockChatResponse("A cat sitting on a mat");

    const node = new ImageToText();
    node.assign({
      image: { type: "image", data: "abc123", uri: "", asset_id: null },
      prompt: "What is this?"
    });
    node.setDynamic("_secrets", { XAI_API_KEY: "k" });
    const result = await node.process();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("grok-2-vision-1212");
    const content = body.messages[0].content;
    expect(content[0].type).toBe("image_url");
    expect(content[0].image_url.url).toBe("data:image/png;base64,abc123");
    expect(content[1].text).toBe("What is this?");

    expect(result.output).toBe("A cat sitting on a mat");
  });

  it("passes through data URIs unchanged", async () => {
    mockChatResponse("ok");

    const node = new ImageToText();
    node.assign({
      image: { type: "image", data: "data:image/jpeg;base64,zzz", uri: "" }
    });
    node.setDynamic("_secrets", { XAI_API_KEY: "k" });
    await node.process();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content[0].image_url.url).toBe(
      "data:image/jpeg;base64,zzz"
    );
  });
});

// ---------------------------------------------------------------------------
// GenerateImage
// ---------------------------------------------------------------------------
describe("GenerateImage", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    delete process.env.XAI_API_KEY;
  });

  it("has correct metadata", () => {
    expect(GenerateImage.nodeType).toBe("xai.image.GenerateImage");
    expect(GenerateImage.title).toBe("Generate Image");
    expect(GenerateImage.autoSaveAsset).toBe(true);
  });

  it("throws when prompt is empty", async () => {
    const node = new GenerateImage();
    node.assign({ prompt: "" });
    node.setDynamic("_secrets", { XAI_API_KEY: "k" });
    await expect(node.process()).rejects.toThrow(/Prompt cannot be empty/i);
  });

  it("returns image from b64_json and revised prompt", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ b64_json: "aGVsbG8=", revised_prompt: "a vivid sunset" }]
      })
    });

    const node = new GenerateImage();
    node.assign({ prompt: "a sunset" });
    node.setDynamic("_secrets", { XAI_API_KEY: "k" });
    const result = await node.process();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.x.ai/v1/images/generations");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("grok-2-image");
    expect(body.prompt).toBe("a sunset");
    expect(body.response_format).toBe("b64_json");
    // xAI rejects size/quality — make sure we don't send them
    expect(body.size).toBeUndefined();
    expect(body.quality).toBeUndefined();

    expect(result.output).toEqual({
      type: "image",
      data: "data:image/png;base64,aGVsbG8="
    });
    expect(result.revised_prompt).toBe("a vivid sunset");
  });

  it("returns image from url when no b64_json", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ url: "https://img.x.ai/1.png" }] })
    });

    const node = new GenerateImage();
    node.assign({ prompt: "a sunset" });
    node.setDynamic("_secrets", { XAI_API_KEY: "k" });
    const result = await node.process();

    expect(result.output).toEqual({
      type: "image",
      uri: "https://img.x.ai/1.png"
    });
    expect(result.revised_prompt).toBe("");
  });
});

// ---------------------------------------------------------------------------
// XAI_NODES export
// ---------------------------------------------------------------------------
describe("XAI_NODES", () => {
  it("exports all node classes", () => {
    expect(XAI_NODES).toHaveLength(4);
    const types = XAI_NODES.map((n) => n.nodeType);
    expect(types).toContain("xai.text.ChatComplete");
    expect(types).toContain("xai.text.WebSearch");
    expect(types).toContain("xai.vision.ImageToText");
    expect(types).toContain("xai.image.GenerateImage");
  });
});
