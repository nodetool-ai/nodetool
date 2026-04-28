import { Prediction, type AggregateResult } from "@nodetool-ai/models";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import {
  listPredictionsInput,
  listPredictionsOutput,
  aggregateInput,
  aggregateByUserOutput,
  aggregateByProviderOutput,
  aggregateByModelInput,
  aggregateByModelOutput,
  summaryOutput,
  type PredictionResponse,
  type AggregateByUserOutput
} from "@nodetool-ai/protocol/api-schemas/costs.js";

function toPredictionResponse(pred: Prediction): PredictionResponse {
  return {
    id: pred.id,
    user_id: pred.user_id,
    node_id: pred.node_id ?? "",
    provider: pred.provider,
    model: pred.model,
    workflow_id: pred.workflow_id ?? null,
    cost: pred.cost ?? null,
    input_tokens: pred.input_tokens ?? null,
    output_tokens: pred.output_tokens ?? null,
    total_tokens: pred.total_tokens ?? null,
    cached_tokens: pred.cached_tokens ?? null,
    reasoning_tokens: pred.reasoning_tokens ?? null,
    created_at: pred.created_at,
    metadata: pred.metadata ?? null
  };
}

/**
 * Normalize `AggregateResult` → `AggregateByUserOutput` by coercing optional
 * `provider`/`model` (which can be `undefined`) to `null` so the shape matches
 * the zod schema. Mocks in tests may return either shape.
 */
function normalizeAggregate(agg: AggregateResult): AggregateByUserOutput {
  return {
    user_id: agg.user_id,
    provider: agg.provider ?? null,
    model: agg.model ?? null,
    total_cost: agg.total_cost,
    total_input_tokens: agg.total_input_tokens,
    total_output_tokens: agg.total_output_tokens,
    total_tokens: agg.total_tokens,
    call_count: agg.call_count
  };
}

export const costsRouter = router({
  list: protectedProcedure
    .input(listPredictionsInput)
    .output(listPredictionsOutput)
    .query(async ({ ctx, input }) => {
      const [calls, nextKey] = await Prediction.paginate(ctx.userId, {
        provider: input.provider,
        model: input.model,
        limit: input.limit,
        startKey: input.startKey
      });
      return {
        calls: calls.map(toPredictionResponse),
        next_start_key: nextKey || null
      };
    }),

  aggregate: protectedProcedure
    .input(aggregateInput)
    .output(aggregateByUserOutput)
    .query(async ({ ctx, input }) => {
      const result = await Prediction.aggregateByUser(ctx.userId, {
        provider: input.provider,
        model: input.model
      });
      return normalizeAggregate(result);
    }),

  aggregateByProvider: protectedProcedure
    .output(aggregateByProviderOutput)
    .query(async ({ ctx }) => {
      return Prediction.aggregateByProvider(ctx.userId);
    }),

  aggregateByModel: protectedProcedure
    .input(aggregateByModelInput)
    .output(aggregateByModelOutput)
    .query(async ({ ctx, input }) => {
      return Prediction.aggregateByModel(ctx.userId, {
        provider: input.provider
      });
    }),

  summary: protectedProcedure.output(summaryOutput).query(async ({ ctx }) => {
    const [overall, byProvider, byModel, paginated] = await Promise.all([
      Prediction.aggregateByUser(ctx.userId),
      Prediction.aggregateByProvider(ctx.userId),
      Prediction.aggregateByModel(ctx.userId),
      Prediction.paginate(ctx.userId, { limit: 10 })
    ]);
    const [recentCalls] = paginated;
    return {
      overall: normalizeAggregate(overall),
      by_provider: byProvider,
      by_model: byModel,
      recent_calls: recentCalls.map(toPredictionResponse)
    };
  })
});
