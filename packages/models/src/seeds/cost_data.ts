/**
 * Demo cost-data seed.
 *
 * Populates `nodetool_predictions` (and a few demo workflows so names resolve)
 * with realistic-looking spend for the Costs dashboard — for screenshots and
 * local development. Off by default; enabled via `NODETOOL_SEED_DEMO_COSTS=1`
 * (see `runSeeds`). Idempotent: a deterministic marker row prevents re-seeding.
 *
 * Timestamps are relative to "now" so the dashboard's trailing window always
 * contains data regardless of when the seed runs.
 */
import { Prediction } from "../prediction.js";
import { Workflow } from "../workflow.js";

export const COST_SEED_USER_ID = "1";
const MARKER_ID = "seed-cost-0001";
const SPAN_DAYS = 90;
const COUNT = 320;
const DAY_MS = 86_400_000;

interface DemoWorkflow {
  id: string;
  name: string;
}

const WORKFLOWS: DemoWorkflow[] = [
  { id: "seed-wf-product-0001", name: "Product shots batch" },
  { id: "seed-wf-kitchen-0001", name: "kitchen v4 — egg gen" },
  { id: "seed-wf-relight-0001", name: "Relight portraits" },
  { id: "seed-wf-newsletter-0001", name: "Newsletter draft" }
];

interface CatalogEntry {
  nodeType: string;
  provider: string;
  model: string;
  hasTokens: boolean;
  baseCost: number;
  runtime: [number, number];
  weight: number;
}

// prettier-ignore
const CATALOG: CatalogEntry[] = [
  { nodeType: "nodetool.llm.GenerateText", provider: "openai", model: "gpt-4o", hasTokens: true, baseCost: 0.0125, runtime: [1.2, 4.5], weight: 9 },
  { nodeType: "nodetool.llm.GenerateText", provider: "anthropic", model: "claude-3.5-sonnet", hasTokens: true, baseCost: 0.009, runtime: [1.4, 5.2], weight: 7 },
  { nodeType: "nodetool.llm.GenerateText", provider: "anthropic", model: "claude-3.5-haiku", hasTokens: true, baseCost: 0.0021, runtime: [0.8, 2.4], weight: 4 },
  { nodeType: "nodetool.image.StableDiffusionXL", provider: "replicate", model: "sdxl-1.0", hasTokens: false, baseCost: 0.011, runtime: [5.5, 9.5], weight: 5 },
  { nodeType: "nodetool.image.FluxSchnell", provider: "fal", model: "flux-schnell", hasTokens: false, baseCost: 0.0031, runtime: [1.1, 3.0], weight: 6 },
  { nodeType: "nodetool.audio.Whisper", provider: "openai", model: "whisper-large-v3", hasTokens: false, baseCost: 0.0062, runtime: [3.0, 8.0], weight: 4 },
  { nodeType: "nodetool.audio.TextToSpeech", provider: "openai", model: "tts-1", hasTokens: false, baseCost: 0.0015, runtime: [0.9, 2.2], weight: 3 },
  { nodeType: "nodetool.text.ImageCaption", provider: "huggingface", model: "blip2-opt-2.7b", hasTokens: false, baseCost: 0.0008, runtime: [1.0, 2.4], weight: 4 },
  { nodeType: "nodetool.image.RemoveBackground", provider: "fal", model: "birefnet", hasTokens: false, baseCost: 0.002, runtime: [0.9, 2.0], weight: 5 },
  { nodeType: "nodetool.image.Upscale", provider: "replicate", model: "real-esrgan-x4", hasTokens: false, baseCost: 0.0044, runtime: [1.6, 3.4], weight: 4 },
  { nodeType: "nodetool.text.Embeddings", provider: "openai", model: "text-embedding-3-small", hasTokens: true, baseCost: 0.0003, runtime: [0.3, 0.9], weight: 4 },
  { nodeType: "nodetool.llm.GenerateText", provider: "local", model: "llama-3-8b", hasTokens: true, baseCost: 0, runtime: [0.6, 2.8], weight: 4 }
];

/** Deterministic PRNG so the seeded set is stable. */
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

const pad4 = (n: number): string => n.toString().padStart(4, "0");

/**
 * Seed demo predictions + workflows. Returns the number of predictions created
 * (0 when already seeded).
 */
export async function seedCostData(): Promise<number> {
  if (await Prediction.find(MARKER_ID)) return 0;

  for (const wf of WORKFLOWS) {
    if (!(await Workflow.get(wf.id))) {
      await Workflow.create<Workflow>({
        id: wf.id,
        user_id: COST_SEED_USER_ID,
        name: wf.name,
        graph: { nodes: [], edges: [] }
      });
    }
  }

  const rng = mulberry32(0xc05d_a7a);
  const weightTotal = CATALOG.reduce((a, c) => a + c.weight, 0);
  const pick = (): CatalogEntry => {
    let r = rng() * weightTotal;
    for (const c of CATALOG) {
      r -= c.weight;
      if (r <= 0) return c;
    }
    return CATALOG[CATALOG.length - 1];
  };

  const now = Date.now();

  for (let i = 0; i < COUNT; i++) {
    const entry = pick();
    // Bias toward recent days so the default 14d window is dense.
    const dayOffset = Math.floor(SPAN_DAYS * Math.pow(rng(), 1.7));
    const createdMs = now - dayOffset * DAY_MS - Math.floor(rng() * DAY_MS);
    const cost = +(entry.baseCost * (0.55 + rng() * 1.05)).toFixed(6);
    const runtime = +(
      entry.runtime[0] +
      rng() * (entry.runtime[1] - entry.runtime[0])
    ).toFixed(1);
    const inputTokens = entry.hasTokens ? 250 + Math.floor(rng() * 7600) : null;
    const outputTokens = entry.hasTokens ? 80 + Math.floor(rng() * 1500) : null;
    const isLlm = entry.nodeType.includes(".llm") || entry.hasTokens;
    const workflow =
      isLlm && rng() < 0.6
        ? WORKFLOWS[3]
        : WORKFLOWS[Math.floor(rng() * WORKFLOWS.length)];

    await Prediction.create<Prediction>({
      id: `seed-cost-${pad4(i + 1)}`,
      user_id: COST_SEED_USER_ID,
      node_id: `${entry.nodeType.split(".").pop()}-${i + 1}`,
      node_type: entry.nodeType,
      provider: entry.provider,
      model: entry.model,
      workflow_id: workflow.id,
      status: rng() < 0.07 ? "failed" : "completed",
      cost,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens:
        inputTokens != null && outputTokens != null
          ? inputTokens + outputTokens
          : null,
      duration: runtime,
      currency: "USD",
      created_at: new Date(createdMs).toISOString()
    });
  }

  return COUNT;
}
