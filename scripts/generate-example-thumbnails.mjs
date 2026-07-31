// Generates card art for shipped example workflows into
// packages/base-nodes/nodetool/assets/nodetool-base/<name>.jpg.
//
// The art gates marketing: generate-template-entries.mjs emits
// `indexable: false` for any example without a matching <name>.jpg, keeping
// its /templates page out of the sitemap and the smoke walk. An example with
// no card is a page nobody finds.
//
// House style, matched from the cards already shipped: one flat two-tone
// pictogram, centred, on a dark desaturated ground, and no text at all. The
// title is set in HTML on the page itself, so baking words into the image
// only fights it — and looks wrong beside the existing set.
//
// Art comes from Recraft's text-to-vector model on fal. A diffusion model is
// the wrong tool here: FLUX (schnell and dev) reads "flat icon" as an
// invitation to render a lit 3D scene with a floor and a cast shadow, however
// many negations the prompt carries. Recraft emits actual vector shapes, so
// flat is the only thing it can produce. The ground is then normalised to the
// house colour so a gallery row sits on one background rather than on whatever
// each generation happened to pick.
//
//   FAL_API_KEY=... node scripts/generate-example-thumbnails.mjs
//   FAL_API_KEY=... node scripts/generate-example-thumbnails.mjs --only "Movie Posters"
//   FAL_API_KEY=... node scripts/generate-example-thumbnails.mjs --force
//
// Existing art is left alone unless --force is passed. --force rebuilds
// everything, including hand-made cards, so reach for --only when redoing one.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES_DIR = path.join(
  REPO_ROOT,
  "packages/base-nodes/nodetool/examples/nodetool-base"
);
const ASSETS_DIR = path.join(
  REPO_ROOT,
  "packages/base-nodes/nodetool/assets/nodetool-base"
);

const W = 1280;
const H = 720;
const FAL_ENDPOINT = "https://fal.run/fal-ai/recraft/v4.1/text-to-vector";
const SUBJECTS_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "example-thumbnail-subjects.json"
);

/** The ground the shipped cards sit on, sampled from their corners. */
const GROUND = { r: 43, g: 47, b: 51 };

/**
 * Recraft reads the palette phrase as a suggestion and returns colour hotter
 * than the house style. Measured over both sets — mean saturation of the lit
 * pixels, ignoring the ground — the shipped cards sit at 0.276 and generated
 * ones at 0.321. This is that ratio, so a generated card lands where a drawn
 * one does instead of shouting next to it in the gallery.
 */
const SATURATION = 0.86;

/**
 * Two-tone palettes drawn from the existing set — a light muted fill against a
 * deep plum. Chosen per example by name hash so the gallery varies but never
 * lands somewhere garish.
 */
const PALETTES = [
  "dusty rose and deep plum",
  "pale lavender and dark indigo",
  "muted sage and deep teal",
  "soft apricot and dark umber",
  "pale slate blue and deep navy",
  "warm sand and dark olive"
];

/**
 * The style half of the prompt. Every clause here is load-bearing against a
 * specific failure: models add captions unless told twice, drift photographic
 * unless "flat vector" is repeated, and crowd the frame without an explicit
 * call for negative space.
 */
const STYLE =
  "%SUBJECT%, minimal flat two-tone icon, %PALETTE%, centred, " +
  "dark charcoal background, no text";

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Concrete objects to draw for each example, cached in
 * scripts/example-thumbnail-subjects.json.
 *
 * Feeding the title straight to the image model fails on abstract ones: "A
 * Boolean Constant" produced two rounded bars that mean nothing, while "Add
 * Reverb to a Voice" produced a microphone because the title happens to name
 * an object. So a language model turns each title into drawable nouns once,
 * and the answers are checked in — reviewable, editable by hand, and not
 * re-billed on every run.
 */
