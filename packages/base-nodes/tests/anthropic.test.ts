import { vi, describe, it, expect, beforeEach } from "vitest";
import { ClaudeAgentNode } from "../src/nodes/anthropic.js";

describe("ClaudeAgentNode", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("has correct static properties", () => {
    expect(ClaudeAgentNode.nodeType).toBe("anthropic.agents.ClaudeAgent");
    expect(ClaudeAgentNode.title).toBe("Claude Agent");
  });

  it("returns correct defaults", () => {
    const node = new ClaudeAgentNode();
    const d = node.serialize();
    expect(d.prompt).toBe("");
    expect(d.max_turns).toBe(20);
    expect(d.allowed_tools).toEqual(["Read", "Write", "Bash"]);
    expect(d.permission_mode).toBe("acceptEdits");
  });

  it("throws on empty prompt", async () => {
    const node = new ClaudeAgentNode();
    node.assign({
      prompt: ""
    });
    node.setDynamic("_secrets", { ANTHROPIC_API_KEY: "key" });
    await expect(node.process()).rejects.toThrow("Prompt is required");
  });

  it("throws when API key is missing", async () => {
    const node = new ClaudeAgentNode();
    node.assign({ prompt: "hello" });
    await expect(node.process()).rejects.toThrow(
      "ANTHROPIC_API_KEY is not configured"
    );
  });

  it("throws when claude-agent-sdk is not installed", async () => {
    const node = new ClaudeAgentNode();
    node.assign({
      prompt: "hello"
    });
    node.setDynamic("_secrets", { ANTHROPIC_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow(
      /Claude Agent SDK|Cannot find module|Claude Agent error/
    );
  });

  it("uses env var for API key", async () => {
    process.env.ANTHROPIC_API_KEY = "env-key";
    const node = new ClaudeAgentNode();
    // Will fail on SDK import, but shouldn't fail on API key check
    node.assign({ prompt: "hello" });
    await expect(node.process()).rejects.toThrow(
      /Claude Agent SDK|Cannot find module|Claude Agent error/
    );
  });

  it("accumulates streamed text from Claude Agent SDK", async () => {
    // Mock the dynamic import of claude-agent-sdk
    const messages = [
      { content: [{ text: "Hello" }] },
      { content: [{ text: ", " }, { text: "world" }] },
      { content: [{ text: "!" }] }
    ];

    const mockQuery = vi.fn().mockImplementation(() => ({
      async *[Symbol.asyncIterator]() {
        for (const msg of messages) {
          yield msg;
        }
      }
    }));

    vi.doMock("claude-agent-sdk", () => ({
      query: mockQuery
    }));

    const node = new ClaudeAgentNode();
    node.assign({
      prompt: "say hello",
      model: {
        type: "language_model",
        provider: "anthropic",
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet",
        path: null,
        supported_tasks: []
      },
      system_prompt: "Be concise",
      max_turns: 5,
      allowed_tools: ["Read"],
      permission_mode: "acceptEdits"
    });
    node.setDynamic("_secrets", { ANTHROPIC_API_KEY: "test-key" });

    const result = await node.process();

    expect(result).toEqual({ text: "Hello, world!" });
    expect(mockQuery).toHaveBeenCalledOnce();
    expect(mockQuery).toHaveBeenCalledWith({
      prompt: "say hello",
      options: {
        model: "claude-sonnet-4-20250514",
        system_prompt: "Be concise",
        max_turns: 5,
        allowed_tools: ["Read"],
        permission_mode: "acceptEdits",
        env: { ANTHROPIC_API_KEY: "test-key" }
      }
    });

    vi.doUnmock("claude-agent-sdk");
  });
});
