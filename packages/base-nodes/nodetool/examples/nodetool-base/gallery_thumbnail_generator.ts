/**
 * Gallery Thumbnail Generator
 *
 * Generates a 16:9 neon UI-icon thumbnail for every workflow JSON in this
 * folder. Each thumbnail is a flat, dark-mode "app icon" illustration — a
 * rounded-square tile holding a primary glyph, wired by glowing connector
 * lines to a couple of secondary glyphs that hint at the workflow's flow.
 * It is tinted by the workflow's gallery category (Image=violet, Video=magenta,
 * Audio=amber, Multimodal=cyan, Agents=blue, Data&Web=green) so the card art
 * matches the category chip in the "Start from a template" gallery.
 *
 * Two steps per workflow:
 *   1. An LLM (OpenAI) reads the workflow JSON and returns a single
 *      domain-specific icon concept — primary symbol + connected secondary
 *      glyphs, no color/lighting/text words.
 *   2. FLUX.2 [klein] (fal.ai) renders that concept in the fixed neon-UI
 *      style, with the palette injected from the workflow's category.
 *
 * Output: ../../assets/nodetool-base/<workflow name>.png (master). Run
 * scripts/convert-thumbnails.ts afterwards to encode the 1280×720 .jpg cards
 * the gallery actually serves.
 *
 * Usage (from repo root):
 *   npx tsx packages/base-nodes/nodetool/examples/nodetool-base/gallery_thumbnail_generator.ts
 *     → only workflows whose PNG master is missing
 *   ... --all            → regenerate every workflow
 *   ... --only "Color"   → regenerate workflows whose name contains "Color"
 *
 * Requires OPENAI_API_KEY and FAL_API_KEY in the local secret store (the same
 * store `nodetool serve` uses).
 *
 * Tags: image, automation, meta, example
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync
} from "node:fs";

import { initMasterKey } from "@nodetool-ai/security";
import { initDb, getSecret } from "@nodetool-ai/models";
import { getDefaultDbPath } from "@nodetool-ai/config";
import {
  getProvider,
  type OpenAIProvider,
  type FalProvider,
  type ImageModel
} from "@nodetool-ai/runtime";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";

// ---------------------------------------------------------------------------
// Paths — resolved relative to this file so the script is location-stable.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = __dirname;
const ASSETS_DIR = resolve(__dirname, "..", "..", "assets", "nodetool-base");

// ---------------------------------------------------------------------------
// Category palettes. Mirrors web/src/utils/templateCategories.ts: the tag
// lists and priority order MUST match so a workflow lands on the same
// category (and therefore the same accent color) the gallery tints its card
// with. Each entry adds a human-readable palette the image prompt can use —
// FLUX needs color *words*, not hex.
// ---------------------------------------------------------------------------

interface Palette {
  /** The two muted tones the flat icon is filled with (light + deep). */
  tones: string;
  /** Short label for logging. */
  name: string;
}

interface Category {
  id: string;
  tags: string[];
  palette: Palette;
}

const CATEGORIES: Category[] = [
  {
    id: "image",
    tags: ["image", "design"],
    palette: { tones: "dusty lavender and deep indigo", name: "lavender" }
  },
  {
    id: "video",
    tags: ["video", "youtube"],
    palette: { tones: "dusty rose and deep plum", name: "rose-plum" }
  },
  {
    id: "audio",
    tags: ["audio"],
    palette: { tones: "muted apricot and warm deep brown", name: "apricot" }
  },
  {
    id: "multimodal",
    tags: ["multimodal"],
    palette: { tones: "muted aqua and deep teal", name: "aqua-teal" }
  },
  {
    id: "agents",
    tags: ["agent", "agents", "ai", "claude", "huggingface"],
    palette: { tones: "dusty slate blue and deep navy", name: "slate-blue" }
  },
  {
    id: "data-web",
    tags: [
      "data",
      "web",
      "search",
      "serp",
      "google",
      "news",
      "reddit",
      "amazon",
      "trends",
      "analysis",
      "research",
      "rag"
    ],
    palette: { tones: "muted sage green and deep forest green", name: "sage" }
  }
];

// Fallback for workflows that match no category — the gallery shows them
// untinted, so use a neutral muted mauve.
const DEFAULT_PALETTE: Palette = {
  tones: "dusty mauve and deep plum",
  name: "mauve"
};

function paletteForTags(tags: string[]): Palette {
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  const cat = CATEGORIES.find((c) => c.tags.some((t) => tagSet.has(t)));
  return cat?.palette ?? DEFAULT_PALETTE;
}

// ---------------------------------------------------------------------------
// Prompt construction. The style is fixed; only the palette and the LLM's
// icon concept vary. Diffusion models weight the tail of the prompt heavily,
// so we restate the color/flatness rule at the end.
// ---------------------------------------------------------------------------

