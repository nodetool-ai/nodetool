import { z } from "zod";

// ── Input schemas ──────────────────────────────────────────────────

export const listPredictionsInput = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(50),
  startKey: z.string().optional()
});

export const aggregateInput = z.object({
  provider: z.string().optional(),
  model: z.string().optional()
});

export const aggregateByModelInput = z.object({
  provider: z.string().optional()
});

// ── Response schemas ───────────────────────────────────────────────

/**
 * Shape returned by `toPredictionResponse` in cost-api.ts.
 * Mirrors `Prediction` model fields exposed by the REST handler — note `node_id`
 * is coalesced to `""` (never null), and other optional fields are coalesced
 * to `null`.
 */
export const predictionResponse = z.object({
  id: z.string(),
  user_id: z.string(),
  node_id: z.string(),
  provider: z.string(),
  model: z.string(),
  workflow_id: z.string().nullable(),
  cost: z.number().nullable(),
  input_tokens: z.number().nullable(),
  output_tokens: z.number().nullable(),
  total_tokens: z.number().nullable(),
  cached_tokens: z.number().nullable(),
  reasoning_tokens: z.number().nullable(),
  billing_unit: z.string().nullable(),
  quantity: z.number().nullable(),
  unit_price: z.number().nullable(),
  currency: z.string().nullable(),
  created_at: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable()
});

export const listPredictionsOutput = z.object({
  calls: z.array(predictionResponse),
  next_start_key: z.string().nullable()
});

/**
 * Shape returned by `Prediction.aggregateByUser(userId, opts)` —
 * see `AggregateResult` in `packages/models/src/prediction.ts`.
 */
export const aggregateByUserOutput = z.object({
  user_id: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  total_cost: z.number(),
  total_input_tokens: z.number(),
  total_output_tokens: z.number(),
  total_tokens: z.number(),
  call_count: z.number()
});

/**
 * Shape of one element returned by `Prediction.aggregateByProvider(userId)` —
 * see `ProviderAggregateResult`.
 */
export const providerAggregate = z.object({
  provider: z.string(),
  total_cost: z.number(),
  total_input_tokens: z.number(),
  total_output_tokens: z.number(),
  total_tokens: z.number(),
  call_count: z.number()
});

export const aggregateByProviderOutput = z.array(providerAggregate);

/**
 * Shape of one element returned by `Prediction.aggregateByModel(userId, opts)` —
 * see `ModelAggregateResult`.
 */
export const modelAggregate = z.object({
  provider: z.string(),
  model: z.string(),
  total_cost: z.number(),
  total_input_tokens: z.number(),
  total_output_tokens: z.number(),
  total_tokens: z.number(),
  call_count: z.number()
});

export const aggregateByModelOutput = z.array(modelAggregate);

export const summaryOutput = z.object({
  overall: aggregateByUserOutput,
  by_provider: aggregateByProviderOutput,
  by_model: aggregateByModelOutput,
  recent_calls: z.array(predictionResponse)
});

// ── Dashboard (windowed analytics) ─────────────────────────────────

/**
 * Input for the cost dashboard aggregation. `days` is the trailing window;
 * `tzOffsetMinutes` is the client's `Date.getTimezoneOffset()` so daily
 * buckets align with the viewer's local calendar.
 */
export const dashboardInput = z.object({
  days: z.number().int().min(1).max(365).default(14),
  tzOffsetMinutes: z.number().int().min(-840).max(840).default(0),
  executionsLimit: z.number().int().min(1).max(1000).default(200)
});

export const dashboardProvider = z.object({
  provider: z.string(),
  total_cost: z.number(),
  call_count: z.number()
});

export const dashboardDay = z.object({
  /** Local calendar day, `YYYY-MM-DD`. */
  date: z.string(),
  /** Spend per provider for the day. */
  totals: z.record(z.string(), z.number())
});

export const dashboardModel = z.object({
  provider: z.string(),
  model: z.string(),
  total_cost: z.number(),
  call_count: z.number()
});

export const dashboardStats = z.object({
  total_cost: z.number(),
  call_count: z.number(),
  failed_count: z.number(),
  avg_per_call: z.number(),
  top_model: dashboardModel.nullable(),
  prior_total_cost: z.number(),
  /** `(total - prior) / prior`; null when the prior window had no spend. */
  delta_fraction: z.number().nullable()
});

export const dashboardExecution = z.object({
  id: z.string(),
  node_id: z.string(),
  workflow_id: z.string().nullable(),
  workflow_name: z.string().nullable(),
  provider: z.string(),
  model: z.string(),
  cost: z.number().nullable(),
  input_tokens: z.number().nullable(),
  output_tokens: z.number().nullable(),
  total_tokens: z.number().nullable(),
  duration: z.number().nullable(),
  status: z.string(),
  created_at: z.string().nullable()
});

export const dashboardOutput = z.object({
  window: z.object({
    start: z.string(),
    end: z.string(),
    days: z.number()
  }),
  providers: z.array(dashboardProvider),
  daily: z.array(dashboardDay),
  models: z.array(dashboardModel),
  stats: dashboardStats,
  executions: z.array(dashboardExecution)
});

// ── Inferred types ─────────────────────────────────────────────────

export type ListPredictionsInput = z.infer<typeof listPredictionsInput>;
export type AggregateInput = z.infer<typeof aggregateInput>;
export type AggregateByModelInput = z.infer<typeof aggregateByModelInput>;
export type PredictionResponse = z.infer<typeof predictionResponse>;
export type ListPredictionsOutput = z.infer<typeof listPredictionsOutput>;
export type AggregateByUserOutput = z.infer<typeof aggregateByUserOutput>;
export type ProviderAggregate = z.infer<typeof providerAggregate>;
export type AggregateByProviderOutput = z.infer<typeof aggregateByProviderOutput>;
export type ModelAggregate = z.infer<typeof modelAggregate>;
export type AggregateByModelOutput = z.infer<typeof aggregateByModelOutput>;
export type SummaryOutput = z.infer<typeof summaryOutput>;
export type DashboardInput = z.infer<typeof dashboardInput>;
export type DashboardProvider = z.infer<typeof dashboardProvider>;
export type DashboardDay = z.infer<typeof dashboardDay>;
export type DashboardModel = z.infer<typeof dashboardModel>;
export type DashboardStats = z.infer<typeof dashboardStats>;
export type DashboardExecution = z.infer<typeof dashboardExecution>;
export type DashboardOutput = z.infer<typeof dashboardOutput>;
