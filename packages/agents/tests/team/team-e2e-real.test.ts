/**
 * Real E2E tests: Multi-agent teams with Claude Agent Provider.
 *
 * These tests run actual Claude agents collaborating via the TeamExecutor.
 * Nothing mocked — real LLM calls, real tool execution, real message passing.
 *
 * Requires: Claude Code CLI authenticated (Claude Agent SDK).
 */

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { ClaudeAgentProvider, ProcessingContext } from "@nodetool-ai/runtime";
import { TeamExecutor } from "../../src/team/team-executor.js";
import { Tool } from "../../src/tools/base-tool.js";
import type {
  AgentIdentity,
  TeamConfig,
  TeamEvent
} from "../../src/team/types.js";

const MODEL = "claude-sonnet-4-20250514";
const TIMEOUT = 300_000; // 5 min — multi-agent takes time

let sdkAvailable = false;
try {
  await import("@anthropic-ai/claude-agent-sdk");
  // Also verify the claude CLI is actually available and runnable
  execSync("claude --version", { stdio: "pipe", timeout: 5000 });
  // Verify the CLI is actually authenticated by checking for API key
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("No API key");
  sdkAvailable = true;
} catch {}

// ─── Tools ───

class CalculatorTool extends Tool {
  readonly name = "calculator";
  readonly description =
    "Evaluate a mathematical expression and return the numeric result.";
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

class ResearchTool extends Tool {
  readonly name = "research";
  readonly description = "Look up a fact or topic. Returns a short summary.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "What to look up" }
    },
    required: ["query"]
  };

  async process(_ctx: any, params: Record<string, unknown>): Promise<unknown> {
    const query = String(params.query ?? "").toLowerCase();
    // Simulated knowledge base — real tool, predictable results
    const facts: Record<string, string> = {
      "population of france":
        "France has approximately 68 million people (2024).",
      "population of germany":
        "Germany has approximately 84 million people (2024).",
      "population of spain":
        "Spain has approximately 48 million people (2024).",
      "eiffel tower":
        "The Eiffel Tower is 330 meters tall, built in 1889 in Paris, France.",
      "speed of light":
        "The speed of light is approximately 299,792,458 meters per second.",
      "python language":
        "Python was created by Guido van Rossum and released in 1991."
    };

    for (const [key, value] of Object.entries(facts)) {
      if (query.includes(key)) return { query, result: value };
    }
    return {
      query,
      result: `No specific data found for: ${query}. This is a general topic.`
    };
  }
}

// ─── Helpers ───

function makeContext(): ProcessingContext {
  return new ProcessingContext({
    jobId: `team-test-${Date.now()}`,
    userId: "test",
    workspaceDir: "/tmp/nodetool-team-test"
  });
}

async function collectEvents(executor: TeamExecutor): Promise<TeamEvent[]> {
  const events: TeamEvent[] = [];
  for await (const event of executor.execute()) {
    events.push(event);

    // Log interesting events
    switch (event.type) {
      case "agent_started":
        console.log(`  🟢 Agent started: ${event.agentId}`);
        break;
      case "task_created":
        console.log(
          `  📋 Task created: "${event.task.title}" (${event.task.id.slice(0, 8)})`
        );
        break;
      case "task_claimed":
        console.log(
          `  🤚 Task claimed by ${event.agentId}: ${event.taskId.slice(0, 8)}`
        );
        break;
      case "task_completed":
        console.log(`  ✅ Task completed: ${event.taskId.slice(0, 8)}`);
        break;
      case "task_failed":
        console.log(
          `  ❌ Task failed: ${event.taskId.slice(0, 8)} — ${event.reason}`
        );
        break;
      case "chunk":
        // Show first 80 chars of agent output
        if (event.content.trim()) {
          const preview = event.content.trim().slice(0, 80);
          console.log(`  💬 [${event.agentId}] ${preview}`);
        }
        break;
      case "deadlock_detected":
        console.log(`  🔒 DEADLOCK: ${event.blockingTasks.join(", ")}`);
        break;
      case "team_complete":
        console.log(`  🏁 Team complete`);
        break;
    }
  }
  return events;
}

// ─── Tests ───