function stylePreamble(p: Palette): string {
  return (
    "Flat solid icon illustration, dark mode, minimalist flat design. " +
    "Deep muted near-black charcoal background (#16141a), uniform, no vignette. " +
    `The icon is rendered as flat filled geometric shapes in two muted, desaturated tones of ${p.tones} — ` +
    "matte finish, no outlines, no neon, no glow, no gradient bloom, no glossy reflections, low contrast and dimmed. " +
    "Subject: "
  );
}

function styleComposition(p: Palette): string {
  return (
    ". Simple modern flat-design icon with a bold readable silhouette, centered, " +
    "generous empty negative space around it. No tile, frame, or container behind it. " +
    `Use only the two muted ${p.name} tones plus the dark charcoal background, nothing brighter. ` +
    "Absolutely no text, no letters, no numbers, no logos, no watermark, no UI chrome, no photographic realism."
  );
}

function styleReinforce(p: Palette): string {
  return (
    ` Flat matte filled shapes in muted ${p.name} on dark charcoal, dim and simple. ` +
    "No glow, no neon, no outlines, no text, no people."
  );
}

// ---------------------------------------------------------------------------
// LLM instruction — returns ONE icon concept (primary + secondary glyphs).
// No color/lighting words: those are owned by the palette + style strings.
// ---------------------------------------------------------------------------

const CONCEPT_SYSTEM = `You are an icon designer for a workflow gallery.

You receive the raw JSON of a NodeTool workflow. Read its "name", "description",
"tags", and graph.nodes[].type, then describe ONE app-icon scene that captures
what the workflow does as a small flow of symbols.

Output EXACTLY one short clause (8-18 words) with this shape:
  "<primary symbol>[, with a small <supporting glyph>] representing <what it does>"
The supporting glyph is optional — prefer just the primary when it reads clearly.

The icon grammar (always follow it):
  - PRIMARY: one bold, instantly recognizable glyph for the workflow's core
    domain (an envelope, a microphone, a film reel, a magnifying glass, a
    document, a sound wave, a camera, a robot/agent head, a database cylinder…).
  - SUPPORTING (optional): at most one small glyph placed beside or overlapping
    the primary to clarify the output (a play triangle on a reel, a sparkle by a
    photo, a small tag on an envelope). NO connector lines, NO arrows, NO flow.
  - Pick glyphs from the workflow's real domain, not from the fact that it
    uses AI. AI is the tool, never the subject.
  - These become flat filled silhouette shapes, so choose bold, solid forms
    that read instantly — avoid thin, intricate, or busy detail.

Choose glyphs that read at a glance by domain:
  email/mail        → envelope, folder chips, tags
  reddit/social     → speech bubble, upvote arrows, board
  rss/news          → broadcast/RSS waves, newspaper
  sqlite/data       → database cylinder, table grid, index cards
  browser/scrape    → magnifying glass, globe, map pin
  image generation  → framed photo, mountain-and-sun picture glyph, sparkle
  video             → film reel, play triangle, filmstrip, clapperboard
  audio/tts/asr     → microphone, sound wave, speaker, headphones
  research/papers   → document, stacked pages, magnifying glass
  agents            → choose by what the agent OPERATES on (a tool + its target)

HARD RULES:
  - Describe shapes only. NO colors, NO lighting, NO background, NO mood —
    those are added later and your words would fight them.
  - NO text, letters, numbers, logos, or fake UI screenshots in the scene.
  - NO literal "AI" imagery: brains, neurons, circuit boards, chips, glowing
    orbs, node graphs, matrix code, holograms.
  - Keep it to one primary glyph plus at most one small supporting glyph.
    Simple, bold, and uncluttered — never a busy scene.

Output ONLY the clause. No quotes, no markdown, no preamble, no trailing period.`;

const CONCEPT_MODEL = "gpt-5";

// ---------------------------------------------------------------------------
// Image model: FLUX.2 [klein] 9B via fal.ai. Fast distilled model — a handful
// of inference steps is enough for this flat-vector look.
// ---------------------------------------------------------------------------

const IMAGE_MODEL: ImageModel = {
  id: "fal-ai/flux-2/klein/9b",
  name: "FLUX.2 [klein] 9B",
  provider: PROVIDER_IDS.FAL_AI
};

// Generate at 4:3 (fal's landscape_4_3 default) on purpose, NOT 16:9. The
// prompt produces a centered icon; at 4:3 it fills the frame, and
// convert-thumbnails.ts cover-crops it to a full-bleed 16:9 card. Asking FLUX
// for 16:9 directly leaves the icon small with wide empty margins. width/height
// are a fallback for any non-enum model swapped in later.
const IMAGE_WIDTH = 1280;
const IMAGE_HEIGHT = 720;
const INFERENCE_STEPS = 6;

