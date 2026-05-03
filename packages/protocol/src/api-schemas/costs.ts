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
