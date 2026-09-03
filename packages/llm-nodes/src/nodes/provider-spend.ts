/**
 * Report what an LLM node spent, so a workflow run leaves a ledger row.
 *
 * A chat turn's token spend reaches `nodetool_predictions` because
 * `ChatTurn._logProviderCall` writes the provider instance's running total at
 * the end of the turn. A workflow node had no equivalent: `trackUsage` reached
 * only the in-memory invocation account, so a job whose only node was an
 * `Agent` had no prediction row and `nodetool_jobs.cost` stayed null.
 *
 * The path that already writes a row is the one FAL and kie use:
 * `context.setProviderCost()` -> `node_update.provider_cost` ->
 * `recordNodeProviderCost`. This meter puts a token-billed node on it — snapshot
 * the provider's running cost and token counts, run the loop, report the
 * difference.
 */

import type {
  BaseProvider,
  ProcessingContext,
  ProviderUsageTotals
} from "@nodetool-ai/runtime";

/** The slice of `ProcessingContext` this meter needs. */
export type SpendReporter = Pick<ProcessingContext, "setProviderCost">;

/** The slice of a provider this meter reads. Both are running totals. */
export type SpendSource = Pick<BaseProvider, "provider" | "cost"> & {
  usageTotals?: ProviderUsageTotals;
};

/** An open measurement. Call {@link ProviderSpendMeter.report} exactly once. */
export interface ProviderSpendMeter {
  /**
   * Charge the node with everything the provider booked since the meter
   * opened. Safe to call from a `finally`: a second call reports nothing, so a
   * failure path books whatever was spent before the throw and no more.
   */
  report(): void;
}

const ZERO_USAGE: ProviderUsageTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0
};

/** Copied, not aliased: the snapshot must not move when the provider does. */
function readUsage(provider: SpendSource): ProviderUsageTotals {
  return { ...(provider.usageTotals ?? ZERO_USAGE) };
}

/**
 * Start measuring one node's provider spend.
 *
 * Provider instances are cached per `ProcessingContext` (`getProvider` memoizes
 * into `_providers`), and every run path builds a fresh context —
 * `buildWorkspaceExecutionContext` in `ExecutionSession.create` and in
 * `service/workflow-run.ts`. So a workflow started from a chat via
 * `run_workflow` never shares the chat turn's provider instance, and this delta
 * can never be the same money `ChatTurn._logProviderCall` already wrote. Within
 * one run the instance *is* shared between nodes, which is why this reports a
 * before/after difference rather than the running total.
 */
export function meterProviderSpend(
  context: SpendReporter,
  provider: SpendSource,
  model: string
): ProviderSpendMeter {
  const startCost = provider.cost;
  const startUsage = readUsage(provider);
  let reported = false;

  return {
    report(): void {
      if (reported) return;
      reported = true;

      const amount = provider.cost - startCost;
      // A zero would be stored as a real zero and read as "this call was
      // free" — the one thing it is not. An unpriced model leaves the running
      // total flat, and the run stays honestly unmeasured instead.
      if (!Number.isFinite(amount) || amount <= 0) return;

      const usage = readUsage(provider);
      const inputTokens = usage.inputTokens - startUsage.inputTokens;
      const outputTokens = usage.outputTokens - startUsage.outputTokens;
      const cachedTokens = usage.cachedTokens - startUsage.cachedTokens;
      const billedTokens = inputTokens + outputTokens;

      context.setProviderCost(provider.provider, amount, "USD", {
        model,
        currency: "USD",
        billing_unit: billedTokens > 0 ? "tokens" : null,
        quantity: billedTokens > 0 ? billedTokens : null,
        input_tokens: inputTokens > 0 ? inputTokens : null,
        output_tokens: outputTokens > 0 ? outputTokens : null,
        cached_tokens: cachedTokens > 0 ? cachedTokens : null
      });
    }
  };
}