// ---------------------------------------------------------------------------
// Work list. Default: only workflows whose PNG master is missing (resumable).
// --all regenerates everything; --only <substr> targets matching names.
// ---------------------------------------------------------------------------

const ONLY_FLAG = process.argv.find(
  (a) => a === "--only" || a.startsWith("--only=")
);
const ONLY_TERM = !ONLY_FLAG
  ? undefined
  : ONLY_FLAG.includes("=")
    ? ONLY_FLAG.split("=")[1]
    : process.argv[process.argv.indexOf("--only") + 1];
const REGEN_ALL = process.argv.includes("--all");

const ALL_JSONS = readdirSync(EXAMPLES_DIR)
  .filter((n) => n.endsWith(".json"))
  .sort();

const WORK = ALL_JSONS.filter((n) => {
  const base = n.replace(/\.json$/, "");
  if (ONLY_TERM) return base.toLowerCase().includes(ONLY_TERM.toLowerCase());
  if (REGEN_ALL) return true;
  return !existsSync(join(ASSETS_DIR, `${base}.png`));
});

// ---------------------------------------------------------------------------
// Generation.
// ---------------------------------------------------------------------------

interface Providers {
  llm: OpenAIProvider;
  fal: FalProvider;
}

async function conceptFor(
  llm: OpenAIProvider,
  jsonText: string
): Promise<string> {
  const msg = await llm.generateMessage({
    messages: [
      { role: "system", content: CONCEPT_SYSTEM },
      { role: "user", content: jsonText }
    ],
    model: CONCEPT_MODEL,
    // gpt-5 is a reasoning model — leave headroom for thinking before text.
    maxTokens: 4000
  });
  const text = typeof msg.content === "string" ? msg.content.trim() : "";
  if (!text) throw new Error("LLM returned no concept text");
  return text;
}

async function generateOne(
  providers: Providers,
  jsonName: string
): Promise<void> {
  const base = jsonName.replace(/\.json$/, "");
  const jsonText = readFileSync(join(EXAMPLES_DIR, jsonName), "utf-8");
  const tags: string[] = (JSON.parse(jsonText).tags as string[]) ?? [];
  const palette = paletteForTags(tags);

  const concept = await conceptFor(providers.llm, jsonText);
  const prompt =
    stylePreamble(palette) +
    concept +
    styleComposition(palette) +
    styleReinforce(palette);

  const bytes = await providers.fal.textToImage({
    model: IMAGE_MODEL,
    prompt,
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    numInferenceSteps: INFERENCE_STEPS
  });

  const out = join(ASSETS_DIR, `${base}.png`);
  writeFileSync(out, bytes);
  console.error(`  ✓ ${base}  [${palette.name}]  ${concept}`);
}

// ---------------------------------------------------------------------------
// Concurrency. Each job fires one LLM call and one FLUX call. Keep the batch
// small so one rate-limit error costs a batch, not the whole run.
// ---------------------------------------------------------------------------

const BATCH_SIZE = 4;

function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

async function initProviders(): Promise<Providers> {
  const dbPath = getDefaultDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  initDb(dbPath);
  await initMasterKey();
  // "1" is the local single-user id the nodetool CLI stores secrets under.
  const resolve_ = (key: string) =>
    getSecret(key, "1").then((v) => v ?? undefined);
  const llm = (await getProvider(
    PROVIDER_IDS.OPENAI,
    resolve_
  )) as OpenAIProvider;
  const fal = (await getProvider(
    PROVIDER_IDS.FAL_AI,
    resolve_
  )) as FalProvider;
  return { llm, fal };
}

if (WORK.length === 0) {
  console.error("[gallery] nothing to do (use --all to regenerate everything)");
} else {
  console.error(
    `[gallery] generating ${WORK.length} thumbnail(s) with FLUX.2 [klein]` +
      (REGEN_ALL ? " (--all)" : ONLY_TERM ? ` (--only ${ONLY_TERM})` : "")
  );
  const providers = await initProviders();
  const batches = chunk(WORK, BATCH_SIZE);
  for (const [i, names] of batches.entries()) {
    console.error(`[gallery] batch ${i + 1}/${batches.length}: ${names.join(", ")}`);
    await Promise.all(
      names.map((n) =>
        generateOne(providers, n).catch((e) =>
          console.error(`  ✗ ${n}: ${(e as Error).message}`)
        )
      )
    );
  }
  console.error(`[gallery] done — run scripts/convert-thumbnails.ts to encode .jpg cards`);
}

export {};
