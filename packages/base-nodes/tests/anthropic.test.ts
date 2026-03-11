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
    await expect(
      node.process({
        prompt: "",
        _secrets: { ANTHROPIC_API_KEY: "key" },
      })
    ).rejects.toThrow("Prompt is required");
  });

  it("throws when API key is missing", async () => {
    const node = new ClaudeAgentNode();
    await expect(node.process({ prompt: "hello" })).rejects.toThrow(
      "ANTHROPIC_API_KEY is not configured"
    );
  });

  it("throws when claude-agent-sdk is not installed", async () => {
    const node = new ClaudeAgentNode();
    await expect(
      node.process({
        prompt: "hello",
        _secrets: { ANTHROPIC_API_KEY: "test-key" },
      })
    ).rejects.toThrow(/Claude Agent SDK|Cannot find module|Claude Agent error/);
  });

  it("uses env var for API key", async () => {
    process.env.ANTHROPIC_API_KEY = "env-key";
    const node = new ClaudeAgentNode();
    // Will fail on SDK import, but shouldn't fail on API key check
    await expect(
      node.process({ prompt: "hello" })
    ).rejects.toThrow(/Claude Agent SDK|Cannot find module|Claude Agent error/);
  });
});
