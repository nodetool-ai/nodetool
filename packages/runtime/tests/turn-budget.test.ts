import { describe, it, expect } from "vitest";
import { CostCappedTurnBudget } from "../src/turn-budget.js";
import { CostCalculator } from "../src/providers/cost-calculator.js";
import { BaseProvider } from "../src/providers/base-provider.js";
import { OpenAIProvider } from "../src/providers/openai-provider.js";
import { isProviderStop } from "../src/providers/types.js";
import type { ProviderStreamItem } from "../src/providers/types.js";

const PRICED_MODEL = "gpt-4o-mini";

function turn(inputTokens = 1000) {
  return { model: PRICED_MODEL, provider: "openai" as const, inputTokens };
}

describe("CostCappedTurnBudget", () => {
  it("admits a turn whose worst case fits under the cap", () => {
    const budget = new CostCappedTurnBudget({
      capUsd: 1,
      maxOutputTokens: 2048
    });
    expect(budget.reserve(turn())).not.toBeNull();
  });

  it("refuses a turn whose worst case would cross the cap", () => {
    // The whole point of reserving: spent-so-far is not the number that
    // decides. A cap this tight cannot cover even one worst-case turn.
    const budget = new CostCappedTurnBudget({
      capUsd: 0.0001,
      maxOutputTokens: 2048
    });
    expect(budget.reserve(turn())).toBeNull();
  });

  it("holds the ceiling against a turn that costs more than the headroom", () => {
    const budget = new CostCappedTurnBudget({
      capUsd: 0.5,
      maxOutputTokens: 2048
    });
    const held = budget.reserve(turn());
    expect(held).not.toBeNull();
    budget.commit(held!, 0.49);
    expect(budget.spentUsd).toBeCloseTo(0.49);
    // $0.49 spent, and the next turn's worst case is ~$0.30. Checking spent
    // cost alone would admit it and land at $0.79.
    expect(budget.reserve({ ...turn(), inputTokens: 1_000_000 })).toBeNull();
  });

  it("refuses every turn on a model with no price", () => {
    const budget = new CostCappedTurnBudget({
      capUsd: 100,
      maxOutputTokens: 2048
    });
    expect(
      budget.reserve({
        model: "a-model-nobody-prices",
        provider: "openai",
        inputTokens: 10
      })
    ).toBeNull();
  });

  it("treats a local provider as free rather than unpriced", () => {
    const budget = new CostCappedTurnBudget({
      capUsd: 0.000001,
      maxOutputTokens: 2048
    });
    expect(
      budget.reserve({
        model: "qwen-3.5:4b",
        provider: "ollama",
        inputTokens: 100000
      })
    ).not.toBeNull();
  });

  it("accumulates reservations until a turn commits", () => {
    const budget = new CostCappedTurnBudget({
      capUsd: 0.002,
      maxOutputTokens: 2048
    });
    expect(budget.reserve(turn())).not.toBeNull();
    // Nothing committed yet, so the outstanding worst case still counts.
    expect(budget.reserve(turn())).toBeNull();
  });
});

/** Fails every turn, so the reservation has to be released by the loop. */
class ThrowingProvider extends BaseProvider {
  readonly provider = "openai" as const;

  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    throw new Error("network exploded");
  }

  async generateMessage(): Promise<never> {
    throw new Error("not used");
  }
}

/** Minimal provider whose only job is to report turns taken. */
class CountingProvider extends BaseProvider {
  readonly provider = "openai" as const;
  turns = 0;

  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    this.turns++;
    yield { type: "chunk", content: "ok", done: true };
  }

  async generateMessage(): Promise<never> {
    throw new Error("not used");
  }
}

describe("generateLoop turn admission", () => {
  it("makes the turn when the budget admits it", async () => {
    const provider = new CountingProvider();
    const budget = new CostCappedTurnBudget({
      capUsd: 1,
      maxOutputTokens: 2048
    });
    for await (const _item of provider.generateLoop({
      messages: [{ role: "user", content: "hi" }],
      model: PRICED_MODEL,
      turnBudget: budget
    } as Parameters<BaseProvider["generateLoop"]>[0])) {
      // drain
    }
    expect(provider.turns).toBe(1);
  });

  it("makes no call at all when the budget refuses", async () => {
    const provider = new CountingProvider();
    const budget = new CostCappedTurnBudget({
      capUsd: 0,
      maxOutputTokens: 2048
    });
    const items: ProviderStreamItem[] = [];
    for await (const item of provider.generateLoop({
      messages: [{ role: "user", content: "hi" }],
      model: PRICED_MODEL,
      turnBudget: budget
    } as Parameters<BaseProvider["generateLoop"]>[0])) {
      items.push(item);
    }
    expect(provider.turns).toBe(0);
    // A silent return here reads exactly like a model that finished answering,
    // which is how a budget stop went unnoticed by every consumer.
    expect(items.filter(isProviderStop).map((s) => s.reason)).toEqual([
      "budget"
    ]);
  });
});

/**
 * Every supported OpenAI model (the gpt-5 family) is served by the Responses
 * loop, which drives its own turns. An override that ignored the budget would
 * make the cap advisory for the entire catalog, so the admission gate is
 * checked directly.
 */
