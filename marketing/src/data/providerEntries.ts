/**
 * Provider pages (`/providers/<slug>`). Hand-written intent copy (positioning
 * blurb + FAQ) per provider; the model catalog — counts, modality breakdown,
 * and highlighted model ids — is generated from the node-package manifests
 * (`providerCatalog.generated.ts`, built by
 * `scripts/generate-provider-catalog.mjs`), so it matches what each provider
 * actually serves.
 *
 * Launch set: the six providers whose node package ships a model manifest —
 * fal.ai, Replicate, Kie, Together AI, AtlasCloud, Topaz. These are exactly the
 * providers `nodetool generate <provider> --list-models` can enumerate.
 */
import type { PageEntry } from "./types";
import { yearToken } from "./types";
import {
  providerCatalog,
  type ProviderCatalog,
  type ProviderModelKind,
} from "./providerCatalog.generated";
import { PROVIDER_DISPLAY } from "./providerDisplay";

export type Accent = "blue" | "violet" | "emerald" | "rose" | "amber" | "cyan";

export const KIND_LABEL: Record<ProviderModelKind, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  "3d": "3D",
  text: "Text",
};

export const KIND_ORDER: ProviderModelKind[] = [
  "image",
  "video",
  "audio",
  "3d",
  "text",
];

export interface ProviderFaq {
  q: string;
  a: string;
}

export interface ProviderEntry extends PageEntry {
  slug: string;
  /** Runtime provider id (key into providerCatalog / providerDisplay). */
  providerId: string;
  name: string;
  /** Provider home page. */
  url: string;
  /** BYOK env var NodeTool reads. */
  byokEnv: string;
  /** Hero subtitle — one line. */
  tagline: string;
  /** Positioning blurb, 2–3 paragraphs. */
  blurb: string[];
  /** Modalities the provider is best known for, for the hero chips. */
  strengths: string[];
  faq: ProviderFaq[];
  accent: Accent;
  catalog: ProviderCatalog;
}

interface ProviderContent {
  slug: string;
  providerId: string;
  name: string;
  tagline: string;
  blurb: string[];
  strengths: string[];
  faq: ProviderFaq[];
  accent: Accent;
  priority?: number;
}

function provider(c: ProviderContent): ProviderEntry {
  const display = PROVIDER_DISPLAY[c.providerId];
  const catalog = providerCatalog[c.providerId];
  if (!display || !catalog) {
    throw new Error(
      `No display/catalog for provider "${c.providerId}" — check providerDisplay.ts and regenerate providerCatalog.`
    );
  }
  const route = `/providers/${c.slug}`;
  return {
    slug: c.slug,
    providerId: c.providerId,
    name: c.name,
    url: display.url,
    byokEnv: display.byokEnv,
    tagline: c.tagline,
    blurb: c.blurb,
    strengths: c.strengths,
    faq: c.faq,
    accent: c.accent,
    catalog,
    route,
    title: `${c.name} in NodeTool — run ${catalog.total}+ models in a visual AI workflow (${yearToken()})`,
    description: c.tagline,
    priority: c.priority ?? 0.7,
    changeFrequency: "monthly",
    indexable: true,
  };
}

