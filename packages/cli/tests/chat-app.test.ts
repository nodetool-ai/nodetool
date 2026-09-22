import React from "react";
import type { PermissionGateOptions } from "@nodetool-ai/agents";
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
  decision: "",
  gate: undefined as PermissionGateOptions | undefined
}));
vi.mock("@nodetool-ai/runtime", () => ({
  PERMISSION_GATE_CONTEXT_KEY: "gate",
  RUN_BUDGET_CONTEXT_KEY: "budget"
}));
vi.mock("@nodetool-ai/agents", () => ({
  getBuiltinTools: () => [],
  getAllMcpTools: () => []
}));
vi.mock("../src/permission-gate.js", () => ({
  parsePermissionMode: (mode: string) => mode
}));
vi.mock("../src/providers.js", () => ({
  availableProviders: () => ["ollama"],
  configuredProviderIds: async () => new Set(["ollama"]),
  createProvider: async () => ({
    getAvailableLanguageModels: async () => [
      { id: "local-model", name: "Local model" }
    ]
  }),
  KNOWN_PROVIDERS: ["ollama"],
  DEFAULT_MODELS: { ollama: "local-model" },
  providerSecretKey: () => undefined
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
  buildCliAgentBelt: ({ gate }: { gate: PermissionGateOptions }) => {
    run.gate = gate;
    return [];
  },
  createCliCodeActTurn: () => ({ tools: [], systemPrompt: "catalog" }),
  applySystemPrompt: () => {}
}));
vi.mock("@nodetool-ai/chat", () => ({
  processChat: async (options: {
    signal: AbortSignal;
    callbacks: { onChunk: (text: string) => void };
  }) => {
    run.calls++;
    if (run.approval && run.gate?.requestApproval) {
      run.decision = await run.gate.requestApproval({
        toolName: "write_file",
        category: "write",
        message: "Write the requested file",
        args: { path: "output.txt" }
      });
    }
    options.callbacks.onChunk("A partial answer");
    options.signal.addEventListener("abort", () => {
      run.aborted = true;
    });
    await new Promise<void>((resolve) => {
      run.finish = resolve;
    });
  }
}));
const { App } = await import("../src/app.js");
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
  run.calls = 0;
  run.finish = undefined;
  run.aborted = false;
  run.approval = false;
  run.decision = "";
  run.gate = undefined;
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
    () => rm(directory, { recursive: true, force: true })
  );
  await vi.waitFor(() => expect(terminal.frame()).toContain("Ask NodeTool"));
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
    await vi.waitFor(() => expect(terminal.frame()).toContain("› /he"));
    terminal.stdin.write("\r");
    await vi.waitFor(() => expect(terminal.frame()).toContain("/compact"));
    expect(run.calls).toBe(0);
    terminal.stdin.write("\u001b");
    await new Promise((resolve) => setTimeout(resolve, 100));
    terminal.stdin.write("still here");
    await vi.waitFor(() => expect(terminal.frame()).toContain("still here"));
  });
  it("requires an explicit answer to a tool approval and resumes the turn", async () => {
    run.approval = true;
    const terminal = await start();
    terminal.stdin.write("write a file");
    await vi.waitFor(() => expect(terminal.frame()).toContain("write a file"));
    terminal.stdin.write("\r");
    await vi.waitFor(() =>
      expect(terminal.frame()).toContain("Approve write_file")
    );
    expect(run.decision).toBe("");
    expect(run.gate?.mode).toBe("default");
    terminal.stdin.write("y");
    await vi.waitFor(() => expect(run.decision).toBe("allow"));
    await vi.waitFor(() => expect(run.finish).toBeDefined());
    run.finish?.();
    await vi.waitFor(() =>
      expect(terminal.frame()).toContain("A partial answer")
    );
  });
  it("holds the turn lock through cancellation cleanup and keeps partial output", async () => {
    const terminal = await start();
    terminal.stdin.write("hello");
    await vi.waitFor(() => expect(terminal.frame()).toContain("hello"));
    terminal.stdin.write("\r");
    await vi.waitFor(() => expect(run.calls).toBe(1));
    terminal.stdin.write("\u0003");
    await vi.waitFor(() => expect(run.aborted).toBe(true));
    terminal.stdin.write("next");
    await vi.waitFor(() => expect(terminal.frame()).toContain("next"));
    terminal.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(run.calls).toBe(1);
    run.finish?.();
    await vi.waitFor(() =>
      expect(terminal.frame()).toContain("Stopped. You can continue")
    );
    expect(terminal.frame()).toContain("A partial answer");
    expect(terminal.frame()).toContain("next");
  });
});
