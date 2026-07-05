/**
 * Model-vs-model pages (`/models/<a>-vs-<b>`). Hand-written verdict copy per
 * pair; the same-prompt showcase pairs come from W-2 (Model Duel) via
 * `showcaseEntries` joined on `params.duelId` (see `modelShowcase.ts`). Until a
 * duel batch is seeded, committed fixtures stand in so the side-by-side renders.
 *
 * The pair slug uses `-vs-` as the delimiter (model slugs may themselves contain
 * hyphens, e.g. `veo-3`), so `/models/veo-3-vs-sora` splits to `veo-3` + `sora`.
 */
import type { PageEntry } from "./types";
import { yearToken } from "./types";
import type { Accent, ModelFaq } from "./modelEntries";
import { modelBySlug } from "./modelEntries";

export interface ModelComparison extends PageEntry {
  slug: string;
  /** Left model page slug. */
  a: string;
  /** Right model page slug. */
  b: string;
  aName: string;
  bName: string;
  /** Verdict copy, 2–3 paragraphs. */
  verdict: string[];
  faq: ModelFaq[];
  accent: Accent;
}

type ComparisonContent = {
  a: string;
  b: string;
  accent: Accent;
  tagline: string;
  verdict: string[];
  faq: ModelFaq[];
  priority?: number;
};

function comparison(c: ComparisonContent): ModelComparison {
  const a = modelBySlug(c.a);
  const b = modelBySlug(c.b);
  if (!a || !b) {
    throw new Error(
      `modelComparisonEntries: unknown model slug in pair ${c.a}-vs-${c.b}`
    );
  }
  const slug = `${c.a}-vs-${c.b}`;
  return {
    slug,
    a: c.a,
    b: c.b,
    aName: a.name,
    bName: b.name,
    accent: c.accent,
    verdict: c.verdict,
    faq: c.faq,
    route: `/models/${slug}`,
    title: `${a.name} vs ${b.name} — same prompt, side by side in NodeTool (${yearToken()})`,
    description: c.tagline,
    priority: c.priority ?? 0.6,
    changeFrequency: "monthly",
    indexable: true,
  };
}

