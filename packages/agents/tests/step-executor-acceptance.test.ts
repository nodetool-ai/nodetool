/**
 * The two `StepExecutor` extensions the supervisor needed, tested as the
 * general features they are: host-side validation of the whole declared
 * schema, and an async acceptance callback that can reject a schema-valid
 * result into the still-open conversation.
 */

import { describe, it, expect, vi } from "vitest";
import { AgentMemory, BaseProvider } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  StepExecutor,
  MAX_REPAIR_ROUNDS,
  type StepResultAcceptance
} from "../src/step-executor.js";
import type { Step, Task } from "../src/types.js";

function scriptedProvider(results: unknown[]): BaseProvider {
  let turn = 0;
  return {
    provider: "mock",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    generateMessages: async function* () {
      const result = results[Math.min(turn, results.length - 1)];
      turn++;
      yield { id: `tc_${turn}`, name: "finish_step", args: { result } };
    },
    async *generateMessagesTraced(args: unknown) {
      yield* (
        this as unknown as {
          generateMessages: (a: unknown) => AsyncGenerator<unknown>;
        }
      ).generateMessages(args);
    },
    generateLoop(args: unknown) {
      return (
        BaseProvider.prototype as unknown as {
          generateLoop: (a: unknown) => AsyncGenerator<unknown>;
        }
      ).generateLoop.call(this, args);
    },
    _admitTurn: () => true,
    generateMessage: vi.fn(),
    getContainerEnv: () => ({}),
    isContextLengthError: () => false
  } as unknown as BaseProvider;
}

function makeContext(): ProcessingContext {
  return {
    memory: new AgentMemory(),
    workspaceDir: null,
    storeStepResult: vi.fn(async (key: string) => key),
    loadStepResult: vi.fn(),
    set: vi.fn(),
    get: vi.fn()
  } as unknown as ProcessingContext;
}

function makeStep(outputSchema: unknown): { step: Step; task: Task } {
  const step: Step = {
    id: "s1",
    instructions: "produce a value",
    completed: false,
    dependsOn: [],
    outputSchema: JSON.stringify(outputSchema),
    logs: []
  };
  return { step, task: { id: "t1", title: "t", steps: [step] } };
}

async function run(executor: StepExecutor): Promise<void> {
  for await (const _message of executor.execute()) {
    // drain
  }
}

describe("StepExecutor host-side schema validation", () => {
  it("rejects a value outside a declared enum, then accepts the correction", async () => {
    const { step, task } = makeStep({
      type: "object",
      properties: { action: { type: "string", enum: ["skip", "fail"] } },
      required: ["action"]
    });
    const executor = new StepExecutor({
      task,
      step,
      context: makeContext(),
      provider: scriptedProvider([{ action: "retry" }, { action: "skip" }]),
      model: "m"
    });

    await run(executor);

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ action: "skip" });
  });

  it("checks nested properties, not just the top level", async () => {
    const { step, task } = makeStep({
      type: "object",
      properties: {
        outputs: {
          type: "object",
          properties: { count: { type: "integer" } },
          required: ["count"]
        }
      },
      required: ["outputs"]
    });
    const executor = new StepExecutor({
      task,
      step,
      context: makeContext(),
      provider: scriptedProvider([
        { outputs: { count: "seven" } },
        { outputs: { count: 7 } }
      ]),
      model: "m"
    });

    await run(executor);

    expect(executor.getResult()).toEqual({ outputs: { count: 7 } });
  });

  it("does not enforce additionalProperties the caller never declared", async () => {
    // `properties: {}` means "an object". The sanitizer adds
    // `additionalProperties: false` for strict providers; that is transport,
    // not the contract, and must not reject a result here.
    const { step, task } = makeStep({ type: "object", properties: {} });
    const executor = new StepExecutor({
      task,
      step,
      context: makeContext(),
      provider: scriptedProvider([{ anything: true }]),
      model: "m"
    });

    await run(executor);

    expect(executor.getResult()).toEqual({ anything: true });
  });
});

describe("StepExecutor acceptance callback", () => {
  it("bounces a rejected result back into the conversation", async () => {
    const { step, task } = makeStep({ type: "object" });
    const seen: unknown[] = [];
    const acceptResult = async (
      result: unknown
    ): Promise<StepResultAcceptance> => {
      seen.push(result);
      return (result as { ok?: boolean }).ok === true
        ? { accepted: true }
        : { accepted: false, reason: "uri does not resolve" };
    };
    const executor = new StepExecutor({
      task,
      step,
      context: makeContext(),
      provider: scriptedProvider([{ ok: false }, { ok: true }]),
      model: "m",
      acceptResult
    });

    await run(executor);

    expect(seen).toEqual([{ ok: false }, { ok: true }]);
    expect(step.completed).toBe(true);
  });

  it("fails the step after the repair rounds run out", async () => {
    const { step, task } = makeStep({ type: "object" });
    const executor = new StepExecutor({
      task,
      step,
      context: makeContext(),
      provider: scriptedProvider([{ ok: false }]),
      model: "m",
      acceptResult: async () => ({
        accepted: false,
        reason: "uri does not resolve"
      })
    });

    await run(executor);

    expect(step.completed).toBe(false);
    expect(step.failed).toBe(true);
    expect(step.error).toContain(`after ${MAX_REPAIR_ROUNDS} attempts`);
    expect(step.error).toContain("uri does not resolve");
  });
});
