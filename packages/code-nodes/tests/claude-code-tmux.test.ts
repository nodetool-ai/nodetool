import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import {
  ClaudeCodeAgentNode,
  CLAUDE_CODE_NODES,
  encodeClaudeProjectDir,
  parseSessionLines,
  extractAssistantEvents,
  buildClaudeLaunchCommand,
  combinePrompt,
  shQuote,
  isTurnComplete,
  isPaneBusy,
  detectPaneDialog,
  terminalPipeFile
} from "@nodetool-ai/code-nodes";

describe("ClaudeCodeAgentNode metadata", () => {
  it("is registered with the expected node type and outputs", () => {
    expect(CLAUDE_CODE_NODES).toContain(ClaudeCodeAgentNode);
    expect(ClaudeCodeAgentNode.nodeType).toBe("nodetool.agents.ClaudeCodeAgent");
    expect(ClaudeCodeAgentNode.title).toBe("Claude Code Agent");
    expect(ClaudeCodeAgentNode.metadataOutputTypes).toEqual({
      text: "str",
      chunk: "chunk",
      transcript: "str",
      session_id: "str",
      workspace: "str"
    });
  });

  it("is chainable: text output and input/prompt/workspace inputs are strings", () => {
    const props = ClaudeCodeAgentNode.getDeclaredProperties();
    const byName = new Map(props.map((p) => [p.name, p.options]));
    expect(byName.get("prompt")?.type).toBe("str");
    expect(byName.get("input")?.type).toBe("str");
    expect(byName.get("workspace")?.type).toBe("str");
    expect(ClaudeCodeAgentNode.inputFields).toEqual([
      "prompt",
      "input",
      "workspace"
    ]);
  });

  it("requires a prompt", async () => {
    const node = new ClaudeCodeAgentNode({ prompt: "", input: "" });
    await expect(node.process()).rejects.toThrow(/Prompt is required/);
  });
});

describe("combinePrompt (agent chaining)", () => {
  it("appends upstream input after the node's own instructions", () => {
    expect(combinePrompt("Review this code", "diff --git a b")).toBe(
      "Review this code\n\ndiff --git a b"
    );
  });

  it("falls back to whichever side is set", () => {
    expect(combinePrompt("only prompt", "")).toBe("only prompt");
    expect(combinePrompt("", "only input")).toBe("only input");
    expect(combinePrompt("  ", " \n ")).toBe("");
  });
});

describe("terminalPipeFile", () => {
  it("derives a per-session pipe file in the OS temp dir", () => {
    expect(terminalPipeFile("nt-claude-abc")).toBe(
      `${tmpdir()}/nodetool-tmux-nt-claude-abc.out`
    );
  });
});

describe("encodeClaudeProjectDir", () => {
  it("encodes a cwd the way Claude Code names project dirs", () => {
    expect(encodeClaudeProjectDir("/home/user/my_project.v2")).toBe(
      "-home-user-my-project-v2"
    );
  });
});

describe("session JSONL parsing", () => {
  const assistantLine = JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "I'll fix the bug now." },
        { type: "tool_use", name: "Bash", input: { command: "npm test" } }
      ]
    }
  });

  it("parses complete lines and skips malformed ones", () => {
    const entries = parseSessionLines(
      `${assistantLine}\nnot json\n\n{"type":"user"}`
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe("assistant");
    expect(entries[1].type).toBe("user");
  });

  it("extracts text and tool_use events from assistant entries only", () => {
    const [entry] = parseSessionLines(assistantLine);
    const events = extractAssistantEvents(entry);
    expect(events).toEqual([
      { kind: "text", text: "I'll fix the bug now." },
      { kind: "tool_use", text: "[tool] Bash" }
    ]);
    expect(extractAssistantEvents({ type: "user" })).toEqual([]);
    expect(
      extractAssistantEvents({
        type: "assistant",
        message: { role: "assistant", content: "plain string answer" }
      })
    ).toEqual([{ kind: "text", text: "plain string answer" }]);
  });
});

describe("completion detection", () => {
  const base = {
    sawAssistantText: true,
    paneBusy: false,
    dialogPending: false,
    msSinceLastEntry: 5000,
    quietMs: 3000
  };

  it("completes only when all signals agree", () => {
    expect(isTurnComplete(base)).toBe(true);
    expect(isTurnComplete({ ...base, sawAssistantText: false })).toBe(false);
    expect(isTurnComplete({ ...base, paneBusy: true })).toBe(false);
    expect(isTurnComplete({ ...base, dialogPending: true })).toBe(false);
    expect(isTurnComplete({ ...base, msSinceLastEntry: 1000 })).toBe(false);
  });

  it("reads the busy indicator from the pane", () => {
    expect(isPaneBusy("✻ Cogitating… (esc to interrupt)")).toBe(true);
    expect(isPaneBusy("╭─ > ╰─ ? for shortcuts")).toBe(false);
  });

  it("recognizes startup dialogs", () => {
    expect(detectPaneDialog("Do you trust the files in this folder?")).toBe(
      "trust"
    );
    expect(
      detectPaneDialog("❯ 1. Yes, I trust this folder\n  2. No, exit")
    ).toBe("trust");
    expect(
      detectPaneDialog("WARNING: ... 2. Yes, I accept ... Bypass Permissions")
    ).toBe("bypass-permissions");
    expect(detectPaneDialog("Choose the text style that looks best")).toBe(
      "theme"
    );
    expect(detectPaneDialog("Select login method:")).toBe("login");
    expect(detectPaneDialog("╭─ > ╰─")).toBe(null);
  });
});

describe("buildClaudeLaunchCommand", () => {
  it("strips nested Claude Code env vars and launches with bypass permissions", () => {
    const cmd = buildClaudeLaunchCommand({
      command: "claude",
      sessionId: "abc-123"
    });
    expect(cmd).toContain("unset");
    expect(cmd).toContain("CLAUDECODE");
    expect(cmd).toContain(
      "exec claude --dangerously-skip-permissions --session-id 'abc-123'"
    );
  });

  it("includes optional model, system prompt, and extra args", () => {
    const cmd = buildClaudeLaunchCommand({
      command: "claude",
      sessionId: "abc",
      model: "opus",
      appendSystemPrompt: "You are a code reviewer",
      extraArgs: "--verbose"
    });
    expect(cmd).toContain("--model 'opus'");
    expect(cmd).toContain("--append-system-prompt 'You are a code reviewer'");
    expect(cmd.endsWith("--verbose")).toBe(true);
  });

  it("shell-quotes single quotes safely", () => {
    expect(shQuote("it's")).toBe("'it'\\''s'");
  });
});
