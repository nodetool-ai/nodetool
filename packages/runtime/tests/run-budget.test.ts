/**
 * The run-level bounds: what admits a turn, what refuses it, and how a loop
 * says which ceiling stopped it.
 *
 * A budget that refuses silently is indistinguishable from a model that
 * finished answering (invariant I-3), and an unpriced model booked at $0 is
 * indistinguishable from a free one (assumption A-5, invariant I-4). Both are
 * pinned here.
 */
import { describe, it, expect, vi } from "vitest";
import {
  CompositeTurnBudget,
  createCounter,
  createDeadline,
  createRunBudget,
  createSemaphore,
  isRunBudget,
  type Release,
  type RunBudget
} from "../src/turn-budget.js";
import { BaseProvider } from "../src/providers/base-provider.js";
import { CostCalculator } from "../src/providers/cost-calculator.js";
import {
  isProviderStop,
  type ProviderStop,
  type ProviderStreamItem,
  type ProviderTool
} from "../src/providers/types.js";

const PRICED_MODEL = "gpt-4o-mini";
const UNPRICED_MODEL = "a-model-nobody-prices";

function pricedTurn(inputTokens = 1000) {
  return { model: PRICED_MODEL, provider: "openai" as const, inputTokens };
}
function unpricedTurn(inputTokens = 1000) {
  return { model: UNPRICED_MODEL, provider: "openai" as const, inputTokens };
}

describe("CompositeTurnBudget: priced models", () => {
  it("behaves as the cost-capped budget does", () => {
    const budget = new CompositeTurnBudget({
      capUsd: 1,
      maxOutputTokens: 2048,
      unpricedTokenCeiling: 100
    });
    const held = budget.reserve(pricedTurn());
    expect(held).not.toBeNull();
    budget.commit(held!, 0.5);
    expect(budget.spentUsd).toBeCloseTo(0.5);
    expect(budget.unpricedTurns).toBe(0);
  });

  it("refuses a turn whose worst case would cross the cap", () => {
    const budget = new CompositeTurnBudget({
      capUsd: 0.0001,
      maxOutputTokens: 2048,
      unpricedTokenCeiling: 100
    });
    expect(budget.reserve(pricedTurn())).toBeNull();
  });
});

describe("CompositeTurnBudget: unpriced models", () => {
  it("admits a turn under the token ceiling and records it as unpriced", () => {
    const budget = new CompositeTurnBudget({
      capUsd: 1,
      maxOutputTokens: 2048,
      unpricedTokenCeiling: 5000
    });
    const held = budget.reserve(unpricedTurn(4999));
    expect(held).not.toBeNull();
    budget.commit(held!, null);
    // Never booked as $0 spend: the turn is counted where a caller can see it,
    // and `spentUsd` is a lower bound rather than a claim the turn was free.
    expect(budget.unpricedTurns).toBe(1);
    expect(budget.hasUnpricedTurns).toBe(true);
    expect(budget.spentUsd).toBe(0);
  });

  it("refuses a turn over the token ceiling and says which ceiling", () => {
    const budget = new CompositeTurnBudget({
      capUsd: 1,
      maxOutputTokens: 2048,
      unpricedTokenCeiling: 5000
    });
    expect(budget.reserve(unpricedTurn(5001))).toBeNull();
    expect(budget.lastRefusal).toBe("unpriced-token-ceiling");
    expect(budget.reserve(unpricedTurn(10))).not.toBeNull();
    expect(budget.lastRefusal).toBeNull();
  });

  it("books a cost the provider reported anyway", () => {
    const budget = new CompositeTurnBudget({
      capUsd: 1,
      maxOutputTokens: 2048,
      unpricedTokenCeiling: 5000
    });
    const held = budget.reserve(unpricedTurn(10));
    expect(held).not.toBeNull();
    budget.commit(held!, 0.02);
    expect(budget.spentUsd).toBeCloseTo(0.02);
    expect(budget.unpricedTurns).toBe(1);
  });

  it("ignores the ceiling when there is no USD cap to protect", () => {
    // Documented choice: the ceiling exists to keep a *cap* meaningful for a
    // turn that cannot be priced. With no cap, enforcing it would impose a
    // prompt limit nobody configured.
    const budget = new CompositeTurnBudget({
      capUsd: null,
      maxOutputTokens: 2048,
      unpricedTokenCeiling: 10
    });
    expect(budget.reserve(unpricedTurn(1_000_000))).not.toBeNull();
    expect(budget.reserve(pricedTurn(1_000_000))).not.toBeNull();
  });
});