async function loadSubjects() {
  try {
    return JSON.parse(fs.readFileSync(SUBJECTS_FILE, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Written after every derivation, not once at the end. Deriving is billed and
 * the batch runs long enough to get interrupted; flushing only on completion
 * throws away every subject derived so far and re-bills them on the next run.
 */
function saveSubjects(subjects) {
  const ordered = Object.fromEntries(
    Object.keys(subjects)
      .sort()
      .map((k) => [k, subjects[k]])
  );
  fs.writeFileSync(SUBJECTS_FILE, `${JSON.stringify(ordered, null, 2)}\n`);
}

async function deriveSubject(name, steps, openaiKey) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content:
            "You name physical objects for an icon illustrator. Given a " +
            "workflow title and the node types it runs, reply with one or two " +
            "concrete, drawable nouns standing for what it does — things with " +
            "a recognisable silhouette, the icon a designer would reach for. " +
            "Take the meaning from the mechanism, never from a figure of " +
            "speech in the title. No abstractions, no adjectives, no " +
            'explanation. Examples: "a microphone and a sound wave", "a ' +
            'toggle switch", "a shopping tag and a camera". Phrase only.'
        },
        { role: "user", content: `${name}. Runs: ${steps}` }
      ]
    })
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("openai returned no subject");
  return text.replace(/^["']|["']$/g, "").toLowerCase();
}

async function generate(prompt, falKey) {
  const res = await fetch(FAL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt, image_size: "landscape_16_9" })
  });
  if (!res.ok) {
    throw new Error(`fal ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = await res.json();
  const url = body?.images?.[0]?.url;
  if (!url) throw new Error(`fal returned no image: ${JSON.stringify(body).slice(0, 200)}`);
  const img = await fetch(url);
  if (!img.ok) throw new Error(`image fetch ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

/**
 * Pull the generated ground onto the house colour. The model returns a dark
 * background but never exactly the same one twice, and a gallery row of
 * near-misses reads as sloppier than a row of one colour.
 */
async function normaliseGround(buf) {
  const base = sharp(buf)
    .resize(W, H, { fit: "cover", position: "centre" })
    .modulate({ saturation: SATURATION });
  const { data, info } = await base
    .clone()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Corner sample: whatever the model used for the ground.
  const at = (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };
  const corners = [at(6, 6), at(info.width - 6, 6), at(6, info.height - 6)];
  const avg = (k) => corners.reduce((s, c) => s + c[k], 0) / corners.length;
  const src = { r: avg("r"), g: avg("g"), b: avg("b") };

  // Only nudge when the model actually produced a dark ground; a bright one
  // means it ignored the brief and shifting it would wreck the illustration.
  const luma = 0.2126 * src.r + 0.7152 * src.g + 0.0722 * src.b;
  if (luma > 110) return base.jpeg({ quality: 90 }).toBuffer();

  return base
    .linear(
      [1, 1, 1],
      [GROUND.r - src.r, GROUND.g - src.g, GROUND.b - src.b]
    )
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes("--force");
  const onlyIdx = argv.indexOf("--only");
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;

  const falKey = process.env.FAL_API_KEY || process.env.FAL_KEY;
  if (!falKey) {
    console.error("FAL_API_KEY (or FAL_KEY) is required — the art is generated.");
    process.exit(1);
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const subjects = await loadSubjects();
  let derived = 0;

  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  let made = 0;
  let kept = 0;
  const failed = [];

  for (const file of fs.readdirSync(EXAMPLES_DIR).sort()) {
    if (!file.endsWith(".json")) continue;
    const name = file.slice(0, -5);
    if (only && name !== only) continue;
    const dest = path.join(ASSETS_DIR, `${name}.jpg`);
    if (fs.existsSync(dest) && !force && !only) {
      kept += 1;
      continue;
    }

    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, file), "utf8"));
    } catch {
      continue;
    }

    if (!subjects[name] && openaiKey) {
      try {
        subjects[name] = await deriveSubject(
          name,
          (doc.graph?.nodes ?? [])
            .map((n) => String(n.type ?? "").split(".").pop())
            .filter(Boolean)
            .join(", "),
          openaiKey
        );
        derived += 1;
        saveSubjects(subjects);
      } catch (err) {
        // A weaker icon beats no icon, but never fail quietly: falling back
        // silently is how every card ends up drawn from a bare title.
        console.warn(`  ! subject fallback for ${name}: ${err.message}`);
      }
    }
    const subject = subjects[name] ?? name.toLowerCase();
    const palette = PALETTES[hash(name) % PALETTES.length];
    const prompt = STYLE.replace("%PALETTE%", palette).replace("%SUBJECT%", subject);

    try {
      const raw = await generate(prompt, falKey);
      fs.writeFileSync(dest, await normaliseGround(raw));
      made += 1;
      console.log(`  ${name}`);
    } catch (err) {
      failed.push(`${name}: ${err.message}`);
    }
  }

  if (derived) {
    console.log(`  (${derived} new subjects cached in ${path.basename(SUBJECTS_FILE)})`);
  }
  console.log(`card art — ${made} generated, ${kept} already present, ${failed.length} failed`);
  for (const f of failed) console.error(`  FAILED ${f}`);
  if (failed.length) process.exitCode = 1;
}

await main();
