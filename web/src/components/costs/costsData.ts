/**
 * Cost dashboard helpers.
 *
 * Provider presentation (labels/colours), formatting, grouping and CSV export
 * for the Costs view. All cost data comes from the `costs.dashboard` endpoint
 * (see `costsView.ts` / `useCostsDashboard.ts`); there is no bundled sample.
 */

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

export interface DayPoint {
  date: Date;
  values: Record<string, number>;
  total: number;
}

export interface Execution {
  id: string;
  title: string;
  category: NodeCategory;
  workflow: string;
  providerId: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  runtimeSec: number;
  status: "ok" | "error";
  timestamp: Date;
  cost: number;
}

// --- provider presentation --------------------------------------------------

/**
 * Presentation (label + swatch) for known providers, plus a deterministic
 * fallback so providers the API returns that aren't preset still render with a
 * stable colour. Keyed by the provider id the backend stores.
 */
const PROVIDER_PRESET: Record<string, { label: string; color: string }> = {
  openai: { label: "OpenAI", color: "#4FD18B" },
  openai_responses: { label: "OpenAI Responses", color: "#4FD18B" },
  anthropic: { label: "Anthropic", color: "#F2A65A" },
  replicate: { label: "Replicate", color: "#E85FB0" },
  fal: { label: "fal.ai", color: "#85A9F4" },
  huggingface: { label: "Hugging Face", color: "#B79CF5" },
  hugging_face: { label: "Hugging Face", color: "#B79CF5" },
  local: { label: "Local", color: "#34D9C4" },
  ollama: { label: "Ollama", color: "#34D9C4" },
  llamacpp: { label: "llama.cpp", color: "#34D9C4" },
  gemini: { label: "Gemini", color: "#F4C20D" },
  google: { label: "Gemini", color: "#F4C20D" },
  groq: { label: "Groq", color: "#F55036" },
  mistral: { label: "Mistral", color: "#FF7000" },
  cohere: { label: "Cohere", color: "#39CCCC" }
};

const FALLBACK_PALETTE = [
  "#7CC4FF",
  "#FFD166",
  "#C792EA",
  "#80CBC4",
  "#F78C6C",
  "#A3BE8C",
  "#E0A3FF"
];

const hashString = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export const providerColor = (id: string): string =>
  PROVIDER_PRESET[id]?.color ??
  FALLBACK_PALETTE[hashString(id) % FALLBACK_PALETTE.length];

export const providerLabel = (id: string): string =>
  PROVIDER_PRESET[id]?.label ??
  id.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

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

// --- grouping ---------------------------------------------------------------

export interface GroupRow {
  key: string;
  name: string;
  providerId?: string;
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
    providerId?: string;
    model?: string;
  }
> = {
  nodeType: (e) => ({ key: e.title, name: e.title }),
  workflow: (e) => ({ key: e.workflow, name: e.workflow }),
  provider: (e) => ({
    key: e.providerId,
    name: providerLabel(e.providerId),
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
      providerLabel(e.providerId),
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
