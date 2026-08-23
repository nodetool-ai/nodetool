/**
 * The finishing contract of a schema'd CodeAct step: a returned value is an
 * observation, only `finish()` completes the step, a turn that ends in prose is
 * re-prompted once (bounded), and the failure message names the terminal state
 * it really hit.
 *
 * A scripted provider drives the real QuickJS sandbox. No network, no model.
 */
import { describe, it, expect } from "vitest";
import {
  CodeActExecutor,
  FINISH_CONTRACT_NUDGE,
  MAX_FINISH_NUDGES
} from "../src/codeact/codeact-executor.js";
import type { Step, Task } from "../src/types.js";
import type {
  BaseProvider,
  Message,
  ProviderStreamItem
} from "@nodetool-ai/runtime";
import { createMockContext } from "./_helpers/mock-context.js";

const ANSWER_SCHEMA = {
  type: "object",
  properties: { answer: { type: "number" } },
  required: ["answer"],
  additionalProperties: false
};

function makeStep(outputSchema?: object): { step: Step; task: Task } {
  const step: Step = {
    id: "step_1",
    instructions: "Compute the answer",
    completed: false,
    dependsOn: [],
    logs: [],
    outputSchema: outputSchema ? JSON.stringify(outputSchema) : undefined
  };
  return { step, task: { id: "task_1", title: "T", steps: [step] } };
}

/** One provider turn: a code action, or a final assistant message. */
type Turn = { code: string } | { assistant: string };

interface ScriptedProvider {
  provider: BaseProvider;
  /** The `messages` array each `generateLoop` call was given, in order. */
  calls: Message[][];
  /** Every observation string the executor handed back to a code action. */
  observations: string[];
}

/**
 * A provider whose loop is scripted per *call*: `rounds[0]` drives the first
 * `generateLoop`, `rounds[1]` the second (the nudge round), and so on. The
 * message shapes mirror BaseProvider.generateLoop — one assistant message per
 * turn, carrying `toolCalls` when the turn called a tool — because that is what
 * the executor reads to tell "stopped to explain" from "ran out of budget".
 */
