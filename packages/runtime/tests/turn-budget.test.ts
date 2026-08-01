import { describe, it, expect } from "vitest";
import { CostCappedTurnBudget } from "../src/turn-budget.js";
import { BaseProvider } from "../src/providers/base-provider.js";
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
    expect(budget.reserve(turn())).toBe(true);
  });

  it("refuses a turn whose worst case would cross the cap", () => {
    // The whole point of reserving: spent-so-far is not the number that
    // decides. A cap this tight cannot cover even one worst-case turn.
    const budget = new CostCappedTurnBudget({
      capUsd: 0.0001,
      maxOutputTokens: 2048
    });
    expect(budget.reserve(turn())).toBe(false);
  });

  it("holds the ceiling against a turn that costs more than the headroom", () => {
    const budget = new CostCappedTurnBudget({
      capUsd: 0.5,
      maxOutputTokens: 2048
    });
    expect(budget.reserve(turn())).toBe(true);
    budget.commit(0.49);
    expect(budget.spentUsd).toBeCloseTo(0.49);
    // $0.49 spent, and the next turn's worst case is ~$0.30. Checking spent
    // cost alone would admit it and land at $0.79.
    expect(budget.reserve({ ...turn(), inputTokens: 1_000_000 })).toBe(false);
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
    ).toBe(false);
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
    ).toBe(true);
  });

  it("accumulates reservations until a turn commits", () => {
    const budget = new CostCappedTurnBudget({
      capUsd: 0.002,
      maxOutputTokens: 2048
    });
    expect(budget.reserve(turn())).toBe(true);
    // Nothing committed yet, so the outstanding worst case still counts.
    expect(budget.reserve(turn())).toBe(false);
  });
});

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
    for await (const _item of provider.generateLoop({
      messages: [{ role: "user", content: "hi" }],
      model: PRICED_MODEL,
      turnBudget: budget
    } as Parameters<BaseProvider["generateLoop"]>[0])) {
      // drain
    }
    expect(provider.turns).toBe(0);
  });
});
