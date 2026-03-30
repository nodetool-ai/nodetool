#!/usr/bin/env npx tsx
/**
 * End-to-end integration test for MultiModeAgent using a mock provider.
 * Tests loop and plan modes with realistic tool interactions.
 *
 * Usage: npx tsx test-multi-mode-e2e.mts
 */

import { MultiModeAgent, CalculatorTool, StatisticsTool, GeometryTool, ConversionTool } from "./packages/agents/dist/index.js";
import { ProcessingContext } from "./packages/runtime/dist/index.js";
import type { ProcessingMessage } from "./packages/protocol/dist/messages.js";

// ---------------------------------------------------------------------------
// Mock provider that returns pre-defined response sequences.
// When responses are exhausted, returns a finish_step tool call as fallback.
// ---------------------------------------------------------------------------

function createMockProvider(
  streamingResponses: any[][],
  tracedResponses?: any[],
) {
  let streamIdx = 0;
  let tracedIdx = 0;

  const fallbackFinish = [
    { id: "tc_fallback_finish", name: "finish_step", args: { result: { result: "completed" } } },
  ];

  return {
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessages: async function* (..._args: any[]) {
      const items = streamIdx < streamingResponses.length
        ? streamingResponses[streamIdx]
        : fallbackFinish;
      streamIdx++;
      for (const item of items) {
        yield item;
      }
    },
    async *generateMessagesTraced(...args: any[]) {
      yield* (this as any).generateMessages(...args);
    },
    generateMessage: async function (..._args: any[]) {
      return { content: "", toolCalls: [] };
    },
    generateMessageTraced: async function (..._args: any[]) {
      if (tracedResponses && tracedIdx < tracedResponses.length) {
        const resp = tracedResponses[tracedIdx];
        tracedIdx++;
        return resp;
      }
      return { content: "OK", toolCalls: [] };
    },
    getAvailableLanguageModels: async () => [],
    getAvailableImageModels: async () => [],
    getAvailableVideoModels: async () => [],
    getAvailableTTSModels: async () => [],
    getAvailableASRModels: async () => [],
    getAvailableEmbeddingModels: async () => [],
    getContainerEnv: () => ({}),
    textToImage: async () => ({}),
    imageToImage: async () => ({}),
    textToSpeech: async () => ({}),
    automaticSpeechRecognition: async () => ({}),
    textToVideo: async () => ({}),
    imageToVideo: async () => ({}),
    generateEmbedding: async () => ({}),
    isContextLengthError: () => false,
  } as any;
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

async function testLoopMode() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Testing "loop" mode`);
  console.log(`${"=".repeat(60)}\n`);

  const provider = createMockProvider([
    // Iteration 1: LLM calls calculator
    [
      { type: "chunk", content: "Calculating sqrt(144)...\n" },
      { id: "tc1", name: "calculator", args: { expression: "sqrt(144)" } },
    ],
    // Iteration 2: LLM calls calculator again
    [
      { type: "chunk", content: "sqrt(144) = 12. Now cbrt(27)...\n" },
      { id: "tc2", name: "calculator", args: { expression: "27^(1/3)" } },
    ],
    // Iteration 3: LLM calls finish_step
    [
      { type: "chunk", content: "Result: 12 + 3 = 15\n" },
      { id: "tc3", name: "finish_step", args: { result: { result: "15" } } },
    ],
  ]);

  const ctx = new ProcessingContext({ jobId: "test-loop", userId: "test", workspaceDir: "/tmp/nodetool-test" });

  const agent = new MultiModeAgent({
    name: "test-loop",
    objective: "What is sqrt(144) + cbrt(27)?",
    provider,
    model: "mock-model",
    mode: "loop",
    tools: [new CalculatorTool()],
    systemPrompt: "You are a math assistant.",
    maxIterations: 10,
    outputSchema: {
      type: "object",
      properties: { result: { type: "string" } },
      required: ["result"],
    },
  });

  let messageCount = 0;
  for await (const msg of agent.execute(ctx)) {
    messageCount++;
    const pmsg = msg as ProcessingMessage;
    if (pmsg.type === "chunk") process.stdout.write(`  ${(pmsg as any).content ?? ""}`);
    else if (pmsg.type === "step_result") console.log(`  [RESULT] ${JSON.stringify((pmsg as any).result)?.slice(0, 200)}`);
    else if (pmsg.type === "tool_call_update") console.log(`  [TOOL] ${(pmsg as any).name}`);
    else if (pmsg.type === "log_update") console.log(`  [LOG] ${(pmsg as any).content}`);
  }

  const result = agent.getResults();
  const pass = result != null;
  console.log(`\n  Messages: ${messageCount}`);
  console.log(`  Result: ${JSON.stringify(result)}`);
  console.log(`  Status: ${pass ? "PASS" : "FAIL"}`);
  return pass;
}

async function testPlanMode() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Testing "plan" mode`);
  console.log(`${"=".repeat(60)}\n`);

  // The planner uses streaming (generateMessages), then each step uses streaming too
  const provider = createMockProvider([
    // Response 0: Planner creates task
    [
      { type: "chunk", content: "Planning..." },
      {
        id: "tc_plan", name: "create_task", args: {
          title: "Math calculations",
          steps: [
            { id: "step1", instructions: "Calculate pi*5^2", depends_on: [] },
            { id: "step2", instructions: "Calculate sqrt of result", depends_on: ["step1"] },
          ],
        },
      },
    ],
    // Response 1: Step 1 execution
    [
      { type: "chunk", content: "Area = pi * 25 = 78.54\n" },
      { id: "tc_s1", name: "finish_step", args: { result: { result: "78.54" } } },
    ],
    // Response 2: Step 2 execution (last step = finish task)
    [
      { type: "chunk", content: "sqrt(78.54) = 8.86\n" },
      { id: "tc_s2", name: "finish_step", args: { result: { result: "Area=78.54, sqrt=8.86" } } },
    ],
  ]);

  const ctx = new ProcessingContext({ jobId: "test-plan", userId: "test", workspaceDir: "/tmp/nodetool-test" });

  const agent = new MultiModeAgent({
    name: "test-plan",
    objective: "Calculate area of circle r=5, then sqrt of area",
    provider,
    model: "mock-model",
    mode: "plan",
    tools: [new CalculatorTool()],
    systemPrompt: "You are a math assistant.",
    maxSteps: 5,
    maxStepIterations: 3,
    outputSchema: {
      type: "object",
      properties: { result: { type: "string" } },
      required: ["result"],
    },
  });

  let messageCount = 0;
  for await (const msg of agent.execute(ctx)) {
    messageCount++;
    const pmsg = msg as ProcessingMessage;
    if (pmsg.type === "chunk") process.stdout.write(`  ${(pmsg as any).content ?? ""}`);
    else if (pmsg.type === "step_result") console.log(`  [RESULT] is_task=${(pmsg as any).is_task_result} ${JSON.stringify((pmsg as any).result)?.slice(0, 200)}`);
    else if (pmsg.type === "tool_call_update") console.log(`  [TOOL] ${(pmsg as any).name}`);
    else if (pmsg.type === "log_update") console.log(`  [LOG] ${(pmsg as any).content}`);
    else if (pmsg.type === "planning_update") console.log(`  [PLAN] ${(pmsg as any).phase}: ${(pmsg as any).content}`);
    else if (pmsg.type === "task_update") console.log(`  [TASK] ${(pmsg as any).event}`);
  }

  const result = agent.getResults();
  const pass = result != null;
  console.log(`\n  Messages: ${messageCount}`);
  console.log(`  Result: ${JSON.stringify(result)}`);
  console.log(`  Status: ${pass ? "PASS" : "FAIL"}`);
  return pass;
}

// Run tests
const loopPass = await testLoopMode();
const planPass = await testPlanMode();

console.log(`\n${"=".repeat(60)}`);
console.log("  SUMMARY");
console.log(`${"=".repeat(60)}`);
console.log(`  ${loopPass ? "✓" : "✗"} loop mode`);
console.log(`  ${planPass ? "✓" : "✗"} plan mode`);
console.log(`  Overall: ${loopPass && planPass ? "ALL PASSED" : "SOME FAILED"}`);
console.log(`${"=".repeat(60)}\n`);

process.exit(loopPass && planPass ? 0 : 1);
