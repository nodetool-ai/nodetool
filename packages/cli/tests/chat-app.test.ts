import React from "react";
import type { PermissionGateOptions } from "@nodetool-ai/agents";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderTerminal } from "./terminal-harness.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ChatSessionStore } from "../src/chat-sessions.js";

const run = vi.hoisted(() => ({
  calls: 0,
  finish: undefined as (() => void) | undefined,
  aborted: false,
  approval: false,
  subagent: false,
  decision: "",
  onApprovalRequested: undefined as (() => void) | undefined,
  gate: undefined as PermissionGateOptions | undefined,
  forward: undefined as ((message: ProcessingMessage) => void) | undefined
}));
vi.mock("@nodetool-ai/runtime", () => ({
  PERMISSION_GATE_CONTEXT_KEY: "gate",
  RUN_BUDGET_CONTEXT_KEY: "budget",
  estimatePromptTokens: (messages: unknown[]) => messages.length * 10
}));
vi.mock("@nodetool-ai/agents", () => ({
  getBuiltinTools: () => [],
  getAllMcpTools: () => []
}));
vi.mock("../src/bash-tool.js", () => ({
  BashTool: class {
    readonly name = "bash";
  }
}));
vi.mock("../src/permission-gate.js", () => ({
  parsePermissionMode: (mode: string) => mode
}));
vi.mock("../src/providers.js", () => ({
  availableProviders: () => ["ollama"],
  listConfiguredLanguageModels: async () => ({
    providers: ["ollama", "openai"],
    models: [
      { id: "local-model", name: "Local model", provider: "ollama" },
      { id: "gpt-test", name: "GPT Test", provider: "openai" }
    ]
  }),
  createProvider: async () => ({
    getAvailableLanguageModels: async () => [
      { id: "local-model", name: "Local model" }
    ]
  }),
}));
vi.mock("../src/settings.js", () => ({ saveSettings: async () => {} }));
vi.mock("../src/markdown.js", () => ({
  renderMarkdown: async (text: string) => text
}));
vi.mock("../src/chat-context.js", () => ({
  createChatContext: async () => ({
    addMessageListener: () => () => {},
    set: () => {}
  })
}));
vi.mock("../src/run-budget.js", () => ({
  createCliRunBudget: async () => ({}),
  budgetSummaryLine: () => "spent $0.01",
  budgetStopReason: () => null
}));
vi.mock("../src/chat-codeact.js", () => ({
  buildCliAgentBelt: ({
    gate,
    forwardMessage
  }: {
    gate: PermissionGateOptions;
    forwardMessage: (message: ProcessingMessage) => void;
  }) => {
    run.gate = gate;
    run.forward = forwardMessage;
    return [];
  },
  createCliCodeActTurn: () => ({ tools: [], systemPrompt: "catalog" }),
  applySystemPrompt: () => {}
}));
vi.mock("@nodetool-ai/chat", () => ({
  processChat: async (options: {
    signal: AbortSignal;
    callbacks: {
      onChunk: (text: string) => void;
      onToolCall: (call: {
        id: string;
        name: string;
        args: Record<string, unknown>;
      }) => void;
      onToolResult: (
        call: {
          id: string;
          name: string;
          args: Record<string, unknown>;
        },
        result: unknown
      ) => void;
    };
  }) => {
    run.calls++;
    if (run.approval && run.gate?.requestApproval) {
      const decision = run.gate.requestApproval({
        toolName: "write_file",
        category: "write",
        message: "Write the requested file",
        args: { path: "output.txt" }
      });
      run.onApprovalRequested?.();
      run.decision = await decision;
    }
    options.callbacks.onChunk("A partial answer");
    const subagentCall = run.subagent
      ? {
        id: "agent-call-1",
        name: "run_subtask",
        args: { description: "Audit authentication" }
      }
      : undefined;
    if (subagentCall) {
      options.callbacks.onToolCall(subagentCall);
      run.forward?.({
        type: "chunk",
        content: "Found an authentication issue.",
        parent_tool_call_id: subagentCall.id,
        subtask_depth: 1
      });
    }
    options.signal.addEventListener("abort", () => {
      run.aborted = true;
    });
    await new Promise<void>((resolve) => {
      run.finish = resolve;
    });
    if (subagentCall) {
      options.callbacks.onToolResult(subagentCall, "Audit complete");
    }
  }
}));
const { App } = await import("../src/app.js");
const cleanups: Array<() => void | Promise<void>> = [];
const UI_WAIT = { timeout: 5_000 } as const;

async function waitForUi(assertion: () => void): Promise<void> {
  await vi.waitFor(assertion, UI_WAIT);
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
  run.calls = 0;
  run.finish = undefined;
  run.aborted = false;
  run.approval = false;
  run.subagent = false;
  run.decision = "";
  run.onApprovalRequested = undefined;
  run.gate = undefined;
  run.forward = undefined;
});

async function start(columns = 100, rows = 30) {
  const directory = await mkdtemp(join(tmpdir(), "nodetool-terminal-"));
  const terminal = renderTerminal(
    React.createElement(App, {
      initialProvider: "ollama",
      initialModel: "local-model",
      enabledTools: [],
      workspaceDir: directory,
      sessionStore: new ChatSessionStore(join(directory, "sessions"))
    }),
    columns,
    rows
  );
  cleanups.push(
    () => terminal.close(),
    () =>
      rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 10
      })
  );
  await waitForUi(() => expect(terminal.frame()).toContain("Ask NodeTool"));
  return terminal;
}

