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
//   sections   [ { title, op?, controls: [...], results: [...] } ]
//   content    Optional authored widget tree, used instead of sections.
//
// Control kinds: input, text, model, number, slider, select, image, video, audio,
// switch, color, run, note. Result kinds: progress, activity, error, show, showVar,
// heading, note.
// `text`, `model`, `select` and `slider` take an input name or `{ node, prop }` to drive
// a node property inside the graph; `default` seeds the preview value.
// `image`, `video`, and `audio` take a variable id or `{ input }`.
// See buildControl() in the builder for the exact props each one emits.

import { DIRECTED_CAMPAIGN_KIT_APP } from "./directed-campaign-kit.mjs";
import { PODCAST_PRODUCTION_DESK_APP } from "./podcast-production-desk.mjs";
import { UGC_PRODUCT_VIDEO_APP } from "./ugc-product-video.mjs";
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
const ATLASCLOUD_SYNC_LIPSYNC = {
  type: "video_model",
  provider: "atlascloud",
  id: "sync/lipsync-v3",
  name: "Sync Lipsync v3",
  path: null,
  supported_tasks: ["lip_sync"]
};
const OPENAI_TRANSCRIBE = {
  type: "asr_model",
  provider: "openai",
  id: "gpt-4o-mini-transcribe",
  name: "GPT-4o Mini Transcribe",
  path: null
};

