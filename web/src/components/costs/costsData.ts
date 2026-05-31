/**
 * Cost dashboard data layer.
 *
 * Self-contained sample data + derivation helpers for the Costs view. The
 * shapes here mirror what a real `/api/costs` aggregation endpoint would
 * return (per-provider daily spend + per-execution rows), so the UI can be
 * pointed at a live source later by swapping `dailySeries` / `executions`.
 */

export type ProviderId =
  | "openai"
  | "anthropic"
  | "replicate"
  | "fal"
  | "huggingface"
  | "local";

export type NodeCategory =
  | "text"
  | "audio"
  | "image"
  | "upscale"
  | "background"
  | "llm"
  | "embedding";

export type DateRange = "7d" | "14d" | "30d" | "90d";

export type GroupByKey =
  | "execution"
  | "nodeType"
  | "workflow"
  | "provider"
  | "model";

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  /** Brand-ish swatch used in legend, chart stacks and provider dots. */
  color: string;
  /** Total spend across the full window (USD). */
  total: number;
}

/** Legend order (matches the header chips left-to-right). */
export const PROVIDERS: ProviderMeta[] = [
  { id: "openai", label: "OpenAI", color: "#4FD18B", total: 1.35 },
  { id: "anthropic", label: "Anthropic", color: "#F2A65A", total: 0.981 },
  { id: "replicate", label: "Replicate", color: "#E85FB0", total: 0.236 },
  { id: "fal", label: "fal.ai", color: "#85A9F4", total: 0.778 },
  { id: "huggingface", label: "Hugging Face", color: "#B79CF5", total: 0.011 },
  { id: "local", label: "Local", color: "#34D9C4", total: 0.0 }
];

/** Bottom-to-top order the stacked bars are painted in. */
export const STACK_ORDER: ProviderId[] = [
  "openai",
  "replicate",
  "anthropic",
  "fal",
  "huggingface",
  "local"
];

export const PROVIDER_BY_ID: Record<ProviderId, ProviderMeta> =
  PROVIDERS.reduce(
    (acc, p) => {
      acc[p.id] = p;
      return acc;
    },
    {} as Record<ProviderId, ProviderMeta>
  );

export const providerColor = (id: ProviderId): string =>
  PROVIDER_BY_ID[id]?.color ?? "#8A8F98";

export const WORKFLOWS = [
  "Product shots batch",
  "kitchen v4 — egg gen",
  "Relight portraits",
  "Newsletter draft"
] as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

// --- window -----------------------------------------------------------------

/** First day of the sample window. */
export const WINDOW_START = new Date(2026, 4, 16); // May 16, 2026
export const WINDOW_DAYS = 14;

const dayDate = (index: number): Date => {
  const d = new Date(WINDOW_START);
  d.setDate(d.getDate() + index);
  return d;
};

// --- daily spend series -----------------------------------------------------

export interface DayPoint {
  date: Date;
  values: Record<ProviderId, number>;
  total: number;
}

/**
 * Per-provider day weights shaping the stacked bars. Each provider's daily
 * values are scaled so the column sums to exactly `ProviderMeta.total`, which
 * keeps the legend totals and the bar heights perfectly consistent.
 */
const DAY_WEIGHTS: Record<ProviderId, number[]> = {
  openai: [2.5, 9, 8.5, 7, 7, 7, 0.4, 8.5, 5, 3, 2, 2.5, 1.5, 2],
  anthropic: [0.3, 4, 7, 3.5, 0, 2.5, 0, 3, 0, 0, 6, 0, 5.5, 7],
  replicate: [1, 1.5, 2, 1.5, 2.5, 1, 1, 2, 1.2, 2.5, 0.8, 1, 1, 3],
  fal: [5, 2.5, 2.5, 2.5, 3.5, 2.5, 2.5, 2, 3.5, 2.5, 1.5, 3.5, 2.5, 1.5],
  huggingface: [0.5, 1, 1, 0.6, 0, 0.3, 0, 0.6, 0.2, 0, 0.4, 0.2, 0.3, 0.5],
  local: [1, 1, 1, 1, 1, 1, 0.5, 1, 1, 1, 1, 1, 1, 1]
};