describe("CompositeTurnBudget: concurrent loops", () => {
  /** Worst case of `pricedTurn()` at 2048 output tokens, from the catalog. */
  function worstCase(): number {
    const usd = CostCalculator.estimateTokenCostUsd(
      PRICED_MODEL,
      { inputTokens: 1000, outputTokens: 2048 },
      "openai"
    );
    if (usd === null) throw new Error("test model must be priced");
    return usd;
  }

  it("keeps another loop's reservation outstanding when one commits", () => {
    const budget = new CompositeTurnBudget({
      capUsd: worstCase() * 2.5,
      maxOutputTokens: 2048,
      unpricedTokenCeiling: 5000
    });
    const a = budget.reserve(pricedTurn());
    const b = budget.reserve(pricedTurn());
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(budget.reserve(pricedTurn())).toBeNull();

    // A cost nothing, so exactly one worst case of headroom comes back:
    // committing A must not release B, whose turn is still in flight.
    budget.commit(a!, 0);
    expect(budget.reserve(pricedTurn())).not.toBeNull();
    expect(budget.reserve(pricedTurn())).toBeNull();
  });

  it("books each handle by its own pricing, not by whichever reserved last", () => {
    // Invariant I-4: an unpriced turn is never booked as priced, and a priced
    // turn is never booked as unpriced, however the two interleave.
    const budget = new CompositeTurnBudget({
      capUsd: 1,
      maxOutputTokens: 2048,
      unpricedTokenCeiling: 5000
    });
    const priced = budget.reserve(pricedTurn());
    const unpriced = budget.reserve(unpricedTurn(10));
    expect(priced).not.toBeNull();
    expect(unpriced).not.toBeNull();
    expect(priced!.unpriced).toBe(false);
    expect(unpriced!.unpriced).toBe(true);

    budget.commit(priced!, null);
    expect(budget.spentUsd).toBeCloseTo(priced!.worstCaseUsd, 10);
    expect(budget.unpricedTurns).toBe(0);

    budget.commit(unpriced!, null);
    // Unknown adds nothing to the money, and is reported as a turn instead.
    expect(budget.spentUsd).toBeCloseTo(priced!.worstCaseUsd, 10);
    expect(budget.unpricedTurns).toBe(1);
  });
});

describe("Deadline", () => {
  it("is expired once its instant has passed", () => {
    expect(createDeadline(0).expired()).toBe(true);
    const live = createDeadline(60_000);
    expect(live.expired()).toBe(false);
    expect(live.remainingMs()).toBeGreaterThan(0);
  });

  it("never expires when given no bound", () => {
    const none = createDeadline(Infinity);
    expect(none.at).toBe(Infinity);
    expect(none.expired()).toBe(false);
    expect(none.remainingMs()).toBe(Infinity);
  });
});

describe("Counter", () => {
  it("stops incrementing at max", () => {
    const counter = createCounter(2);
    expect(counter.increment()).toBe(true);
    expect(counter.increment()).toBe(true);
    expect(counter.increment()).toBe(false);
    expect(counter.current).toBe(2);
    expect(counter.max).toBe(2);
  });
});

describe("Semaphore", () => {
  it("never lets more than `permits` callers hold one at once", async () => {
    const semaphore = createSemaphore(2);
    let inFlight = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        const release = await semaphore.acquire();
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight--;
        release();
      })
    );
    expect(peak).toBe(2);
    expect(semaphore.available).toBe(2);
    expect(semaphore.waiting).toBe(0);
  });

  it("hands permits to waiters in arrival order", async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire();
    const order: string[] = [];
    const first = semaphore.acquire().then((r) => {
      order.push("first");
      return r;
    });
    const second = semaphore.acquire().then((r) => {
      order.push("second");
      return r;
    });
    expect(semaphore.waiting).toBe(2);
    held();
    (await first)();
    await second;
    expect(order).toEqual(["first", "second"]);
  });

  it("ignores a double release rather than inflating the pool", async () => {
    const semaphore = createSemaphore(1);
    const release: Release = await semaphore.acquire();
    release();
    release();
    expect(semaphore.available).toBe(1);
    // A second permit would exist if the double release had counted: this
    // acquire must be the only one that resolves without waiting.
    await semaphore.acquire();
    expect(semaphore.available).toBe(0);
    expect(semaphore.waiting).toBe(0);
  });
});

