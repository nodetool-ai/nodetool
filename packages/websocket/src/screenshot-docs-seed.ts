/**
 * Extra fixtures for the documentation screenshots: the documents the editor
 * pages show that the workflow and project seeds do not cover.
 *
 * - a 3D model (the repo's product-shot glTF), so the 3D editor opens on a set
 *   with a plinth, a product and lights instead of a single box
 * - an audio asset (the trailer score), so the audio editor draws a waveform
 * - a JS script with inputs, outputs and saved tests
 * - user skills, so the Skills list and editor have entries of their own
 * - durable memories, so the Memory page lists what an agent kept
 * - vector collections with indexed chunks, so the Collections page lists
 *   stores with counts and ingestion workflows instead of its empty state
 * - pictures behind the mock photo and entity rows the main seed creates, so
 *   asset grids, entity cards and mention pickers show images, not swatches
 *
 * Media bytes are files the repo already ships, copied into the asset store
 * through the same call an upload makes.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Asset, JsScript, Memory, Skill } from "@nodetool-ai/models";
import { STYLE_PRESETS } from "@nodetool-ai/protocol";
import sharp from "sharp";
import {
  getDefaultVectorProvider,
  OWNER_METADATA_KEY
} from "@nodetool-ai/vectorstore";

import { getAssetFileName } from "./lib/asset-paths.js";
import { seedStylePresets } from "./lib/style-presets.js";
import { storeAssetWithThumbnail } from "./lib/thumbnail.js";

// This file compiles to packages/websocket/dist/, so the repo root is three
// levels up either way (src or dist → websocket → packages → root).
const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".."
);

export const DOCS_MODEL3D_ASSET_ID = "model3d-product-shot";
export const DOCS_AUDIO_ASSET_ID = "audio-trailer-score";
export const DOCS_JS_SCRIPT_ID = "js-headline-variants";

const agoIso = (hours: number): string =>
  new Date(Date.now() - hours * 3_600_000).toISOString();

interface RepoMedia {
  id: string;
  source: string;
  name: string;
  contentType: string;
  parentId: string;
  durationSeconds?: number;
}

const MEDIA: RepoMedia[] = [
  {
    id: DOCS_MODEL3D_ASSET_ID,
    source: "demo/public/casts/model3d/composition.gltf",
    name: "product_shot_set.gltf",
    contentType: "model/gltf+json",
    parentId: "folder-images"
  },
  {
    id: DOCS_AUDIO_ASSET_ID,
    source: "demo/public/casts/promo/trailer-music.mp3",
    name: "trailer_score.mp3",
    contentType: "audio/mpeg",
    parentId: "folder-audio"
  }
];

async function seedMedia(media: RepoMedia, userId: string): Promise<void> {
  const bytes = readFileSync(join(REPO_ROOT, media.source));
  await Asset.create({
    id: media.id,
    user_id: userId,
    parent_id: media.parentId,
    name: media.name,
    content_type: media.contentType,
    size: bytes.byteLength,
    duration: media.durationSeconds ?? null,
    metadata: null,
    workflow_id: null,
    node_id: null,
    job_id: null,
    created_at: agoIso(30),
    updated_at: agoIso(30)
  });
  await storeAssetWithThumbnail(
    userId,
    media.id,
    getAssetFileName(media.id, media.contentType),
    bytes,
    media.contentType
  );
}

const HEADLINE_SCRIPT = {
  schemaVersion: 1 as const,
  description:
    "Turn a product name and a list of benefits into short ad headlines, one per benefit, capped at a character limit.",
  code: [
    "// Headline variants for a product ad.",
    "// inputs.product: the product name",
    "// inputs.benefits: one benefit per line",
    "// inputs.max_length: longest headline allowed",
    "",
    "const benefits = inputs.benefits",
    "  .split(\"\\n\")",
    "  .map((line) => line.trim())",
    "  .filter(Boolean);",
    "",
    "const headlines = benefits.map((benefit) => {",
    "  const line = `${inputs.product}: ${benefit}`;",
    "  return line.length <= inputs.max_length",
    "    ? line",
    "    : `${line.slice(0, inputs.max_length - 1).trimEnd()}…`;",
    "});",
    "",
    "output(\"headlines\", headlines);",
    "output(\"count\", headlines.length);",
    ""
  ].join("\n"),
  inputs: [
    { name: "product", type: "str" },
    { name: "benefits", type: "str" },
    { name: "max_length", type: "int" }
  ],
  outputs: [
    { name: "headlines", type: "list" },
    { name: "count", type: "int" }
  ],
  secrets: [],
  timeoutSeconds: 30,
  tests: [
    {
      name: "two benefits",
      inputs: {
        product: "Aurora Lamp",
        benefits: "Warm light at night\nLasts a week per charge",
        max_length: 40
      },
      expect: {
        headlines: [
          "Aurora Lamp: Warm light at night",
          "Aurora Lamp: Lasts a week per charge"
        ],
        count: 2
      }
    },
    {
      name: "truncates long lines",
      inputs: {
        product: "Aurora Lamp",
        benefits: "Dims itself as the room gets dark and wakes you gently",
        max_length: 32
      },
      expect: { count: 1 }
    }
  ]
};

const SKILLS = [
  {
    id: "skill-brand-voice",
    name: "brand-voice",
    description:
      "Write copy in the Aurora house style. Use for ad lines, captions, product descriptions and voiceover scripts.",
    content: [
      "# Aurora brand voice",
      "",
      "Write the way the product feels: calm, warm, specific.",
      "",
      "## Rules",
      "",
      "- Short sentences. One idea each.",
      "- Name the moment, not the feature: \"reading past midnight\", not \"adjustable brightness\".",
      "- No exclamation marks. No \"revolutionary\", \"game-changing\" or \"unleash\".",
      "- Headlines stay under 40 characters.",
      "",
      "## Product facts",
      "",
      "| Fact | Value |",
      "|---|---|",
      "| Battery | 7 days at half brightness |",
      "| Colors | Sand, Slate, Moss |",
      "| Price | $89 |",
      ""
    ].join("\n")
  },
  {
    id: "skill-shot-list",
    name: "shot-list",
    description:
      "Break a brief into a numbered shot list with framing, motion and duration. Use before creating a storyboard.",
    content: [
      "# Shot list",
      "",
      "1. Read the brief and name the one feeling the film must leave.",
      "2. Plan 4 to 8 shots. Each shot gets framing, subject, motion and seconds.",
      "3. Open on the widest shot and end on the product.",
      "4. Keep the total within one second of the requested runtime.",
      ""
    ].join("\n")
  },
  {
    id: "skill-thumbnail-check",
    name: "thumbnail-check",
    description:
      "Review generated stills for legibility at thumbnail size before they go into a cut.",
    content: [
      "# Thumbnail check",
      "",
      "Downscale each still to 320px wide and check:",
      "",
      "- The subject reads in under a second.",
      "- No text in the frame unless the brief asked for it.",
      "- Faces are not cropped at the eyes.",
      ""
    ].join("\n")
  }
];

const MEMORIES = [
  {
    id: "memory-brand-palette",
    kind: "preference",
    title: "Aurora palette",
    content:
      "Sand #E8DCC8, Slate #3B4250, Moss #6B7F5A. Backgrounds stay warm; never use pure white.",
    hoursAgo: 3
  },
  {
    id: "memory-voice",
    kind: "preference",
    title: "Narrator voice",
    content:
      "ElevenLabs \"Brian\" at stability 0.45 for every trailer voiceover. The brighter voices were rejected in review.",
    hoursAgo: 9
  },
  {
    id: "memory-hero-still",
    kind: "asset",
    title: "SCRAPHEART hero still",
    content:
      "The convoy-on-the-horizon frame is the approved opener and the poster crop.",
    resources: [
      { type: "asset", id: "still-scrapheart-1", uri: "asset://still-scrapheart-1", label: "convoy horizon" }
    ],
    hoursAgo: 26
  },
  {
    id: "memory-delivery",
    kind: "fact",
    title: "Delivery specs",
    content:
      "Social cuts ship as 1080x1920 at 30 fps, -14 LUFS, captions burned in.",
    hoursAgo: 48
  },
  {
    id: "memory-model-choice",
    kind: "decision",
    title: "Still model for trailers",
    content:
      "Use gpt-image-2 for stills with hands or text, FLUX.2 for wide landscapes.",
    hoursAgo: 72
  }
];

interface CollectionSpec {
  name: string;
  workflow?: string;
  embeddingModel: string;
  embeddingProvider: string;
  chunks: string[];
}

const COLLECTIONS: CollectionSpec[] = [
  {
    name: "brand-guidelines",
    workflow: "wf-rag-pipeline",
    embeddingModel: "text-embedding-3-small",
    embeddingProvider: "openai",
    chunks: [
      "Aurora headlines stay under 40 characters and never end in an exclamation mark.",
      "The palette is Sand, Slate and Moss. Backgrounds stay warm; pure white is never used.",
      "Product shots sit on a matte plinth with one warm key light from the left.",
      "Voiceover reads slowly, at about 130 words per minute, with a pause before the product name.",
      "Logos appear in the last two seconds of a cut and nowhere else."
    ]
  },
  {
    name: "support-articles",
    workflow: "wf-customer-support",
    embeddingModel: "nomic-embed-text",
    embeddingProvider: "ollama",
    chunks: [
      "To reset the lamp, hold the base button for ten seconds until the ring blinks twice.",
      "A full charge takes about three hours over USB-C and lasts seven days at half brightness.",
      "The sunrise alarm starts thirty minutes before the set time and brightens gradually.",
      "Firmware updates install from the app while the lamp is charging."
    ]
  },
  {
    name: "film-research",
    embeddingModel: "text-embedding-3-small",
    embeddingProvider: "openai",
    chunks: [
      "Long lenses compress a convoy against the horizon and make distance feel hostile.",
      "Dust in backlight reads as heat; shoot into the sun an hour before dusk.",
      "Trailers cut faster in the last third, often on the beat of the score."
    ]
  }
];

/** A deterministic stand-in vector, so no embedding provider is called. */
function fakeEmbedding(text: string): number[] {
  const vector = new Array<number>(16).fill(0);
  for (let index = 0; index < text.length; index++) {
    vector[index % vector.length] += text.charCodeAt(index) / 1000;
  }
  return vector;
}