describe("OpenAI Responses loop honors the budget", () => {
  const RESPONSES_MODEL = "gpt-5.4-mini";

  function provider(): {
    instance: OpenAIProvider;
    turnsCollected: () => number;
  } {
    const instance = new OpenAIProvider(
      { OPENAI_API_KEY: "test-key" },
      { client: {} as never }
    );
    let turns = 0;
    const patched = instance as unknown as Record<string, unknown>;
    patched["buildResponsesRequest"] = async () => ({});
    patched["collectResponsesTurn"] = async function* () {
      turns++;
    };
    return { instance, turnsCollected: () => turns };
  }

  it("makes the turn when the budget admits it", async () => {
    const { instance, turnsCollected } = provider();
    const budget = new CostCappedTurnBudget({
      capUsd: 1,
      maxOutputTokens: 2048
    });
    for await (const _item of instance.generateLoop({
      messages: [{ role: "user", content: "hi" }],
      model: RESPONSES_MODEL,
      turnBudget: budget
    } as Parameters<OpenAIProvider["generateLoop"]>[0])) {
      // drain
    }
    expect(turnsCollected()).toBe(1);
  });

  it("makes no call at all when the budget refuses", async () => {
    const { instance, turnsCollected } = provider();
    const budget = new CostCappedTurnBudget({
      capUsd: 0,
      maxOutputTokens: 2048
    });
    const items: ProviderStreamItem[] = [];
    for await (const item of instance.generateLoop({
      messages: [{ role: "user", content: "hi" }],
      model: RESPONSES_MODEL,
      turnBudget: budget
    } as Parameters<OpenAIProvider["generateLoop"]>[0])) {
      items.push(item);
    }
    expect(turnsCollected()).toBe(0);
    expect(items.filter(isProviderStop).map((s) => s.reason)).toEqual([
      "budget"
    ]);
  });
});

describe("reservation release on a failed turn", () => {
  it("does not leave a failed turn's reservation outstanding", async () => {
    // The budget is run-level and outlives the decision that hit the error, so
    // a stranded reservation would quietly shrink the cap for the rest of the
    // run — refusing later turns that had the headroom all along.
    const provider = new ThrowingProvider();
    const budget = new CostCappedTurnBudget({
      capUsd: 0.002,
      maxOutputTokens: 2048
    });

    await expect(async () => {
      for await (const _item of provider.generateLoop({
        messages: [{ role: "user", content: "hi" }],
        model: PRICED_MODEL,
        turnBudget: budget
      } as Parameters<BaseProvider["generateLoop"]>[0])) {
        // drain
      }
    }).rejects.toThrow("network exploded");

    expect(budget.spentUsd).toBe(0);
    // Headroom is intact: the next turn is admitted, as it would have been
    // had the failed one never happened.
    expect(budget.reserve(turn())).not.toBeNull();
  });
});

describe("unreported spend", () => {
  it("charges the reservation when the turn's cost was never reported", () => {
    // The Claude Agent SDK reports usage only on a terminal `result` message,
    // and an aborted session never emits one — which is how a supervisor
    // decision normally ends, since `finish_step` aborts the query. Booking
    // that as free would mean the cap never counted a decision at all.
    const budget = new CostCappedTurnBudget({
      capUsd: 1,
      maxOutputTokens: 2048
    });
    const held = budget.reserve(turn());
    expect(held).not.toBeNull();
    budget.commit(held!, null);
    expect(budget.spentUsd).toBeGreaterThan(0);
  });

  it("charges nothing for a reservation this budget never handed out", () => {
    const budget = new CostCappedTurnBudget({
      capUsd: 1,
      maxOutputTokens: 2048
    });
    // A handle from somewhere else, or one already settled: neither is spend.
    budget.commit({ worstCaseUsd: 0.25, unpriced: false }, null);
    expect(budget.spentUsd).toBe(0);
  });
});

describe("concurrent reservations", () => {
  /** Worst case of `turn()` at 2048 output tokens, read from the same catalog. */
  function worstCase(): number {
    const usd = CostCalculator.estimateTokenCostUsd(
      PRICED_MODEL,
      { inputTokens: 1000, outputTokens: 2048 },
      "openai"
    );
    if (usd === null) throw new Error("test model must be priced");
    return usd;
  }

  it("releases only the reservation being committed", () => {
    // One budget, several loops in flight at once (a chat turn plus its
    // sub-agents). Committing one loop's turn must not hand back the headroom
    // another loop is still holding.
    const budget = new CostCappedTurnBudget({
      capUsd: worstCase() * 2.5,
      maxOutputTokens: 2048
    });
    const a = budget.reserve(turn());
    const b = budget.reserve(turn());
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // Two worst cases outstanding: a third does not fit.
    expect(budget.reserve(turn())).toBeNull();

    // A cost nothing, so exactly one worst case of headroom comes back — B's
    // reservation is still held.
    budget.commit(a!, 0);
    expect(budget.reserve(turn())).not.toBeNull();
    expect(budget.reserve(turn())).toBeNull();
  });

  it("charges the handed-in reservation, not whichever one is outstanding", () => {
    const budget = new CostCappedTurnBudget({
      capUsd: worstCase() * 4,
      maxOutputTokens: 2048
    });
    const small = budget.reserve(turn(10));
    const large = budget.reserve(turn(1000));
    expect(small).not.toBeNull();
    expect(large).not.toBeNull();
    // Unknown is charged as *this* reservation's worst case, not as the sum
    // of every one in flight.
    budget.commit(small!, null);
    expect(budget.spentUsd).toBeCloseTo(small!.worstCaseUsd, 10);
    budget.commit(large!, null);
    expect(budget.spentUsd).toBeCloseTo(
      small!.worstCaseUsd + large!.worstCaseUsd,
      10
    );
  });
});