describe("RunBudget", () => {
  const options = {
    capUsd: 1,
    maxOutputTokens: 2048,
    unpricedTokenCeiling: 1000,
    deadlineMs: 60_000,
    maxConcurrency: 4,
    maxTurns: 100
  };

  it("is recognized by isRunBudget; a bare turn budget is not", () => {
    const budget = createRunBudget(options);
    expect(isRunBudget(budget)).toBe(true);
    expect(isRunBudget(budget.turns)).toBe(false);
    expect(isRunBudget(undefined)).toBe(false);
  });

  it("admits a turn and counts it", () => {
    const budget = createRunBudget(options);
    expect(budget.turns.reserve(pricedTurn())).not.toBeNull();
    expect(budget.turnCount.current).toBe(1);
    expect(budget.exhausted).toBeNull();
  });

  it("refuses on an expired deadline and says so", () => {
    const budget = createRunBudget({ ...options, deadlineMs: 0 });
    expect(budget.turns.reserve(pricedTurn())).toBeNull();
    expect(budget.exhausted?.kind).toBe("deadline");
  });

  it("refuses once the turn count is spent", () => {
    const budget = createRunBudget({ ...options, maxTurns: 1 });
    const held = budget.turns.reserve(pricedTurn());
    expect(held).not.toBeNull();
    budget.turns.commit(held!, 0);
    expect(budget.turns.reserve(pricedTurn())).toBeNull();
    expect(budget.exhausted?.kind).toBe("turns");
  });

  it("names the unpriced ceiling rather than the cap when that is what refused", () => {
    // Both refusals are `kind: "cost"`, and telling a user their $1 budget ran
    // out when the real problem is a 100-token ceiling sends them to the wrong
    // setting.
    const budget = createRunBudget({ ...options, unpricedTokenCeiling: 5 });
    expect(budget.turns.reserve(unpricedTurn(500))).toBeNull();
    expect(budget.exhausted?.kind).toBe("cost");
    expect(budget.exhausted?.detail).toContain("unpriced ceiling of 5");
  });

  it("refuses on the USD cap and names it", () => {
    const budget = createRunBudget({ ...options, capUsd: 0 });
    expect(budget.turns.reserve(pricedTurn())).toBeNull();
    expect(budget.exhausted?.kind).toBe("cost");
    expect(budget.exhausted?.detail).toContain("$0");
    // A turn that was never made must not consume a turn slot — the count is
    // of model turns, and a reservation cannot be handed back.
    expect(budget.turnCount.current).toBe(0);
  });

  it("keeps the first reason when a second ceiling is hit later", () => {
    // Reporting the deadline for a run that had already run out of money would
    // point whoever reads it at the wrong limit.
    //
    // On a fake clock, because `reserve` checks the deadline before the cost:
    // against the wall clock, any pause between construction and the first
    // reserve longer than the deadline (a loaded CI runner, a GC pause) marks
    // the run exhausted on "deadline" and the first assertion fails. Time here
    // moves only when the test moves it.
    vi.useFakeTimers();
    try {
      const budget = createRunBudget({ ...options, capUsd: 0, deadlineMs: 10 });
      expect(budget.turns.reserve(pricedTurn())).toBeNull();
      expect(budget.exhausted?.kind).toBe("cost");

      vi.advanceTimersByTime(20);
      expect(budget.deadline.expired()).toBe(true);
      expect(budget.turns.reserve(pricedTurn())).toBeNull();
      expect(budget.exhausted?.kind).toBe("cost");
    } finally {
      vi.useRealTimers();
    }
  });
});

/** Counts model turns and always answers, so the loop ends on its own. */
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

/** Calls the same tool on every turn, so only a limit ends the loop. */
class LoopingProvider extends BaseProvider {
  readonly provider = "openai" as const;
  turns = 0;

  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    this.turns++;
    yield { id: `call_${this.turns}`, name: "noop", args: {} };
  }

  async generateMessage(): Promise<never> {
    throw new Error("not used");
  }
}