async function seedCollections(userId: string): Promise<void> {
  const provider = getDefaultVectorProvider();
  for (const spec of COLLECTIONS) {
    const metadata: Record<string, string> = {
      [OWNER_METADATA_KEY]: userId,
      embedding_model: spec.embeddingModel,
      embedding_provider: spec.embeddingProvider
    };
    if (spec.workflow) {
      metadata.workflow = spec.workflow;
    }
    const collection = await provider.getOrCreateCollection({
      name: spec.name,
      metadata
    });
    await collection.upsert(
      spec.chunks.map((chunk, index) => ({
        id: `${spec.name}-${index + 1}`,
        document: chunk,
        embedding: fakeEmbedding(chunk),
        metadata: { source: `${spec.name}.md` }
      }))
    );
  }
}

const BASE_NODE_ASSETS = "packages/base-nodes/nodetool/assets/nodetool-base";

/**
 * Pictures for asset rows `screenshot-server.ts` creates without bytes, keyed
 * by asset id. Each is re-encoded to the row's declared content type.
 */
const MOCK_MEDIA: { id: string; source: string; contentType: string }[] = [
  {
    id: "asset-photo1",
    source: "marketing/public/storyboards/rooftop-run/at-the-edge.jpg",
    contentType: "image/jpeg"
  },
  {
    id: "asset-photo2",
    source: `${BASE_NODE_ASSETS}/styles/cinematic.jpg`,
    contentType: "image/png"
  },
  {
    id: "asset-photo3",
    source: "marketing/public/templates/samples/backdrop.webp",
    contentType: "image/jpeg"
  },
  {
    id: "asset-photo4",
    source: "marketing/public/storyboards/the-interrogation/the-room.jpg",
    contentType: "image/jpeg"
  },
  {
    id: "asset-img-folder-1",
    source: "marketing/public/logo.png",
    contentType: "image/png"
  },
  {
    id: "asset-img-folder-2",
    source: "marketing/public/templates/samples/concept-art-iteration-board.webp",
    contentType: "image/png"
  },
  {
    id: "asset-first-workflow-image",
    source: `${BASE_NODE_ASSETS}/storyboards/lighthouse-keeper/headland-at-dusk.jpg`,
    contentType: "image/jpeg"
  },
  {
    id: "entity-marta",
    source: "marketing/public/storyboards/the-interrogation/home-at-nine.jpg",
    contentType: "image/png"
  },
  {
    id: "entity-harbor",
    source: `${BASE_NODE_ASSETS}/styles/noir.jpg`,
    contentType: "image/png"
  },
  {
    id: "entity-noir",
    source: `${BASE_NODE_ASSETS}/timelines/voltra/street.jpg`,
    contentType: "image/png"
  },
  {
    id: "entity-umbrella",
    source: `${BASE_NODE_ASSETS}/timelines/voltra/rider.jpg`,
    contentType: "image/png"
  }
];

