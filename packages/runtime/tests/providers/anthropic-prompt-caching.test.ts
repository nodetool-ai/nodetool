/**
 * Prompt-cache breakpoints the Anthropic provider places on every request: one
 * at the end of the system prompt (caching tools + system) and one on the last
 * cacheable block of the conversation (caching the history so far).
 */

import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicProvider } from "../../src/providers/anthropic-provider.js";
import type { Message, ProviderTool } from "../../src/providers/types.js";

const EPHEMERAL = { type: "ephemeral" };

function makeProvider(options: Record<string, unknown> = {}) {
  const create = vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "ok" }],
    usage: { input_tokens: 1, output_tokens: 1 }
  });
  const provider = new AnthropicProvider(
    { ANTHROPIC_API_KEY: "k" },
    { client: { messages: { create } } as unknown as Anthropic, ...options }
  );
  return { provider, create };
}

/** Every `cache_control` marker in a request body, wherever it sits. */
function countMarkers(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((sum: number, item) => sum + countMarkers(item), 0);
  }
  if (value && typeof value === "object") {
    let count = "cache_control" in value ? 1 : 0;
    for (const [key, child] of Object.entries(value)) {
      if (key !== "cache_control") count += countMarkers(child);
    }
    return count;
  }
  return 0;
}

const weatherTool: ProviderTool = {
  name: "get_weather",
  description: "Weather for a city",
  inputSchema: { type: "object", properties: { city: { type: "string" } } }
};

describe("AnthropicProvider – prompt cache breakpoints", () => {
  it("marks the system prompt and the last user message", async () => {
    const { provider, create } = makeProvider();
    await provider.generateMessage({
      model: "claude-sonnet-4-6",
      messages: [
        { role: "system", content: "You are a weather bot." },
        { role: "user", content: "Weather in Paris?" }
      ],
      tools: [weatherTool]
    });

    const request = create.mock.calls[0][0];
    expect(request.system).toEqual([
      { type: "text", text: "You are a weather bot.", cache_control: EPHEMERAL }
    ]);
    expect(request.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Weather in Paris?", cache_control: EPHEMERAL }
        ]
      }
    ]);
    // The tool catalog renders ahead of the system prompt, so the system
    // breakpoint already covers it.
    expect(countMarkers(request.tools)).toBe(0);
    expect(request.cache_control).toBeUndefined();
  });

  it("moves the tail breakpoint onto the tool results each round", async () => {
    const { provider, create } = makeProvider();
    const history: Message[] = [
      { role: "system", content: "You are a weather bot." },
      { role: "user", content: "Weather in Paris?" },
      {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "tu_1", name: "get_weather", args: { city: "Paris" } }]
      },
      { role: "tool", toolCallId: "tu_1", content: "Sunny" }
    ];
    await provider.generateMessage({
      model: "claude-sonnet-4-6",
      messages: history,
      tools: [weatherTool]
    });

    const request = create.mock.calls[0][0];
    // Earlier turns are sent exactly as before, so the prefix the previous
    // round cached still matches byte for byte.
    expect(request.messages[0]).toEqual({
      role: "user",
      content: "Weather in Paris?"
    });
    const last = request.messages[request.messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content[last.content.length - 1]).toMatchObject({
      type: "tool_result",
      tool_use_id: "tu_1",
      cache_control: EPHEMERAL
    });
    expect(countMarkers(request)).toBe(2);
  });

  it("skips blocks that cannot carry a marker", async () => {
    const { provider, create } = makeProvider();
    await provider.generateMessage({
      model: "claude-sonnet-4-6",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Look at this" },
            { type: "text", text: "" }
          ]
        }
      ]
    });

    const content = create.mock.calls[0][0].messages[0].content;
    expect(content[0]).toEqual({
      type: "text",
      text: "Look at this",
      cache_control: EPHEMERAL
    });
    expect(content[1]).not.toHaveProperty("cache_control");
  });

  it("keeps within four breakpoints when tools already carry markers", async () => {
    const { provider, create } = makeProvider();
    const marked = (name: string): ProviderTool => ({
      ...weatherTool,
      name,
      cacheControl: { type: "ephemeral" }
    });
    await provider.generateMessage({
      model: "claude-sonnet-4-6",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" }
      ],
      tools: [marked("a"), marked("b"), marked("c")]
    });

    const request = create.mock.calls[0][0];
    expect(countMarkers(request)).toBe(4);
    expect(request.system[0].cache_control).toEqual(EPHEMERAL);
    expect(request.messages[0].content).toBe("hi");
  });

  it("leaves the tail to top-level cache_control and reuses its TTL", async () => {
    const { provider, create } = makeProvider({
      cacheControl: { type: "ephemeral", ttl: "1h" }
    });
    await provider.generateMessage({
      model: "claude-sonnet-4-6",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" }
      ]
    });

    const request = create.mock.calls[0][0];
    expect(request.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(request.system[0].cache_control).toEqual({
      type: "ephemeral",
      ttl: "1h"
    });
    expect(request.messages[0].content).toBe("hi");
  });

  it("sends no markers when prompt caching is off", async () => {
    const { provider, create } = makeProvider({ promptCaching: false });
    await provider.generateMessage({
      model: "claude-sonnet-4-6",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" }
      ]
    });

    const request = create.mock.calls[0][0];
    expect(request.system).toBe("sys");
    expect(countMarkers(request)).toBe(0);
  });
});
