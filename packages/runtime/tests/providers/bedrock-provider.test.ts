import { describe, expect, it, vi } from "vitest";
import { BedrockProvider } from "../../src/providers/bedrock-provider.js";
import {
  decodeEventStream,
  encodeEventStreamMessage,
  signAwsRequest
} from "../../src/providers/bedrock-transport.js";
import type { ProviderStreamItem } from "../../src/providers/types.js";

const NOW = new Date("2026-10-13T16:00:00Z");
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function provider(fetchFn: typeof fetch, overrides: Record<string, string> = {}): BedrockProvider {
  return new BedrockProvider(
    {
      BEDROCK_ACCESS_KEY_ID: "AKIDEXAMPLE",
      BEDROCK_SECRET_ACCESS_KEY: "secret",
      BEDROCK_REGION: "eu-central-1",
      ...overrides
    },
    { fetchFn, now: () => NOW }
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function eventStream(events: Array<[string, unknown]>, chunkSize = 7): Response {
  const encoder = new TextEncoder();
  const frames = events.map(([type, payload]) =>
    encodeEventStreamMessage(
      { ":event-type": type, ":message-type": "event", ":content-type": "application/json" },
      encoder.encode(JSON.stringify(payload))
    )
  );
  const bytes = Buffer.concat(frames);
  // Small chunks make frames straddle network reads, as they do in practice.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(new Uint8Array(bytes.subarray(i, i + chunkSize)));
      }
      controller.close();
    }
  });
  return new Response(stream, { status: 200 });
}

function sentBody(mock: ReturnType<typeof vi.fn>, call = 0): Record<string, any> {
  const init = mock.mock.calls[call][1] as RequestInit;
  return JSON.parse(String(init.body));
}

async function collect(gen: AsyncGenerator<ProviderStreamItem>): Promise<ProviderStreamItem[]> {
  const items: ProviderStreamItem[] = [];
  for await (const item of gen) items.push(item);
  return items;
}

async function* chunks(...parts: Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const part of parts) yield part;
}

describe("signAwsRequest", () => {
  it("matches the AWS SigV4 get-vanilla test vector", () => {
    const headers = signAwsRequest({
      method: "GET",
      url: new URL("https://example.amazonaws.com/"),
      body: "",
      region: "us-east-1",
      service: "service",
      credentials: {
        accessKeyId: "AKIDEXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"
      },
      now: new Date("2015-08-30T12:36:00Z")
    });
    expect(headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, " +
        "SignedHeaders=host;x-amz-date, " +
        "Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31"
    );
    expect(headers["x-amz-date"]).toBe("20150830T123600Z");
  });

  it("signs the session token when one is given", () => {
    const headers = signAwsRequest({
      method: "POST",
      url: new URL("https://bedrock-runtime.us-east-1.amazonaws.com/model/a%3A0/converse"),
      body: "{}",
      region: "us-east-1",
      service: "bedrock",
      credentials: { accessKeyId: "AK", secretAccessKey: "S", sessionToken: "TOKEN" },
      headers: { "content-type": "application/json" },
      now: NOW
    });
    expect(headers["x-amz-security-token"]).toBe("TOKEN");
    expect(headers.authorization).toContain("SignedHeaders=content-type;host;x-amz-date;x-amz-security-token");
  });
});

