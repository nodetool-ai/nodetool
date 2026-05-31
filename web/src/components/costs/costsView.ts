/**
 * View-model layer for the Costs dashboard.
 *
 * Maps the `costs.dashboard` API response (or the bundled sample data) into the
 * shapes the presentational components consume, so the dashboard renders the
 * same way regardless of source.
 */
import {
  providerColor,
  providerLabel,
  type DateRange,
  type DayPoint,
  type Execution,
  type NodeCategory
} from "./costsData";

/**
 * Structural mirror of `DashboardOutput` from
 * `@nodetool-ai/protocol/api-schemas/costs`. Kept local so the web bundle
 * doesn't take a runtime dependency on the protocol package; the tRPC query's
 * inferred output is assignable to this.
 */
export interface DashboardData {
  window: { start: string; end: string; days: number };
  providers: { provider: string; total_cost: number; call_count: number }[];
  daily: { date: string; totals: Record<string, number> }[];
  models: {
    provider: string;
    model: string;
    total_cost: number;
    call_count: number;
  }[];
  stats: {
    total_cost: number;
    call_count: number;
    failed_count: number;
    avg_per_call: number;
    top_model: {
      provider: string;
      model: string;
      total_cost: number;
      call_count: number;
    } | null;
    prior_total_cost: number;
    delta_fraction: number | null;
  };
  executions: {
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
  }[];
}

export interface ProviderView {
  id: string;
  label: string;
  color: string;
  total: number;
}

export interface CostsStatsView {
  totalSpend: number;
  executionCount: number;
  failedCount: number;
  avgPerExecution: number;
  topDriver: { label: string; providerId: string; cost: number } | null;
  deltaFraction: number | null;
  workflowCount: number;
}

export interface CostsView {
  providers: ProviderView[];
  stackOrder: string[];
  days: DayPoint[];
  executions: Execution[];
  stats: CostsStatsView;
}

const RANGE_DAYS: Record<DateRange, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "90d": 90
};

export const rangeToDays = (range: DateRange): number => RANGE_DAYS[range];

/**
 * Best-effort node category for the table's leading icon. The node type's
 * namespace (when present) is the strongest signal; otherwise fall back to
 * model-name heuristics.
 */
export const inferCategory = (
  _provider: string,
  model: string,
  nodeType = ""
): NodeCategory => {
  const t = nodeType.toLowerCase();
  if (t) {
    if (/\.audio|whisper|tts|speech/.test(t)) return "audio";
    if (/embed/.test(t)) return "embedding";
    if (/upscal|esrgan/.test(t)) return "upscale";
    if (/removebg|background|segment/.test(t)) return "background";
    if (/\.image|\.video/.test(t)) return "image";
    if (/\.text/.test(t)) return "text";
    if (/llm|agent|chat|generate/.test(t)) return "llm";
  }
  const m = model.toLowerCase();
  if (/whisper|tts|audio|speech|voice|musicgen/.test(m)) return "audio";
  if (/embed/.test(m)) return "embedding";
  if (/esrgan|upscal|swinir|gfpgan/.test(m)) return "upscale";
  if (/birefnet|rembg|background|matting|segment/.test(m)) return "background";
  if (/blip|caption|ocr|florence/.test(m)) return "text";
  if (/sdxl|flux|stable|diffusion|image|dall|imagen|pixart|kandinsky/.test(m))
    return "image";
  return "llm";
};

/** Human-friendly node title: last segment of the node type, else model/id. */
const nodeTitle = (nodeType: string, model: string, nodeId: string): string => {
  if (nodeType) return nodeType.split(".").pop() || nodeType;
  return model || nodeId || "node";
};

const parseLocalDate = (ymd: string): Date => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

const mapStatus = (status: string): "ok" | "error" =>
  status === "failed" || status === "error" ? "error" : "ok";

/** Map a live `costs.dashboard` response into the dashboard view model. */
export const apiToView = (api: DashboardData): CostsView => {
  // Backend returns providers sorted by spend desc — biggest at the bottom of
  // the stack.
  const providers: ProviderView[] = api.providers.map((p) => ({
    id: p.provider,
    label: providerLabel(p.provider),
    color: providerColor(p.provider),
    total: p.total_cost
  }));

  const days: DayPoint[] = api.daily.map((d) => {
    const values = { ...d.totals };
    const total = Object.values(values).reduce((a, b) => a + b, 0);
    return { date: parseLocalDate(d.date), values, total };
  });

  const executions: Execution[] = api.executions.map((e) => ({
    id: e.id,
    title: nodeTitle(e.node_type, e.model, e.node_id),
    category: inferCategory(e.provider, e.model, e.node_type),
    workflow: e.workflow_name ?? e.workflow_id ?? "—",
    providerId: e.provider,
    model: e.model,
    tokensIn: e.input_tokens,
    tokensOut: e.output_tokens,
    runtimeSec: e.duration ?? 0,
    status: mapStatus(e.status),
    timestamp: e.created_at ? new Date(e.created_at) : new Date(),
    cost: e.cost ?? 0
  }));

  const workflowCount = new Set(
    api.executions
      .map((e) => e.workflow_id)
      .filter((x): x is string => Boolean(x))
  ).size;

  const top = api.stats.top_model;
  return {
    providers,
    stackOrder: providers.map((p) => p.id),
    days,
    executions,
    stats: {
      totalSpend: api.stats.total_cost,
      executionCount: api.stats.call_count,
      failedCount: api.stats.failed_count,
      avgPerExecution: api.stats.avg_per_call,
      topDriver: top
        ? { label: top.model, providerId: top.provider, cost: top.total_cost }
        : null,
      deltaFraction: api.stats.delta_fraction,
      workflowCount
    }
  };
};
