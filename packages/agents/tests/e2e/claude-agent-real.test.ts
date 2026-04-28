/**
 * Real E2E test: runs a full Agent (plan → execute → finish) using
 * ClaudeAgentProvider with MCP tool calling.
 *
 * This hits the real Claude Agent SDK — requires Claude Code CLI authenticated.
 */

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { Agent } from "../../src/agent.js";
import { TaskExecutor } from "../../src/task-executor.js";
import { StepExecutor } from "../../src/step-executor.js";
import { Tool } from "../../src/tools/base-tool.js";
import { ClaudeAgentProvider, ProcessingContext } from "@nodetool/runtime";
import type { ProcessingMessage, StepResult } from "@nodetool/protocol";
import type { Task } from "../../src/types.js";

const MODEL = "claude-sonnet-4-20250514";
const TIMEOUT = 180_000;

let sdkAvailable = false;
try {
  await import("@anthropic-ai/claude-agent-sdk");
  // Also verify the claude CLI is actually available and runnable
  execSync("claude --version", { stdio: "pipe", timeout: 5000 });
  // Verify the CLI is actually authenticated by checking for API key
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("No API key");
  sdkAvailable = true;
} catch {}

// --- Custom tool ---

class CalculatorTool extends Tool {
  readonly name = "calculator";
  readonly description =
    "Evaluate a mathematical expression and return the result.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      expression: {
        type: "string",
        description: "Math expression to evaluate, e.g. '2 + 3 * 4'"
      }
    },
    required: ["expression"]
  };

  async process(_ctx: any, params: Record<string, unknown>): Promise<unknown> {
    const expr = String(params.expression ?? "");
    const sanitized = expr.replace(/[^0-9+\-*/().% ]/g, "");
    try {
      const result = Function(`"use strict"; return (${sanitized})`)();
      return { expression: expr, result: Number(result) };
    } catch {
      return { expression: expr, error: "Invalid expression" };
    }
  }
}

// --- Helpers ---

async function collectMessages(
  gen: AsyncGenerator<ProcessingMessage>
): Promise<ProcessingMessage[]> {
  const msgs: ProcessingMessage[] = [];
  for await (const m of gen) msgs.push(m);
  return msgs;
}

function findStepResults(msgs: ProcessingMessage[]): StepResult[] {
  return msgs.filter((m) => m.type === "step_result") as StepResult[];
}

function makeContext() {
  return new ProcessingContext({
    jobId: `job-${Date.now()}`,
    userId: "test",
    workspaceDir: "/tmp/nodetool-test-workspace"
  });
}

// --- Tests ---

describe.skipIf(!sdkAvailable)(
  "Agent E2E with ClaudeAgentProvider + MCP",
  () => {
    it(
      "executes a single step with calculator tool and finish_step",
      async () => {
        const provider = new ClaudeAgentProvider();
        const context = makeContext();

        const task: Task = {
          id: "task-calc",
          title: "Calculate Expression",
          steps: [
            {
              id: "step_1",
              instructions:
                "Use the calculator tool to compute (15 * 7) + (22 * 3). Then call finish_step with the result.",
              completed: false,
              dependsOn: [],
              logs: [],
              outputSchema: JSON.stringify({
                type: "object",
                properties: { answer: { type: "number" } },
                required: ["answer"]
              })
            }
          ]
        };

        const executor = new StepExecutor({
          task,
          step: task.steps[0],
          context,
          provider,
          model: MODEL,
          tools: [new CalculatorTool()],
          maxIterations: 10
        });

        const messages = await collectMessages(executor.execute());

        for (const m of messages) {
          if (m.type === "tool_call_update")
            console.log(
              "[tool_call]",
              (m as any).name,
              JSON.stringify((m as any).args)
            );
          if (m.type === "step_result")
            console.log("[step_result]", JSON.stringify((m as any).result));
          if (m.type === "log_update") console.log("[log]", (m as any).content);
          if (m.type === "task_update")
            console.log("[task_update]", (m as any).event);
        }

        const results = findStepResults(messages);
        expect(results.length).toBeGreaterThanOrEqual(1);

        // 15*7=105, 22*3=66, 105+66=171
        const lastResult = results[results.length - 1].result as Record<
          string,
          unknown
        >;
        console.log("Final step result:", lastResult);
        expect(lastResult.answer).toBe(171);
      },
      TIMEOUT
    );

    it.skip(
      "plans and executes a full agent task",
      async () => {
        const provider = new ClaudeAgentProvider();
        const context = makeContext();

        const agent = new Agent({
          name: "calc-agent",
          objective:
            "Calculate (15 * 7) + (22 * 3) using the calculator tool, then report the final answer.",
          provider,
          model: MODEL,
          tools: [new CalculatorTool()],
          maxSteps: 3,
          maxStepIterations: 10,
          outputSchema: {
            type: "object",
            properties: {
              answer: {
                type: "number",
                description: "The final numerical answer"
              }
            },
            required: ["answer"]
          }
        });

        const messages = await collectMessages(agent.execute(context));

        for (const m of messages) {
          if (m.type === "task_update")
            console.log("[task_update]", (m as any).event);
          if (m.type === "tool_call_update")
            console.log(
              "[tool_call]",
              (m as any).name,
              JSON.stringify((m as any).args)
            );
          if (m.type === "step_result")
            console.log("[step_result]", JSON.stringify((m as any).result));
          if (m.type === "log_update") console.log("[log]", (m as any).content);
          if (m.type === "chunk" && (m as any).content)
            console.log("[chunk]", (m as any).content.slice(0, 100));
        }

        const results = findStepResults(messages);
        expect(results.length).toBeGreaterThanOrEqual(1);

        const finalResult = agent.getResults();
        console.log("Final result:", finalResult);
        expect(finalResult).toBeDefined();
        expect((finalResult as any).answer).toBe(171);
      },
      TIMEOUT
    );
  }
);
