/**
 * The `costs` capability module — what this account has spent.
 *
 * A run that picks its own models is spending the user's money, and until now
 * it had no way to see the bill: `nodetool costs` reads the prediction ledger
 * from the CLI, the Costs dashboard reads it over tRPC, and sandboxed code
 * could reach neither. Reading is the whole module. There is deliberately no
 * counterpart that adjusts a budget or buys credit — see the withheld table in
 * `api-coverage.ts`.
 *
 * Scoped to the caller: `aggregateDashboard` takes the user id and every query
 * behind it filters on that column, so one account's spend is all a run can
 * ever see.
 */

import type { CapabilityExport, CapabilityModule } from "./types.js";
import { userIdOf } from "../tools/mcp-tool-support.js";
import { getCostSummarySpec } from "./costs.specs.js";

/** Clamp a caller-supplied window to what the aggregate accepts. */
function bounded(value: unknown, fallback: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

const getCostSummary: CapabilityExport = {
  spec: getCostSummarySpec,
  impl: async (run, params) => {
    const { Prediction } = await import("@nodetool-ai/models");
    return Prediction.aggregateDashboard(userIdOf(run.context), {
      days: bounded(params["days"], 14, 365),
      executionsLimit: bounded(params["executions_limit"], 50, 1000)
    });
  }
};

export const COST_CAPABILITIES: readonly CapabilityExport[] = [getCostSummary];

export const module: CapabilityModule = {
  module: "costs",
  exports: COST_CAPABILITIES
};

export { getCostSummary };
