import { describe, it, expect } from "vitest";

describe("agents index exports", () => {
  it("exports all public API", async () => {
    const mod = await import("../src/index.js");
    expect(mod).toBeDefined();

    // Tools
    expect(mod.Tool).toBeDefined();
    expect(mod.FinishStepTool).toBeDefined();
    expect(mod.htmlToText).toBeDefined();
    expect(mod.registerTool).toBeDefined();
    expect(mod.resolveTool).toBeDefined();
    expect(mod.listTools).toBeDefined();
    expect(mod.getAllTools).toBeDefined();

    // The belt. A tool is a capability wire name now, not an exported class:
    // the names are the belt, `getBuiltinTools()` assembles it, and
    // `toolForCapabilityName` builds any one of them on its own.
    expect(mod.BUILTIN_TOOL_NAMES).toBeDefined();
    expect(mod.getBuiltinTools).toBeDefined();
    expect(mod.getAgentToolbelt).toBeDefined();
    expect(mod.toolForCapabilityName).toBeDefined();
  });

  it("assembles the built-in belt from capability names", async () => {
    const mod = await import("../src/index.js");

    // What the deleted `ReadFileTool`/`BrowserTool`/… exports stood for.
    for (const name of [
      "read_file",
      "write_file",
      "list_directory",
      "download_file",
      "http_request",
      "web_search",
      "browser",
      "take_screenshot"
    ]) {
      expect(mod.BUILTIN_TOOL_NAMES).toContain(name);
      expect(mod.toolForCapabilityName(name).name).toBe(name);
    }

    const belt = mod.getBuiltinTools();
    expect(belt.map((tool) => tool.name)).toEqual([...mod.BUILTIN_TOOL_NAMES]);
    for (const tool of belt) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it("exports the rest of the public API", async () => {
    const mod = await import("../src/index.js");

    // Utilities
    expect(mod.extractJSON).toBeDefined();

    // Core execution
    expect(mod.CodeActExecutor).toBeDefined();

    // Read-only fan-out search primitive
    expect(mod.RunSearchTool).toBeDefined();
    expect(mod.buildReadOnlySearchPrompt).toBeDefined();
    expect(mod.READ_ONLY_SEARCH_DESCRIPTION).toBeDefined();

    // Planning & orchestration
    expect(mod.TaskPlanner).toBeDefined();
    expect(mod.TaskExecutor).toBeDefined();
    expect(mod.ParallelTaskExecutor).toBeDefined();

    // Security monitor (opt-in LLM judge)
    expect(mod.SecurityMonitor).toBeDefined();
    expect(mod.createSecurityMonitorConsult).toBeDefined();
    expect(mod.SECURITY_MONITOR_SYSTEM_PROMPT).toBeDefined();
    expect(mod.buildSecurityMonitorUserPrompt).toBeDefined();
  });
});
