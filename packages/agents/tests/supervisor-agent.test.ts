/**
 * SupervisorAgent — the LLM-backed handle.
 *
 * Every test here drives a scripted provider: no network, no model. What is
 * under test is the contract around the model — that a malformed verdict
 * bounces, that an unacceptable repair bounces, that every failure mode lands
 * on `fail`, and that the data boundary holds.
 */

import { describe, it, expect, vi } from "vitest";
import type { Escalation } from "@nodetool-ai/protocol";
import { lineageRelated, type RunStateReader } from "@nodetool-ai/kernel";
import { BaseProvider } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { SupervisorAgent } from "../src/supervisor/supervisor-agent.js";
import { buildVerdictSchema } from "../src/supervisor/verdict-schema.js";
import { createMockContext } from "./_helpers/mock-context.js";

type ScriptedCall = { name: string; args: Record<string, unknown> };

/**
 * A provider that replays a list of tool calls, one per turn, through the real
 * `BaseProvider.generateLoop`. Records the prompts it was sent so a test can
 * assert on what crossed the boundary.
 */
function scriptedProvider(turns: ScriptedCall[][]): {
  provider: BaseProvider;
  sentPrompts: () => string;
  turnsMade: () => number;
} {
  let turn = 0;
  const prompts: string[] = [];
  const provider = {
    provider: "mock",
    _cost: 0,
    hasToolSupport: async () => true,
    getTotalCost() {
      return 0;
    },
    generateMessages: async function* (args: { messages: unknown[] }) {
      prompts.push(JSON.stringify(args.messages));
      const calls = turns[turn] ?? [];
      turn++;
      for (const call of calls) {
        yield { id: `tc_${turn}_${call.name}`, name: call.name, args: call.args };
      }
      if (calls.length === 0) {
        yield { type: "chunk" as const, content: "", done: true };
      }
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
    // The base loop admits each turn through this hook; a plain-object mock
    // has to borrow it the same way it borrows the loop.
    _admitTurn: (BaseProvider.prototype as unknown as Record<string, unknown>)[
      "_admitTurn"
    ],
    generateMessage: vi.fn(),
    getContainerEnv: () => ({}),
    isContextLengthError: () => false
  } as unknown as BaseProvider;
  return {
    provider,
    sentPrompts: () => prompts.join("\n"),
    turnsMade: () => turn
  };
}

function escalation(overrides: Partial<Escalation> = {}): Escalation {
  return {
    nodeId: "n1",
    nodeType: "test.Node",
    correlationLineage: [],
    invocationKey: "",
    allowedActions: ["skip", "fail"],
    detail: "boom",
    inputs: {},
    declaredOutputs: { output: "str" },
    attempt: 1,
    spentCostUsd: 0,
    createdAssets: false,
    retrySafe: false,
    emitted: false,
    ...overrides
  };
}

function emptyReader(): RunStateReader {
  return {
    digest: () => ({ jobId: "j", nodes: [], costUsd: 0 }),
    readOutput: () => null
  };
}

function makeContext(): ProcessingContext {
  return createMockContext() as unknown as ProcessingContext;
}

const NEVER_ABORTED = new AbortController().signal;

/**
 * Any model the pricing catalog knows. Reservation fails closed on an unpriced
 * model, so a test that wants the model called has to name a real one.
 */
const PRICED_MODEL = "gpt-4o-mini";

describe("SupervisorAgent", () => {
  it("returns the model's verdict, tagged as an agent decision", async () => {
    const { provider } = scriptedProvider([
      [
        {
          name: "finish_step",
          args: {
            result: { action: "skip", rationale: "item 7 is unparseable" }
          }
        }
      ]
    ]);
    const agent = new SupervisorAgent({
      provider,
      model: PRICED_MODEL,
      context: makeContext()
    });
    agent.attach(emptyReader());

    const outcome = await agent.decide(escalation(), NEVER_ABORTED);

    expect(outcome.verdict).toEqual({ action: "skip" });
    expect(outcome.decidedBy).toBe("agent");
  });

  it("writes the decision and its rationale to supervisor: memory", async () => {
    const { provider } = scriptedProvider([
      [
        {
          name: "finish_step",
          args: { result: { action: "skip", rationale: "row 7 has no id" } }
        }
      ]
    ]);
    const context = makeContext();
    const agent = new SupervisorAgent({
      provider,
      model: PRICED_MODEL,
      context
    });
    agent.attach(emptyReader());

    await agent.decide(escalation({ invocationKey: "root=7" }), NEVER_ABORTED);

    const entry = context.memory.get("supervisor:n1:root=7");
    expect(entry).toBeDefined();
    expect((entry?.value as { rationale: string }).rationale).toBe(
      "row 7 has no id"
    );
  });

  it("bounces a verdict outside the allowed set, then accepts the correction", async () => {
    const { provider, turnsMade } = scriptedProvider([
      // `retry` is not in this escalation's allowed set.
      [
        {
          name: "finish_step",
          args: { result: { action: "retry", rationale: "worth another go" } }
        }
      ],
      [
        {
          name: "finish_step",
          args: { result: { action: "fail", rationale: "not recoverable" } }
        }
      ]
    ]);
    const agent = new SupervisorAgent({
      provider,
      model: PRICED_MODEL,
      context: makeContext()
    });
    agent.attach(emptyReader());

    const outcome = await agent.decide(escalation(), NEVER_ABORTED);

    expect(outcome.verdict).toEqual({ action: "fail" });
    expect(outcome.decidedBy).toBe("agent");
    expect(turnsMade()).toBe(2);
  });

  it("bounces a substitute whose value does not match the declared output", async () => {
    const { provider } = scriptedProvider([
      [
        {
          name: "finish_step",
          args: {
            result: {
              action: "substitute",
              outputs: { output: 42 },
              rationale: "close enough"
            }
          }
        }
      ],
      [
        {
          name: "finish_step",
          args: {
            result: {
              action: "substitute",
              outputs: { output: "42" },
              rationale: "typed correctly this time"
            }
          }
        }
      ]
    ]);
    const agent = new SupervisorAgent({
      provider,
      model: PRICED_MODEL,
      context: makeContext()
    });
    agent.attach(emptyReader());

    const outcome = await agent.decide(
      escalation({ allowedActions: ["substitute", "skip", "fail"] }),
      NEVER_ABORTED
    );

    expect(outcome.verdict).toEqual({
      action: "substitute",
      outputs: { output: "42" }
    });
  });

  it("fails when the model never produces a usable verdict", async () => {
    const { provider } = scriptedProvider([[], [], [], [], [], []]);
    const agent = new SupervisorAgent({
      provider,
      model: PRICED_MODEL,
      context: makeContext()
    });
    agent.attach(emptyReader());

    const outcome = await agent.decide(escalation(), NEVER_ABORTED);

    expect(outcome.verdict).toEqual({ action: "fail" });
    expect(outcome.decidedBy).toBe("bounds");
  });

  it("fails when the provider throws", async () => {
    const provider = {
      provider: "mock",
      getTotalCost: () => 0,
      generateLoop: async function* () {
        throw new Error("401 from provider");
      },
      isContextLengthError: () => false
    } as unknown as BaseProvider;
    const agent = new SupervisorAgent({
      provider,
      model: PRICED_MODEL,
      context: makeContext()
    });

    const outcome = await agent.decide(escalation(), NEVER_ABORTED);

    expect(outcome.verdict).toEqual({ action: "fail" });
    expect(outcome.decidedBy).toBe("bounds");
  });

  it("fails without calling the model when the decision is already aborted", async () => {
    const { provider, turnsMade } = scriptedProvider([
      [
        {
          name: "finish_step",
          args: { result: { action: "skip", rationale: "too late" } }
        }
      ]
    ]);
    const agent = new SupervisorAgent({
      provider,
      model: PRICED_MODEL,
      context: makeContext()
    });
    agent.attach(emptyReader());

    const aborted = AbortSignal.abort();
    const outcome = await agent.decide(escalation(), aborted);

    expect(outcome.verdict).toEqual({ action: "fail" });
    expect(turnsMade()).toBe(0);
  });

  it("refuses to run at all on a model with no known price", async () => {
    const { provider, turnsMade } = scriptedProvider([
      [
        {
          name: "finish_step",
          args: { result: { action: "skip", rationale: "never asked" } }
        }
      ]
    ]);
    const agent = new SupervisorAgent({
      provider,
      model: "a-model-nobody-prices",
      context: makeContext()
    });
    agent.attach(emptyReader());

    const outcome = await agent.decide(escalation(), NEVER_ABORTED);

    expect(outcome.verdict).toEqual({ action: "fail" });
    expect(outcome.decidedBy).toBe("bounds");
    expect(turnsMade()).toBe(0);
  });

  it("refuses a sibling item's output in a fan-out", async () => {
    const { provider, sentPrompts } = scriptedProvider([
      [{ name: "read_node_output", args: { node_id: "producer" } }],
      [
        {
          name: "finish_step",
          args: { result: { action: "skip", rationale: "item 7 is bad" } }
        }
      ]
    ]);
    // The runner only holds item 3's output; item 7 is the one that failed.
    const reader: RunStateReader = {
      digest: () => ({ jobId: "j", nodes: [], costUsd: 0 }),
      readOutput: (_nodeId, lineage) =>
        lineageRelated(["items=3"], lineage)
          ? {
              nodeId: "producer",
              lineage: ["items=3"],
              outputs: { text: "belongs to item 3" }
            }
          : null
    };
    const agent = new SupervisorAgent({
      provider,
      model: PRICED_MODEL,
      context: makeContext()
    });
    agent.attach(reader);

    await agent.decide(
      escalation({ correlationLineage: ["items=7"], invocationKey: "items=7" }),
      NEVER_ABORTED
    );

    expect(sentPrompts()).toContain("not_available");
    expect(sentPrompts()).not.toContain("belongs to item 3");
  });

  it("stops mid-decision when the signal fires between turns", async () => {
    const controller = new AbortController();
    const { provider, turnsMade } = scriptedProvider([
      // A tool call keeps the loop going; the abort lands before the next turn.
      [{ name: "get_run_state", args: {} }],
      [
        {
          name: "finish_step",
          args: { result: { action: "skip", rationale: "never reached" } }
        }
      ]
    ]);
    const reader: RunStateReader = {
      digest: () => {
        controller.abort();
        return { jobId: "j", nodes: [], costUsd: 0 };
      },
      readOutput: () => null
    };
    const agent = new SupervisorAgent({
      provider,
      model: PRICED_MODEL,
      context: makeContext()
    });
    agent.attach(reader);

    const outcome = await agent.decide(escalation(), controller.signal);

    expect(outcome.verdict).toEqual({ action: "fail" });
    expect(turnsMade()).toBe(1);
  });

  it("masks a secret planted in a read_node_output result", async () => {
    const { provider, sentPrompts } = scriptedProvider([
      [{ name: "read_node_output", args: { node_id: "producer" } }],
      [
        {
          name: "finish_step",
          args: { result: { action: "fail", rationale: "upstream is broken" } }
        }
      ]
    ]);
    const context = createMockContext() as unknown as ProcessingContext;
    (
      context as unknown as { getResolvedSecretValues: () => Set<string> }
    ).getResolvedSecretValues = () => new Set(["sk-live-DEADBEEF"]);

    const reader: RunStateReader = {
      digest: () => ({ jobId: "j", nodes: [], costUsd: 0 }),
      readOutput: () => ({
        nodeId: "producer",
        lineage: [],
        outputs: { header: "Bearer sk-live-DEADBEEF" }
      })
    };
    const agent = new SupervisorAgent({
      provider,
      model: PRICED_MODEL,
      context
    });
    agent.attach(reader);

    await agent.decide(escalation(), NEVER_ABORTED);

    expect(sentPrompts()).toContain("producer");
    expect(sentPrompts()).not.toContain("sk-live-DEADBEEF");
  });
});

describe("buildVerdictSchema", () => {
  it("offers only the actions the kernel would accept", () => {
    const schema = buildVerdictSchema(["skip", "fail"]);
    const actions = (schema["oneOf"] as Array<Record<string, unknown>>).map(
      (branch) =>
        (
          (branch["properties"] as Record<string, Record<string, unknown>>)[
            "action"
          ] as { const: string }
        ).const
    );
    expect(actions).toEqual(["skip", "fail"]);
  });

  it("requires outputs on the substitute branch only", () => {
    const schema = buildVerdictSchema(["substitute", "fail"]);
    const [substitute, fail] = schema["oneOf"] as Array<
      Record<string, unknown>
    >;
    expect(substitute["required"]).toContain("outputs");
    expect(fail["required"]).not.toContain("outputs");
  });
});
