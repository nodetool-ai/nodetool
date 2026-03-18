/**
 * Prediction model -- tracks AI provider call costs and token usage.
 *
 * Port of Python's `nodetool.models.prediction`.
 */

import type { TableSchema } from "./database-adapter.js";
import type { Row } from "./database-adapter.js";
import {
  DBModel,
  createTimeOrderedUuid,
  type IndexSpec,
  type ModelClass,
} from "./base-model.js";
import { field } from "./condition-builder.js";

// ── Aggregate result types ──────────────────────────────────────────

export interface AggregateResult {
  user_id: string;
  provider?: string | null;
  model?: string | null;
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  call_count: number;
}

export interface ProviderAggregateResult {
  provider: string;
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  call_count: number;
}

export interface ModelAggregateResult {
  provider: string;
  model: string;
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  call_count: number;
}

// ── Schema ───────────────────────────────────────────────────────────

const PREDICTION_SCHEMA: TableSchema = {
  table_name: "nodetool_predictions",
  primary_key: "id",
  columns: {
    id: { type: "string" },
    user_id: { type: "string" },
    node_id: { type: "string" },
    provider: { type: "string" },
    model: { type: "string" },
    workflow_id: { type: "string", optional: true },
    error: { type: "string", optional: true },
    logs: { type: "string", optional: true },
    status: { type: "string" },
    cost: { type: "number", optional: true },
    input_tokens: { type: "number", optional: true },
    output_tokens: { type: "number", optional: true },
    total_tokens: { type: "number", optional: true },
    cached_tokens: { type: "number", optional: true },
    reasoning_tokens: { type: "number", optional: true },
    created_at: { type: "datetime", optional: true },
    started_at: { type: "datetime", optional: true },
    completed_at: { type: "datetime", optional: true },
    duration: { type: "number", optional: true },
    hardware: { type: "string", optional: true },
    input_size: { type: "number", optional: true },
    output_size: { type: "number", optional: true },
    parameters: { type: "json", optional: true },
    metadata: { type: "json", optional: true },
  },
};

const PREDICTION_INDEXES: IndexSpec[] = [
  { name: "idx_predictions_user_id", columns: ["user_id"], unique: false },
  {
    name: "idx_predictions_user_provider",
    columns: ["user_id", "provider"],
    unique: false,
  },
  {
    name: "idx_prediction_created_at",
    columns: ["created_at"],
    unique: false,
  },
  {
    name: "idx_prediction_user_model",
    columns: ["user_id", "model"],
    unique: false,
  },
];

// ── Model ────────────────────────────────────────────────────────────

export class Prediction extends DBModel {
  static override schema = PREDICTION_SCHEMA;
  static override indexes = PREDICTION_INDEXES;

  declare id: string;
  declare user_id: string;
  declare node_id: string;
  declare provider: string;
  declare model: string;
  declare workflow_id: string | null;
  declare error: string | null;
  declare logs: string | null;
  declare status: string;
  declare cost: number | null;
  declare input_tokens: number | null;
  declare output_tokens: number | null;
  declare total_tokens: number | null;
  declare cached_tokens: number | null;
  declare reasoning_tokens: number | null;
  declare created_at: string | null;
  declare started_at: string | null;
  declare completed_at: string | null;
  declare duration: number | null;
  declare hardware: string | null;
  declare input_size: number | null;
  declare output_size: number | null;
  declare parameters: Record<string, unknown> | null;
  declare metadata: Record<string, unknown> | null;