const NOOP_TOOL: ProviderTool = {
  name: "noop",
  description: "",
  parameters: { type: "object", properties: {} }
};

async function drain(
  stream: AsyncGenerator<ProviderStreamItem>
): Promise<ProviderStreamItem[]> {
  const items: ProviderStreamItem[] = [];
  for await (const item of stream) {
    items.push(item);
  }
  return items;
}

function stopsIn(items: ProviderStreamItem[]): ProviderStop[] {
  return items.filter(isProviderStop);
}

function loopArgs(
  provider: BaseProvider,
  extra: Record<string, unknown>
): AsyncGenerator<ProviderStreamItem> {
  return provider.generateLoop({
    messages: [{ role: "user", content: "hi" }],
    model: PRICED_MODEL,
    ...extra
  } as Parameters<BaseProvider["generateLoop"]>[0]);
}

describe("generateLoop stop signal", () => {
  it("yields exactly one budget stop, last, and makes no model call", async () => {
    const provider = new CountingProvider();
    const budget: RunBudget = createRunBudget({
      // Below the worst case of a single turn on a priced model.
      capUsd: 0.0000001,
      maxOutputTokens: 2048,
      unpricedTokenCeiling: 1000,
      deadlineMs: 60_000,
      maxConcurrency: 4,
      maxTurns: 100
    });

    const items = await drain(loopArgs(provider, { turnBudget: budget }));

    expect(provider.turns).toBe(0);
    const stops = stopsIn(items);
    expect(stops).toHaveLength(1);
    expect(stops[0]?.reason).toBe("budget");
    expect(stops[0]?.detail).toContain("$");
    expect(items[items.length - 1]).toBe(stops[0]);
  });

  it("reports a deadline stop apart from a cost stop", async () => {
    const provider = new CountingProvider();
    const budget = createRunBudget({
      capUsd: 100,
      maxOutputTokens: 2048,
      unpricedTokenCeiling: 1000,
      deadlineMs: 0,
      maxConcurrency: 4,
      maxTurns: 100
    });

    const items = await drain(loopArgs(provider, { turnBudget: budget }));

    expect(provider.turns).toBe(0);
    expect(budget.exhausted?.kind).toBe("deadline");
    const stops = stopsIn(items);
    expect(stops).toHaveLength(1);
    expect(stops[0]?.reason).toBe("deadline");
  });

  it("yields an iterations stop when the rounds run out", async () => {
    const provider = new LoopingProvider();
    const items = await drain(
      loopArgs(provider, {
        tools: [NOOP_TOOL],
        maxIterations: 2,
        executeTool: async () => "done"
      })
    );

    expect(provider.turns).toBe(2);
    const stops = stopsIn(items);
    expect(stops).toHaveLength(1);
    expect(stops[0]?.reason).toBe("iterations");
    expect(items[items.length - 1]).toBe(stops[0]);
  });

  it("yields an aborted stop when the caller cancels", async () => {
    const provider = new CountingProvider();
    const controller = new AbortController();
    controller.abort();

    const items = await drain(
      loopArgs(provider, { signal: controller.signal })
    );

    expect(provider.turns).toBe(0);
    const stops = stopsIn(items);
    expect(stops).toHaveLength(1);
    expect(stops[0]?.reason).toBe("aborted");
  });

  it("yields no stop at all when the model ends its own turn", async () => {
    const provider = new CountingProvider();
    const budget = createRunBudget({
      capUsd: 10,
      maxOutputTokens: 2048,
      unpricedTokenCeiling: 1000,
      deadlineMs: 60_000,
      maxConcurrency: 4,
      maxTurns: 100
    });

    const items = await drain(loopArgs(provider, { turnBudget: budget }));

    expect(provider.turns).toBe(1);
    expect(stopsIn(items)).toHaveLength(0);
  });

  it("still honors a bare TurnBudget, which names no ceiling", async () => {
    const provider = new CountingProvider();
    const budget = new CompositeTurnBudget({
      capUsd: 0,
      maxOutputTokens: 2048,
      unpricedTokenCeiling: 1000
    });

    const items = await drain(loopArgs(provider, { turnBudget: budget }));

    expect(provider.turns).toBe(0);
    const stops = stopsIn(items);
    expect(stops).toHaveLength(1);
    expect(stops[0]?.reason).toBe("budget");
  });
});