const buildDailySeries = (): DayPoint[] => {
  const scale: Record<ProviderId, number> = {} as Record<ProviderId, number>;
  for (const p of PROVIDERS) {
    const sum = DAY_WEIGHTS[p.id].reduce((a, b) => a + b, 0);
    scale[p.id] = sum > 0 ? p.total / sum : 0;
  }
  return Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const values = {} as Record<ProviderId, number>;
    let total = 0;
    for (const p of PROVIDERS) {
      const v = DAY_WEIGHTS[p.id][i] * scale[p.id];
      values[p.id] = v;
      total += v;
    }
    return { date: dayDate(i), values, total };
  });
};

export const dailySeries: DayPoint[] = buildDailySeries();

// --- executions -------------------------------------------------------------

export interface Execution {
  id: string;
  title: string;
  category: NodeCategory;
  workflow: string;
  providerId: ProviderId;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  runtimeSec: number;
  status: "ok" | "error";
  timestamp: Date;
  cost: number;
}

interface CatalogEntry {
  title: string;
  category: NodeCategory;
  providerId: ProviderId;
  model: string;
  hasTokens: boolean;
  baseCost: number;
  runtime: [number, number];
  /** Relative sampling weight. */
  weight: number;
}

// prettier-ignore
const CATALOG: CatalogEntry[] = [
  { title: "GPT-4o", category: "llm", providerId: "openai", model: "gpt-4o", hasTokens: true, baseCost: 0.0125, runtime: [1.2, 4.5], weight: 9 },
  { title: "Claude 3.5 Sonnet", category: "llm", providerId: "anthropic", model: "claude-3.5-sonnet", hasTokens: true, baseCost: 0.009, runtime: [1.4, 5.2], weight: 7 },
  { title: "Claude 3.5 Haiku", category: "llm", providerId: "anthropic", model: "claude-3.5-haiku", hasTokens: true, baseCost: 0.0021, runtime: [0.8, 2.4], weight: 4 },
  { title: "SDXL", category: "image", providerId: "replicate", model: "sdxl-1.0", hasTokens: false, baseCost: 0.011, runtime: [5.5, 9.5], weight: 5 },
  { title: "Flux Schnell", category: "image", providerId: "fal", model: "flux-schnell", hasTokens: false, baseCost: 0.0031, runtime: [1.1, 3.0], weight: 6 },
  { title: "Whisper v3", category: "audio", providerId: "openai", model: "whisper-large-v3", hasTokens: false, baseCost: 0.0062, runtime: [3.0, 8.0], weight: 4 },
  { title: "TTS", category: "audio", providerId: "openai", model: "tts-1", hasTokens: false, baseCost: 0.0015, runtime: [0.9, 2.2], weight: 3 },
  { title: "Caption (BLIP-2)", category: "text", providerId: "huggingface", model: "blip2-opt-2.7b", hasTokens: false, baseCost: 0.0008, runtime: [1.0, 2.4], weight: 4 },
  { title: "Remove BG", category: "background", providerId: "fal", model: "birefnet", hasTokens: false, baseCost: 0.002, runtime: [0.9, 2.0], weight: 5 },
  { title: "Real-ESRGAN", category: "upscale", providerId: "replicate", model: "real-esrgan-x4", hasTokens: false, baseCost: 0.0044, runtime: [1.6, 3.4], weight: 4 },
  { title: "Embeddings", category: "embedding", providerId: "openai", model: "text-embedding-3-small", hasTokens: true, baseCost: 0.0003, runtime: [0.3, 0.9], weight: 4 },
  { title: "Llama 3", category: "llm", providerId: "local", model: "llama-3-8b", hasTokens: true, baseCost: 0, runtime: [0.6, 2.8], weight: 4 }
];