  constructor(data: Row) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.created_at ??= now;
    this.node_id ??= "";
    this.provider ??= "";
    this.model ??= "";
    this.status ??= "pending";
    this.workflow_id ??= null;
    this.error ??= null;
    this.logs ??= null;
    this.cost ??= null;
    this.input_tokens ??= null;
    this.output_tokens ??= null;
    this.total_tokens ??= null;
    this.cached_tokens ??= null;
    this.reasoning_tokens ??= null;
    this.started_at ??= null;
    this.completed_at ??= null;
    this.duration ??= null;
    this.hardware ??= null;
    this.input_size ??= null;
    this.output_size ??= null;
    this.parameters ??= null;
    this.metadata ??= null;
  }

  // ── Static queries ───────────────────────────────────────────────

  /** Find a prediction by ID. */
  static async find(predictionId: string): Promise<Prediction | null> {
    return (await (Prediction as unknown as ModelClass<Prediction>).get(
      predictionId,
    )) as Prediction | null;
  }

  static async paginate(
    userId: string,
    opts: {
      provider?: string | null;
      model?: string | null;
      limit?: number;
      startKey?: string;
    } = {},
  ): Promise<[Prediction[], string]> {
    const { limit = 50, provider, model } = opts;
    let cond = field("user_id").equals(userId);
    if (provider) cond = cond.and(field("provider").equals(provider));
    if (model) cond = cond.and(field("model").equals(model));

    return (Prediction as unknown as ModelClass<Prediction>).query({
      condition: cond,
      orderBy: "created_at",
      reverse: true,
      limit,
    });
  }

  static async aggregateByUser(
    userId: string,
    opts?: { provider?: string | null; model?: string | null },
  ): Promise<AggregateResult> {
    let cond = field("user_id").equals(userId);
    if (opts?.provider) cond = cond.and(field("provider").equals(opts.provider));
    if (opts?.model) cond = cond.and(field("model").equals(opts.model));

    const [predictions] = await (
      Prediction as unknown as ModelClass<Prediction>
    ).query({ condition: cond, limit: 10000 });

    let total_cost = 0;
    let total_input_tokens = 0;
    let total_output_tokens = 0;
    let total_tokens = 0;

    for (const p of predictions) {
      total_cost += p.cost ?? 0;
      total_input_tokens += p.input_tokens ?? 0;
      total_output_tokens += p.output_tokens ?? 0;
      total_tokens += p.total_tokens ?? 0;
    }

    return {
      user_id: userId,
      provider: opts?.provider ?? null,
      model: opts?.model ?? null,
      total_cost,
      total_input_tokens,
      total_output_tokens,
      total_tokens,
      call_count: predictions.length,
    };
  }

  static async aggregateByProvider(
    userId: string,
  ): Promise<ProviderAggregateResult[]> {
    const cond = field("user_id").equals(userId);
    const [predictions] = await (
      Prediction as unknown as ModelClass<Prediction>
    ).query({ condition: cond, limit: 10000 });

    const groups = new Map<string, ProviderAggregateResult>();
    for (const p of predictions) {
      let entry = groups.get(p.provider);
      if (!entry) {
        entry = {
          provider: p.provider,
          total_cost: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_tokens: 0,
          call_count: 0,
        };
        groups.set(p.provider, entry);
      }
      entry.total_cost += p.cost ?? 0;
      entry.total_input_tokens += p.input_tokens ?? 0;
      entry.total_output_tokens += p.output_tokens ?? 0;
      entry.total_tokens += p.total_tokens ?? 0;
      entry.call_count += 1;
    }

    return [...groups.values()];
  }

  static async aggregateByModel(
    userId: string,
    opts?: { provider?: string | null },
  ): Promise<ModelAggregateResult[]> {
    let cond = field("user_id").equals(userId);
    if (opts?.provider) cond = cond.and(field("provider").equals(opts.provider));

    const [predictions] = await (
      Prediction as unknown as ModelClass<Prediction>
    ).query({ condition: cond, limit: 10000 });

    const groups = new Map<string, ModelAggregateResult>();
    for (const p of predictions) {
      const key = `${p.provider}::${p.model}`;
      let entry = groups.get(key);
      if (!entry) {
        entry = {
          provider: p.provider,
          model: p.model,
          total_cost: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_tokens: 0,
          call_count: 0,
        };
        groups.set(key, entry);
      }
      entry.total_cost += p.cost ?? 0;
      entry.total_input_tokens += p.input_tokens ?? 0;
      entry.total_output_tokens += p.output_tokens ?? 0;
      entry.total_tokens += p.total_tokens ?? 0;
      entry.call_count += 1;
    }

    return [...groups.values()];
  }
}