export const modelComparisonEntries: ModelComparison[] = [
  comparison({
    a: "veo-3",
    b: "sora",
    accent: "blue",
    tagline:
      "Veo 3 vs Sora 2 — the same prompt through both audio-capable text-to-video models, side by side in NodeTool.",
    verdict: [
      "Veo 3 and Sora 2 are the two flagship audio-capable text-to-video models, and they trade blows. Veo 3 tends to win on tightly synchronized native audio and clean, well-lit cinematography; Sora 2 tends to win on physical realism and holding a scene together across multiple shots.",
      "There's no single winner — it depends on the shot. NodeTool's duel runs one prompt through both and shows the outputs together, so you judge on your own material instead of a cherry-picked reel. Below are matched pairs from the same prompt.",
    ],
    faq: [
      {
        q: "Is Veo 3 or Sora 2 better?",
        a: "Neither wins outright. Veo 3 leads on synchronized native audio and clean cinematography; Sora 2 leads on physical realism and multi-shot consistency. NodeTool runs the same prompt through both so you can decide per shot.",
      },
      {
        q: "Do both models generate audio?",
        a: "Yes — both Veo 3 and Sora 2 produce a synchronized audio track with the video.",
      },
    ],
  }),
  comparison({
    a: "veo-3",
    b: "kling",
    accent: "cyan",
    tagline:
      "Veo 3 vs Kling — cinematic native-audio video against Kling's expressive motion, same prompt in NodeTool.",
    verdict: [
      "Veo 3 brings native audio and a polished, cinematic look; Kling brings fluid, expressive motion and excellent image-to-video. If your shot lives or dies on sound and lighting, Veo 3 is the pick; if it's about movement — a subject in motion, a camera push — Kling often feels more alive.",
      "Run both on your prompt below and compare the actual frames rather than the marketing.",
    ],
    faq: [
      {
        q: "When should I pick Kling over Veo 3?",
        a: "Pick Kling when motion is the point — expressive movement and image-to-video are its strengths. Pick Veo 3 when you need synchronized audio and a cinematic finish.",
      },
    ],
  }),
  comparison({
    a: "sora",
    b: "kling",
    accent: "violet",
    tagline:
      "Sora 2 vs Kling — physical realism versus expressive motion, the same prompt side by side in NodeTool.",
    verdict: [
      "Sora 2 is strongest on physically plausible motion and multi-shot scenes; Kling is strongest on expressive, fluid movement and image-to-video. Sora 2 leans cinematic and literal; Kling leans lively and stylized.",
      "The duel below puts one prompt through both so the difference is visible, not described.",
    ],
    faq: [
      {
        q: "Which is better for animating a still image, Sora 2 or Kling?",
        a: "Kling is the more common choice for image-to-video — it keeps the subject coherent while adding believable motion. Sora 2 also supports image-to-video and leans toward physical realism.",
      },
    ],
  }),
  comparison({
    a: "kling",
    b: "hailuo",
    accent: "amber",
    tagline:
      "Kling vs Hailuo — two image-to-video specialists on the same prompt, side by side in NodeTool.",
    verdict: [
      "Kling and Hailuo both excel at image-to-video, and both produce strong subject motion. Kling tends toward smoother, more cinematic movement; Hailuo tends toward punchier, more energetic motion. Latency and pricing differ by provider and tier.",
      "Compare them on your own still below rather than a generic demo.",
    ],
    faq: [
      {
        q: "Kling or Hailuo for image-to-video?",
        a: "Both are strong. Kling skews smoother and more cinematic; Hailuo skews punchier and more energetic. Run the same still through both in NodeTool to decide.",
      },
    ],
  }),
  comparison({
    a: "seedance",
    b: "kling",
    accent: "rose",
    tagline:
      "Seedance vs Kling — fast high-motion video against smooth cinematic motion, same prompt in NodeTool.",
    verdict: [
      "Seedance is built for speed and lively motion, which makes it great for iteration; Kling is built for smooth, expressive movement and image-to-video. Seedance's lite tier is fast enough to explore a prompt; Kling's pro tier is where you land a polished clip.",
      "The matched pairs below show both on one prompt.",
    ],
    faq: [
      {
        q: "Is Seedance faster than Kling?",
        a: "Seedance's lite tier is optimized for quick turnaround, making it a common choice for iteration. Kling's pro tier prioritizes smoother, more cinematic motion.",
      },
    ],
  }),
  comparison({
    a: "hailuo",
    b: "wan",
    accent: "emerald",
    tagline:
      "Hailuo vs Wan — energetic hosted video against Wan's open-weights control toolkit, same prompt in NodeTool.",
    verdict: [
      "Hailuo delivers punchy motion through hosted providers with minimal fuss; Wan is open-weights and ships a deep set of control modes — pose, depth, inpaint, outpaint, reframe. Hailuo is the faster path to a good clip; Wan is the one to reach for when you need to steer the motion precisely or self-host.",
      "See both on the same prompt below.",
    ],
    faq: [
      {
        q: "Why choose Wan over Hailuo?",
        a: "Choose Wan when you need control — pose, depth, and inpainting modes — or want to self-host the open weights. Choose Hailuo for a fast, high-energy clip through a hosted provider.",
      },
    ],
  }),
  comparison({
    a: "flux",
    b: "seedream",
    accent: "blue",
    tagline:
      "FLUX vs Seedream — prompt-faithful design output against high-resolution photoreal, same prompt in NodeTool.",
    verdict: [
      "FLUX is prized for prompt fidelity and legible typography, which makes it a favorite for design and poster work; Seedream is prized for photoreal detail at high native resolution. FLUX for graphic, text-heavy compositions; Seedream for detailed, print-scale realism.",
      "The pairs below run one prompt through both.",
    ],
    faq: [
      {
        q: "FLUX or Seedream for photorealism?",
        a: "Seedream leans more photoreal and generates at higher native resolution. FLUX leads on prompt fidelity and legible text, which suits design and poster work.",
      },
    ],
  }),
  comparison({
    a: "flux",
    b: "gpt-image",
    accent: "emerald",
    tagline:
      "FLUX vs GPT-Image — prompt-faithful generation against instruction-following and editing, same prompt in NodeTool.",
    verdict: [
      "FLUX generates sharp, prompt-faithful images fast and comes with a strong image-to-image family; GPT-Image is exceptional at following detailed instructions and rendering legible text, with precise mask-aware editing. FLUX for speed and range; GPT-Image for instruction-heavy prompts and revisions.",
      "Compare them on your prompt below.",
    ],
    faq: [
      {
        q: "Which is better at text in images, FLUX or GPT-Image?",
        a: "Both render legible text well; GPT-Image is especially strong on instruction-following and precise typography. FLUX is faster and offers more image-to-image variants.",
      },
    ],
  }),
  comparison({
    a: "imagen",
    b: "flux",
    accent: "cyan",
    tagline:
      "Imagen vs FLUX — Google's photoreal generator against Black Forest Labs' prompt-faithful family, same prompt in NodeTool.",
    verdict: [
      "Imagen leans photoreal with accurate typography; FLUX leans prompt-faithful with a broad tier range and editing variants. Imagen for clean, realistic renders; FLUX when you want to move between fast drafts and high-fidelity finals or edit in place.",
      "The duel below shows both on one prompt.",
    ],
    faq: [
      {
        q: "Imagen or FLUX for realistic images?",
        a: "Both produce strong photoreal output. Imagen is tuned for photorealism and typography; FLUX gives you more tiers and image-to-image editing. Run the same prompt through both in NodeTool.",
      },
    ],
  }),
  comparison({
    a: "gpt-image",
    b: "imagen",
    accent: "violet",
    tagline:
      "GPT-Image vs Imagen — instruction-following and editing against photoreal typography, same prompt in NodeTool.",
    verdict: [
      "GPT-Image is the instruction-follower with precise editing; Imagen is the photoreal generator with clean typography. For prompts that read like a brief — 'change this, keep that' — GPT-Image shines; for a straight, realistic render, Imagen is hard to beat.",
      "See the matched pairs below.",
    ],
    faq: [
      {
        q: "GPT-Image or Imagen for editing an existing image?",
        a: "GPT-Image is the stronger editor — its mask-aware edit endpoints do targeted revisions. Imagen is focused on high-quality text-to-image generation.",
      },
    ],
  }),
];

/** Page-registry contribution. */
export const entries: PageEntry[] = modelComparisonEntries.map(
  (c): PageEntry => ({
    route: c.route,
    title: c.title,
    description: c.description,
    priority: c.priority,
    changeFrequency: c.changeFrequency,
    indexable: c.indexable,
  })
);

export function comparisonBySlug(slug: string): ModelComparison | undefined {
  return modelComparisonEntries.find((c) => c.slug === slug);
}
