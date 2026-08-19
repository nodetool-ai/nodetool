/**
 * The `costs` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `costs.ts`, so nothing the
 * implementation pulls in reaches the entry graph.
 */

import type { CapabilitySpec } from "./types.js";

export const getCostSummarySpec: CapabilitySpec = {
  name: "get_cost_summary",
  description:
    "What this account has spent on model calls over a trailing window: " +
    "totals per provider and per model, a daily series, and the most recent " +
    "executions. Read it before an expensive run to see what a comparable " +
    "one cost.",
  inputSchema: {
    type: "object",
    properties: {
      days: {
        type: "number",
        description: "Length of the trailing window in days (1–365).",
        default: 14
      },
      executions_limit: {
        type: "number",
        description: "How many recent executions to include (1–1000).",
        default: 50
      }
    },
    required: []
  },
  category: "read",
  userMessage: (params) =>
    `Reading spend for the last ${Number(params["days"] ?? 14)} days`
};

/** Every spec this module declares, in declaration order. */
export const costsSpecs: readonly CapabilitySpec[] = [getCostSummarySpec];
