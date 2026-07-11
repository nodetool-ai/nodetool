/**
 * Prediction model -- tracks AI provider call costs and token usage.
 *
 * Port of Python's `nodetool.models.prediction`.
 */

import { eq, and, desc, gte, lt, lte, inArray } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { predictions } from "./schema/predictions.js";
import { workflows } from "./schema/workflows.js";

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

export interface DashboardProviderResult {
  provider: string;
  total_cost: number;
  call_count: number;
}

export interface DashboardModelResult {
  provider: string;
  model: string;
  total_cost: number;
  call_count: number;
}

export interface DashboardDayResult {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Spend per provider for the day. */
  totals: Record<string, number>;
}

export interface DashboardExecutionResult {
  id: string;
  node_id: string;
  node_type: string;
  workflow_id: string | null;
  workflow_name: string | null;
  provider: string;
  model: string;
  cost: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  duration: number | null;
  status: string;
  created_at: string | null;
}

export interface DashboardResult {
  window: { start: string; end: string; days: number };
  providers: DashboardProviderResult[];
  daily: DashboardDayResult[];
  models: DashboardModelResult[];
  stats: {
    total_cost: number;
    call_count: number;
    failed_count: number;
    avg_per_call: number;
    top_model: DashboardModelResult | null;
    prior_total_cost: number;
    delta_fraction: number | null;
  };
  executions: DashboardExecutionResult[];
}

