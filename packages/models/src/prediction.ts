/**
 * Prediction model -- tracks AI provider call costs and token usage.
 *
 * Port of Python's `nodetool.models.prediction`.
 */

import { eq, and, desc } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { predictions } from "./schema/predictions.js";

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

export class Prediction extends DBModel {
  static override table = predictions;

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

  constructor(data: Record<string, unknown>) {
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

  /** Find a prediction by ID. */
  static async find(predictionId: string): Promise<Prediction | null> {
    return Prediction.get<Prediction>(predictionId);
  }

  static async paginate(
    userId: string,
    opts: {
      provider?: string | null;
      model?: string | null;
      limit?: number;
      startKey?: string;
    } = {}
  ): Promise<[Prediction[], string]> {
    const { limit = 50, provider, model } = opts;
    const db = getDb();

    const conditions = [eq(predictions.user_id, userId)];
    if (provider) conditions.push(eq(predictions.provider, provider));
    if (model) conditions.push(eq(predictions.model, model));

    const rows = db
      .select()
      .from(predictions)
      .where(and(...conditions))
      .orderBy(desc(predictions.created_at))
      .limit(limit + 1)
      .all();

    const items = rows.map((r) => new Prediction(r as Record<string, unknown>));
    if (items.length <= limit) return [items, ""];
    items.pop();
    const cursor = items[items.length - 1]?.id ?? "";
    return [items, cursor];
  }

  static async aggregateByUser(
    userId: string,
    opts?: { provider?: string | null; model?: string | null }
  ): Promise<AggregateResult> {
    const db = getDb();
    const conditions = [eq(predictions.user_id, userId)];
    if (opts?.provider)
      conditions.push(eq(predictions.provider, opts.provider));
    if (opts?.model) conditions.push(eq(predictions.model, opts.model));

    const rows = db
      .select()
      .from(predictions)
      .where(and(...conditions))
      .limit(10000)
      .all();

    let total_cost = 0;
    let total_input_tokens = 0;
    let total_output_tokens = 0;
    let total_tokens = 0;

    for (const p of rows) {
      total_cost += (p.cost as number) ?? 0;
      total_input_tokens += (p.input_tokens as number) ?? 0;
      total_output_tokens += (p.output_tokens as number) ?? 0;
      total_tokens += (p.total_tokens as number) ?? 0;
    }

    return {
      user_id: userId,
      provider: opts?.provider ?? null,
      model: opts?.model ?? null,
      total_cost,
      total_input_tokens,
      total_output_tokens,
      total_tokens,
      call_count: rows.length
    };
  }

  static async aggregateByProvider(
    userId: string
  ): Promise<ProviderAggregateResult[]> {
    const db = getDb();
    const rows = db
      .select()
      .from(predictions)
      .where(eq(predictions.user_id, userId))
      .limit(10000)
      .all();

    const groups = new Map<string, ProviderAggregateResult>();
    for (const p of rows) {
      const prov = p.provider as string;
      let entry = groups.get(prov);
      if (!entry) {
        entry = {
          provider: prov,
          total_cost: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_tokens: 0,
          call_count: 0
        };
        groups.set(prov, entry);
      }
      entry.total_cost += (p.cost as number) ?? 0;
      entry.total_input_tokens += (p.input_tokens as number) ?? 0;
      entry.total_output_tokens += (p.output_tokens as number) ?? 0;
      entry.total_tokens += (p.total_tokens as number) ?? 0;
      entry.call_count += 1;
    }

    return [...groups.values()];
  }

  static async aggregateByModel(
    userId: string,
    opts?: { provider?: string | null }
  ): Promise<ModelAggregateResult[]> {
    const db = getDb();
    const conditions = [eq(predictions.user_id, userId)];
    if (opts?.provider)
      conditions.push(eq(predictions.provider, opts.provider));

    const rows = db
      .select()
      .from(predictions)
      .where(and(...conditions))
      .limit(10000)
      .all();

    const groups = new Map<string, ModelAggregateResult>();
    for (const p of rows) {
      const prov = p.provider as string;
      const mod = p.model as string;
      const key = `${prov}::${mod}`;
      let entry = groups.get(key);
      if (!entry) {
        entry = {
          provider: prov,
          model: mod,
          total_cost: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_tokens: 0,
          call_count: 0
        };
        groups.set(key, entry);
      }
      entry.total_cost += (p.cost as number) ?? 0;
      entry.total_input_tokens += (p.input_tokens as number) ?? 0;
      entry.total_output_tokens += (p.output_tokens as number) ?? 0;
      entry.total_tokens += (p.total_tokens as number) ?? 0;
      entry.call_count += 1;
    }

    return [...groups.values()];
  }
}
