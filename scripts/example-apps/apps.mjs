// The curated example apps, as data.
//
// `scripts/build-example-apps.mjs`
// turns each entry into an ApplicationBundle in
// packages/base-nodes/nodetool/examples/apps/, resolving every workflow,
// input, and output **by name** against the shipped template graphs — a name
// that no longer exists fails the build instead of shipping a dead binding.
//
// Entry shape:
//   slug, name, emoji, showEmoji, tagline, description, note, featured
//   workflows  { <bundleKey>: "<Template Name>" }
//   variables  [ { id, name, scope, persist?, default? } ]
//   operations [ { id, name, workflow, policy?, timeoutMs?,
//                  inputs:  { "<input name>": mapping },
//                  outputs: { "<output name>": { to: "variable", variableId } } } ]
//              Inputs with no mapping are driven by a widget; outputs with no
//              mapping are displayed.
//   modelOverrides { <bundleKey>: { <nodeId>: <model ref> } }
//   propOverrides  { <bundleKey>: { <nodeId>: { <prop>: value } } } for a
//              template default that suits the template but not the app
//   sections   [ { title, op?, controls: [...], results: [...] } ]
//   content    Optional authored widget tree, used instead of sections.
//   steps      `true` shows one section at a time behind a Stepper. A
//              section's `key` defaults to its slugified title, and the build
//              declares the `step` variable unless the app does. A section may
//              carry an `intro` and a `nextWhen` variable that must be filled
//              before Next. Use it when sections run in order.
//   layout     "tabs" puts each section on its own tab (at most three), for
//              sections that are alternatives rather than steps.
//
// Model pickers for the graph's own model nodes are generated per section and
// placed above its first run button. Two or more fold into a closed "Models"
// accordion.
//
// Control kinds: input, text, model, number, slider, select, image, video, audio,
// document, switch, color, run, note. Result kinds: progress, activity, transcript, error, show, showVar,
// heading, note, and textVar for an editable variable under the run that fills it.
// `text`, `model`, `select` and `slider` take an input name or `{ node, prop }` to drive
// a node property inside the graph; `default` seeds the preview value. `model` also
// takes `{ variable }`: one picker for a model that several operations read, and
// `number` and `select` take `{ variable }` the same way.
// `image`, `video`, `audio`, and `document` take a variable id or `{ input }`.
// See buildControl() in the builder for the exact props each one emits.

import { PRODUCT_PRICE_DROP_BUNDLE, PRODUCT_PRICE_DROP_DEBUG_INTERACTIONS } from "./product-price-drop.mjs";
import { AD_LIBRARY_APPS } from "./ad-library-recipes.mjs";
import { DIRECTED_CAMPAIGN_KIT_APP } from "./directed-campaign-kit.mjs";
import { PODCAST_PRODUCTION_DESK_APP } from "./podcast-production-desk.mjs";
import { UGC_PRODUCT_VIDEO_APP } from "./ugc-product-video.mjs";
import { CATALOG_MOTION_APP, CATALOG_MOTION_REFERENCES_APP } from "./catalog-motion.mjs";
import { VIDEO_POST_HOUSE_APP } from "./video-post-house.mjs";

const SLIDERS_IMAGE_ENHANCE = [
  { slider: { node: "denoise-node", prop: "radius" }, label: "Denoise", min: 0, max: 16, step: 0.5, default: 0 },
  { slider: { node: "tone-node", prop: "brightness" }, label: "Brightness", min: -1, max: 1, step: 0.05, default: 0.05 },
  { slider: { node: "tone-node", prop: "contrast" }, label: "Contrast", min: 0, max: 4, step: 0.05, default: 1.15 },
  { slider: { node: "color-node", prop: "saturation" }, label: "Saturation", min: 0, max: 4, step: 0.05, default: 1.2 },
  { slider: { node: "sharpen-node", prop: "amount" }, label: "Sharpen", min: 0, max: 4, step: 0.05, default: 1 }
];

const IMG = { $demo: "image" };
const VIDEO = { $demo: "video" };
const AUDIO = { $demo: "audio" };
const AD_MAKER_HERO = "/app-preview/media/ad-maker/campaign-hero.png";
const CODEX_LUNA = {
  type: "language_model",
  provider: "codex",
  id: "gpt-5.6-luna",
  name: "GPT-5.6-Luna",
  path: null,
  supported_tasks: []
};
const ATLASCLOUD_YOUCHUAN_REMOVE_BACKGROUND = {
  type: "image_model",
  provider: "atlascloud",
  id: "youchuan/v8.2/remove-background",
  name: "Youchuan v8.2 — Remove Background",
  path: null,
  supported_tasks: ["remove_background"]
};

const NANO_BANANA_EDIT = {
  type: "image_model",
  provider: "fal_ai",
  id: "fal-ai/nano-banana/edit",
  name: "Nano Banana Edit",
  path: null,
  supported_tasks: []
};

const DIRECT_TRAILER_CODE = String.raw`
import { run_agent } from "@nodetool-ai/sandbox-nodetool/agents";

const premise = String(inputs.premise ?? "").trim();
if (!premise) throw new Error("Write the premise before you direct the teaser.");
const style = String(inputs.style ?? "").trim();
const shots = Math.max(3, Math.min(10, Number(inputs.shots) || 6));
const picked = inputs.model?.id ? inputs.model : await nodetool.models.pick("generate_message");
const ref = async ([chosen, capability]) => {
  const hit = chosen?.id ? chosen : await nodetool.models.pick(capability);
  const { provider, id } = hit.ref || hit;
  return "provider " + provider + ", model " + id;
};
const [imageModel, videoModel, musicModel] = await Promise.all(
  [
    [inputs.image_model, "text_to_image"],
    [inputs.video_model, "image_to_video"],
    [null, "text_to_music"]
  ].map(ref)
);

const answer = await run_agent({
  label: "director",
  model: picked.ref || picked,
  max_turns: 40,
  tools: ["generate_batch", "generate_music", "media_probe", "media_edit"],
  system: "You are a trailer director. Decide, say what you decided in one or two sentences, then act with your tools. Use only the asset URIs your tools return.",
  prompt: [
    "Direct a teaser trailer from start to finish.",
    "Premise: " + premise,
    "Visual style: " + (style || "choose one that fits the premise"),
    "Number of shots: " + shots,
    "",
    "1. Write the beat sheet: hook, escalation, turn and title card, with timings.",
    "2. Write the numbered shot list: subject, framing, camera move and duration. Repeat the visual style in every shot prompt. Allow no on-screen text.",
    "3. Make every still in one generate_batch call: one generate_image request per shot, at 16:9, with " + imageModel + ". Label each request with its shot.",
    "4. Animate every still in one more generate_batch call: one animate_image request per still, with " + videoModel + ".",
    "5. Keep each clip to the duration in your shot list.",
    "6. Call media_edit with operation concat, the clip asset URIs in shot order, and output_file cut.mp4. Check it with media_probe.",
    "7. Call generate_music for a bed as long as the cut, with " + musicModel + ". Then call media_edit with operation add_audio and output_file trailer.mp4.",
    "8. Submit the asset URI of the final file and your notes.",
    "",
    "Retry a failed call once. If a shot fails again, cut without it and say so. Do not regenerate a shot only to improve it.",
    "If you cannot finish, still submit: leave trailer_uri empty and say in the notes which step failed and why."
  ].join("\n"),
  output_schema: {
    type: "object",
    properties: { trailer_uri: { type: "string" }, notes: { type: "string" } },
    required: ["notes"]
  }
});
if (answer.error) throw new Error(answer.error);
await output("notes", answer.result.notes);
if (!answer.result.trailer_uri) throw new Error("The agent made no trailer. Its notes say why.");
await output("trailer", { type: "video", uri: answer.result.trailer_uri });
`;