export const providerEntries: ProviderEntry[] = [
  provider({
    slug: "fal",
    providerId: "fal_ai",
    name: "fal.ai",
    accent: "violet",
    tagline:
      "Run fal.ai's image, video, audio, and 3D models in a visual AI workflow — the largest catalog in NodeTool, called with your own key at fal's list price.",
    blurb: [
      "fal.ai is a serving platform for generative media models, with the broadest catalog NodeTool integrates: FLUX and its editing variants, Seedream, Kling, Veo, Wan, Seedance, plus audio and 3D endpoints. Each fal endpoint is exposed as its own node, so the model you pick is the model you run.",
      "In NodeTool you compose fal models on the canvas — generate an image, feed it into an image-to-video node, upscale the result, all in one graph you can re-run and share as a single file. Swapping one fal model for another, or for a model on a different provider, is a single node change.",
      "fal is bring-your-own-key: NodeTool calls it with your `FAL_API_KEY` and you pay fal's list price with no markup. The model list below is generated from the same manifest `nodetool generate fal-ai --list-models` reads, so it matches what fal actually serves.",
    ],
    strengths: ["Image", "Video", "Audio", "3D"],
    faq: [
      {
        q: "How do I use my fal.ai key in NodeTool?",
        a: "Store your fal key as `FAL_API_KEY` in NodeTool settings (or the secret store). Every fal node then calls fal directly with your key — NodeTool never proxies or marks up the request.",
      },
      {
        q: "Which fal models does NodeTool support?",
        a: "Every endpoint in fal's node manifest — over a thousand image, video, audio, and 3D models, each a separate node. The catalog on this page is generated from that manifest.",
      },
      {
        q: "Does NodeTool add a fee on top of fal.ai?",
        a: "No. NodeTool is bring-your-own-key — you pay fal's list price for each generation and NodeTool adds nothing per call.",
      },
    ],
  }),
  provider({
    slug: "replicate",
    providerId: "replicate",
    name: "Replicate",
    accent: "blue",
    tagline:
      "Run Replicate's image, video, and audio models in a visual AI workflow — hundreds of community and first-party models, BYOK at Replicate's list price.",
    blurb: [
      "Replicate hosts a large, fast-moving catalog of open and commercial models behind one API — image, video, and audio generators from FLUX and Stable Diffusion to Kling, Wan, and more. NodeTool surfaces each as a node you can drop onto the canvas.",
      "Chain Replicate models into a pipeline — prompt to image, image to video, transcript to speech — and the whole graph is reusable and shareable. Because every model is a node, comparing two Replicate models on the same prompt is a matter of wiring both into the same input.",
      "Replicate is BYOK in NodeTool: set your `REPLICATE_API_TOKEN` and calls go straight to Replicate at their price. The model list below comes from the Replicate node manifest, so it tracks what the provider ships.",
    ],
    strengths: ["Image", "Video", "Audio"],
    faq: [
      {
        q: "How do I connect Replicate to NodeTool?",
        a: "Add your Replicate token as `REPLICATE_API_TOKEN` in NodeTool. Replicate nodes then call the API directly with your token.",
      },
      {
        q: "Which Replicate models are available?",
        a: "The image, video, and audio models in Replicate's node manifest — several hundred, each a separate node. See the catalog below.",
      },
      {
        q: "What does Replicate cost through NodeTool?",
        a: "Replicate's own list price. NodeTool is bring-your-own-key and adds no per-generation fee.",
      },
    ],
  }),
  provider({
    slug: "kie",
    providerId: "kie",
    name: "Kie",
    accent: "emerald",
    tagline:
      "Run Kie's image, video, and audio models in a visual AI workflow — Veo, Kling, Seedream, Suno and more, called with your own key at Kie's price.",
    blurb: [
      "Kie serves a curated set of top generative models — video (Veo, Kling, Seedance, Hailuo), image (Seedream, FLUX, GPT-Image), and audio including Suno music generation. NodeTool exposes each Kie model as its own node.",
      "Build a Kie pipeline on the canvas: write a prompt, generate an image, animate it, add a Suno soundtrack — one graph, edited freely and re-run on demand. Any Kie node can be swapped for a model on another provider without rewiring the rest.",
      "Kie is BYOK: NodeTool calls it with your `KIE_API_KEY` at Kie's list price. The catalog below is generated from Kie's node manifest.",
    ],
    strengths: ["Video", "Image", "Audio"],
    faq: [
      {
        q: "How do I use Kie in NodeTool?",
        a: "Store your key as `KIE_API_KEY` in NodeTool settings. Kie nodes then call Kie directly with your key.",
      },
      {
        q: "Can I generate music with Kie in NodeTool?",
        a: "Yes — Kie's Suno endpoints are audio nodes, so you can generate music inside a workflow alongside image and video steps.",
      },
      {
        q: "Does NodeTool mark up Kie pricing?",
        a: "No. You pay Kie's list price with your own key; NodeTool adds no per-call fee.",
      },
    ],
  }),
  provider({
    slug: "together-ai",
    providerId: "together",
    name: "Together AI",
    accent: "cyan",
    tagline:
      "Run Together AI's image and video models in a visual AI workflow — FLUX, Seedream, Kling, Veo and more, BYOK at Together's list price.",
    blurb: [
      "Together AI runs a broad inference platform; NodeTool integrates its image and video generation models — FLUX, Seedream, and popular video models — as nodes on the canvas.",
      "Drop a Together model into a graph, chain it with models from other providers, and share the whole pipeline as one file. Because each model is a node, putting two through the same prompt is a wiring change, not a rewrite.",
      "Together is BYOK in NodeTool: set `TOGETHER_API_KEY` and calls go to Together at their price. The model list below is generated from Together's node manifest.",
    ],
    strengths: ["Image", "Video"],
    faq: [
      {
        q: "How do I connect Together AI?",
        a: "Add your key as `TOGETHER_API_KEY` in NodeTool. Together nodes call the API directly with your key.",
      },
      {
        q: "Which Together AI models does NodeTool support?",
        a: "The image and video models in Together's node manifest, each a separate node. See the catalog below.",
      },
      {
        q: "Is there a NodeTool fee on Together AI?",
        a: "No — bring your own key and pay Together's list price. NodeTool adds nothing per call.",
      },
    ],
  }),
  provider({
    slug: "atlascloud",
    providerId: "atlascloud",
    name: "AtlasCloud",
    accent: "amber",
    tagline:
      "Run AtlasCloud's image and video models in a visual AI workflow — Seedance, GPT-Image and more, called with your own key at AtlasCloud's price.",
    blurb: [
      "AtlasCloud serves image and video generation models through a single API. NodeTool exposes each AtlasCloud model as a node you can compose with the rest of your graph.",
      "Wire an AtlasCloud image model into a video model, add an upscaler, and you have a repeatable pipeline you can re-run and share. Swapping AtlasCloud for another provider is a single node change.",
      "AtlasCloud is BYOK: NodeTool calls it with your `ATLASCLOUD_API_KEY` at their list price. The catalog below comes from AtlasCloud's node manifest.",
    ],
    strengths: ["Image", "Video"],
    faq: [
      {
        q: "How do I use AtlasCloud in NodeTool?",
        a: "Store your key as `ATLASCLOUD_API_KEY` in NodeTool settings. AtlasCloud nodes then call the API directly.",
      },
      {
        q: "Which AtlasCloud models are supported?",
        a: "The image and video models in AtlasCloud's node manifest, each a separate node. See the catalog below.",
      },
      {
        q: "Does NodeTool add a markup?",
        a: "No. You pay AtlasCloud's list price with your own key.",
      },
    ],
  }),
  provider({
    slug: "topaz",
    providerId: "topaz",
    name: "Topaz",
    accent: "rose",
    tagline:
      "Run Topaz's image and video enhancement models in a visual AI workflow — upscaling and restoration, called with your own key at Topaz's price.",
    blurb: [
      "Topaz Labs specializes in image and video enhancement — upscaling, denoising, and restoration. NodeTool integrates its models as nodes, so you can add a Topaz upscale step to the end of any generation pipeline.",
      "Generate an image or video with any provider, then route it through a Topaz node to sharpen and enlarge it — all in one graph. The pipeline is reusable and shareable as a single file.",
      "Topaz is BYOK in NodeTool: set `TOPAZ_API_KEY` and calls go to Topaz at their price. The model list below is generated from Topaz's node manifest.",
    ],
    strengths: ["Image", "Video"],
    faq: [
      {
        q: "What does Topaz do in NodeTool?",
        a: "Topaz nodes enhance media — upscaling and restoring images and video. Add one after a generation step to sharpen and enlarge the output inside the same workflow.",
      },
      {
        q: "How do I connect Topaz?",
        a: "Add your key as `TOPAZ_API_KEY` in NodeTool. Topaz nodes then call the API directly with your key.",
      },
      {
        q: "Is Topaz billed through NodeTool?",
        a: "No — bring your own key and pay Topaz's list price. NodeTool adds no per-call fee.",
      },
    ],
  }),
];

/** Page-registry contribution: one entry per provider page + the hub. */
export const entries: PageEntry[] = [
  {
    route: "/providers",
    title: `AI model providers in NodeTool — bring your own key (${yearToken()})`,
    description:
      "Every model provider NodeTool integrates — fal.ai, Replicate, Kie, Together AI, AtlasCloud, Topaz — with the image, video, audio, and 3D models each one serves. Bring your own key at provider prices.",
    priority: 0.6,
    changeFrequency: "monthly",
    indexable: true,
  },
  ...providerEntries.map(
    (p): PageEntry => ({
      route: p.route,
      title: p.title,
      description: p.description,
      priority: p.priority,
      changeFrequency: p.changeFrequency,
      indexable: p.indexable,
    })
  ),
];

export function providerBySlug(slug: string): ProviderEntry | undefined {
  return providerEntries.find((p) => p.slug === slug);
}

export function kindLabel(kind: ProviderModelKind): string {
  return KIND_LABEL[kind];
}