describe("decodeEventStream", () => {
  it("round-trips frames split across reads", async () => {
    const a = encodeEventStreamMessage({ ":event-type": "one" }, new TextEncoder().encode("first"));
    const b = encodeEventStreamMessage({ ":event-type": "two" }, new TextEncoder().encode("second"));
    const joined = Buffer.concat([a, b]);
    const messages = [];
    for await (const message of decodeEventStream(
      chunks(joined.subarray(0, 5), joined.subarray(5, a.length + 3), joined.subarray(a.length + 3))
    )) {
      messages.push({ type: message.headers[":event-type"], payload: new TextDecoder().decode(message.payload) });
    }
    expect(messages).toEqual([
      { type: "one", payload: "first" },
      { type: "two", payload: "second" }
    ]);
  });

  it("rejects a corrupted frame", async () => {
    const frame = encodeEventStreamMessage({ ":event-type": "one" }, new TextEncoder().encode("payload"));
    frame[frame.length - 6] ^= 0xff;
    await expect(collect(decodeEventStream(chunks(frame)) as never)).rejects.toThrow("checksum mismatch");
  });

  it("rejects a stream that ends mid-frame", async () => {
    const frame = encodeEventStreamMessage({ ":event-type": "one" }, new TextEncoder().encode("payload"));
    await expect(
      collect(decodeEventStream(chunks(frame.subarray(0, frame.length - 2))) as never)
    ).rejects.toThrow("ended mid-message");
  });
});

