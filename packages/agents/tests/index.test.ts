import { describe, it, expect } from "vitest";

describe("agents index exports", () => {
  it("exports all public API", async () => {
    const mod = await import("../src/index.js");
    expect(mod).toBeDefined();

    // Tools
    expect(mod.Tool).toBeDefined();
    expect(mod.FinishStepTool).toBeDefined();
    expect(mod.CalculatorTool).toBeDefined();
    expect(mod.StatisticsTool).toBeDefined();
    expect(mod.GeometryTool).toBeDefined();
    expect(mod.TrigonometryTool).toBeDefined();
    expect(mod.ConversionTool).toBeDefined();
    expect(mod.OpenAIWebSearchTool).toBeDefined();
    expect(mod.OpenAIImageGenerationTool).toBeDefined();
    expect(mod.OpenAITextToSpeechTool).toBeDefined();
    expect(mod.ReadFileTool).toBeDefined();
    expect(mod.WriteFileTool).toBeDefined();
    expect(mod.ListDirectoryTool).toBeDefined();
    expect(mod.DownloadFileTool).toBeDefined();
    expect(mod.HttpRequestTool).toBeDefined();
    expect(mod.RunCodeTool).toBeDefined();
    expect(mod.WebSearchTool).toBeDefined();
    expect(mod.GoogleNewsTool).toBeDefined();
    expect(mod.GoogleImagesTool).toBeDefined();
    expect(mod.GoogleGroundedSearchTool).toBeDefined();
    expect(mod.GoogleImageGenerationTool).toBeDefined();
    expect(mod.BrowserTool).toBeDefined();
    expect(mod.ScreenshotTool).toBeDefined();
    expect(mod.htmlToText).toBeDefined();
    expect(mod.registerTool).toBeDefined();
    expect(mod.resolveTool).toBeDefined();
    expect(mod.listTools).toBeDefined();
    expect(mod.getAllTools).toBeDefined();

    // Utilities
    expect(mod.extractJSON).toBeDefined();

    // Core execution
    expect(mod.StepExecutor).toBeDefined();

    // Read-only fan-out search primitive
    expect(mod.RunSearchTool).toBeDefined();
    expect(mod.buildReadOnlySearchPrompt).toBeDefined();
    expect(mod.READ_ONLY_SEARCH_DESCRIPTION).toBeDefined();

    // Agents
    expect(mod.Agent).toBeDefined();

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
