/**
 * Tests for the plan-approval gate in Agent.execute: rejection aborts the
 * run, rejection-with-feedback triggers a replan, and the callback is picked
 * up from the ProcessingContext when not passed as an option.
 */

import { describe, it, expect, vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "../src/agent.js";
import {
  PLAN_APPROVAL_CONTEXT_KEY,
  type PlanApprovalDecision,
  type TaskPlan
} from "../src/types.js";
import type {
  BaseProvider as BaseProviderType,
  ProcessingContext,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";
import type { ProcessingMessage, PlanningUpdate } from "@nodetool-ai/protocol";
import { createMockContext } from "./_helpers/mock-context.js";

const OBJECTIVE = "Research and write outreach";

function scriptedPlanCalls(): ToolCall[] {
  return [
    {
      id: "tc_add_1",
      name: "add_task",
      args: {
        id: "task_research",
        title: "Research the prospect",
        depends_on: [],
        steps: [
          {
            id: "task_research_s1",
            instructions: "Search the web",
            depends_on: []
          }
        ]
      }
    },
    { id: "tc_finish", name: "finish_plan", args: { title: "Outreach Plan" } }
  ];
}

/** Provider that replays the plan script on every generateLoop invocation. */
function createLoopProvider(script: ToolCall[]): {
  provider: BaseProviderType;
  getLoopCalls: () => number;
} {
  let loopCalls = 0;
  const provider = {
    provider: "sdk_loop",
    hasToolSupport: async () => true,
    async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
      yield { type: "chunk", content: "", done: true };
    },
    async *generateMessagesTraced(): AsyncGenerator<ProviderStreamItem> {
      yield { type: "chunk", content: "", done: true };
    },
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<string | unknown>;
        terminal?: boolean;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      loopCalls++;
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      for (const tc of script) {
        if (args.signal?.aborted) break;
        yield tc;
        const tool = toolMap.get(tc.name);
        const content = tool?.execute ? await tool.execute(tc.args) : "";
        yield {
          type: "message",
          message: {
            role: "tool",
            toolCallId: tc.id,
            content:
              typeof content === "string" ? content : JSON.stringify(content)
          }
        };
        if (tool?.terminal) break;
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProviderType;
  return { provider, getLoopCalls: () => loopCalls };
}

function makeAgent(
  provider: BaseProviderType,
  requestPlanApproval?: (plan: TaskPlan) => Promise<PlanApprovalDecision>
): Agent {
  return new Agent({
    name: "plan-approval-test",
    objective: OBJECTIVE,
    provider,
    model: "opus",
    workspace: join(tmpdir(), `plan-approval-test-${Date.now()}`),
    requestPlanApproval
  });
}

async function drain(
  gen: AsyncGenerator<ProcessingMessage>
): Promise<ProcessingMessage[]> {
  const messages: ProcessingMessage[] = [];
  for await (const msg of gen) {
    messages.push(msg);
  }
  return messages;
}

function approvalUpdates(messages: ProcessingMessage[]): PlanningUpdate[] {
  return messages.filter(
    (m): m is PlanningUpdate =>
      m.type === "planning_update" &&
      (m as PlanningUpdate).phase === "awaiting_approval"
  );
}

describe("Agent plan approval gate", () => {
  it("aborts the run with a rejection notice when the plan is rejected", async () => {
    const { provider, getLoopCalls } = createLoopProvider(scriptedPlanCalls());
    const requestApproval = vi.fn(
      async (): Promise<PlanApprovalDecision> => ({ decision: "reject" })
    );
    const agent = makeAgent(provider, requestApproval);

    const messages = await drain(
      agent.execute(createMockContext() as ProcessingContext)
    );

    expect(requestApproval).toHaveBeenCalledTimes(1);
    // Only the planning loop ran — no step execution, no compiler.
    expect(getLoopCalls()).toBe(1);
    expect(agent.getResults()).toBe("Plan rejected by user.");

    const updates = approvalUpdates(messages);
    expect(updates.some((u) => u.status === "Running")).toBe(true);
    expect(updates.some((u) => u.status === "Failed")).toBe(true);
  });

  it("replans when rejected with feedback, presenting the revised plan", async () => {
    const { provider, getLoopCalls } = createLoopProvider(scriptedPlanCalls());
    const decisions: PlanApprovalDecision[] = [
      { decision: "reject", feedback: "Add a verification task" },
      { decision: "reject" }
    ];
    const seenPlans: TaskPlan[] = [];
    const requestApproval = vi.fn(
      async (plan: TaskPlan): Promise<PlanApprovalDecision> => {
        seenPlans.push(plan);
        return decisions.shift() ?? { decision: "reject" };
      }
    );
    const agent = makeAgent(provider, requestApproval);

    await drain(agent.execute(createMockContext() as ProcessingContext));

    // Two approval round-trips: original plan, then the revised plan built by
    // a second planning loop.
    expect(requestApproval).toHaveBeenCalledTimes(2);
    expect(getLoopCalls()).toBe(2);
    expect(seenPlans).toHaveLength(2);
    expect(agent.getResults()).toBe("Plan rejected by user.");
  });

  it("proceeds without gating when no callback is configured", async () => {
    const { provider } = createLoopProvider(scriptedPlanCalls());
    const agent = makeAgent(provider);

    const messages = await drain(
      agent.execute(createMockContext() as ProcessingContext)
    );

    expect(approvalUpdates(messages)).toHaveLength(0);
    // Execution went past planning (the plan is set and tasks ran).
    expect(agent.taskPlan?.title).toBe("Outreach Plan");
  });

  it("picks up the approval callback from the ProcessingContext", async () => {
    const { provider, getLoopCalls } = createLoopProvider(scriptedPlanCalls());
    const requestApproval = vi.fn(
      async (): Promise<PlanApprovalDecision> => ({ decision: "reject" })
    );
    const agent = makeAgent(provider);

    const context = createMockContext();
    context.set(PLAN_APPROVAL_CONTEXT_KEY, requestApproval);

    await drain(agent.execute(context as ProcessingContext));

    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(getLoopCalls()).toBe(1);
    expect(agent.getResults()).toBe("Plan rejected by user.");
  });
});
