import { describe, expect, it, vi } from "vitest";
import { createCoreExecutionHost } from "@nodetool-ai/nodes-core";
import { configureFeatures } from "@nodetool-ai/server-features";
import installedFeature, { AnthropicTextProvider, createAnthropicFeature } from "../src/index.js";

function fixtureResponse(): Response {
  const events = [
    { type: "message_start", message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 7, output_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hello" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " world" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "max_tokens", stop_sequence: null }, usage: { output_tokens: 2 } },
    { type: "message_stop" }
  ];
  return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
}

describe("optional Anthropic SDK adapter", () => {
  it("loads the installed default feature and resolves credentials for the run tenant", async () => {
    const credentials: string[] = [];
    const transport = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      credentials.push(new Headers(init?.headers).get("x-api-key") ?? "");
      return fixtureResponse();
    });
    const execution = createCoreExecutionHost();
    const lookups: string[] = [];
    const features = await configureFeatures([{ id: "provider-anthropic", load: async () => installedFeature }], {
      execution,
      readSecret: async (userId: string, key: string) => {
        lookups.push(`${userId}:${key}`);
        return `credential-${userId}`;
      }
    });
    try {
      for (const userId of ["alice", "bob"]) {
        await execution.run({ graph: { nodes: [{ id: "n", type: "anthropic.text.ChatComplete", properties: { model: "fixture", prompt: "hi" } }], edges: [] }, userId, jobId: userId, signal: new AbortController().signal, emit: () => {} });
      }
      expect(lookups).toEqual(["alice:ANTHROPIC_API_KEY", "bob:ANTHROPIC_API_KEY"]);
      expect(credentials).toEqual(["credential-alice", "credential-bob"]);
    } finally {
      transport.mockRestore();
      await features.close();
    }
  });
  it("streams through the official SDK and translates system messages and token usage", async () => {
    let body: unknown;
    const provider = new AnthropicTextProvider({ apiKey: "fixture", fetch: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      expect(new Headers(init?.headers).get("x-api-key")).toBe("fixture");
      return fixtureResponse();
    } });
    const chunks = [];
    for await (const chunk of provider.stream({ model: "fixture", messages: [{ role: "system", content: "Be brief" }, { role: "user", content: "hi" }], signal: new AbortController().signal })) {
      chunks.push(chunk);
    }
    expect(body).toMatchObject({ system: "Be brief", messages: [{ role: "user", content: "hi" }], stream: true });
    expect(chunks).toEqual([{ done: false, text: "hello" }, { done: false, text: " world" }, { done: true, usage: { inputTokens: 7, outputTokens: 2 } }]);
  });

  it("blocks unsafe endpoints before transport and respects cancellation", async () => {
    let calls = 0;
    const provider = new AnthropicTextProvider({ apiKey: "fixture", baseURL: "https://127.0.0.1", fetch: async () => { calls++; return fixtureResponse(); } });
    const request = { model: "fixture", messages: [{ role: "user" as const, content: "hi" }], signal: new AbortController().signal };
    await expect(provider.stream(request)[Symbol.asyncIterator]().next()).rejects.toThrow();
    expect(calls).toBe(0);
    const controller = new AbortController();
    controller.abort();
    await expect(provider.stream({ ...request, signal: controller.signal })[Symbol.asyncIterator]().next()).rejects.toThrow();
    expect(calls).toBe(0);
  });

  it("executes an explicitly selected feature through the minimal actor host", async () => {
    const execution = createCoreExecutionHost();
    const provider = new AnthropicTextProvider({ apiKey: "fixture", fetch: async () => fixtureResponse() });
    const features = await configureFeatures([{ id: "provider-anthropic", load: async () => createAnthropicFeature(provider) }], { execution });
    const graph = { nodes: [{ id: "n", type: "anthropic.text.ChatComplete", properties: { model: "fixture", prompt: "hi" } }], edges: [] };
    expect(execution.validate(graph)).toEqual([]);
    const recordUsage = vi.fn();
    const result = await execution.run({ graph, userId: "tenant", jobId: "fixture", signal: new AbortController().signal, emit: () => {}, recordUsage });
    expect(Object.values(result).flat()).toContain("hello world");
    expect(recordUsage).toHaveBeenCalledExactlyOnceWith({ inputTokens: 7, outputTokens: 2 });
    expect(features.capabilities).toEqual(["provider:anthropic"]);
    await features.close();
  });
});