export const EXAMPLE_APPS = [
  // ── 1 ──────────────────────────────────────────────────────────────────────
  {
    slug: "photo-studio",
    name: "Photo Studio",
    emoji: "📸",
    featured: true,
    tagline:
      "Drag five sliders and watch the photo re-render — then run the same grade over a whole folder.",
    description:
      "A live photo editor and a batch retoucher behind one surface. The single-photo grade is pure GPU filters, so it runs with no API key at all.",
    note: "✨ `Enhance` runs locally. `Batch` adds a cloud grading pass and is billed per image.",
    workflows: { enhance: "Image Enhance", batch: "Photo Enhancement Suite" },
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
          { slider: "color_boost", op: "batch", label: "Color boost", min: 0, max: 2, step: 0.05, pace: "release" },
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
          { slider: "variations", op: "concepts", label: "How many variations?", min: 1, max: 8, step: 1 },
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
    name: "Brand & Social",
    emoji: "🎨",
    featured: true,
    tagline: "One brand identity drives two deliverables.",
    description:
      "Fill in your brand once — the asset kit and the thumbnail factory both read the same values.",
    note: "Your brand name, audience, and voice persist between sessions.",
    workflows: {
      brand: "Brand Asset Generator",
      hooks: "Hook & Thumbnail Factory"
    },
    variables: [
      { id: "brandName", name: "Brand name", scope: "user", persist: true, type: "str", default: "Aurora Labs" },
      { id: "audience", name: "Audience", scope: "user", persist: true, type: "str", default: "outdoor-minded people in their 30s" },
      { id: "voice", name: "Brand voice", scope: "user", persist: true, type: "str", default: "friendly and confident, never corporate" }
    ],
    operations: [
      {
        id: "kit",
        name: "Asset kit",
        workflow: "brand",
        policy: "replace",
        inputs: { brand_name: { from: "variable", variableId: "brandName" } }
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
        title: "Your brand",
        controls: [
          { textVar: "brandName", label: "Brand name" },
          { textVar: "audience", label: "Who is it for?", multiline: true },
          { textVar: "voice", label: "Brand voice", multiline: true },
          { text: "brand_description", op: "kit", label: "Describe your brand", multiline: true },
          { text: "tagline", op: "kit", label: "Tagline" },
          { color: "primary_color", op: "kit", label: "Primary color" },
          { run: ["kit"], label: "Generate brand assets" }
        ],
        results: [
          { progress: "kit", label: "Designing your assets…" },
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
          { run: ["thumbnails"], label: "Make hooks & thumbnails" }
        ],
        results: [
          { progress: "thumbnails", label: "Writing hooks & rendering thumbnails…" },
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
          { number: "num_scenes", op: "mockups", label: "How many scenes?", min: 1, max: 6 },
          { run: ["mockups"], label: "Generate mockups" }
        ],
        results: [
          { progress: "mockups", label: "Staging your mockups…" },
          { show: "mockup", op: "mockups", as: "Image", label: "Mockups", demo: IMG },
          { show: "scene", op: "mockups", as: "Markdown", label: "Shot list" }
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
    name: "Film Studio",
    emoji: "🎬",
    featured: true,
    tagline: "Brief → direction → storyboard → cut → key art.",
    description:
      "The showcase run: one brief drives a directed short, an editable rough cut, and the poster that sells it.",
    note: "💸 This app generates video and music. Run it once, deliberately.",
    workflows: {
      script: "Script to Screen",
      timeline: "Directed Film to Timeline",
      posters: "Movie Posters"
    },
    variables: [
      { id: "brief", name: "Brief", scope: "instance", type: "str", default: "A lighthouse keeper follows her own beam to the thing it will no longer stop pointing at." },
      { id: "style", name: "Visual style", scope: "instance", type: "str", default: "Anamorphic, sodium amber against blue-black sea, fine grain" }
    ],
    operations: [
      {
        id: "produce",
        name: "Produce",
        workflow: "script",
        policy: "queue",
        timeoutMs: 1800000,
        inputs: {
          Brief: { from: "variable", variableId: "brief" },
          "Visual Style": { from: "variable", variableId: "style" }
        }
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
        title: "The film",
        op: "produce",
        controls: [
          { note: "💸 Each run of Produce or Rough cut incurs video and music generation charges." },
          { textVar: "brief", label: "Your film in one line", multiline: true },
          { textVar: "style", label: "Visual style", multiline: true },
          { text: "Shot Count", op: "produce", label: "Number of shots" },
          { run: ["produce"], label: "Shoot my film", disabledWhen: "produce" },
          { run: ["cut"], label: "Give me the rough cut", disabledWhen: "cut" }
        ],
        results: [
          { progress: "produce", label: "Directing, storyboarding & shooting…" },
          { error: "produce", label: "Film production failed" },
          { show: "direction", op: "produce", as: "Markdown", label: "Direction document", demo: "## THE BENDING LIGHT\n\n**Logline** — A keeper follows her own beam to the thing it will no longer stop pointing at." },
          { show: "storyboard", op: "produce", as: "Image", label: "Storyboard keyframes", demo: IMG },
          { show: "film", op: "produce", as: "Video", label: "Finished film", demo: VIDEO },
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
    tagline: "One brief, three frontier models, answered side by side.",
    description:
      "Three answers in three columns, each streaming independently. A missing provider key fails one column, not the run.",
    note: "Choose one configured language model per column.",
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
          { run: ["compare"], label: "Compare the models" }
        ],
        results: [
          { progress: "compare", label: "Asking three models…" },
          { show: "openai", op: "compare", as: "Markdown", label: "Model A", demo: "**Model A:** leads with a crisp three-point structure and ships a concrete next step." },
          { show: "anthropic", op: "compare", as: "Markdown", label: "Model B", demo: "**Model B:** longer reasoning, names the tradeoff explicitly, flags one risk the others miss." },
          { show: "gemini", op: "compare", as: "Markdown", label: "Model C", demo: "**Model C:** tightest answer, strongest factual recall, lightest on caveats." }
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

  // ── 13 ─────────────────────────────────────────────────────────────────────
  {
    slug: "product-reshoot",
    name: "Product Reshoot",
    emoji: "📦",
    showEmoji: false,
    featured: true,
    tagline: "Relight the product. Change the set. Keep the product fixed.",
    description:
      "Start with one product photo and make three production-ready passes: a new set, a seasonal relight, or a clean cutout for compositing.",
    note:
      "Choose a treatment, review the result, then reuse the same product reference for another pass.",
    workflows: {
      backdrop: "Put a Product on a Studio Backdrop",
      relight: "Relight a Product for a Seasonal Campaign",
      cutout: "Cut a Product Out of Its Background"
    },
    modelOverrides: {
      backdrop: { bg: ATLASCLOUD_YOUCHUAN_REMOVE_BACKGROUND },
      cutout: { bg: ATLASCLOUD_YOUCHUAN_REMOVE_BACKGROUND }
    },
    variables: [
      { id: "productPhoto", name: "Product photo", scope: "instance", type: "image" }
    ],
    operations: [
      {
        id: "backdrop",
        name: "Backdrop",
        workflow: "backdrop",
        policy: "replace",
        inputs: { photo: { from: "variable", variableId: "productPhoto" } }
      },
      {
        id: "relight",
        name: "Relight",
        workflow: "relight",
        policy: "replace",
        inputs: { photo: { from: "variable", variableId: "productPhoto" } }
      },
      {
        id: "cutout",
        name: "Cut out",
        workflow: "cutout",
        policy: "replace",
        inputs: { photo: { from: "variable", variableId: "productPhoto" } }
      }
    ],
    sections: [
      {
        title: "Your product",
        controls: [{ image: "productPhoto", label: "Product photo" }]
      },
      {
        title: "Set the scene",
        op: "backdrop",
        controls: [
          {
            model: { node: "bg", prop: "model" },
            op: "backdrop",
            label: "Background removal model",
            modelKind: "image_model",
            task: "remove_background"
          },
          {
            model: { node: "comp", prop: "model" },
            op: "backdrop",
            label: "Scene model",
            modelKind: "image_model",
            task: "image_to_image"
          },
          {
            select: { node: "comp", prop: "prompt" },
            op: "backdrop",
            label: "Scene direction",
            default:
              "Keep the product as it is. Change only what is around it: warm concrete plinth, soft studio key from upper left, blurred background.",
            options: [
              "Keep the product as it is. Change only what is around it: warm concrete plinth, soft studio key from upper left, blurred background.",
              "Keep the product as it is. Change only what is around it: white marble surface, bright daylight from a window, soft shadow.",
              "Keep the product as it is. Change only what is around it: dark slate table, single hard spotlight, deep black background.",
              "Keep the product as it is. Change only what is around it: pale oak shelf, morning light, out-of-focus plants behind.",
              "Keep the product as it is. Change only what is around it: wet black rock at the shoreline, overcast sky, sea spray."
            ]
          },
          {
            run: ["backdrop"],
            label: "Render the new set",
            disabledWhen: "backdrop"
          }
        ],
        results: [
          { progress: "backdrop", label: "Cutting out and placing…" },
          { error: "backdrop", label: "The set treatment failed" },
          { note: "Review the product edges, shadow, and surface before keeping the treatment." },
          { show: "styled", op: "backdrop", as: "Image", label: "Set treatment", demo: IMG }
        ]
      },
      {
        title: "Relight the product",
        op: "relight",
        controls: [
          {
            model: { node: "rl", prop: "model" },
            op: "relight",
            label: "Relight model",
            modelKind: "image_model",
            task: "image_to_image"
          },
          {
            select: { node: "rl", prop: "prompt" },
            op: "relight",
            label: "Seasonal light",
            default: "warm low winter sun from the left, long soft shadows",
            options: [
              "warm low winter sun from the left, long soft shadows",
              "bright summer noon, hard overhead sun, short crisp shadows",
              "soft spring window light from the right, gentle falloff",
              "autumn golden hour from behind, amber rim light",
              "cool blue evening light, neon reflections"
            ]
          },
          {
            run: ["relight"],
            label: "Render the relight",
            disabledWhen: "relight"
          }
        ],
        results: [
          { progress: "relight", label: "Relighting…" },
          { error: "relight", label: "The relight failed" },
          { note: "Keep the product identity fixed while you compare the light and shadow." },
          { show: "seasonal", op: "relight", as: "Image", label: "Seasonal relight", demo: IMG }
        ]
      },
      {
        title: "Prepare a cutout",
        op: "cutout",
        controls: [
          {
            model: { node: "bg", prop: "model" },
            op: "cutout",
            label: "Background removal model",
            modelKind: "image_model",
            task: "remove_background"
          },
          {
            run: ["cutout"],
            label: "Remove the background",
            disabledWhen: "cutout"
          }
        ],
        results: [
          { progress: "cutout", label: "Removing the background…" },
          { error: "cutout", label: "The cutout failed" },
          { note: "Use the transparent result in a layout, product page, or campaign composite." },
          { show: "cutout", op: "cutout", as: "Image", label: "Transparent cutout", demo: IMG }
        ]
      }
    ]
  },

  // ── 14 ─────────────────────────────────────────────────────────────────────
  {
    slug: "product-shot-video",
    name: "Product Shot Video",
    emoji: "🎥",
    showEmoji: false,
    featured: true,
    tagline: "Turn a product photo into a controlled moving shot.",
    description:
      "Keep the product reference fixed and choose one camera move for a looping ad or a turntable clip for the product page.",
    note:
      "Choose an ad loop or turntable model. Review the motion before exporting the shot.",
    workflows: {
      loop: "Ad Loop from a Product Photo",
      turntable: "Spin a Packshot into a Turntable Clip"
    },
    variables: [
      { id: "productPhoto", name: "Product photo", scope: "instance", type: "image" }
    ],
    operations: [
      {
        id: "loop",
        name: "Ad loop",
        workflow: "loop",
        policy: "replace",
        inputs: { product_photo: { from: "variable", variableId: "productPhoto" } }
      },
      {
        id: "turntable",
        name: "Turntable",
        workflow: "turntable",
        policy: "replace",
        inputs: { photo: { from: "variable", variableId: "productPhoto" } }
      }
    ],
    sections: [
      {
        title: "Your product",
        controls: [{ image: "productPhoto", label: "A clean product photo" }]
      },
      {
        title: "Make a hero loop",
        op: "loop",
        controls: [
          {
            model: { node: "animate", prop: "model" },
            op: "loop",
            label: "Video model",
            modelKind: "video_model",
            task: "image_to_video"
          },
          {
            select: "motion",
            op: "loop",
            label: "Camera move",
            options: [
              "Slow orbit around the product as a soft highlight travels across its surface",
              "Slow push in toward the product as the background falls out of focus",
              "Gentle dolly from left to right, product fixed, light sweeping across",
              "Rise from a low angle to eye level, product centered, soft reflections",
              "Hold still while steam and light drift around the product"
            ]
          },
          {
            run: ["loop"],
            label: "Render the hero loop",
            disabledWhen: "loop"
          }
        ],
        results: [
          { progress: "loop", label: "Animating…" },
          { error: "loop", label: "The hero loop failed" },
          { note: "Check the first and last frame for a clean loop and stable product geometry." },
          { show: "ad_loop", op: "loop", as: "Video", label: "Rendered hero loop", demo: VIDEO }
        ]
      },
      {
        title: "Make a turntable",
        op: "turntable",
        controls: [
          {
            model: { node: "v", prop: "model" },
            op: "turntable",
            label: "Video model",
            modelKind: "video_model",
            task: "image_to_video"
          },
          {
            select: { node: "v", prop: "prompt" },
            op: "turntable",
            label: "Turntable direction",
            default: "slow orbit around the product, fixed lighting, product stays centered",
            options: [
              "slow orbit around the product, fixed lighting, product stays centered",
              "full 360 degree turntable rotation, product centered, studio lighting fixed",
              "slow half turn revealing the back of the product, fixed lighting",
              "gentle rocking turn, product centered, soft studio light"
            ]
          },
          {
            run: ["turntable"],
            label: "Render the turntable",
            disabledWhen: "turntable"
          }
        ],
        results: [
          { progress: "turntable", label: "Rendering the turntable…" },
          { error: "turntable", label: "The turntable failed" },
          { note: "Use the turntable when the product page needs a clear view around the packshot." },
          { show: "turntable", op: "turntable", as: "Video", label: "Rendered turntable", demo: VIDEO }
        ]
      }
    ]
  },

  // ── 15 ─────────────────────────────────────────────────────────────────────
  {
    slug: "multi-shot-video",
    name: "Multi-Shot Video",
    emoji: "🎬",
    featured: true,
    tagline: "One logline in, a cut sequence of shots out.",
    description:
      "A director model writes the shot list and a style bible, every shot is rendered as a keyframe and animated, and the clips are cut together into one video.",
    note: "💸 Each shot generates a keyframe and a video clip. Video is metered by duration, so start with a small shot count.",
    workflows: { trailer: "Movie Trailer Generator" },
    operations: [
      {
        id: "trailer",
        name: "Direct",
        workflow: "trailer",
        policy: "replace",
        timeoutMs: 1200000
      }
    ],
    sections: [
      {
        title: "The brief",
        op: "trailer",
        controls: [
          { text: "Logline", op: "trailer", label: "Logline", multiline: true },
          {
            select: "Visual Style",
            op: "trailer",
            label: "Visual style",
            options: [
              "cinematic film still, theatrical key art, anamorphic framing, high-contrast daylight, dust and sparks, handheld telephoto, motion blur, hard sun, blown-out sky, fine film grain, gritty",
              "moody neo-noir, wet streets, sodium and neon, deep shadows, slow dolly moves, shallow focus",
              "warm indie drama, natural window light, handheld 35mm, soft grain, muted pastel palette",
              "clean sci-fi, cool white light, wide static compositions, glass and steel, minimal color",
              "animated storybook, painterly textures, soft gradients, gentle camera drift"
            ]
          },
          { slider: "Shot Count", op: "trailer", label: "How many shots?", min: 1, max: 8, step: 1 },
          {
            run: ["trailer"],
            label: "Direct the video",
            disabledWhen: "trailer"
          }
        ],
        results: [
          { progress: "trailer", label: "Writing, rendering and cutting shots…" },
          { error: "trailer", label: "Video production failed" },
          { show: "trailer", op: "trailer", as: "Video", label: "Your video", demo: VIDEO }
        ]
      }
    ]
  },

  // ── 16 ─────────────────────────────────────────────────────────────────────
  {
    slug: "scene-builder",
    name: "Scene Builder",
    emoji: "🎞️",
    showEmoji: false,
    featured: true,
    tagline: "Approve the frame, then animate the shot.",
    description:
      "Describe a scene, review the editorial still, then animate that exact frame so the subject, framing, and color carry into the moving shot.",
    note:
      "Approve the still before you render the moving shot.",
    workflows: { look: "Editorial Still from a Line", motion: "Bring a Still to Life" },
    variables: [
      { id: "still", name: "The still", scope: "instance", type: "image" }
    ],
    operations: [
      {
        id: "look",
        name: "Look",
        workflow: "look",
        policy: "replace",
        outputs: { picture: { to: "variable", variableId: "still" } }
      },
      {
        id: "motion",
        name: "Motion",
        workflow: "motion",
        policy: "replace",
        inputs: { still: { from: "variable", variableId: "still" } }
      }
    ],
    sections: [
      {
        title: "Approve the frame",
        op: "look",
        controls: [
          {
            model: { node: "img", prop: "model" },
            op: "look",
            label: "Image model",
            modelKind: "image_model",
            task: "text_to_image"
          },
          { text: "subject", op: "look", label: "Scene brief", multiline: true },
          { run: ["look"], label: "Render the still", disabledWhen: "look" }
        ],
        results: [
          { progress: "look", label: "Rendering the still…" },
          { error: "look", label: "The still failed" },
          { note: "Approve the composition before moving to the shot." },
          { showVar: "still", as: "Image", label: "Approved still", demo: IMG }
        ]
      },
      {
        title: "Animate the approved frame",
        op: "motion",
        controls: [
          {
            model: { node: "vid", prop: "model" },
            op: "motion",
            label: "Video model",
            modelKind: "video_model",
            task: "image_to_video"
          },
          {
            select: "motion",
            op: "motion",
            label: "Shot direction",
            options: [
              "Slow push in with a gentle parallax drift",
              "Slow pull back revealing more of the scene",
              "Lateral dolly left to right with foreground parallax",
              "Locked-off camera, only atmosphere and light move",
              "Slow tilt up from the ground to the sky"
            ]
          },
          {
            slider: { node: "vid", prop: "duration" },
            op: "motion",
            label: "Shot length",
            min: 6,
            max: 10,
            step: 2,
            default: 6
          },
          {
            run: ["motion"],
            label: "Render the moving shot",
            disabledWhen: "motion"
          }
        ],
        results: [
          { progress: "motion", label: "Animating…" },
          { error: "motion", label: "The moving shot failed" },
          { note: "Review the motion for continuity with the approved still." },
          { show: "animated", op: "motion", as: "Video", label: "Moving shot", demo: VIDEO }
        ]
      }
    ]
  },

  // ── 17 ─────────────────────────────────────────────────────────────────────
  {
    slug: "video-restyle",
    name: "Video Restyle",
    emoji: "🎨",
    featured: false,
    tagline: "Repaint a clip in a new style while its motion stays put.",
    description:
      "Upload footage, name the look and what must survive, and a video-to-video model applies the style while the motion stays put.",
    note: "Video restyling is billed per clip.",
    workflows: { restyle: "Video Restyle Studio" },
    operations: [
      { id: "restyle", name: "Restyle", workflow: "restyle", policy: "replace" }
    ],
    sections: [
      {
        title: "Restyle a clip",
        op: "restyle",
        controls: [
          {
            model: { node: "restyle", prop: "model" },
            op: "restyle",
            label: "Restyle model",
            modelKind: "video_model",
            task: "video_to_video"
          },
          {
            video: { input: "source_video", op: "restyle" },
            op: "restyle",
            label: "The clip"
          },
          {
            select: "style",
            op: "restyle",
            label: "The look",
            options: [
              "1980s anime cel animation, hand-inked outlines, flat gouache color, visible film grain",
              "claymation, soft studio light, fingerprints in the clay, stop-motion cadence",
              "black and white 16mm documentary, heavy grain, high contrast",
              "oil painting, thick impasto brushwork, warm gallery light",
              "neon cyberpunk, wet reflections, magenta and cyan rim light",
              "pencil sketch on paper, cross-hatched shading, visible paper grain"
            ]
          },
          { text: "preserve", op: "restyle", label: "What must survive" },
          { run: ["restyle"], label: "Restyle the clip" }
        ],
        results: [
          { progress: "restyle", label: "Repainting every frame…" },
          { show: "restyled", op: "restyle", as: "Video", label: "Restyled clip", demo: VIDEO }
        ]
      }
    ]
  },

  // ── 18 ─────────────────────────────────────────────────────────────────────
  {
    slug: "ai-spokesperson",
    name: "AI Spokesperson",
    emoji: "🗣️",
    featured: false,
    tagline: "Give a presenter clip a new script.",
    description:
      "Text-to-speech voices the script, then a lip-sync model redrives the mouth in the source footage so the delivery matches. Localize a take, fix a fluffed line, or spin one recording into many variants.",
    note: "Voice generation and lip-sync are both billed per run.",
    workflows: { revoice: "AI Spokesperson" },
    modelOverrides: {
      revoice: { sync: ATLASCLOUD_SYNC_LIPSYNC }
    },
    operations: [
      { id: "revoice", name: "Revoice", workflow: "revoice", policy: "replace" }
    ],
    sections: [
      {
        title: "New words, same take",
        op: "revoice",
        controls: [
          { input: "presenter_clip", op: "revoice", label: "Presenter clip" },
          { text: "script", op: "revoice", label: "What they should say", multiline: true },
          {
            model: { node: "sync", prop: "model" },
            op: "revoice",
            label: "Lip-sync model",
            modelKind: "video_model",
            task: "lip_sync"
          },
          {
            run: ["revoice"],
            label: "Revoice the clip",
            disabledWhen: "revoice"
          }
        ],
        results: [
          { progress: "revoice", label: "Voicing and syncing…" },
          { error: "revoice", label: "The revoice failed" },
          { show: "revoiced_clip", op: "revoice", as: "Video", label: "Revoiced clip", demo: VIDEO }
        ]
      }
    ]
  },

  // ── 19 ─────────────────────────────────────────────────────────────────────
  {
    slug: "upscale-image",
    name: "Upscale Image",
    emoji: "🔍",
    featured: false,
    tagline: "Enlarge an image without the softness of a plain resize.",
    description:
      "Two upscalers behind one drop zone. ESRGAN reconstructs the detail that is there, which is what you want for a photo. Clarity invents plausible detail, which is what you want when the source is small.",
    note: "One billed generation per upscale.",
    workflows: {
      faithful: "Upscale a Still",
      clarity: "Take a Product Shot to Print Resolution"
    },
    operations: [
      {
        id: "faithful",
        name: "Faithful",
        workflow: "faithful",
        policy: "replace"
      },
      {
        id: "clarity",
        name: "Clarity",
        workflow: "clarity",
        policy: "replace"
      }
    ],
    sections: [
      {
        title: "Faithful",
        op: "faithful",
        controls: [
          {
            model: { node: "up", prop: "model" },
            op: "faithful",
            label: "Faithful model",
            modelKind: "image_model",
            task: "upscale"
          },
          {
            image: { input: "picture", op: "faithful" },
            op: "faithful",
            label: "The image to enlarge (faithful)"
          },
          {
            slider: { node: "up", prop: "scale" },
            op: "faithful",
            label: "Scale",
            min: 2,
            max: 4,
            step: 2,
            default: 4
          },
          { run: ["faithful"], label: "Upscale (ESRGAN)" }
        ],
        results: [
          { progress: "faithful", label: "Reconstructing detail…" },
          { show: "enlarged", op: "faithful", as: "Image", label: "Enlarged", demo: IMG }
        ]
      },
      {
        title: "Clarity",
        op: "clarity",
        controls: [
          {
            model: { node: "up", prop: "model" },
            op: "clarity",
            label: "Clarity model",
            modelKind: "image_model",
            task: "upscale"
          },
          {
            image: { input: "photo", op: "clarity" },
            op: "clarity",
            label: "The image to enlarge (clarity)"
          },
          {
            slider: { node: "up", prop: "scale" },
            op: "clarity",
            label: "Scale",
            min: 2,
            max: 4,
            step: 2,
            default: 4
          },
          { run: ["clarity"], label: "Upscale (Clarity)" }
        ],
        results: [
          { progress: "clarity", label: "Adding detail…" },
          { show: "print_ready", op: "clarity", as: "Image", label: "Print-ready", demo: IMG }
        ]
      }
    ]
  },

  // ── 20 ─────────────────────────────────────────────────────────────────────
  {
    slug: "vertical-cut",
    name: "Vertical Cut",
    emoji: "📱",
    featured: false,
    tagline: "Landscape footage in, a 9:16 post and its cover frame out.",
    description:
      "Resize a 16:9 clip to the vertical frame and pull a still at the timestamp you choose for the cover. Both run locally through ffmpeg.",
    note: "✨ Keyless. Both steps run on your machine.",
    workflows: {
      vertical: "Cut a Landscape Clip for Vertical",
      cover: "Pull a Still from a Clip"
    },
    variables: [
      { id: "clip", name: "The clip", scope: "instance", type: "video" }
    ],
    operations: [
      {
        id: "vertical",
        name: "Vertical",
        workflow: "vertical",
        policy: "parallel",
        inputs: { clip: { from: "variable", variableId: "clip" } }
      },
      {
        id: "cover",
        name: "Cover",
        workflow: "cover",
        policy: "parallel",
        inputs: { clip: { from: "variable", variableId: "clip" } }
      }
    ],
    sections: [
      {
        title: "Cut for vertical",
        controls: [
          { video: "clip", label: "Landscape clip" },
          {
            slider: { node: "frame", prop: "time" },
            op: "cover",
            label: "Cover frame at (seconds)",
            min: 0,
            max: 30,
            step: 0.5,
            default: 2
          },
          { run: ["vertical", "cover"], label: "Cut it" }
        ],
        results: [
          { progress: "vertical", label: "Resizing…" },
          { show: "vertical", op: "vertical", as: "Video", label: "Vertical clip", demo: VIDEO },
          { show: "still", op: "cover", as: "Image", label: "Cover frame", demo: IMG }
        ]
      }
    ]
  },

  // ── 21 ─────────────────────────────────────────────────────────────────────
  {
    slug: "ad-maker",
    name: "Ad Maker",
    emoji: "📣",
    showEmoji: false,
    featured: true,
    tagline: "Settle the message. Direct the campaign image.",
    description:
      "Start with one offer, compare copy routes and headline angles, then direct a campaign hero with the approved message beside the visual brief.",
    note:
      "The hero render only runs after you approve the visual brief.",
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
        title: "1 · Settle the message",
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
        title: "2 · Direct the campaign image",
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

  // ── 22 ─────────────────────────────────────────────────────────────────────
  // The four apps below each bind one shipped recipe
  // (packages/base-nodes/nodetool/examples/recipes/*.recipe.json) end to end:
  // the recipe's steps become operations on one surface, and the handoff the
  // manifest describes in prose becomes a variable carried between them.
  {
    slug: "trailer-room",
    name: "Trailer Room",
    emoji: "🎞️",
    featured: false,
    tagline: "Premise to beat sheet to shot list to a scored teaser, on one page.",
    description:
      "The Storyboard to Trailer chain behind one surface. Rewrite the beat sheet and the shot list while they still cost one text call each, then spend once on the footage and lay a score under the cut.",
    note: "💸 Beats and shots are text calls. Shoot spends on a per-second video model and Score on one audio generation.",
    workflows: {
      beats: "Trailer Beats from a Premise",
      shots: "Shot List from a Synopsis",
      trailer: "Movie Trailer Generator",
      score: "Score a Silent Clip"
    },
    variables: [
      {
        id: "premise",
        name: "Premise",
        scope: "instance",
        type: "str",
        default:
          "A getaway driver speeds onto a bridge as it starts to collapse behind her."
      },
      {
        id: "synopsis",
        name: "Synopsis",
        scope: "instance",
        type: "str",
        default: ""
      },
      { id: "cut", name: "The cut", scope: "instance", type: "video" }
    ],
    operations: [
      {
        id: "beats",
        name: "Beats",
        workflow: "beats",
        policy: "replace",
        inputs: { premise: { from: "variable", variableId: "premise" } }
      },
      {
        id: "shots",
        name: "Shots",
        workflow: "shots",
        policy: "replace",
        inputs: { synopsis: { from: "variable", variableId: "synopsis" } }
      },
      {
        id: "trailer",
        name: "Shoot",
        workflow: "trailer",
        policy: "queue",
        timeoutMs: 1800000,
        inputs: { Logline: { from: "variable", variableId: "premise" } },
        outputs: { trailer: { to: "variable", variableId: "cut" } }
      },
      {
        id: "score",
        name: "Score",
        workflow: "score",
        policy: "queue",
        inputs: { clip: { from: "variable", variableId: "cut" } }
      }
    ],
    sections: [
      {
        title: "The paperwork",
        controls: [
          { textVar: "premise", label: "Your trailer in one line", multiline: true },
          { run: ["beats"], label: "Write the beats" },
          { textVar: "synopsis", label: "Synopsis to break into shots", multiline: true },
          { run: ["shots"], label: "Break it into shots" }
        ],
        results: [
          { progress: "beats", label: "Structuring the trailer…" },
          {
            show: "beats",
            op: "beats",
            as: "Markdown",
            label: "Beat sheet",
            demo: "**Hook (0:00–0:08)** — Headlights on wet asphalt, the bridge ahead already wrong.\n\n**Escalation (0:08–0:24)** — Concrete gives. She does not lift off.\n\n**Turn (0:24–0:36)** — The span behind her is gone. So is the way back.\n\n**Title card (0:36–0:42)** — THE LAST SPAN."
          },
          { progress: "shots", label: "Numbering the shots…" },
          {
            show: "shot_list",
            op: "shots",
            as: "Markdown",
            label: "Shot list",
            demo: "1. Close on the speedometer, handheld, 2s\n2. Low wide of the bridge mouth, locked off, 3s\n3. Tracking side profile of the car, dolly right, 4s"
          }
        ]
      },
      {
        title: "The footage",
        controls: [
          { note: "💸 Shooting the teaser runs one video generation per shot." },
          { text: "Visual Style", op: "trailer", label: "Visual style", multiline: true },
          { number: "Shot Count", op: "trailer", label: "Number of shots", min: 3, max: 10 },
          { run: ["trailer"], label: "Shoot the teaser" },
          { text: "mood", op: "score", label: "Score mood", multiline: true },
          { run: ["score"], label: "Score the cut" }
        ],
        results: [
          { progress: "trailer", label: "Directing, rendering & cutting…" },
          { showVar: "cut", as: "Video", label: "The cut", demo: VIDEO },
          { progress: "score", label: "Writing the bed…" },
          { show: "scored_clip", op: "score", as: "Video", label: "Scored teaser" }
        ]
      }
    ]
  },

  // ── 23 ─────────────────────────────────────────────────────────────────────
  {
    slug: "sku-factory",
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
            min: 4,
            max: 8,
            step: 2,
            default: 4
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
    tagline: "One presenter clip, spoken in another language, checked and subtitled.",
    description:
      "The Multilingual Video Dubber chain behind one surface. Transcribing writes the script into a variable the revoice and back-translation steps both read, so the words that get dubbed are the words you can see.",
    note: "Transcription, translation, speech, and lip-sync use configured models and are billed per run.",
    workflows: {
      transcribe: "Transcribe a Clip",
      revoice: "Localise a Script and Revoice It",
      check: "One Tagline, Six Markets",
      spokesperson: "AI Spokesperson",
      subtitles: "Subtitle Text from a Recording"
    },
    modelOverrides: {
      revoice: { ag: CODEX_LUNA },
      check: { ag: CODEX_LUNA },
      subtitles: { ag: CODEX_LUNA }
    },
    variables: [
      { id: "clip", name: "The clip", scope: "instance", type: "video" },
      {
        id: "script",
        name: "Script",
        scope: "instance",
        type: "str",
        default: ""
      }
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
        id: "revoice",
        name: "Revoice",
        workflow: "revoice",
        policy: "replace",
        inputs: { script: { from: "variable", variableId: "script" } }
      },
      {
        id: "check",
        name: "Back-translate",
        workflow: "check",
        policy: "parallel",
        inputs: { tagline: { from: "variable", variableId: "script" } }
      },
      {
        id: "spokesperson",
        name: "Lip-sync",
        workflow: "spokesperson",
        policy: "queue",
        timeoutMs: 900000,
        inputs: {
          presenter_clip: { from: "variable", variableId: "clip" },
          script: { from: "variable", variableId: "script" }
        }
      },
      {
        id: "subtitles",
        name: "Subtitles",
        workflow: "subtitles",
        policy: "parallel",
        inputs: { recording: { from: "variable", variableId: "clip" } }
      }
    ],
    sections: [
      {
        title: "The footage",
        controls: [
          { video: "clip", label: "Presenter clip" },
          { run: ["transcribe"], label: "Get the script back out" },
          { textVar: "script", label: "The script that gets dubbed", multiline: true },
          { run: ["revoice", "subtitles"], label: "Revoice and subtitle" }
        ],
        results: [
          { progress: "transcribe", label: "Transcribing…" },
          { progress: "revoice", label: "Translating and voicing…" },
          {
            show: "spanish_audio",
            op: "revoice",
            as: "Audio",
            label: "Localised voice track",
            demo: AUDIO
          },
          {
            show: "captions",
            op: "subtitles",
            as: "Markdown",
            label: "Subtitle lines",
            demo: "1\n00:00:00,000 --> 00:00:02,400\nOur spring release ships today."
          }
        ]
      },
      {
        title: "Make the mouth match",
        controls: [
          { note: "💸 Lip-sync redraws the footage and is metered per second." },
          { run: ["spokesperson"], label: "Lip-sync the clip" }
        ],
        results: [
          { progress: "spokesperson", label: "Redriving the mouth…" },
          {
            show: "revoiced_clip",
            op: "spokesperson",
            as: "Video",
            label: "Dubbed cut",
            demo: VIDEO
          }
        ]
      },
      {
        title: "Check what you shipped",
        controls: [
          { text: "tagline", op: "check", label: "A line to read back", multiline: true },
          { run: ["check"], label: "Show me all six" }
        ],
        results: [
          { progress: "check", label: "Localising…" },
          {
            show: "localised",
            op: "check",
            as: "Markdown",
            label: "Six markets, back-translated",
            demo: "**de** — Schneller als letzte Saison. _(Faster than last season.)_\n\n**fr** — Plus rapide que la saison dernière. _(Faster than last season.)_"
          }
        ]
      }
    ]
  },

  // ── 25 ─────────────────────────────────────────────────────────────────────
  {
    slug: "viral-ad-engine",
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