const DIRECT_TRAILER_SCRIPT = {
  name: "Direct a Trailer",
  document: {
    schemaVersion: 1,
    description: "Runs one agent that plans, renders, cuts and scores a teaser trailer from a premise.",
    code: DIRECT_TRAILER_CODE,
    inputs: [
      { name: "premise", type: "str" },
      { name: "style", type: "str" },
      { name: "shots", type: "int" },
      { name: "model", type: "language_model" },
      { name: "image_model", type: "image_model" },
      { name: "video_model", type: "video_model" }
    ],
    outputs: [
      { name: "trailer", type: "video" },
      { name: "notes", type: "str" }
    ],
    secrets: [],
    timeoutSeconds: 1800,
    tests: []
  }
};

const DIRECT_FILM_CODE = String.raw`
import { run_agent } from "@nodetool-ai/sandbox-nodetool/agents";

const brief = String(inputs.brief ?? "").trim();
if (!brief) throw new Error("Write the film in one line before you shoot it.");
const style = String(inputs.style ?? "").trim();
const shots = Math.max(3, Math.min(8, Number(inputs.shots) || 5));
const picked = inputs.model?.id ? inputs.model : await nodetool.models.pick("generate_message");
const ref = async ([chosen, capability]) => {
  const hit = chosen?.id ? chosen : await nodetool.models.pick(capability);
  const { provider, id } = hit.ref || hit;
  return "provider " + provider + ", model " + id;
};
const [imageModel, editModel, videoModel, voiceModel, musicModel] = await Promise.all(
  [
    [inputs.image_model, "text_to_image"],
    [null, "image_to_image"],
    [inputs.video_model, "image_to_video"],
    [null, "text_to_speech"],
    [null, "text_to_music"]
  ].map(ref)
);

const answer = await run_agent({
  label: "director",
  model: picked.ref || picked,
  max_turns: 50,
  tools: ["generate_image", "generate_batch", "generate_speech", "generate_music", "media_probe", "media_edit"],
  system: "You are a film director. Decide, say what you decided in one or two sentences, then act with your tools. Use only the asset URIs your tools return.",
  prompt: [
    "Direct a narrated, scored short film from start to finish.",
    "Brief: " + brief,
    "Visual style: " + (style || "choose one that fits the brief"),
    "Number of shots: " + shots,
    "",
    "1. Write the direction document in Markdown: title, logline, characters, style bible, numbered shot list (subject, framing, motion, 4s each), narration script and music cue.",
    "2. Make one style frame with generate_image at 16:9, with " + imageModel + ". Every keyframe must match it.",
    "3. Make every keyframe in one generate_batch call: one edit_image request per shot, with the style frame as input_file, at 16:9, with " + editModel + ". Label each request with its shot.",
    "4. Animate every keyframe in one more generate_batch call: one animate_image request per keyframe, with input_file set to the keyframe and " + videoModel + ".",
    "5. Call media_edit with operation concat, the clip asset URIs in shot order, and output_file cut.mp4. Check its length with media_probe.",
    "6. Voice the narration with generate_speech, with " + voiceModel + ". Keep it shorter than the cut.",
    "7. Call generate_music for a bed as long as the cut, with " + musicModel + ".",
    "8. Mix the narration, then the music, onto the cut with media_edit operation add_audio. Name the final file film.mp4.",
    "9. Submit the direction document, the asset URI of the final file, and your notes.",
    "",
    "Retry a failed call once, and fix its arguments first if the error names one. If a shot fails again, cut without it and say so. Do not regenerate a shot only to improve it.",
    "If you cannot finish, still submit: leave film_uri empty and say in the notes which step failed and why."
  ].join("\n"),
  output_schema: {
    type: "object",
    properties: {
      direction: { type: "string" },
      film_uri: { type: "string" },
      notes: { type: "string" }
    },
    required: ["direction", "notes"]
  }
});
if (answer.error) throw new Error(answer.error);
await output("direction", answer.result.direction);
await output("notes", answer.result.notes);
if (!answer.result.film_uri) throw new Error("The agent made no film. Its notes say why.");
await output("film", { type: "video", uri: answer.result.film_uri });
`;

const DIRECT_FILM_SCRIPT = {
  name: "Direct a Short Film",
  document: {
    schemaVersion: 1,
    description: "Runs one agent that directs, storyboards, shoots, narrates, scores and cuts a short film from a brief.",
    code: DIRECT_FILM_CODE,
    inputs: [
      { name: "brief", type: "str" },
      { name: "style", type: "str" },
      { name: "shots", type: "int" },
      { name: "model", type: "language_model" },
      { name: "image_model", type: "image_model" },
      { name: "video_model", type: "video_model" }
    ],
    outputs: [
      { name: "direction", type: "str" },
      { name: "film", type: "video" },
      { name: "notes", type: "str" }
    ],
    secrets: [],
    timeoutSeconds: 1800,
    tests: []
  }
};