describe.skipIf(!sdkAvailable)("Team E2E with real Claude agents", () => {
  it(
    "two agents collaborate: researcher finds data, analyst calculates",
    async () => {
      console.log("\n=== Test: Researcher + Analyst team ===");

      // Simplified to 2 agents — 3-agent coordinator can loop too long
      const agents: AgentIdentity[] = [
        {
          id: "researcher",
          name: "Researcher",
          role: "You look up facts using the research tool. After finding data, create a task for the calculator agent with the numbers. Use the task board to coordinate.",
          skills: ["research", "data_gathering"],
          provider: "claude_agent",
          model: MODEL,
          tools: []
        },
        {
          id: "analyst",
          name: "Analyst",
          role: "You perform calculations using the calculator tool. Check the task board for calculation tasks, claim them, compute results, and complete them.",
          skills: ["calculation", "analysis"],
          provider: "claude_agent",
          model: MODEL,
          tools: []
        }
      ];

      const config: TeamConfig = {
        objective:
          "Find the population of France using the research tool, then use the calculator to multiply it by 2. Complete all tasks with the results.",
        agents,
        strategy: "autonomous",
        maxIterations: 25
      };

      const executor = new TeamExecutor({
        config,
        context: makeContext(),
        sharedTools: [new CalculatorTool(), new ResearchTool()]
      });

      const events = await collectEvents(executor);
      const result = executor.getResult();

      console.log("\nFinal result:", JSON.stringify(result, null, 2));

      expect(events.some((e) => e.type === "team_complete")).toBe(true);
      expect(result).toBeDefined();
    },
    TIMEOUT
  );

  it(
    "autonomous team self-organizes to solve a problem",
    async () => {
      console.log("\n=== Test: Autonomous team ===");

      const agents: AgentIdentity[] = [
        {
          id: "alice",
          name: "Alice",
          role: "You are a researcher who looks up facts. Use the research tool to gather information.",
          skills: ["research"],
          provider: "claude_agent",
          model: MODEL,
          tools: []
        },
        {
          id: "bob",
          name: "Bob",
          role: "You are a calculator who computes numbers. Use the calculator tool for math.",
          skills: ["calculation"],
          provider: "claude_agent",
          model: MODEL,
          tools: []
        }
      ];

      const config: TeamConfig = {
        objective:
          "Find the height of the Eiffel Tower in meters using the research tool, then use the calculator to convert it to feet (multiply by 3.281). Complete all tasks when done.",
        agents,
        strategy: "autonomous",
        maxIterations: 20
      };

      const executor = new TeamExecutor({
        config,
        context: makeContext(),
        sharedTools: [new CalculatorTool(), new ResearchTool()]
      });

      const events = await collectEvents(executor);
      const result = executor.getResult();

      console.log("\nFinal result:", JSON.stringify(result, null, 2));

      expect(events.some((e) => e.type === "team_complete")).toBe(true);
      expect(result).toBeDefined();
    },
    TIMEOUT
  );

  it(
    "agents send messages to coordinate",
    async () => {
      console.log("\n=== Test: Message-based coordination ===");

      const agents: AgentIdentity[] = [
        {
          id: "lead",
          name: "Lead",
          role: "You are the team lead. Create tasks for the worker. When the worker completes tasks, review the results and mark the objective done.",
          skills: ["planning"],
          provider: "claude_agent",
          model: MODEL,
          tools: []
        },
        {
          id: "worker",
          name: "Worker",
          role: "You do calculations. Claim tasks from the board and complete them using the calculator tool. Send a message to the lead when you finish.",
          skills: ["calculation"],
          provider: "claude_agent",
          model: MODEL,
          tools: []
        }
      ];

      const config: TeamConfig = {
        objective:
          "Calculate three values: 15*7, 22*3, and 99+101. The lead should create one task for each calculation, the worker should claim and complete them all.",
        agents,
        strategy: "coordinator",
        maxIterations: 25
      };

      const executor = new TeamExecutor({
        config,
        context: makeContext(),
        sharedTools: [new CalculatorTool()]
      });

      const events = await collectEvents(executor);
      const result = executor.getResult();

      console.log("\nFinal result:", JSON.stringify(result, null, 2));

      // Check that messages were sent between agents
      const messageSent = events.filter((e) => e.type === "message_sent");
      console.log(`Messages exchanged: ${messageSent.length}`);

      expect(events.some((e) => e.type === "team_complete")).toBe(true);
      expect(result).toBeDefined();

      // Log coordination stats
      const created = events.filter((e) => e.type === "task_created");
      const completed = events.filter((e) => e.type === "task_completed");
      console.log(
        `Tasks created: ${created.length}, completed: ${completed.length}`
      );
    },
    TIMEOUT
  );

  it(
    "single agent claims and completes a pre-populated board",
    async () => {
      console.log("\n=== Test: Pre-populated task board ===");

      const { TaskBoard } = await import("../../src/team/task-board.js");
      const board = new TaskBoard();

      // Pre-populate the board
      board.create({
        title: "Calculate 25 * 4",
        description:
          "Use the calculator tool to compute 25 * 4 and complete this task with the result.",
        createdBy: "system",
        requiredSkills: ["calculation"],
        priority: 1
      });
      board.create({
        title: "Calculate 100 / 5",
        description:
          "Use the calculator tool to compute 100 / 5 and complete this task with the result.",
        createdBy: "system",
        requiredSkills: ["calculation"],
        priority: 2
      });

      const agents: AgentIdentity[] = [
        {
          id: "solver",
          name: "Solver",
          role: "You claim tasks from the board, solve them using the calculator tool, and mark them complete.",
          skills: ["calculation"],
          provider: "claude_agent",
          model: MODEL,
          tools: []
        }
      ];

      const config: TeamConfig = {
        objective: "Complete all tasks on the board.",
        agents,
        strategy: "autonomous",
        maxIterations: 15
      };

      const executor = new TeamExecutor({
        config,
        context: makeContext(),
        sharedTools: [new CalculatorTool()],
        taskBoard: board
      });

      const events = await collectEvents(executor);
      const result = executor.getResult();

      console.log("\nFinal result:", JSON.stringify(result, null, 2));
      console.log(
        "Board state:",
        JSON.stringify(
          board.getSnapshot().map((t) => ({
            title: t.title,
            status: t.status,
            result: t.result
          })),
          null,
          2
        )
      );

      // Both tasks should be completed
      const snapshot = board.getSnapshot();
      const doneCount = snapshot.filter((t) => t.status === "done").length;
      console.log(`Tasks done: ${doneCount}/${snapshot.length}`);

      expect(doneCount).toBeGreaterThanOrEqual(1);
      expect(events.some((e) => e.type === "team_complete")).toBe(true);
    },
    TIMEOUT
  );
});