const DAY_MS = 86_400_000;
const pad2 = (n: number): string => String(n).padStart(2, "0");
const localDayString = (localMs: number): string => {
  const d = new Date(localMs);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate()
  )}`;
};

export class Prediction extends DBModel {
  static override table = predictions;

  declare id: string;
  declare user_id: string;
  declare node_id: string;
  declare node_type: string;
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
  declare billing_unit: string | null;
  declare quantity: number | null;
  declare unit_price: number | null;
  declare currency: string | null;
  declare provider_request_id: string | null;
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
    this.node_type ??= "";
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
    this.billing_unit ??= null;
    this.quantity ??= null;
    this.unit_price ??= null;
    this.currency ??= null;
    this.provider_request_id ??= null;
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

    const rows = await db
      .select()
      .from(predictions)
      .where(and(...conditions))
      .orderBy(desc(predictions.created_at))
      .limit(limit + 1)

    const items = rows.map((r: Record<string, unknown>) => new Prediction(r as Record<string, unknown>));
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

    const rows = await db
      .select()
      .from(predictions)
      .where(and(...conditions))
      .limit(10000)

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
    const rows = await db
      .select()
      .from(predictions)
      .where(eq(predictions.user_id, userId))
      .limit(10000)

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

    const rows = await db
      .select()
      .from(predictions)
      .where(and(...conditions))
      .limit(10000)

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

  /**
   * Aggregate everything the cost dashboard needs for a trailing window in a
   * couple of queries: per-provider totals, a per-provider daily series,
   * per-model totals, headline stats (incl. prior-window delta) and the most
   * recent executions with workflow names resolved.
   *
   * Days are bucketed in the viewer's local calendar via `tzOffsetMinutes`
   * (the client's `Date.getTimezoneOffset()`). `created_at` is an ISO string,
   * which sorts chronologically, so the range filter works as a lexical
   * comparison.
   */
  static async aggregateDashboard(
    userId: string,
    opts: {
      days?: number;
      tzOffsetMinutes?: number;
      executionsLimit?: number;
    } = {}
  ): Promise<DashboardResult> {
    const days = opts.days ?? 14;
    const tzMs = (opts.tzOffsetMinutes ?? 0) * 60_000;
    const execLimit = opts.executionsLimit ?? 200;
    const db = getDb();

    const nowMs = Date.now();
    const todayLocalMidnight =
      Math.floor((nowMs - tzMs) / DAY_MS) * DAY_MS;
    const startLocal = todayLocalMidnight - (days - 1) * DAY_MS;
    const startUtcMs = startLocal + tzMs;
    const priorStartUtcMs = startUtcMs - days * DAY_MS;

    const startIso = new Date(startUtcMs).toISOString();
    const endIso = new Date(nowMs).toISOString();
    const priorStartIso = new Date(priorStartUtcMs).toISOString();

    const [rows, priorRows] = await Promise.all([
      db
        .select()
        .from(predictions)
        .where(
          and(
            eq(predictions.user_id, userId),
            gte(predictions.created_at, startIso),
            lte(predictions.created_at, endIso)
          )
        )
        .orderBy(desc(predictions.created_at))
        .limit(20000),
      db
        .select({ cost: predictions.cost })
        .from(predictions)
        .where(
          and(
            eq(predictions.user_id, userId),
            gte(predictions.created_at, priorStartIso),
            lt(predictions.created_at, startIso)
          )
        )
        .limit(20000)
    ]);

    let prior_total_cost = 0;
    for (const r of priorRows) prior_total_cost += (r.cost as number) ?? 0;

    const daily: DashboardDayResult[] = Array.from({ length: days }, (_, i) => ({
      date: localDayString(startLocal + i * DAY_MS),
      totals: {}
    }));

    const providerMap = new Map<string, DashboardProviderResult>();
    const modelMap = new Map<string, DashboardModelResult>();
    let total_cost = 0;
    let failed_count = 0;

    for (const p of rows) {
      const cost = (p.cost as number) ?? 0;
      const provider = (p.provider as string) || "unknown";
      const model = (p.model as string) || "unknown";
      const status = (p.status as string) ?? "";
      total_cost += cost;
      if (status === "failed" || status === "error") failed_count += 1;

      let pe = providerMap.get(provider);
      if (!pe) {
        pe = { provider, total_cost: 0, call_count: 0 };
        providerMap.set(provider, pe);
      }
      pe.total_cost += cost;
      pe.call_count += 1;

      const mkey = `${provider}::${model}`;
      let me = modelMap.get(mkey);
      if (!me) {
        me = { provider, model, total_cost: 0, call_count: 0 };
        modelMap.set(mkey, me);
      }
      me.total_cost += cost;
      me.call_count += 1;

      const created = p.created_at as string | null;
      if (created) {
        const idx = Math.floor(
          (Date.parse(created) - tzMs - startLocal) / DAY_MS
        );
        if (idx >= 0 && idx < days) {
          const bucket = daily[idx].totals;
          bucket[provider] = (bucket[provider] ?? 0) + cost;
        }
      }
    }

    const providers = [...providerMap.values()].sort(
      (a, b) => b.total_cost - a.total_cost
    );
    const models = [...modelMap.values()].sort(
      (a, b) => b.total_cost - a.total_cost
    );

    const call_count = rows.length;
    const delta_fraction =
      prior_total_cost > 0
        ? (total_cost - prior_total_cost) / prior_total_cost
        : null;

    const recent = rows.slice(0, execLimit);
    const wfIdSet = new Set<string>();
    for (const p of recent) {
      const wf = p.workflow_id as string | null;
      if (wf) wfIdSet.add(wf);
    }
    const wfIds = [...wfIdSet];
    const wfNames = new Map<string, string>();
    if (wfIds.length > 0) {
      const wfRows = await db
        .select({ id: workflows.id, name: workflows.name })
        .from(workflows)
        .where(inArray(workflows.id, wfIds));
      for (const w of wfRows) wfNames.set(w.id as string, w.name as string);
    }

    const executions: DashboardExecutionResult[] = [];
    for (const p of recent) {
      const workflow_id = (p.workflow_id as string | null) ?? null;
      executions.push({
        id: p.id as string,
        node_id: (p.node_id as string) ?? "",
        node_type: (p.node_type as string) ?? "",
        workflow_id,
        workflow_name: workflow_id ? (wfNames.get(workflow_id) ?? null) : null,
        provider: (p.provider as string) ?? "",
        model: (p.model as string) ?? "",
        cost: (p.cost as number | null) ?? null,
        input_tokens: (p.input_tokens as number | null) ?? null,
        output_tokens: (p.output_tokens as number | null) ?? null,
        total_tokens: (p.total_tokens as number | null) ?? null,
        duration: (p.duration as number | null) ?? null,
        status: (p.status as string) ?? "",
        created_at: (p.created_at as string | null) ?? null
      });
    }

    return {
      window: { start: startIso, end: endIso, days },
      providers,
      daily,
      models,
      stats: {
        total_cost,
        call_count,
        failed_count,
        avg_per_call: call_count > 0 ? total_cost / call_count : 0,
        top_model: models[0] ?? null,
        prior_total_cost,
        delta_fraction
      },
      executions
    };
  }
}