describe("BedrockProvider", () => {
  it("requires an access key pair", () => {
    expect(() => new BedrockProvider({ BEDROCK_ACCESS_KEY_ID: "AK" })).toThrow(
      "BEDROCK_ACCESS_KEY_ID and BEDROCK_SECRET_ACCESS_KEY are required"
    );
    expect(BedrockProvider.requiredSecrets()).toEqual([
      "BEDROCK_ACCESS_KEY_ID",
      "BEDROCK_SECRET_ACCESS_KEY"
    ]);
  });

  it("refuses a region that is not an AWS region before any request", async () => {
    const fetchFn = vi.fn();
    const p = provider(fetchFn as unknown as typeof fetch, { BEDROCK_REGION: "evil.example.com#" });
    await expect(
      p.generateMessage({ messages: [{ role: "user", content: "Hi" }], model: "m" })
    ).rejects.toThrow("BEDROCK_REGION is not an AWS region");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("converts a conversation into one signed Converse request", async () => {
    const fetchFn = vi.fn(async () =>
      json({
        output: { message: { role: "assistant", content: [{ text: "Done" }] } },
        stopReason: "end_turn",
        usage: { inputTokens: 10, outputTokens: 2, cacheReadInputTokens: 4 }
      })
    );
    const p = provider(fetchFn as unknown as typeof fetch);
    const message = await p.generateMessage({
      model: "eu.anthropic.claude-sonnet-4-6-v1:0",
      maxTokens: 512,
      temperature: 0.2,
      tools: [{ name: "lookup", description: "Look up", inputSchema: { type: "object", properties: { q: { type: "string" } } } }],
      toolChoice: "lookup",
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: [{ type: "text", text: "What is this?" }, { type: "image_url", image: { data: PNG } }] },
        { role: "assistant", content: "", toolCalls: [{ id: "t1", name: "lookup", args: { q: "a" } }, { id: "t2", name: "lookup", args: { q: "b" } }] },
        { role: "tool", toolCallId: "t1", content: "A" },
        { role: "tool", toolCallId: "t2", content: "B", isError: true }
      ]
    });

    expect(message).toEqual({ role: "assistant", content: "Done" });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://bedrock-runtime.eu-central-1.amazonaws.com/model/eu.anthropic.claude-sonnet-4-6-v1%3A0/converse"
    );
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20261013\/eu-central-1\/bedrock\/aws4_request, SignedHeaders=accept;content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/
    );

    const body = sentBody(fetchFn);
    expect(body.system).toEqual([{ text: "Be brief." }]);
    expect(body.inferenceConfig).toEqual({ maxTokens: 512, temperature: 0.2 });
    expect(body.toolConfig).toEqual({
      tools: [{ toolSpec: { name: "lookup", description: "Look up", inputSchema: { json: { type: "object", properties: { q: { type: "string" } } } } } }],
      toolChoice: { tool: { name: "lookup" } }
    });
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { text: "What is this?" },
          { image: { format: "png", source: { bytes: Buffer.from(PNG).toString("base64") } } }
        ]
      },
      {
        role: "assistant",
        content: [
          { toolUse: { toolUseId: "t1", name: "lookup", input: { q: "a" } } },
          { toolUse: { toolUseId: "t2", name: "lookup", input: { q: "b" } } }
        ]
      },
      {
        role: "user",
        content: [
          { toolResult: { toolUseId: "t1", content: [{ text: "A" }], status: "success" } },
          { toolResult: { toolUseId: "t2", content: [{ text: "B" }], status: "error" } }
        ]
      }
    ]);
    expect(p.usageTotals.inputTokens).toBe(14);
  });

  it("returns tool calls from a non-streaming response", async () => {
    const fetchFn = vi.fn(async () =>
      json({
        output: { message: { role: "assistant", content: [{ toolUse: { toolUseId: "t1", name: "lookup", input: { q: "x" } } }] } },
        stopReason: "tool_use",
        usage: { inputTokens: 3, outputTokens: 4 }
      })
    );
    const message = await provider(fetchFn as unknown as typeof fetch).generateMessage({
      messages: [{ role: "user", content: "Look it up" }],
      model: "meta.llama3-70b-instruct-v1:0"
    });
    expect(message.toolCalls).toEqual([{ id: "t1", name: "lookup", args: { q: "x" }, _anthropicThinkingBlocks: undefined }]);
  });

  it("streams text, reasoning and tool calls, then one terminal chunk", async () => {
    const fetchFn = vi.fn(async () =>
      eventStream([
        ["messageStart", { role: "assistant" }],
        ["contentBlockDelta", { contentBlockIndex: 0, delta: { reasoningContent: { text: "Thinking" } } }],
        ["contentBlockDelta", { contentBlockIndex: 0, delta: { reasoningContent: { signature: "sig" } } }],
        ["contentBlockStop", { contentBlockIndex: 0 }],
        ["contentBlockDelta", { contentBlockIndex: 1, delta: { text: "Hel" } }],
        ["contentBlockDelta", { contentBlockIndex: 1, delta: { text: "lo" } }],
        ["contentBlockStop", { contentBlockIndex: 1 }],
        ["contentBlockStart", { contentBlockIndex: 2, start: { toolUse: { toolUseId: "t1", name: "lookup" } } }],
        ["contentBlockDelta", { contentBlockIndex: 2, delta: { toolUse: { input: "{\"q\":" } } }],
        ["contentBlockDelta", { contentBlockIndex: 2, delta: { toolUse: { input: "\"x\"}" } } }],
        ["contentBlockStop", { contentBlockIndex: 2 }],
        ["messageStop", { stopReason: "tool_use" }],
        ["metadata", { usage: { inputTokens: 20, outputTokens: 9 } }]
      ])
    );
    const p = provider(fetchFn as unknown as typeof fetch);
    const items = await collect(
      p.generateMessages({
        messages: [{ role: "user", content: "Hi" }],
        model: "eu.anthropic.claude-sonnet-4-6-v1:0",
        thinking: { type: "manual", budgetTokens: 2048 }
      })
    );
    expect(items).toEqual([
      { type: "chunk", content: "Thinking", done: false, thinking: true },
      { type: "chunk", content: "Hel", done: false },
      { type: "chunk", content: "lo", done: false },
      {
        id: "t1",
        name: "lookup",
        args: { q: "x" },
        _anthropicThinkingBlocks: [{ type: "thinking", thinking: "Thinking", signature: "sig" }]
      },
      { type: "chunk", content: "", done: true }
    ]);
    expect(String(fetchFn.mock.calls[0][0])).toMatch(/\/converse-stream$/);
    expect(sentBody(fetchFn).additionalModelRequestFields).toEqual({
      thinking: { type: "enabled", budget_tokens: 2048 }
    });
    expect(p.usageTotals.outputTokens).toBe(9);
  });

  it("sends reasoning back ahead of the tool calls it led to", async () => {
    const fetchFn = vi.fn(async () => json({ output: { message: { content: [{ text: "ok" }] } } }));
    await provider(fetchFn as unknown as typeof fetch).generateMessage({
      model: "anthropic.claude",
      messages: [
        { role: "user", content: "Hi" },
        {
          role: "assistant",
          content: null,
          toolCalls: [{ id: "t1", name: "lookup", args: {} }],
          _anthropicThinkingBlocks: [{ type: "thinking", thinking: "plan", signature: "sig" }]
        },
        { role: "tool", toolCallId: "t1", content: "result" }
      ]
    });
    expect(sentBody(fetchFn).messages[1].content).toEqual([
      { reasoningContent: { reasoningText: { text: "plan", signature: "sig" } } },
      { toolUse: { toolUseId: "t1", name: "lookup", input: {} } }
    ]);
  });

  it("surfaces a stream exception with its HTTP status", async () => {
    const encoder = new TextEncoder();
    const frame = encodeEventStreamMessage(
      { ":message-type": "exception", ":exception-type": "throttlingException" },
      encoder.encode(JSON.stringify({ message: "Too many tokens" }))
    );
    const fetchFn = vi.fn(async () => new Response(frame, { status: 200 }));
    const p = provider(fetchFn as unknown as typeof fetch);
    const error = await collect(
      p.generateMessages({ messages: [{ role: "user", content: "Hi" }], model: "m" })
    ).catch((e: unknown) => e);
    expect(String(error)).toContain("Bedrock error 429: Too many tokens");
    expect(p.isRateLimitError(error)).toBe(true);
  });

  it("classifies HTTP errors for retry and auth handling", async () => {
    const denied = provider(vi.fn(async () => json({ message: "The security token included in the request is invalid." }, 403)) as unknown as typeof fetch);
    const authError = await denied
      .generateMessage({ messages: [{ role: "user", content: "Hi" }], model: "m" })
      .catch((e: unknown) => e);
    expect(String(authError)).toContain("Bedrock error 403");
    expect(denied.isAuthError(authError)).toBe(true);
  });

  it("lists on-demand models and text inference profiles", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/foundation-models")) {
        return json({
          modelSummaries: [
            { modelId: "anthropic.claude-sonnet-4-6-v1:0", modelName: "Claude Sonnet 4.6", providerName: "Anthropic", outputModalities: ["TEXT"], inferenceTypesSupported: ["INFERENCE_PROFILE"], modelLifecycle: { status: "ACTIVE" } },
            { modelId: "mistral.mistral-large-2402-v1:0", modelName: "Mistral Large", providerName: "Mistral AI", outputModalities: ["TEXT"], inferenceTypesSupported: ["ON_DEMAND"], modelLifecycle: { status: "ACTIVE" } },
            { modelId: "meta.llama2-13b-chat-v1", modelName: "Llama 2", providerName: "Meta", outputModalities: ["TEXT"], inferenceTypesSupported: ["ON_DEMAND"], modelLifecycle: { status: "LEGACY" } },
            { modelId: "amazon.nova-canvas-v1:0", modelName: "Nova Canvas", providerName: "Amazon", outputModalities: ["IMAGE"], inferenceTypesSupported: ["ON_DEMAND"], modelLifecycle: { status: "ACTIVE" } },
            { modelId: "amazon.titan-embed-text-v2:0", modelName: "Titan Embeddings", providerName: "Amazon", outputModalities: ["EMBEDDING"], inferenceTypesSupported: ["ON_DEMAND"], modelLifecycle: { status: "ACTIVE" } }
          ]
        });
      }
      const page = new URL(url).searchParams.get("nextToken");
      return json(
        page
          ? { inferenceProfileSummaries: [{ inferenceProfileId: "eu.amazon.nova-canvas", inferenceProfileName: "EU Nova Canvas", status: "ACTIVE", models: [{ modelArn: "arn:aws:bedrock:eu-central-1::foundation-model/amazon.nova-canvas-v1:0" }] }] }
          : {
              inferenceProfileSummaries: [
                { inferenceProfileId: "eu.anthropic.claude-sonnet-4-6-v1:0", inferenceProfileName: "EU Claude Sonnet 4.6", status: "ACTIVE", models: [{ modelArn: "arn:aws:bedrock:eu-central-1::foundation-model/anthropic.claude-sonnet-4-6-v1:0" }] }
              ],
              nextToken: "page-2"
            }
      );
    });
    const p = provider(fetchFn as unknown as typeof fetch);
    expect(await p.getAvailableLanguageModels()).toEqual([
      { id: "mistral.mistral-large-2402-v1:0", name: "Mistral AI Mistral Large", provider: "bedrock" },
      { id: "eu.anthropic.claude-sonnet-4-6-v1:0", name: "EU Claude Sonnet 4.6", provider: "bedrock" }
    ]);
    expect(await p.getAvailableImageModels()).toEqual([
      { id: "amazon.nova-canvas-v1:0", name: "Amazon Nova Canvas", provider: "bedrock", supportedTasks: ["text_to_image"] }
    ]);
    // Foundation models and two profile pages, fetched once for both pickers.
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(String(fetchFn.mock.calls[0][0])).toBe("https://bedrock.eu-central-1.amazonaws.com/foundation-models");
  });

  it("lists BEDROCK_MODEL_IDS without calling AWS", async () => {
    const fetchFn = vi.fn();
    const p = provider(fetchFn as unknown as typeof fetch, {
      BEDROCK_MODEL_IDS: "eu.anthropic.claude-sonnet-4-6-v1:0, stability.sd3-5-large-v1:0"
    });
    expect((await p.getAvailableLanguageModels()).map((m) => m.id)).toEqual(["eu.anthropic.claude-sonnet-4-6-v1:0"]);
    expect((await p.getAvailableImageModels()).map((m) => m.id)).toEqual(["stability.sd3-5-large-v1:0"]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns an empty picker when listing fails", async () => {
    const p = provider(vi.fn(async () => json({ message: "denied" }, 403)) as unknown as typeof fetch);
    expect(await p.getAvailableLanguageModels()).toEqual([]);
  });

  it("generates an image with Nova Canvas", async () => {
    const fetchFn = vi.fn(async () => json({ images: [Buffer.from(PNG).toString("base64")] }));
    const bytes = await provider(fetchFn as unknown as typeof fetch).textToImage({
      model: { id: "amazon.nova-canvas-v1:0", name: "Nova Canvas", provider: "bedrock" },
      prompt: "A drone at dawn",
      negativePrompt: "blur",
      width: 1000,
      height: 600,
      seed: 7
    });
    expect(bytes).toEqual(PNG);
    expect(String(fetchFn.mock.calls[0][0])).toMatch(/\/model\/amazon\.nova-canvas-v1%3A0\/invoke$/);
    expect(sentBody(fetchFn)).toEqual({
      taskType: "TEXT_IMAGE",
      textToImageParams: { text: "A drone at dawn", negativeText: "blur" },
      imageGenerationConfig: { numberOfImages: 1, width: 1008, height: 608, seed: 7 }
    });
  });

  it("generates an image with a Stability model and reports filtering", async () => {
    const ok = vi.fn(async () => json({ images: [Buffer.from(PNG).toString("base64")], finish_reasons: [null] }));
    await provider(ok as unknown as typeof fetch).textToImage({
      model: { id: "stability.sd3-5-large-v1:0", name: "SD 3.5", provider: "bedrock" },
      prompt: "A drone",
      aspectRatio: "16:9"
    });
    expect(sentBody(ok)).toEqual({ prompt: "A drone", output_format: "png", aspect_ratio: "16:9" });

    const filtered = vi.fn(async () => json({ images: [], finish_reasons: ["Filter reason: prompt"] }));
    await expect(
      provider(filtered as unknown as typeof fetch).textToImage({
        model: { id: "stability.sd3-5-large-v1:0", name: "SD 3.5", provider: "bedrock" },
        prompt: "A drone"
      })
    ).rejects.toThrow("filtered");
  });
});