export const EXAMPLE_APPS = [
  {slug: "product-price-drop", name: "Product Price Drop", description: PRODUCT_PRICE_DROP_BUNDLE.description, tagline: "Exact product, editable prices, deterministic motion.", workflows: {}, featured: true, bundle: PRODUCT_PRICE_DROP_BUNDLE, debugInteractions: PRODUCT_PRICE_DROP_DEBUG_INTERACTIONS},
  ...AD_LIBRARY_APPS,
  // ── 1 ──────────────────────────────────────────────────────────────────────
  {
    slug: "photo-studio",
    layout: "tabs",
    name: "Photo Studio",
    emoji: "📸",
    featured: true,
    tagline:
      "Drag five sliders and watch the photo re-render — then run the same grade over a whole folder.",
    description:
      "A live photo editor and a batch retoucher behind one surface. The single-photo grade is pure GPU filters, so it runs with no API key at all.",
    note: "✨ `Enhance` runs locally. `Batch` adds a cloud grading pass and is billed per image.",
    workflows: { enhance: "Image Enhance", batch: "Photo Enhancement Suite" },
    // The template's FLUX schnell is text-to-image only, so it drew a new
    // picture instead of grading the photo it was given.
    modelOverrides: { batch: { 3: NANO_BANANA_EDIT } },
    variables: [
      { id: "sourceImage", name: "Source photo", scope: "instance", type: "image" }
    ],
    operations: [
      {
        id: "enhance",
        name: "Enhance",
        workflow: "enhance",
        policy: "replace",
        inputs: { image: { from: "variable", variableId: "sourceImage" } }
      },
      { id: "batch", name: "Batch", workflow: "batch", policy: "replace" }
    ],
    sections: [
      {
        title: "One photo",
        op: "enhance",
        controls: [
          { image: "sourceImage", label: "Your photo" },
          ...SLIDERS_IMAGE_ENHANCE.map((s) => ({ ...s, op: "enhance", pace: "release", run: true })),
          { run: ["enhance"], label: "Enhance my photo" }
        ],
        results: [
          { progress: "enhance", label: "Running the filter chain…" },
          { show: "enhanced_image", op: "enhance", as: "Image", label: "Enhanced photo", demo: IMG }
        ]
      },
      {
        title: "A whole set",
        op: "batch",
        controls: [
          { input: "photos", op: "batch", label: "Your photos" },
          { slider: "brightness_adjust", op: "batch", label: "Brightness", min: 0.5, max: 1.5, step: 0.05, pace: "release" },
          { slider: "color_boost", op: "batch", label: "Color boost", min: 0.5, max: 2, step: 0.05, pace: "release" },
          { run: ["batch"], label: "Enhance my photos" }
        ],
        results: [
          { progress: "batch", label: "Retouching each photo…" },
          { show: "enhanced_photos", op: "batch", as: "Image", label: "Enhanced photos", demo: IMG }
        ]
      }
    ]
  },


  // ── 3 ──────────────────────────────────────────────────────────────────────
  {
    slug: "concept-studio",
    steps: true,
    name: "Concept Studio",
    emoji: "🖌️",
    featured: true,
    tagline: "Generate a gallery, pick one, polish it.",
    description:
      "The creative iteration loop: fan a brief into concept art, mix animals into creatures, then run the picked image through a keyless filter chain.",
    note: "🎨 Generation uses configured cloud models. Polishing runs locally on a compatible GPU.",
    workflows: {
      concepts: "Concept Art Iteration Board",
      creatures: "Pokemon Maker",
      enhance: "Image Enhance"
    },
    variables: [
      { id: "picked", name: "Picked image", scope: "instance", type: "image" }
    ],
    operations: [
      { id: "concepts", name: "Concepts", workflow: "concepts", policy: "replace" },
      { id: "creatures", name: "Creatures", workflow: "creatures", policy: "replace" },
      {
        id: "polish",
        name: "Polish",
        workflow: "enhance",
        policy: "replace",
        inputs: { image: { from: "variable", variableId: "picked" } }
      }
    ],
    sections: [
      {
        title: "Concept art",
        op: "concepts",
        controls: [
          { text: "creative_brief", op: "concepts", label: "Creative brief", multiline: true },
          {
            select: "art_style",
            op: "concepts",
            label: "Art style",
            options: [
              "Painterly digital concept art, dramatic cinematic lighting, rich saturated color, visible brushwork, AAA game key art",
              "Ink and wash, monochrome, loose gestural linework",
              "Photobash realism, moody atmospheric haze, volumetric light",
              "Flat vector, bold shapes, limited palette",
              "Anime background art, soft gradients, golden-hour light"
            ]
          },
          { text: "mood_keywords", op: "concepts", label: "Mood keywords" },
          { slider: "variations", op: "concepts", label: "How many variations?", min: 2, max: 8, step: 1 },
          { run: ["concepts"], label: "Generate concept art" }
        ],
        results: [
          { progress: "concepts", label: "Rendering variations…" },
          { show: "Concept Art", op: "concepts", as: "Image", label: "Concept art", demo: IMG }
        ]
      },
      {
        title: "Creatures",
        op: "creatures",
        controls: [
          { text: "animals", op: "creatures", label: "Mix these animals" },
          {
            select: "style",
            op: "creatures",
            label: "Style",
            options: [
              "Classic anime cel-shaded",
              "Glossy 3D render",
              "Painterly watercolor",
              "Retro 16-bit pixel art",
              "Holographic foil trading card"
            ]
          },
          { run: ["creatures"], label: "Create my creatures" }
        ],
        results: [
          { progress: "creatures", label: "Designing your creatures…" },
          { show: "pokemon", op: "creatures", as: "Image", label: "Your creatures", demo: IMG }
        ]
      },
      {
        title: "Polish the pick",
        op: "polish",
        controls: [
          { image: "picked", label: "The image you picked" },
          ...SLIDERS_IMAGE_ENHANCE.map((s) => ({ ...s, op: "polish", pace: "release", run: true })),
          { run: ["polish"], label: "Polish it" }
        ],
        results: [
          { progress: "polish", label: "Polishing…" },
          { show: "enhanced_image", op: "polish", as: "Image", label: "Polished", demo: IMG }
        ]
      }
    ]
  },

  // ── 6 ──────────────────────────────────────────────────────────────────────
  {
    slug: "brand-and-social",
    steps: true,
    name: "Brand & Social",
    emoji: "🎨",
    featured: true,
    tagline: "Paste your website. An agent researches the brand, then two deliverables read what it found.",
    description:
      "An agent opens your website, searches for what it leaves out, and fills in your brand. Edit anything it got wrong, then the asset kit and the thumbnail factory both read the same values.",
    note: "Your brand fields persist between sessions. Research uses a model with browser and web search tools.",
    workflows: {
      research: "Research a Brand from Its Website",
      brand: "Brand Asset Generator",
      hooks: "Hook & Thumbnail Factory"
    },
    variables: [
      { id: "brandName", name: "Brand name", scope: "user", persist: true, type: "str", default: "Aurora Labs" },
      { id: "audience", name: "Audience", scope: "user", persist: true, type: "str", default: "outdoor-minded people in their 30s" },
      { id: "voice", name: "Brand voice", scope: "user", persist: true, type: "str", default: "friendly and confident, never corporate" },
      {
        id: "brandDescription",
        name: "Brand description",
        scope: "user",
        persist: true,
        type: "str",
        default: "A climate-tech startup building friendly home-energy tools. Warm, optimistic and human, where nature meets precision engineering."
      },
      { id: "tagline", name: "Tagline", scope: "user", persist: true, type: "str", default: "Power that gives back" }
    ],
    operations: [
      {
        id: "research",
        name: "Research",
        workflow: "research",
        policy: "replace",
        outputs: {
          brand_name: { to: "variable", variableId: "brandName" },
          audience: { to: "variable", variableId: "audience" },
          voice: { to: "variable", variableId: "voice" },
          brand_description: { to: "variable", variableId: "brandDescription" },
          tagline: { to: "variable", variableId: "tagline" }
        }
      },
      {
        id: "kit",
        name: "Asset kit",
        workflow: "brand",
        policy: "replace",
        inputs: {
          brand_name: { from: "variable", variableId: "brandName" },
          brand_description: { from: "variable", variableId: "brandDescription" },
          tagline: { from: "variable", variableId: "tagline" }
        }
      },
      {
        id: "thumbnails",
        name: "Thumbnails",
        workflow: "hooks",
        policy: "replace",
        inputs: { "Target Audience": { from: "variable", variableId: "audience" } }
      }
    ],
    sections: [
      {
        title: "Research your brand",
        op: "research",
        controls: [
          { text: "website", op: "research", label: "Your website" },
          { model: { node: "research_agent", prop: "model" }, op: "research", label: "Research model", modelKind: "language_model" },
          { run: ["research"], label: "Research my brand", disabledWhen: "research" }
        ],
        results: [
          { progress: "research", label: "Reading your site and searching…" },
          { transcript: "research", label: "What the agent is doing", placeholder: "Pages opened and searches run appear here." },
          { error: "research", label: "Research failed" },
          { show: "research_notes", op: "research", as: "Markdown", label: "Research notes", demo: "## Brand\n**Aurora Labs** sells friendly home-energy tools.\n\n## Sources\n- https://example.com" }
        ]
      },
      {
        title: "Your brand",
        controls: [
          { note: "Research fills these in. Edit anything before you generate." },
          { textVar: "brandName", label: "Brand name" },
          { textVar: "audience", label: "Who is it for?", multiline: true },
          { textVar: "voice", label: "Brand voice", multiline: true },
          { textVar: "brandDescription", label: "Describe your brand", multiline: true },
          { textVar: "tagline", label: "Tagline" },
          { color: "primary_color", op: "kit", label: "Primary color" },
          { run: ["kit"], label: "Generate brand assets", disabledWhen: "kit" }
        ],
        results: [
          { progress: "kit", label: "Designing your assets…" },
          { error: "kit", label: "Asset generation failed" },
          { show: "social_assets", op: "kit", as: "Image", label: "Your brand assets", demo: IMG },
          { show: "brand_brief", op: "kit", as: "Markdown", label: "Brand brief", demo: "**Aurora Labs — brand direction.** Warm, optimistic, human. Nature meets precision engineering." }
        ]
      },
      {
        title: "Hooks & thumbnails",
        op: "thumbnails",
        controls: [
          { text: "Video Topic", op: "thumbnails", label: "What's your video about?", multiline: true },
          { number: "Number of Hooks", op: "thumbnails", label: "How many hooks?", min: 3, max: 8 },
          { run: ["thumbnails"], label: "Make hooks & thumbnails", disabledWhen: "thumbnails" }
        ],
        results: [
          { progress: "thumbnails", label: "Writing hooks & rendering thumbnails…" },
          { error: "thumbnails", label: "Thumbnails failed" },
          { show: "thumbnail_gallery", op: "thumbnails", as: "Image", label: "Thumbnail gallery", demo: IMG },
          { show: "hooks", op: "thumbnails", as: "Markdown", label: "Hook ideas", demo: "1. “You're losing $100/month by not knowing this.”\n2. “$5 a day → $1M. Here's the math nobody shows you.”" },
          { show: "thumbnail", op: "thumbnails", as: "Image", label: "Featured thumbnail" }
        ]
      }
    ]
  },

  // ── 7 ──────────────────────────────────────────────────────────────────────
  {
    slug: "product-launch-kit",
    steps: true,
    name: "Product Launch Kit",
    emoji: "📦",
    tagline: "One product photo in, mockups and a launch video out.",
    description:
      "Stage a product photo into lifestyle mockups, then — deliberately, because it costs real money — turn the same photo into a launch video.",
    note: "💸 Mockups and launch video use configured cloud models. Video generation is billed per run, so it has its own button.",
    workflows: { mockups: "Product Mockup Generator", video: "Product Video Generator" },
    variables: [
      { id: "productPhoto", name: "Product photo", scope: "instance", type: "image" },
      { id: "audience", name: "Target audience", scope: "instance", type: "str", default: "people who hike on weekends" }
    ],
    operations: [
      {
        id: "mockups",
        name: "Mockups",
        workflow: "mockups",
        policy: "replace",
        inputs: {
          product_image: { from: "variable", variableId: "productPhoto" },
          target_audience: { from: "variable", variableId: "audience" }
        }
      },
      {
        id: "video",
        name: "Launch video",
        workflow: "video",
        policy: "queue",
        timeoutMs: 900000,
        inputs: {
          image_input_1: { from: "variable", variableId: "productPhoto" },
          target_audience: { from: "variable", variableId: "audience" }
        }
      }
    ],
    sections: [
      {
        title: "Your product",
        controls: [
          { image: "productPhoto", label: "Product photo" },
          { textVar: "audience", label: "Who is it for?", multiline: true },
          { text: "product_name", op: "mockups", label: "Product name" },
          { text: "product_description", op: "mockups", label: "Describe the product", multiline: true },
          { number: "num_scenes", op: "mockups", label: "How many scenes?", min: 2, max: 6 },
          { run: ["mockups"], label: "Generate mockups" }
        ],
        results: [
          { progress: "mockups", label: "Staging your mockups…" },
          { show: "mockup", op: "mockups", as: "Image", label: "Mockups", demo: IMG },
          { show: "scene", op: "mockups", as: "Image", label: "Scenes before the product goes in" }
        ]
      },
      {
        title: "Launch video",
        op: "video",
        controls: [
          { note: "💸 One run generates a video and incurs usage charges." },
          { text: "campaign_brief", op: "video", label: "Campaign brief", multiline: true },
          { text: "key_features", op: "video", label: "Key features", multiline: true },
          { run: ["video"], label: "Generate the launch video" }
        ],
        results: [
          { progress: "video", label: "Producing your spot…" },
          { show: "product_video", op: "video", as: "Video", label: "Launch video", demo: VIDEO }
        ]
      }
    ]
  },

  // ── 8 ──────────────────────────────────────────────────────────────────────
  {
    slug: "film-studio",
    steps: true,
    name: "Film Studio",
    emoji: "🎬",
    featured: true,
    tagline: "Brief → direction → storyboard → cut → key art.",
    description:
      "The showcase run: one agent directs, storyboards, shoots and scores a short while you watch, then a rough cut you can keep editing and the poster that sells it.",
    note: "💸 This app generates video and music. Run it once, deliberately.",
    workflows: {
      timeline: "Directed Film to Timeline",
      posters: "Movie Posters"
    },
    scripts: { produce: DIRECT_FILM_SCRIPT },
    variables: [
      { id: "brief", name: "Brief", scope: "instance", type: "str", default: "A lighthouse keeper follows her own beam to the thing it will no longer stop pointing at." },
      { id: "style", name: "Visual style", scope: "instance", type: "str", default: "Anamorphic, sodium amber against blue-black sea, fine grain" },
      { id: "film", name: "Film", scope: "instance", type: "video" },
      { id: "agentModel", name: "Agent model", scope: "instance", type: "language_model" },
      { id: "imageModel", name: "Image model", scope: "instance", type: "image_model" },
      { id: "videoModel", name: "Video model", scope: "instance", type: "video_model" }
    ],
    operations: [
      {
        id: "produce",
        name: "Produce",
        script: "produce",
        policy: "replace",
        timeoutMs: 1800000,
        inputs: {
          brief: { from: "variable", variableId: "brief" },
          style: { from: "variable", variableId: "style" },
          model: { from: "variable", variableId: "agentModel" },
          image_model: { from: "variable", variableId: "imageModel" },
          video_model: { from: "variable", variableId: "videoModel" }
        },
        outputs: { film: { to: "variable", variableId: "film" } }
      },
      {
        id: "cut",
        name: "Rough cut",
        workflow: "timeline",
        policy: "queue",
        timeoutMs: 1800000,
        inputs: { Brief: { from: "variable", variableId: "brief" } }
      },
      {
        id: "poster",
        name: "Poster",
        workflow: "posters",
        policy: "queue",
        inputs: { "Visual Style": { from: "variable", variableId: "style" } }
      }
    ],
    sections: [
      {
        title: "Shoot",
        intro: "Write the film in one line and pick a look. One agent directs, storyboards, shoots, narrates and scores it, and you watch each step.",
        controls: [
          { textVar: "brief", label: "Your film in one line", multiline: true },
          { textVar: "style", label: "Visual style", multiline: true },
          { number: "shots", op: "produce", label: "Number of shots", min: 3, max: 8 },
          { model: { variable: "agentModel" }, op: "produce", label: "Agent model", modelKind: "language_model" },
          { model: { variable: "imageModel" }, op: "produce", label: "Image model", modelKind: "image_model", task: "text_to_image" },
          { model: { variable: "videoModel" }, op: "produce", label: "Video model", modelKind: "video_model", task: "image_to_video" },
          { run: ["produce"], label: "Shoot my film", disabledWhen: "produce" }
        ],
        results: [
          { transcript: "produce", label: "What the director is doing", placeholder: "Direction, keyframes, clips, narration and the cut appear here." },
          { error: "produce", label: "Film production failed" },
          { show: "direction", op: "produce", as: "Markdown", label: "Direction document", demo: "## THE BENDING LIGHT\n\n**Logline** — A keeper follows her own beam to the thing it will no longer stop pointing at." },
          { showVar: "film", as: "Video", label: "Finished film", demo: VIDEO },
          { show: "notes", op: "produce", as: "Markdown", label: "The director's notes", demo: "Five shots, 20 seconds. Shot 4 failed twice and was cut." }
        ]
      },
      {
        title: "Rough cut",
        intro: "Cut the same brief into a timeline you can keep editing. This run generates video again.",
        op: "cut",
        controls: [
          { run: ["cut"], label: "Give me the rough cut", disabledWhen: "cut" }
        ],
        results: [
          { progress: "cut", label: "Cutting the timeline…" },
          { error: "cut", label: "Rough cut failed" },
          { show: "film", op: "cut", as: "Video", label: "Editable rough cut" }
        ]
      },
      {
        title: "Key art",
        op: "poster",
        controls: [
          { text: "Movie Title", op: "poster", label: "Movie title" },
          {
            select: "Genre",
            op: "poster",
            label: "Genre",
            options: [
              "Sci-Fi Thriller",
              "Action",
              "Horror",
              "Fantasy",
              "Neo-noir",
              "Romance",
              "Comedy",
              "Drama",
              "Documentary"
            ]
          },
          { run: ["poster"], label: "Make my poster", disabledWhen: "poster" }
        ],
        results: [
          { progress: "poster", label: "Designing your poster…" },
          { error: "poster", label: "Poster generation failed" },
          { show: "Poster", op: "poster", as: "Image", label: "Your poster", demo: IMG }
        ]
      }
    ]
  },


  // ── 10 ─────────────────────────────────────────────────────────────────────
  {
    slug: "model-arena",
    name: "Model Arena",
    emoji: "⚖️",
    tagline: "Three models answer one brief. A fourth judges them blind.",
    description:
      "Three answers in three columns, each streaming independently, then a judge model scores them as A, B and C without knowing which model wrote which.",
    note: "Choose one configured language model per column and one for the judge.",
    workflows: { arena: "Model Arena" },
    operations: [
      { id: "compare", name: "Compare", workflow: "arena", policy: "replace" }
    ],
    sections: [
      {
        title: "The brief",
        op: "compare",
        controls: [
          { text: "brief", op: "compare", label: "Your brief", multiline: true },
          { text: "context", op: "compare", label: "Extra context", multiline: true },
          { model: { node: "openai_lane", prop: "model" }, op: "compare", label: "Model A", modelKind: "language_model" },
          { model: { node: "anthropic_lane", prop: "model" }, op: "compare", label: "Model B", modelKind: "language_model" },
          { model: { node: "gemini_lane", prop: "model" }, op: "compare", label: "Model C", modelKind: "language_model" },
          { model: { node: "judge", prop: "model" }, op: "compare", label: "Judge", modelKind: "language_model" },
          { run: ["compare"], label: "Compare the models", disabledWhen: "compare" }
        ],
        results: [
          { progress: "compare", label: "Asking three models, then the judge…" },
          { error: "compare", label: "A model failed" },
          { show: "openai", op: "compare", as: "Markdown", label: "Model A", demo: "**Model A:** leads with a crisp three-point structure and ships a concrete next step." },
          { show: "anthropic", op: "compare", as: "Markdown", label: "Model B", demo: "**Model B:** longer reasoning, names the tradeoff explicitly, flags one risk the others miss." },
          { show: "gemini", op: "compare", as: "Markdown", label: "Model C", demo: "**Model C:** tightest answer, strongest factual recall, lightest on caveats." },
          { show: "verdict", op: "compare", as: "Markdown", label: "Blind verdict", demo: "## Winner\n**B.** The only answer that ties the build-vs-buy call to the two spare engineers and the churn risk." }
        ]
      }
    ]
  },


  // ── 12 ─────────────────────────────────────────────────────────────────────
  // The apps from here on are single-job media tools: one upload, a few
  // choices, one result — the shape of a Runway-style app rather than a studio.
  {
    slug: "vary-image",
    name: "Vary Image",
    emoji: "🪄",
    featured: true,
    tagline: "Change one thing about a photo and keep the rest.",
    description:
      "Pick what should change: lighting, background, pose, palette, camera angle. An edit model alters only that, and composition and subject survive because it edits in place instead of regenerating.",
    note: "Image editing is billed per generated image.",
    workflows: { edit: "Edit a Still with Words" },
    operations: [
      {
        id: "edit",
        name: "Edit",
        workflow: "edit",
        policy: "replace"
      }
    ],
    sections: [
      {
        title: "Vary it",
        op: "edit",
        controls: [
          {
            model: { node: "ed", prop: "model" },
            op: "edit",
            label: "Edit model",
            modelKind: "image_model",
            task: "image_to_image"
          },
          {
            image: { input: "picture", op: "edit" },
            op: "edit",
            label: "Your image"
          },
          {
            select: "instruction",
            op: "edit",
            label: "What should change?",
            options: [
              "Make it golden hour, warm low sun raking across the subject",
              "Relight it as an overcast studio shot, soft even light, no hard shadows",
              "Replace the background with a quiet city street at dusk, keep the subject exactly as is",
              "Change the subject's pose so they face the camera with arms relaxed",
              "Change the subject's outfit to a black tailored suit, keep face and pose",
              "Shift the color palette to muted teal and sand tones",
              "Render it as a loose watercolor illustration, keep the composition",
              "Move the camera to a low angle looking up, same subject and setting"
            ]
          },
          {
            text: "directions",
            op: "edit",
            label: "Add directions (optional)",
            multiline: true
          },
          { run: ["edit"], label: "Vary the image" }
        ],
        results: [
          { progress: "edit", label: "Editing…" },
          { show: "edited", op: "edit", as: "Image", label: "Varied image", demo: IMG }
        ]
      }
    ]
  },

  // ── 21 ─────────────────────────────────────────────────────────────────────
  {
    slug: "ad-maker",
    steps: true,
    name: "Ad Maker",
    emoji: "📣",
    showEmoji: false,
    featured: true,
    tagline: "Settle the message. Direct the campaign image.",
    description:
      "Start with one offer, compare copy routes and headline angles, then direct a campaign hero with the approved message beside the visual brief. The hero is a new picture made from the brief. To start from your own product photo, use Directed Campaign Kit.",
    note:
      "The hero is a new picture made from your brief, not from a photo of yours. It only renders after you approve the visual brief.",
    workflows: {
      copy: "Ad Copy in Three Registers",
      headlines: "Five Headlines for a Landing Page",
      visual: "Write the Prompt, Then Make the Image"
    },
    variables: [
      {
        id: "offer",
        name: "The offer",
        scope: "user",
        persist: true,
        type: "str",
        default:
          "Olive Travel Cup: a matte muted-olive cup with a charcoal lid, launching this Friday"
      },
      {
        id: "visualBrief",
        name: "Visual brief",
        scope: "instance",
        type: "str",
        default:
          "Olive Travel Cup on a pale limestone cafe counter at warm sunrise. Editorial 50mm product photography, restrained sage, charcoal, and cream palette, clean negative space on the upper left, no text in the image."
      }
    ],
    operations: [
      {
        id: "copy",
        name: "Copy",
        workflow: "copy",
        policy: "replace",
        inputs: { offer: { from: "variable", variableId: "offer" } }
      },
      {
        id: "headlines",
        name: "Headlines",
        workflow: "headlines",
        policy: "replace",
        inputs: { offer: { from: "variable", variableId: "offer" } }
      },
      {
        id: "visual",
        name: "Visual",
        workflow: "visual",
        policy: "replace",
        timeoutMs: 600000,
        inputs: { idea: { from: "variable", variableId: "visualBrief" } }
      }
    ],
    sections: [
      {
        title: "Settle the message",
        controls: [
          { textVar: "offer", label: "Offer or product brief", multiline: true },
          {
            model: { node: "ag", prop: "model" },
            op: "copy",
            label: "Writing model",
            modelKind: "language_model"
          },
          {
            model: { node: "ag", prop: "model" },
            op: "headlines",
            label: "Headline model",
            modelKind: "language_model"
          },
          {
            note:
              "Start with the cheap decision point. Compare the writing before generating an image."
          },
          {
            run: ["copy", "headlines"],
            label: "Write the routes",
            disabledWhen: "copy"
          }
        ],
        results: [
          { progress: "copy", label: "Writing three registers…" },
          { error: "copy", label: "The copy routes failed" },
          {
            show: "variants",
            op: "copy",
            as: "Markdown",
            label: "Three copy routes",
            demo:
              "**Plain**\nOlive Cup. Matte finish. Charcoal lid. Out Friday.\n\n**Playful**\nYour morning has a new plus-one.\n\n**Premium**\nDesigned for the space between first sip and first meeting."
          },
          { progress: "headlines", label: "Testing five angles…" },
          { error: "headlines", label: "The headline angles failed" },
          {
            show: "headlines",
            op: "headlines",
            as: "Markdown",
            label: "Five headline angles",
            demo:
              "1. Make room for your morning\n2. The calm before the calendar\n3. One cup. A quieter start.\n4. Your morning, before the noise\n5. Take the good part with you"
          }
        ]
      },
      {
        title: "Direct the campaign image",
        controls: [
          {
            model: { node: "ag", prop: "model" },
            op: "visual",
            label: "Prompt-writing model",
            modelKind: "language_model"
          },
          {
            model: { node: "gen", prop: "model" },
            op: "visual",
            label: "Image model",
            modelKind: "image_model",
            task: "text_to_image"
          },
          {
            note:
              "Carry the approved promise into the scene. State what the product is doing, where it sits, and what must not appear."
          },
          {
            textVar: "visualBrief",
            label: "Visual brief",
            multiline: true
          },
          {
            run: ["visual"],
            label: "Render the campaign hero",
            disabledWhen: "visual"
          }
        ],
        results: [
          { progress: "visual", label: "Writing the prompt and rendering…" },
          { error: "visual", label: "The campaign hero failed" },
          {
            show: "prompt_used",
            op: "visual",
            as: "Markdown",
            label: "Prompt sent to the image model",
            demo:
              "Olive Travel Cup on a pale limestone cafe counter at warm sunrise, warm window key light with subtle cool fill, editorial 50mm product photography, restrained sage, charcoal, and cream palette, generous clean negative space on the upper left, no lettering, logo, or watermark."
          },
          {
            show: "image",
            op: "visual",
            as: "Image",
            label: "Campaign hero",
            demo: AD_MAKER_HERO
          }
        ]
      }
    ]
  },

  UGC_PRODUCT_VIDEO_APP,

  CATALOG_MOTION_APP,

  CATALOG_MOTION_REFERENCES_APP,

  // ── 22 ─────────────────────────────────────────────────────────────────────
  // The four apps below each bind one shipped recipe
  // (packages/base-nodes/nodetool/examples/recipes/*.recipe.json) end to end:
  // the recipe's steps become operations on one surface, and the handoff the
  // manifest describes in prose becomes a variable carried between them.
  {
    slug: "trailer-room",
    steps: true,
    name: "Trailer Room",
    emoji: "🎞️",
    featured: false,
    tagline: "Give an agent your premise and watch it direct, cut and score the teaser.",
    description:
      "One agent writes the beats and the shot list, renders every shot, cuts them together and lays a score under the cut. You see each decision and tool call as it happens.",
    note: "💸 One run spends one image and one video generation per shot, one music generation, and the agent's own model turns.",
    workflows: {},
    scripts: { direct: DIRECT_TRAILER_SCRIPT },
    variables: [
      {
        id: "premise",
        name: "Premise",
        scope: "instance",
        type: "str",
        default: "A getaway driver speeds onto a bridge as it starts to collapse behind her."
      },
      {
        id: "style",
        name: "Visual style",
        scope: "instance",
        type: "str",
        default: "Anamorphic night photography, wet asphalt, sodium light, heavy grain."
      },
      { id: "cut", name: "The cut", scope: "instance", type: "video" },
      { id: "agentModel", name: "Agent model", scope: "instance", type: "language_model" },
      { id: "imageModel", name: "Image model", scope: "instance", type: "image_model" },
      { id: "videoModel", name: "Video model", scope: "instance", type: "video_model" }
    ],
    operations: [
      {
        id: "direct",
        name: "Direct",
        script: "direct",
        policy: "replace",
        timeoutMs: 1800000,
        inputs: {
          premise: { from: "variable", variableId: "premise" },
          style: { from: "variable", variableId: "style" },
          model: { from: "variable", variableId: "agentModel" },
          image_model: { from: "variable", variableId: "imageModel" },
          video_model: { from: "variable", variableId: "videoModel" }
        },
        outputs: { trailer: { to: "variable", variableId: "cut" } }
      }
    ],
    sections: [
      {
        title: "Direct the teaser",
        controls: [
          { textVar: "premise", label: "Your trailer in one line", multiline: true },
          { textVar: "style", label: "Visual style", multiline: true },
          { number: "shots", op: "direct", label: "Number of shots", min: 3, max: 10 },
          { model: { variable: "agentModel" }, op: "direct", label: "Agent model", modelKind: "language_model" },
          { model: { variable: "imageModel" }, op: "direct", label: "Image model", modelKind: "image_model", task: "text_to_image" },
          { model: { variable: "videoModel" }, op: "direct", label: "Video model", modelKind: "video_model", task: "image_to_video" },
          { run: ["direct"], label: "Direct the teaser", disabledWhen: "direct" }
        ],
        results: [
          { transcript: "direct", label: "What the agent is doing", placeholder: "Beats, shots, renders and the cut appear here." },
          { error: "direct", label: "Directing failed" },
          { showVar: "cut", as: "Video", label: "The cut", demo: VIDEO },
          {
            show: "notes",
            op: "direct",
            as: "Markdown",
            label: "The director's notes",
            demo: "**Hook (0:00–0:08)** — Headlights on wet asphalt, the bridge ahead already wrong.\n\n**Turn (0:24–0:36)** — The span behind her is gone. So is the way back."
          }
        ]
      }
    ]
  },

  // ── 23 ─────────────────────────────────────────────────────────────────────
  {
    slug: "sku-factory",
    steps: true,
    name: "SKU Factory",
    emoji: "🏷️",
    featured: false,
    tagline: "One packshot in, the whole channel set out.",
    description:
      "The E-commerce SKU Visual Factory chain behind one surface. Drop a product photo once and the cutout, the studio scene, the seasonal relight and the listing copy all read the same image; motion and print resolution stay on their own buttons because they cost more.",
    note: "Image and listing steps use configured models. The turntable is metered per second of video.",
    workflows: {
      cutout: "Cut a Product Out of Its Background",
      backdrop: "Put a Product on a Studio Backdrop",
      relight: "Relight a Product for a Seasonal Campaign",
      turntable: "Spin a Packshot into a Turntable Clip",
      print: "Take a Product Shot to Print Resolution",
      listing: "Write a Listing from the Product Photo"
    },
    modelOverrides: {
      cutout: { bg: ATLASCLOUD_YOUCHUAN_REMOVE_BACKGROUND },
      listing: { ag: CODEX_LUNA }
    },
    // LTX 2.3 fast takes 6 to 20 seconds, so the template's 4 is dropped.
    propOverrides: { turntable: { v: { duration: 6 } } },
    variables: [
      { id: "packshot", name: "The packshot", scope: "instance", type: "image" }
    ],
    operations: [
      {
        id: "cutout",
        name: "Cutout",
        workflow: "cutout",
        policy: "parallel",
        inputs: { photo: { from: "variable", variableId: "packshot" } }
      },
      {
        id: "backdrop",
        name: "Studio scene",
        workflow: "backdrop",
        policy: "parallel",
        inputs: { photo: { from: "variable", variableId: "packshot" } }
      },
      {
        id: "relight",
        name: "Seasonal relight",
        workflow: "relight",
        policy: "parallel",
        inputs: { photo: { from: "variable", variableId: "packshot" } }
      },
      {
        id: "listing",
        name: "Listing",
        workflow: "listing",
        policy: "parallel",
        inputs: { photo: { from: "variable", variableId: "packshot" } }
      },
      {
        id: "turntable",
        name: "Turntable",
        workflow: "turntable",
        policy: "queue",
        timeoutMs: 900000,
        inputs: { photo: { from: "variable", variableId: "packshot" } }
      },
      {
        id: "print",
        name: "Print master",
        workflow: "print",
        policy: "queue",
        inputs: { photo: { from: "variable", variableId: "packshot" } }
      }
    ],
    sections: [
      {
        title: "The still set",
        controls: [
          {
            model: { node: "bg", prop: "model" },
            op: "cutout",
            label: "Cutout model",
            modelKind: "image_model",
            task: "remove_background"
          },
          { image: "packshot", label: "Your packshot" },
          {
            text: { node: "comp", prop: "prompt" },
            op: "backdrop",
            label: "The set it stands on",
            multiline: true
          },
          {
            select: { node: "comp", prop: "aspect_ratio" },
            op: "backdrop",
            label: "Frame",
            options: ["1:1", "4:5", "3:2", "16:9"],
            default: "1:1"
          },
          {
            text: { node: "rl", prop: "prompt" },
            op: "relight",
            label: "The light to put on it",
            multiline: true
          },
          {
            run: ["cutout", "backdrop", "relight", "listing"],
            label: "Make the still set"
          }
        ],
        results: [
          { progress: "backdrop", label: "Placing the product…" },
          { show: "cutout", op: "cutout", as: "Image", label: "Cutout", demo: IMG },
          { show: "styled", op: "backdrop", as: "Image", label: "Studio scene", demo: IMG },
          { show: "seasonal", op: "relight", as: "Image", label: "Seasonal", demo: IMG },
          {
            show: "listing",
            op: "listing",
            as: "Markdown",
            label: "Listing copy",
            demo: "**Aurora Trail Runner — Recycled Knit, 240g**\n\nA trail shoe built around wet rock. The knit upper drains instead of holding water, and the outsole lugs bite at an angle rather than flat."
          }
        ]
      },
      {
        title: "Motion and print",
        controls: [
          { note: "💸 The turntable is metered per second of video." },
          {
            text: { node: "v", prop: "prompt" },
            op: "turntable",
            label: "Camera move",
            multiline: true
          },
          {
            slider: { node: "v", prop: "duration" },
            op: "turntable",
            label: "Seconds",
            min: 6,
            max: 10,
            step: 2,
            default: 6
          },
          { run: ["turntable"], label: "Spin it" },
          {
            slider: { node: "up", prop: "scale" },
            op: "print",
            label: "Upscale",
            min: 2,
            max: 4,
            step: 2,
            default: 4
          },
          { run: ["print"], label: "Take it to print" }
        ],
        results: [
          { progress: "turntable", label: "Spinning the packshot…" },
          { show: "turntable", op: "turntable", as: "Video", label: "Turntable clip", demo: VIDEO },
          { progress: "print", label: "Upscaling…" },
          { show: "print_ready", op: "print", as: "Image", label: "Print master" }
        ]
      }
    ]
  },

  // ── 24 ─────────────────────────────────────────────────────────────────────
  {
    slug: "dubbing-desk",
    name: "Dubbing Desk",
    emoji: "🌍",
    featured: false,
    tagline: "One presenter clip, spoken in another language, voiced, subtitled and lip-synced.",
    description:
      "A presenter clip taken through four steps: transcribe it, translate the script into the language you pick, voice and subtitle the translation, then lip-sync the footage. You can edit the script and the translation before anything is voiced, so the words that get dubbed are the words you see.",
    note: "Transcription, translation, speech, and lip-sync use configured models and are billed per run.",
    steps: true,
    workflows: {
      transcribe: "Transcribe a Clip",
      translate: "Translate a Script for Dubbing",
      voice: "Narrate a Script",
      subtitles: "Subtitle Lines from a Script",
      spokesperson: "Lip-sync a Clip to a Voice Track"
    },
    variables: [
      { id: "step", name: "Step", scope: "instance", type: "str", default: "clip" },
      { id: "clip", name: "The clip", scope: "instance", type: "video" },
      { id: "script", name: "Script", scope: "instance", type: "str", default: "" },
      { id: "translation", name: "Translation", scope: "instance", type: "str", default: "" },
      { id: "narration", name: "Voice track", scope: "instance", type: "audio" },
      // One language model translates and writes the subtitles.
      { id: "llm", name: "Language model", scope: "instance", type: "language_model", default: CODEX_LUNA }
    ],
    operations: [
      {
        id: "transcribe",
        name: "Transcribe",
        workflow: "transcribe",
        policy: "replace",
        inputs: { clip: { from: "variable", variableId: "clip" } },
        outputs: { transcript: { to: "variable", variableId: "script" } }
      },
      {
        id: "translate",
        name: "Translate",
        workflow: "translate",
        policy: "replace",
        inputs: {
          script: { from: "variable", variableId: "script" },
          model: { from: "variable", variableId: "llm" }
        },
        outputs: { translation: { to: "variable", variableId: "translation" } }
      },
      {
        id: "voice",
        name: "Voice",
        workflow: "voice",
        policy: "replace",
        inputs: { script: { from: "variable", variableId: "translation" } },
        outputs: { narration: { to: "variable", variableId: "narration" } }
      },
      {
        id: "subtitles",
        name: "Subtitles",
        workflow: "subtitles",
        policy: "replace",
        inputs: {
          script: { from: "variable", variableId: "translation" },
          model: { from: "variable", variableId: "llm" }
        }
      },
      {
        id: "spokesperson",
        name: "Lip-sync",
        workflow: "spokesperson",
        policy: "queue",
        timeoutMs: 900000,
        inputs: {
          presenter_clip: { from: "variable", variableId: "clip" },
          voice_track: { from: "variable", variableId: "narration" }
        }
      }
    ],
    sections: [
      {
        key: "clip",
        title: "Clip",
        intro: "Add a clip of one person who talks to the camera. The app writes down what they say.",
        nextWhen: "script",
        controls: [
          { video: "clip", label: "Presenter clip" },
          { op: "transcribe", model: { node: "asr", prop: "model" }, modelKind: "asr_model", label: "Transcription model" },
          { run: ["transcribe"], label: "Transcribe the clip", disabledWhen: "transcribe" }
        ],
        results: [
          { progress: "transcribe", label: "Transcribing…" },
          { error: "transcribe", label: "Transcription failed" },
          { textVar: "script", label: "What they say", multiline: true }
        ]
      },
      {
        key: "translate",
        title: "Translate",
        intro: "Pick the language of the dub and a language model. The same model writes the subtitles later. Read the translation and fix it before it is voiced.",
        nextWhen: "translation",
        controls: [
          {
            select: "language",
            op: "translate",
            label: "Target language",
            options: ["Spanish", "French", "German", "Italian", "Portuguese", "Dutch", "Polish", "Japanese", "Korean", "Chinese", "Hindi", "Arabic"]
          },
          { model: { variable: "llm" }, modelKind: "language_model", label: "Language model" },
          { run: ["translate"], label: "Translate the script", disabledWhen: "translate" }
        ],
        results: [
          { progress: "translate", label: "Translating…" },
          { error: "translate", label: "Translation failed" },
          { textVar: "translation", label: "The dubbed script", multiline: true }
        ]
      },
      {
        key: "voice",
        title: "Voice",
        intro: "Speak the translation with a new voice and break it into subtitle lines. The lip-sync uses this voice track.",
        nextWhen: "narration",
        controls: [
          { op: "voice", model: { node: "tts", prop: "model" }, modelKind: "tts_model", label: "Voice" },
          { run: ["voice", "subtitles"], label: "Voice and subtitle", disabledWhen: "voice" }
        ],
        results: [
          { progress: "voice", label: "Voicing…" },
          { error: "voice", label: "Voicing failed" },
          { showVar: "narration", as: "Audio", label: "Voice track", demo: AUDIO },
          { progress: "subtitles", label: "Writing subtitles…" },
          { error: "subtitles", label: "Subtitles failed" },
          {
            show: "captions",
            op: "subtitles",
            as: "Markdown",
            label: "Subtitle lines",
            demo: "1\nNuestro lanzamiento de primavera\nsale hoy."
          }
        ]
      },
      {
        key: "lipsync",
        title: "Lip-sync",
        intro: "Redraw the mouth so the presenter speaks the voice track from the last step. Lip-sync is billed per second of footage.",
        controls: [
          { op: "spokesperson", model: { node: "sync", prop: "model" }, modelKind: "video_model", label: "Lip-sync model" },
          { run: ["spokesperson"], label: "Lip-sync the clip", disabledWhen: "spokesperson" }
        ],
        results: [
          { progress: "spokesperson", label: "Redrawing the mouth…" },
          { error: "spokesperson", label: "Lip-sync failed" },
          { show: "revoiced_clip", op: "spokesperson", as: "Video", label: "Dubbed clip", demo: VIDEO }
        ]
      }
    ]
  },

  // ── 25 ─────────────────────────────────────────────────────────────────────
  {
    slug: "viral-ad-engine",
    steps: true,
    name: "Viral Ad Engine",
    emoji: "📈",
    featured: false,
    tagline: "Settle the line, fan it into a test set, then put the product in motion.",
    description:
      "The Viral Video Ad Engine chain behind one surface. The offer drives both the copy registers and the hook-and-thumbnail set, so the line you pick and the thumbnails you test come from the same brief.",
    note: "Writing and thumbnails use configured models. The ad loop generates video; the vertical cut runs locally.",
    workflows: {
      copy: "Ad Copy in Three Registers",
      hooks: "Hook & Thumbnail Factory",
      loop: "Ad Loop from a Product Photo",
      vertical: "Cut a Landscape Clip for Vertical"
    },
    variables: [
      {
        id: "offer",
        name: "The offer",
        scope: "instance",
        type: "str",
        default:
          "Aurora Trail running shoes: a third lighter than last season, grip that holds on wet rock, launching Friday"
      },
      { id: "photo", name: "Product photo", scope: "instance", type: "image" },
      { id: "landscape", name: "Landscape cut", scope: "instance", type: "video" }
    ],
    operations: [
      {
        id: "copy",
        name: "Copy",
        workflow: "copy",
        policy: "parallel",
        inputs: { offer: { from: "variable", variableId: "offer" } }
      },
      {
        id: "hooks",
        name: "Hooks",
        workflow: "hooks",
        policy: "parallel",
        inputs: { "Video Topic": { from: "variable", variableId: "offer" } }
      },
      {
        id: "loop",
        name: "Ad loop",
        workflow: "loop",
        policy: "queue",
        timeoutMs: 900000,
        inputs: { product_photo: { from: "variable", variableId: "photo" } }
      },
      {
        id: "vertical",
        name: "Vertical",
        workflow: "vertical",
        policy: "parallel",
        inputs: { clip: { from: "variable", variableId: "landscape" } }
      }
    ],
    sections: [
      {
        title: "The line",
        controls: [
          { textVar: "offer", label: "What are you advertising?", multiline: true },
          { text: "Target Audience", op: "hooks", label: "Who it is for" },
          { number: "Number of Hooks", op: "hooks", label: "How many hooks", min: 2, max: 8 },
          { run: ["copy", "hooks"], label: "Write it and fan it out" }
        ],
        results: [
          { progress: "copy", label: "Writing copy…" },
          {
            show: "variants",
            op: "copy",
            as: "Markdown",
            label: "Three registers",
            demo: "**Plain**\nAurora Trail. A third lighter. Grips wet rock. Out Friday.\n\n**Playful**\nYour old shoes just got a text: it's over.\n\n**Premium**\nEngineered for the ground that gives nothing back."
          },
          { progress: "hooks", label: "Making the test set…" },
          {
            show: "hooks",
            op: "hooks",
            as: "Markdown",
            label: "Hook lines",
            demo: "1. The shoe that argues with wet rock\n2. A third lighter. Same ground.\n3. Friday, or never"
          },
          {
            show: "thumbnail_gallery",
            op: "hooks",
            as: "Image",
            label: "Thumbnails",
            demo: IMG
          }
        ]
      },
      {
        title: "The footage",
        controls: [
          { note: "💸 The ad loop is a video model. The vertical cut runs on your machine." },
          { image: "photo", label: "Product photo" },
          { text: "motion", op: "loop", label: "Camera move", multiline: true },
          { run: ["loop"], label: "Put it in motion" },
          { video: "landscape", label: "A landscape cut to reframe" },
          { run: ["vertical"], label: "Cut it to 9:16" }
        ],
        results: [
          { progress: "loop", label: "Animating the still…" },
          { show: "ad_loop", op: "loop", as: "Video", label: "Ad loop", demo: VIDEO },
          { progress: "vertical", label: "Reframing…" },
          { show: "vertical", op: "vertical", as: "Video", label: "Vertical cut" }
        ]
      }
    ]
  },
  DIRECTED_CAMPAIGN_KIT_APP,
  PODCAST_PRODUCTION_DESK_APP,
  VIDEO_POST_HOUSE_APP
];