/** Deterministic PRNG so generated rows are stable across renders/tests. */
const mulberry32 = (seed: number): (() => number) => {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** The five most-recent rows, matching the reference design exactly. */
const PINNED: Execution[] = [
  {
    id: "exec_42s",
    title: "Caption (BLIP-2)",
    category: "text",
    workflow: "Product shots batch",
    providerId: "huggingface",
    model: "blip2-opt-2.7b",
    tokensIn: null,
    tokensOut: null,
    runtimeSec: 1.5,
    status: "ok",
    timestamp: new Date(2026, 4, 29, 17, 47),
    cost: 0.0008
  },
  {
    id: "exec_42u",
    title: "Whisper v3",
    category: "audio",
    workflow: "Product shots batch",
    providerId: "openai",
    model: "whisper-large-v3",
    tokensIn: null,
    tokensOut: null,
    runtimeSec: 6.5,
    status: "ok",
    timestamp: new Date(2026, 4, 29, 16, 18),
    cost: 0.0062
  },
  {
    id: "exec_42p",
    title: "SDXL",
    category: "image",
    workflow: "kitchen v4 — egg gen",
    providerId: "replicate",
    model: "sdxl-1.0",
    tokensIn: null,
    tokensOut: null,
    runtimeSec: 7.5,
    status: "ok",
    timestamp: new Date(2026, 4, 29, 13, 22),
    cost: 0.011
  },
  {
    id: "exec_42v",
    title: "Real-ESRGAN",
    category: "upscale",
    workflow: "Relight portraits",
    providerId: "replicate",
    model: "real-esrgan-x4",
    tokensIn: null,
    tokensOut: null,
    runtimeSec: 2.2,
    status: "ok",
    timestamp: new Date(2026, 4, 29, 10, 53),
    cost: 0.0044
  },
  {
    id: "exec_42q",
    title: "Remove BG",
    category: "background",
    workflow: "Product shots batch",
    providerId: "fal",
    model: "birefnet",
    tokensIn: null,
    tokensOut: null,
    runtimeSec: 1.3,
    status: "ok",
    timestamp: new Date(2026, 4, 29, 7, 29),
    cost: 0.002
  }
];

const TOTAL_EXECUTIONS = 161;
const FAILED_COUNT = 9;

const buildExecutions = (): Execution[] => {
  const rng = mulberry32(0xc0577a11);
  const generatedCount = TOTAL_EXECUTIONS - PINNED.length;

  const weightTotal = CATALOG.reduce((a, c) => a + c.weight, 0);
  const pick = (): CatalogEntry => {
    let r = rng() * weightTotal;
    for (const c of CATALOG) {
      r -= c.weight;
      if (r <= 0) return c;
    }
    return CATALOG[CATALOG.length - 1];
  };

  // Spread generated rows backwards from just before the first pinned row.
  const windowStartMs = WINDOW_START.getTime();
  const windowEndMs = new Date(2026, 4, 29, 6, 30).getTime();
  const span = windowEndMs - windowStartMs;

  const failedAt = new Set(
    Array.from({ length: FAILED_COUNT }, (_, k) =>
      Math.floor(((k + 0.5) / FAILED_COUNT) * generatedCount)
    )
  );

  const generated: Execution[] = Array.from(
    { length: generatedCount },
    (_, i) => {
      const entry = pick();
      const jitter = 0.55 + rng() * 1.05;
      const cost = +(entry.baseCost * jitter).toFixed(6);
      const runtimeSec = +(
        entry.runtime[0] +
        rng() * (entry.runtime[1] - entry.runtime[0])
      ).toFixed(1);
      const tokensIn = entry.hasTokens ? 250 + Math.floor(rng() * 7600) : null;
      const tokensOut = entry.hasTokens ? 80 + Math.floor(rng() * 1500) : null;
      const t = windowStartMs + rng() * span;
      const workflow =
        entry.category === "llm" || entry.category === "embedding"
          ? rng() < 0.6
            ? "Newsletter draft"
            : WORKFLOWS[Math.floor(rng() * WORKFLOWS.length)]
          : WORKFLOWS[Math.floor(rng() * 3)];
      return {
        id: `exec_${(i + 1).toString().padStart(3, "0")}`,
        title: entry.title,
        category: entry.category,
        workflow,
        providerId: entry.providerId,
        model: entry.model,
        tokensIn,
        tokensOut,
        runtimeSec,
        status: failedAt.has(i) ? "error" : "ok",
        timestamp: new Date(t),
        cost
      };
    }
  );

  return [...PINNED, ...generated].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
};

export const executions: Execution[] = buildExecutions();

// --- headline stats ---------------------------------------------------------

export const grandTotal = PROVIDERS.reduce((a, p) => a + p.total, 0);
export const executionCount = executions.length;
export const failedCount = executions.filter(
  (e) => e.status === "error"
).length;
export const avgPerExecution = grandTotal / executionCount;

/** Top cost driver is a model-level rollup (a subset of OpenAI's total). */
export const topCostDriver = {
  label: "GPT-4o",
  providerId: "openai" as ProviderId,
  cost: 1.21
};

/** Spend change versus the previous equal-length window. */
export const spendDelta = { fraction: 0.64, direction: "up" as const };

// --- grouping ---------------------------------------------------------------

export interface GroupRow {
  key: string;
  name: string;
  providerId?: ProviderId;
  model?: string;
  executions: number;
  cost: number;
  /** Share of the visible group total (0–1). */
  share: number;
}

const GROUP_FIELD: Record<
  Exclude<GroupByKey, "execution">,
  (e: Execution) => {
    key: string;
    name: string;
    providerId?: ProviderId;
    model?: string;
  }
> = {
  nodeType: (e) => ({ key: e.title, name: e.title }),
  workflow: (e) => ({ key: e.workflow, name: e.workflow }),
  provider: (e) => ({
    key: e.providerId,
    name: PROVIDER_BY_ID[e.providerId].label,
    providerId: e.providerId
  }),
  model: (e) => ({
    key: e.model,
    name: e.model,
    providerId: e.providerId,
    model: e.model
  })
};

export const groupExecutions = (
  execs: Execution[],
  by: Exclude<GroupByKey, "execution">
): GroupRow[] => {
  const field = GROUP_FIELD[by];
  const map = new Map<string, GroupRow>();
  let total = 0;
  for (const e of execs) {
    const { key, name, providerId, model } = field(e);
    total += e.cost;
    const existing = map.get(key);
    if (existing) {
      existing.executions += 1;
      existing.cost += e.cost;
    } else {
      map.set(key, {
        key,
        name,
        providerId,
        model,
        executions: 1,
        cost: e.cost,
        share: 0
      });
    }
  }
  const rows = [...map.values()];
  for (const r of rows) r.share = total > 0 ? r.cost / total : 0;
  return rows.sort((a, b) => b.cost - a.cost);
};

// --- range filtering --------------------------------------------------------

const RANGE_DAYS: Record<DateRange, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "90d": 90
};

