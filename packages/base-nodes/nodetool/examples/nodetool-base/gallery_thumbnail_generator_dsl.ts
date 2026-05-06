/**
 * Gallery Thumbnail Generator (DSL)
 *
 * Iterates over every workflow JSON in this folder and produces a 16:9
 * thumbnail JPEG for the gallery. The subject of each thumbnail is derived
 * by an LLM from the workflow's name, description, tags, and the actual
 * node types used in its graph — so a Reddit workflow gets a Reddit
 * subject, a mail workflow gets a mail subject, etc.
 *
 * Workflow shape (one streaming pipeline, fans out per JSON file):
 *   ListFiles(*.json) ──► ReadTextFile ──► Agent (subject clause)
 *                                       │
 *                                       └─► Concat (preamble + subject)
 *                                              │
 *                                              ▼
 *                                       CreateImage (1536×1024)
 *                                              │
 *   ListFiles.file ──► Basename(no ext) ──► Concat(".jpg") ──► SaveImageFile
 *
 * Output goes to ../../assets/nodetool-base/<workflow name>.jpg.
 *
 * Note on size: openai.image.CreateImage only supports 1024×1024,
 * 1536×1024, 1024×1536. We generate at 1536×1024 (closest to 16:9) and
 * save as-is — no resize, no crop.
 *
 * Tags: image, automation, meta, example
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { readdirSync, readFileSync, existsSync, mkdirSync } from "node:fs";

import { initMasterKey } from "@nodetool-ai/security";
import { initDb, getSecret } from "@nodetool-ai/models";
import { getDefaultDbPath } from "@nodetool-ai/config";

import {
  workflow,
  run,
  type SecretResolver,
  agents,
  text,
  image,
  openaiImage,
} from "@nodetool-ai/dsl";

// ---------------------------------------------------------------------------
// Paths — resolved relative to this file so the workflow is location-stable.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = __dirname;
const ASSETS_DIR = resolve(__dirname, "..", "..", "assets", "nodetool-base");

// ---------------------------------------------------------------------------
// Style preamble — fixed, applied to every thumbnail.
// ---------------------------------------------------------------------------

const STYLE_PREAMBLE =
  "Editorial product still-life photograph, 16:9. " +
  "DEEP BLACK background, almost no ambient light. " +
  "Lighting is exclusively neon cyan and magenta rim-light from the sides — " +
  "saturated, hard-edged glow, color spilling onto the subject's edges. " +
  "Absolutely NO warm light, NO yellow, NO orange, NO golden hour, " +
  "NO daylight, NO window light, NO incandescent tones. " +
  "Cinematic, moody, high contrast, shallow depth of field. " +
  "Subject fills 60-75% of the frame — dense, iconic silhouette, NOT sparse. " +
  "STRICT bans: zero text, letters, numbers, logos, watermarks, captions; " +
  "no screens, UI, laptops, phones, monitors, tablets; " +
  "no people, faces, hands, eyes. " +
  "Hero subject (one richly detailed object or tight still-life): ";

// Reinforcement appended after the subject — image generators weight tokens
// closest to the end most heavily, so we restate the color/lighting rule.
const STYLE_REINFORCE =
  ". Lit only by neon cyan and magenta. Black background. " +
  "No text. No screens. No people.";

// ---------------------------------------------------------------------------
// LLM instruction — must produce a literal, domain-specific subject.
// ---------------------------------------------------------------------------

const SUBJECT_SYSTEM = `You are a thumbnail art director for a workflow gallery.

You will receive the raw JSON of a NodeTool workflow. Identify the workflow's
DOMAIN — the real-world thing it operates on, not the fact that it uses AI —
by reading:
  - top-level "name" and "description"
  - "tags" if present
  - graph.nodes[].type — the namespace prefix names the domain. Examples:
      nodetool.email.* / lib.mail.*    → physical mail
      nodetool.reddit.* / "reddit"     → printed magazines / community boards
      lib.rss.*                        → broadcast antennae / radio
      lib.sqlite.* / nodetool.data.*   → filing cabinets / index cards
      lib.browser.* / scraping         → maps, atlases, libraries
      openai.image.* / image gen       → painter's palette, darkroom prints
      nodetool.video.* / video gen     → cinema reels, clapperboards, marquees
      nodetool.audio.* / tts / asr     → vinyl records, microphones, tape reels
      nodetool.agents.*                → choose by what the AGENT operates on,
                                         NOT "an AI agent" — pick the domain.

The workflow uses AI, but AI is the TOOL, not the SUBJECT. NEVER depict AI.

Output exactly ONE short sentence (12-22 words) naming a SINGLE rich,
iconic, photographable subject from the chosen domain.

CONSTRAINTS on the subject sentence:
  - Name a DENSE composition — multiple related props clustered together,
    not one tiny object floating in space. Sparse subjects fail at thumbnail size.
  - Include 1-2 unmistakable domain motifs (shape, material, era-specific
    object) so the viewer recognizes the domain at a glance.
  - DO NOT mention lighting, color, mood, or background — those are fixed
    by the style preamble (neon cyan/magenta on black). Mentioning warm
    tones, golden hour, or daylight will FIGHT the preamble and ruin the look.
  - Pure subject nouns + materials + arrangement only.

Good examples (study the shape — note the density and zero color/light words):
  - mail workflow         → "a brass mailbox stuffed with crumpled envelopes, wax-sealed letters spilling from a tarnished tray below"
  - reddit workflow       → "a tall stack of orange paperback zines bound with twine, a knitted alien plush perched on top"
  - rss workflow          → "a cluster of copper rooftop antennae rising above slate tiles, ribbon cables coiling around their bases"
  - sqlite workflow       → "an open card-catalog drawer overflowing with handwritten index cards, brass label-holders glinting on its face"
  - youtube/video workflow→ "a film reel mid-unspool with celluloid coiling onto a velvet drape, beside a tarnished clapperboard"
  - audio workflow        → "a chrome ribbon microphone on a vinyl record, headphones draped over a brass volume knob"
  - research/papers       → "stacked leather-bound journals with a magnifying glass over a folded star-chart, ink pots and quill alongside"

ABSOLUTELY FORBIDDEN — these will get the thumbnail rejected:
  - any depiction of "AI": brains, neural networks, neurons, glowing skulls
  - circuit boards, chips, motherboards, PCB traces, microchips
  - glowing orbs, energy spheres, plasma balls, holograms of "data"
  - node graphs, network diagrams, connected dots, flowcharts, schematics
  - robots, androids, humanoid figures, faces, hands, eyes
  - laptops, phones, tablets, monitors, any screen showing UI or text
  - matrix-style code rain, binary streams, floating numbers
  - generic "tech" backgrounds with grid lines or HUD elements
  - any Reddit/YouTube/Slack/etc. UI screenshot or fake interface
  - anything with readable text, letters, numbers, logos, or watermarks

If your sentence contains any forbidden element, REWRITE IT before answering.
The image generator is bad at "no text" — give it nothing that would invite text.

Output ONLY the sentence. No preamble. No quotes. No markdown. No trailing period needed.`;

// ---------------------------------------------------------------------------
// Model used to generate the subject clause.
// ---------------------------------------------------------------------------

const SUBJECT_MODEL = {
  type: "language_model",
  provider: "openai",
  id: "gpt-5",
  name: "GPT-5",
};

// ---------------------------------------------------------------------------
// Discover only the workflows whose thumbnail is missing. We do this at
// TS-level instead of inside the graph because:
//   - It's resumable: re-run after a billing-limit / partial failure and only
//     the still-missing PNGs are regenerated.
//   - Every JSON becomes its own independent pipeline → no streaming pairing
//     concerns, each (image, filename) tuple is wired statically.
// ---------------------------------------------------------------------------

const ALL_JSONS = readdirSync(EXAMPLES_DIR)
  .filter((n) => n.endsWith(".json"))
  .sort();

const MISSING = ALL_JSONS.filter((n) => {
  const png = join(ASSETS_DIR, n.replace(/\.json$/, ".png"));
  return !existsSync(png);
});

console.error(
  `[gallery] ${MISSING.length} of ${ALL_JSONS.length} workflows missing thumbnails`
);

// ---------------------------------------------------------------------------
// One pipeline per missing workflow.
// ---------------------------------------------------------------------------

function buildPipeline(jsonName: string) {
  const jsonText = readFileSync(join(EXAMPLES_DIR, jsonName), "utf-8");
  const filename = jsonName.replace(/\.json$/, ".png");

  // Ask the LLM for a single, domain-specific subject clause.
  const subject = agents.agent({
    model: SUBJECT_MODEL,
    system: SUBJECT_SYSTEM,
    prompt: jsonText,
    // gpt-5 is a reasoning model — needs headroom for internal thinking
    // before it ever produces visible text.
    max_tokens: 4000,
  });

  // Final image prompt: preamble + subject clause + reinforced style trailer.
  // The trailer matters because diffusion models weight tokens nearer the
  // end more heavily — restating the color/lighting rule prevents drift.
  const promptHead = text.concat({
    a: STYLE_PREAMBLE,
    b: subject.output("text"),
  });

  const imagePrompt = text.concat({
    a: promptHead.output(),
    b: STYLE_REINFORCE,
  });

  // Generate the image at the closest-to-16:9 size CreateImage supports.
  const thumbnail = openaiImage.createImage({
    prompt: imagePrompt.output(),
    // Codegen lists only "gpt-image-1"; cast through for the newer model.
    model: "gpt-image-2" as never,
    size: "1536x1024",
    quality: "medium",
    background: "opaque",
  });

  return image.saveImageFile({
    image: thumbnail.output(),
    folder: ASSETS_DIR,
    filename,
    overwrite: true,
  });
}

// ---------------------------------------------------------------------------
// Concurrency limit. Each pipeline fires one Agent (gpt-5) call plus one
// CreateImage (gpt-image-1) call. Running all 47 at once will trip OpenAI
// rate limits; one 429 aborts the whole run. Process in small batches so
// partial failures only cost one batch and stay polite to the API.
// ---------------------------------------------------------------------------

const BATCH_SIZE = 4;

function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Entrypoint — `nodetool run <file>` and `npx tsx <file>` both work.
// Note: workflow() and runGraph() each clear the node registry, so we build
// + run one batch at a time.
// ---------------------------------------------------------------------------

// Open the local secret store the same way `nodetool serve` does, then return
// a resolver bound to the models package. The DSL hands this to `run()`,
// which forwards it onto each per-job ProcessingContext — no globals.
async function initSecretStore(): Promise<SecretResolver> {
  const dbPath = getDefaultDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  initDb(dbPath);
  await initMasterKey();
  return (key, userId) => getSecret(key, userId).then((v) => v ?? undefined);
}

if (MISSING.length === 0) {
  console.error("[gallery] all thumbnails present, nothing to do");
} else if (process.argv.includes("--print")) {
  // Print just the first batch as a representative sample.
  const sample = MISSING.slice(0, BATCH_SIZE).map(buildPipeline);
  console.log(JSON.stringify(workflow(...sample), null, 2));
} else {
  const secretResolver = await initSecretStore();
  const batches = chunk(MISSING, BATCH_SIZE);
  for (const [i, names] of batches.entries()) {
    console.error(
      `[gallery] batch ${i + 1}/${batches.length} (${names.length} workflows): ${names.join(", ")}`
    );
    const saves = names.map(buildPipeline);
    await run(workflow(...saves), { secretResolver });
  }
  console.error(`[gallery] done — ${MISSING.length} thumbnails generated`);
}

export {};