describe("fullscreen chat", () => {
  it("keeps the composer visible at narrow and wide terminal sizes", async () => {
    for (const [columns, rows] of [
      [40, 16],
      [120, 36]
    ]) {
      const terminal = await start(columns, rows);
      expect(terminal.frame()).toContain("NodeTool");
      expect(terminal.frame()).toContain("/help");
      expect(terminal.frame().split("\n").length).toBeLessThanOrEqual(rows + 1);
      if (columns > 110) {
        expect(terminal.frame()).toContain("Session");
      }
    }
  });
  it("completes a slash command once and keeps Escape from exiting", async () => {
    const terminal = await start();
    terminal.stdin.write("/he");
    await waitForUi(() => expect(terminal.frame()).toContain("› /he"));
    terminal.stdin.write("\r");
    await waitForUi(() => expect(terminal.frame()).toContain("/compact"));
    expect(run.calls).toBe(0);
    terminal.stdin.write("\u001b");
    await new Promise((resolve) => setTimeout(resolve, 100));
    terminal.stdin.write("still here");
    await waitForUi(() => expect(terminal.frame()).toContain("still here"));
  });
  it("selects a model and its provider from the combined model picker", async () => {
    const terminal = await start();
    terminal.stdin.write("/model gpt");
    await vi.waitFor(() =>
      expect(terminal.frame()).toContain("/model openai/gpt-test")
    );
    terminal.stdin.write("\r");
    await vi.waitFor(() =>
      expect(terminal.frame()).toContain("openai / gpt-test")
    );
  });
  it("does not offer the removed provider command", async () => {
    const terminal = await start();
    terminal.stdin.write("/prov");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(terminal.frame()).not.toContain("/provider");
  });
  it("opens a running sub-agent thread and updates its status", async () => {
    run.subagent = true;
    const terminal = await start();
    terminal.stdin.write("delegate an audit");
    await vi.waitFor(() =>
      expect(terminal.frame()).toContain("delegate an audit")
    );
    terminal.stdin.write("\r");
    await vi.waitFor(() => expect(run.finish).toBeDefined());

    terminal.stdin.write("/agent ");
    await vi.waitFor(() =>
      expect(terminal.frame()).toContain("running · Audit authentication")
    );
    terminal.stdin.write("\r");
    await vi.waitFor(() => {
      expect(terminal.frame()).toContain("Audit authentication · running");
      expect(terminal.frame()).toContain("Found an authentication issue.");
      expect(terminal.frame()).toContain("/agent main returns");
    });
    run.finish?.();
    await vi.waitFor(() =>
      expect(terminal.frame()).toContain("Audit authentication · completed")
    );
    await vi.waitFor(() => expect(terminal.frame()).toContain("spent $0.01"), {
      timeout: 5_000
    });
  });
  it("requires an explicit answer to a tool approval and resumes the turn", async () => {
    run.approval = true;
    const terminal = await start();
    terminal.stdin.write("write a file");
    await waitForUi(() => expect(terminal.frame()).toContain("write a file"));
    terminal.stdin.write("\r");
    await waitForUi(() =>
      expect(terminal.frame()).toContain("Approve write_file")
    );
    expect(run.decision).toBe("");
    expect(run.gate?.mode).toBe("default");
    terminal.stdin.write("y");
    await waitForUi(() => expect(run.decision).toBe("allow"));
    await waitForUi(() => expect(run.finish).toBeDefined());
    run.finish?.();
    await waitForUi(() =>
      expect(terminal.frame()).toContain("A partial answer")
    );
  });
  it("takes an approval key pressed before the prompt re-renders", async () => {
    run.approval = true;
    const terminal = await start();
    // The key arrives in the same tick the approval is requested, before Ink
    // has re-rendered and re-registered its input handler, as a keystroke can
    // on a loaded machine.
    run.onApprovalRequested = () => terminal.stdin.write("y");
    terminal.stdin.write("write a file");
    await waitForUi(() => expect(terminal.frame()).toContain("write a file"));
    terminal.stdin.write("\r");
    await waitForUi(() => expect(run.decision).toBe("allow"));
    await waitForUi(() => expect(run.finish).toBeDefined());
    run.finish?.();
  });
  it("holds the turn lock through cancellation cleanup and keeps partial output", async () => {
    const terminal = await start();
    terminal.stdin.write("hello");
    await waitForUi(() => expect(terminal.frame()).toContain("hello"));
    terminal.stdin.write("\r");
    await waitForUi(() => expect(run.calls).toBe(1));
    terminal.stdin.write("\u0003");
    await waitForUi(() => expect(run.aborted).toBe(true));
    terminal.stdin.write("next");
    await waitForUi(() => expect(terminal.frame()).toContain("next"));
    terminal.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(run.calls).toBe(1);
    run.finish?.();
    await waitForUi(() =>
      expect(terminal.frame()).toContain("Stopped. You can continue")
    );
    expect(terminal.frame()).toContain("A partial answer");
    expect(terminal.frame()).toContain("next");
  });
});