export const daysForRange = (range: DateRange): DayPoint[] => {
  const n = Math.min(RANGE_DAYS[range], dailySeries.length);
  return dailySeries.slice(dailySeries.length - n);
};

export const rangeStart = (range: DateRange): Date =>
  daysForRange(range)[0]?.date ?? WINDOW_START;

export const executionsForRange = (range: DateRange): Execution[] => {
  const start = rangeStart(range).getTime();
  return executions.filter((e) => e.timestamp.getTime() >= start);
};

// --- formatting -------------------------------------------------------------

const moneyDp = (n: number): number => (n >= 1 ? 2 : n >= 0.01 ? 3 : 4);

export const formatMoney = (n: number): string => {
  if (n <= 0) return "$0";
  return `$${n.toFixed(moneyDp(n))}`;
};

export const splitMoney = (n: number): { whole: string; decimal: string } => {
  const fixed = n.toFixed(moneyDp(n));
  const [w, d] = fixed.split(".");
  return { whole: `$${w}`, decimal: d ? `.${d}` : "" };
};

export const formatPercent = (fraction: number): string =>
  `${Math.round(fraction * 100)}%`;

export const formatRuntime = (sec: number): string => `${sec.toFixed(1)}s`;

export const formatTokens = (n: number | null): string => {
  if (n == null) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
};

const pad2 = (n: number): string => n.toString().padStart(2, "0");

export const formatWhen = (date: Date): string =>
  `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}`;

export const formatAxisDate = (date: Date): string =>
  `${date.getMonth() + 1}/${date.getDate()}`;

export const formatRangeLabel = (start: Date, end: Date): string =>
  `${MONTHS[start.getMonth()]} ${start.getDate()} – ${
    MONTHS[end.getMonth()]
  } ${end.getDate()}, ${end.getFullYear()}`;

// --- csv export -------------------------------------------------------------

export const executionsToCsv = (execs: Execution[]): string => {
  const header = [
    "id",
    "node",
    "workflow",
    "provider",
    "model",
    "tokens_in",
    "tokens_out",
    "runtime_s",
    "status",
    "when",
    "cost_usd"
  ];
  const escape = (v: string): string =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const lines = execs.map((e) =>
    [
      e.id,
      e.title,
      e.workflow,
      PROVIDER_BY_ID[e.providerId].label,
      e.model,
      e.tokensIn ?? "",
      e.tokensOut ?? "",
      e.runtimeSec.toFixed(1),
      e.status,
      formatWhen(e.timestamp),
      e.cost.toFixed(6)
    ]
      .map((v) => escape(String(v)))
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
};