function createRoundProvider(
  rounds: Turn[][],
  opts: { repeatLast?: boolean; abortOnRound?: AbortController } = {}
): ScriptedProvider {
  const calls: Message[][] = [];
  const observations: string[] = [];
  let round = 0;
  const provider = {
    provider: "fake",
    hasToolSupport: async () => true,
    async *generateLoop(args: {
      messages: Message[];
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<string | unknown>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      calls.push([...args.messages]);
      const script =
        rounds[round] ?? (opts.repeatLast ? (rounds[rounds.length - 1] ?? []) : []);
      round++;
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      let seq = 0;
      for (const turn of script) {
        if (args.signal?.aborted) break;
        if ("assistant" in turn) {
          opts.abortOnRound?.abort();
          yield {
            type: "message",
            message: { role: "assistant", content: turn.assistant }
          };
          continue;
        }
        const call = {
          id: `tc_${round}_${++seq}`,
          name: "execute_code",
          args: { title: "act", code: turn.code }
        };
        yield call;
        yield {
          type: "message",
          message: { role: "assistant", content: null, toolCalls: [call] }
        };
        const tool = toolMap.get(call.name);
        const content = await tool?.execute?.(call.args);
        const text = typeof content === "string" ? content : JSON.stringify(content);
        observations.push(text);
        yield {
          type: "message",
          message: { role: "tool", toolCallId: call.id, content: text }
        };
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
  return { provider, calls, observations };
}

function parseObservation(text: string): {
  ok: boolean;
  finished?: boolean;
  note?: string;
  result?: unknown;
} {
  return JSON.parse(text) as {
    ok: boolean;
    finished?: boolean;
    note?: string;
    result?: unknown;
  };
}

describe("a returned value does not finish a schema'd step", () => {
  it("says finished:false and names the schema when the returned value would have passed", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const scripted = createRoundProvider([
      [{ code: `return {answer: 42};` }]
    ]);
    const executor = new CodeActExecutor({
      task,
      step,
      context: createMockContext() as never,
      provider: scripted.provider,
      model: "m",
      tools: []
    });
    for await (const _ of executor.execute()) void _;

    const observation = parseObservation(scripted.observations[0] ?? "{}");
    expect(observation.ok).toBe(true);
    expect(observation.result).toEqual({ answer: 42 });
    // The point of the change: the field is present and false, not absent.
    expect(observation.finished).toBe(false);
    expect(observation.note).toContain("matches the required output schema");
    expect(observation.note).toContain("finish()");
    expect(step.completed).toBe(false);
  }, 60_000);

  it("says finished:false for a returned value that does not match the schema", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const scripted = createRoundProvider([
      [{ code: `return {answer: "forty-two"};` }]
    ]);
    const executor = new CodeActExecutor({
      task,
      step,
      context: createMockContext() as never,
      provider: scripted.provider,
      model: "m",
      tools: []
    });
    for await (const _ of executor.execute()) void _;

    const observation = parseObservation(scripted.observations[0] ?? "{}");
    expect(observation.finished).toBe(false);
    expect(observation.note).toContain("observation only");
    expect(observation.note).not.toContain("matches the required output schema");
  }, 60_000);

  it("leaves a finished action's observation alone", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const scripted = createRoundProvider([
      [{ code: `await finish({answer: 42});` }]
    ]);
    const executor = new CodeActExecutor({
      task,
      step,
      context: createMockContext() as never,
      provider: scripted.provider,
      model: "m",
      tools: []
    });
    for await (const _ of executor.execute()) void _;

    const observation = parseObservation(scripted.observations[0] ?? "{}");
    expect(observation.finished).toBe(true);
    expect(observation.note).toBeUndefined();
    expect(executor.getResult()).toEqual({ answer: 42 });
  }, 60_000);
});

describe("re-prompting a schema'd step that ended in prose", () => {
  it("nudges once and completes from the follow-up action", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const scripted = createRoundProvider([
      [{ assistant: "The answer is 42." }],
      [{ code: `await finish({answer: 42});` }]
    ]);
    const executor = new CodeActExecutor({
      task,
      step,
      context: createMockContext() as never,
      provider: scripted.provider,
      model: "m",
      tools: []
    });
    for await (const _ of executor.execute()) void _;

    expect(scripted.calls).toHaveLength(2);
    const second = scripted.calls[1] ?? [];
    expect(second.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user"
    ]);
    expect(second[3]?.content).toBe(FINISH_CONTRACT_NUDGE);
    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ answer: 42 });
  }, 60_000);

  it("stops after MAX_FINISH_NUDGES and fails with the prose in the message", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const scripted = createRoundProvider(
      [[{ assistant: "I already told you the answer is 42." }]],
      { repeatLast: true }
    );
    const executor = new CodeActExecutor({
      task,
      step,
      context: createMockContext() as never,
      provider: scripted.provider,
      model: "m",
      tools: []
    });
    for await (const _ of executor.execute()) void _;

    expect(scripted.calls).toHaveLength(MAX_FINISH_NUDGES + 1);
    expect(step.completed).toBe(false);
    expect(step.failed).toBe(true);
    expect(step.error).toContain("without calling finish()");
    expect(step.error).toContain("I already told you the answer is 42.");
  }, 60_000);

  it("does not nudge a schemaless step, which finalizes from its prose", async () => {
    const { step, task } = makeStep();
    const scripted = createRoundProvider([
      [{ assistant: "Done: the answer is 42." }]
    ]);
    const executor = new CodeActExecutor({
      task,
      step,
      context: createMockContext() as never,
      provider: scripted.provider,
      model: "m",
      tools: []
    });
    for await (const _ of executor.execute()) void _;

    expect(scripted.calls).toHaveLength(1);
    expect(step.completed).toBe(true);
    expect(executor.getResult()).toBe("Done: the answer is 42.");
  }, 60_000);

  it("does not nudge a cancelled run", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const cancel = new AbortController();
    const scripted = createRoundProvider(
      [[{ assistant: "Stopping here." }]],
      { repeatLast: true, abortOnRound: cancel }
    );
    const executor = new CodeActExecutor({
      task,
      step,
      context: createMockContext() as never,
      provider: scripted.provider,
      model: "m",
      tools: [],
      signal: cancel.signal
    });
    for await (const _ of executor.execute()) void _;

    expect(scripted.calls).toHaveLength(1);
    expect(step.completed).toBe(false);
  }, 60_000);
});

describe("the failure message names the terminal state", () => {
  it("reports the action count, not a budget it never reached", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    // The turn ends on a tool call, so this is not the prose case: no nudge.
    const scripted = createRoundProvider([[{ code: `return "thinking";` }]]);
    const executor = new CodeActExecutor({
      task,
      step,
      context: createMockContext() as never,
      provider: scripted.provider,
      model: "m",
      tools: [],
      maxIterations: 20
    });
    for await (const _ of executor.execute()) void _;

    expect(scripted.calls).toHaveLength(1);
    expect(step.error).toBe(
      "Step failed: ended after 1 action(s) without calling finish()."
    );
    expect(step.error).not.toContain("20 iterations");
  }, 60_000);

  it("still reports iteration exhaustion when the budget really ran out", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const scripted = createRoundProvider([
      [{ code: `return 1;` }, { code: `return 2;` }]
    ]);
    const executor = new CodeActExecutor({
      task,
      step,
      context: createMockContext() as never,
      provider: scripted.provider,
      model: "m",
      tools: [],
      maxIterations: 2
    });
    for await (const _ of executor.execute()) void _;

    expect(step.error).toContain("exceeded 2 iterations without completion");
  }, 60_000);
});