async function seedMockMedia(userId: string): Promise<void> {
  for (const media of MOCK_MEDIA) {
    const image = sharp(readFileSync(join(REPO_ROOT, media.source)));
    const bytes =
      media.contentType === "image/png"
        ? await image.png().toBuffer()
        : await image.jpeg({ quality: 88 }).toBuffer();
    await storeAssetWithThumbnail(
      userId,
      media.id,
      getAssetFileName(media.id, media.contentType),
      bytes,
      media.contentType
    );
  }
}

/**
 * The storyboard style presets are seeded lazily and carry no bytes, so the
 * entity library would render them as broken images. Seed them up front and
 * store each preset's tile art as the asset's file.
 */
async function seedStylePresetMedia(userId: string): Promise<void> {
  const assets = await seedStylePresets(userId);
  for (const [index, preset] of STYLE_PRESETS.entries()) {
    const relative = preset.thumbnail.replace("package://nodetool-base/", "");
    const bytes = await sharp(
      readFileSync(join(REPO_ROOT, BASE_NODE_ASSETS, relative))
    )
      .jpeg({ quality: 88 })
      .toBuffer();
    const id = assets[index].id;
    await storeAssetWithThumbnail(
      userId,
      id,
      getAssetFileName(id, "image/jpeg"),
      bytes,
      "image/jpeg"
    );
  }
}

/** Seed every extra documentation fixture. */
export async function seedDocsExtras(userId: string): Promise<void> {
  for (const media of MEDIA) {
    await seedMedia(media, userId);
  }

  await new JsScript({
    id: DOCS_JS_SCRIPT_ID,
    user_id: userId,
    project_id: "default",
    name: "Headline variants",
    document: JSON.stringify(HEADLINE_SCRIPT),
    created_at: agoIso(20)
  }).save();

  for (const skill of SKILLS) {
    await new Skill({ ...skill, user_id: userId }).save();
  }

  for (const memory of MEMORIES) {
    await new Memory({
      id: memory.id,
      user_id: userId,
      thread_id: "thread-project-scrapheart",
      kind: memory.kind,
      title: memory.title,
      content: memory.content,
      resources: memory.resources ?? null,
      created_at: agoIso(memory.hoursAgo),
      updated_at: agoIso(memory.hoursAgo)
    }).save();
  }

  await seedCollections(userId);
  await seedMockMedia(userId);
  await seedStylePresetMedia(userId);
}
