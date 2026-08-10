// The curated example apps, as data.
//
// One entry per app in docs/plans/example-apps.md. `scripts/build-example-apps.mjs`
// turns each entry into an ApplicationBundle in
// packages/base-nodes/nodetool/examples/apps/, resolving every workflow,
// input, and output **by name** against the shipped template graphs — a name
// that no longer exists fails the build instead of shipping a dead binding.
//
// Entry shape:
//   slug, name, emoji, tagline, description, note, featured
//   workflows  { <bundleKey>: "<Template Name>" }
//   variables  [ { id, name, scope, persist?, default? } ]
//   operations [ { id, name, workflow, policy?, timeoutMs?,
//                  inputs:  { "<input name>": mapping },
//                  outputs: { "<output name>": { to: "variable", variableId } } } ]
//              Inputs with no mapping are driven by a widget; outputs with no
//              mapping are displayed.
//   sections   [ { title, op?, controls: [...], results: [...] } ]
//
// Control kinds: input, text, number, slider, select, image, audio, switch,
// color, run, note. Result kinds: progress, show, showVar, heading, note.
// See buildSection() in the builder for the exact props each one emits.

const SLIDERS_IMAGE_ENHANCE = [
  { slider: { node: "denoise-node", prop: "radius" }, label: "Denoise", min: 0, max: 16, step: 0.5, default: 0 },
  { slider: { node: "tone-node", prop: "brightness" }, label: "Brightness", min: -1, max: 1, step: 0.05, default: 0.05 },
  { slider: { node: "tone-node", prop: "contrast" }, label: "Contrast", min: 0, max: 4, step: 0.05, default: 1.15 },
  { slider: { node: "color-node", prop: "saturation" }, label: "Saturation", min: 0, max: 4, step: 0.05, default: 1.2 },
  { slider: { node: "sharpen-node", prop: "amount" }, label: "Sharpen", min: 0, max: 4, step: 0.05, default: 1 }
];

const IMG = { $demo: "image" };
const VIDEO = { $demo: "video" };

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
    note: "✨ `Enhance` is GPU-only and needs no keys. `Batch` adds a FAL grading pass, so it needs a FAL key.",
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

  // ── 2 ──────────────────────────────────────────────────────────────────────
  {
    slug: "meeting-room",
    name: "Meeting Room",
    emoji: "🎧",
    featured: true,
    tagline: "Recording in, minutes out — then question the transcript.",
    description:
      "Transcribe a recording, summarize it into notes and action items, then ask follow-up questions of the transcript on a local model.",
    note: "🎙️ Transcription uses FAL Whisper and the summary uses OpenAI. The follow-up questions run on a local Ollama model, so they cost nothing.",
    workflows: {
      transcribe: "Transcribe Audio",
      summarize: "Meeting Transcript Summarizer",
      assistant: "Private Assistant"
    },
    variables: [
      { id: "transcript", name: "Transcript", scope: "instance", type: "str", default: "" }
    ],
    operations: [
      {
        id: "transcribe",
        name: "Transcribe",
        workflow: "transcribe",
        policy: "replace",
        outputs: { transcript: { to: "variable", variableId: "transcript" } }
      },
      {
        id: "summarize",
        name: "Summarize",
        workflow: "summarize",
        policy: "replace",
        inputs: { Transcript: { from: "variable", variableId: "transcript" } }
      },
      {
        id: "ask",
        name: "Ask",
        workflow: "assistant",
        policy: "replace",
        inputs: { document: { from: "variable", variableId: "transcript" } }
      }
    ],
    sections: [
      {
        title: "The recording",
        op: "transcribe",
        controls: [
          { audio: "audio", op: "transcribe", label: "Meeting recording", run: true },
          { run: ["transcribe"], label: "Transcribe" }
        ],
        results: [
          { progress: "transcribe", label: "Transcribing…" },
          { showVar: "transcript", as: "Markdown", label: "Transcript", demo: "“…okay, so if we're all aligned, let's lock Friday for the pricing page. Jonas, can you take the trial-expiry bug before Wednesday?…”" }
        ]
      },
      {
        title: "The minutes",
        op: "summarize",
        controls: [{ run: ["summarize"], label: "Summarize the meeting" }],
        results: [
          { progress: "summarize", label: "Writing the minutes…" },
          { show: "Summary", op: "summarize", as: "Markdown", label: "Meeting notes", demo: "**Decisions**\n- Ship the pricing page Friday\n- Maya owns the launch email" },
          { show: "Action Items", op: "summarize", as: "Table", label: "Action items" },
          { show: "Transcript", op: "summarize", as: "Markdown", label: "Transcript used" }
        ]
      },
      {
        title: "Ask the transcript",
        op: "ask",
        controls: [
          { text: "question", op: "ask", label: "Your question", multiline: true },
          {
            select: "tone",
            op: "ask",
            label: "Answer tone",
            options: [
              "concise and neutral",
              "friendly and warm",
              "professional",
              "detailed and thorough",
              "plain and simple"
            ]
          },
          { run: ["ask"], label: "Ask locally" }
        ],
        results: [
          { progress: "ask", label: "Thinking locally…" },
          { show: "answer", op: "ask", as: "Markdown", label: "Answer", demo: "The standup moved to **9:30am on Tuesdays**, and Priya is covering the on-call rotation next week." }
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
    note: "🎨 Generating needs OpenAI and FAL keys. Polishing is GPU-only and runs with no keys.",
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

  // ── 4 ──────────────────────────────────────────────────────────────────────
  {
    slug: "research-desk",
    name: "Research Desk",
    emoji: "🕵️",
    featured: true,
    tagline: "One topic, two sources, two briefings side by side.",
    description:
      "A research agent and a Hacker News reader both take the same topic and stream into their own panel.",
    note: "🔑 Needs an OpenAI key. Both briefings run in parallel from one button.",
    workflows: {
      research: "Research Agent",
      hn: "Hacker News Agent"
    },
    variables: [
      {
        id: "topic",
        name: "Topic",
        scope: "user",
        persist: true,
        type: "str",
        default: "on-device language models"
      }
    ],
    operations: [
      {
        id: "brief",
        name: "Brief",
        workflow: "research",
        policy: "parallel",
        inputs: { topic: { from: "variable", variableId: "topic" } }
      },
      {
        id: "pulse",
        name: "Pulse",
        workflow: "hn",
        policy: "parallel",
        inputs: { topic: { from: "variable", variableId: "topic" } }
      }
    ],
    sections: [
      {
        title: "Your topic",
        controls: [
          { textVar: "topic", label: "Research topic", multiline: true },
          {
            select: "audience",
            op: "brief",
            label: "Who is it for?",
            options: ["engineers", "executives", "a general audience"]
          },
          { run: ["brief", "pulse"], label: "Run the desk" }
        ],
        results: [
          { progress: "brief", label: "Searching & browsing sources…" },
          { show: "brief", op: "brief", as: "Markdown", label: "Research brief", demo: "**On-device LLMs — briefing for a product team.**\n\n- **State of play:** 3–8B models now run usably on laptops and high-end phones.\n- **Tradeoff:** roughly half the quality of frontier models, zero API cost, full privacy." }
        ]
      },
      {
        title: "The pulse",
        results: [
          { progress: "pulse", label: "Reading the front page…" },
          { show: "analysis", op: "pulse", as: "Markdown", label: "Hacker News", demo: "**Today on HN:** local-first software is having a moment — three of the top ten posts cover sync engines." }
        ]
      }
    ]
  },

  // ── 5 ──────────────────────────────────────────────────────────────────────
  {
    slug: "ask-your-documents",
    name: "Ask Your Documents",
    emoji: "📄",
    tagline: "Ask your own documents — with a local mode that never leaves your machine.",
    description:
      "Retrieval-augmented answers with citations, and a fully local fallback that reads one pasted document instead of the vector store.",
    note: "🖥️ The retrieval mode embeds with Ollama `nomic-embed-text` and answers with OpenAI, so it needs **both**. Local mode needs only Ollama.",
    workflows: { rag: "Chat With Your Documents", local: "Private Assistant" },
    variables: [
      { id: "question", name: "Question", scope: "instance", type: "str", default: "Is the Aurora Trail safe to swim with?" },
      { id: "pastedDoc", name: "Pasted document", scope: "instance", type: "str", default: "" },
      { id: "localOnly", name: "Local only", scope: "instance", type: "bool", default: false }
    ],
    operations: [
      {
        id: "ask",
        name: "Ask",
        workflow: "rag",
        policy: "replace",
        inputs: { question: { from: "variable", variableId: "question" } }
      },
      {
        id: "askLocal",
        name: "Ask locally",
        workflow: "local",
        policy: "replace",
        inputs: {
          question: { from: "variable", variableId: "question" },
          document: { from: "variable", variableId: "pastedDoc" }
        }
      }
    ],
    sections: [
      {
        title: "Ask",
        controls: [
          { textVar: "question", label: "Your question", multiline: true },
          { switch: "localOnly", label: "Local only (no cloud)" },
          { text: "search", op: "ask", label: "Search keyword" },
          { run: ["ask"], label: "Search my documents" },
          { textVar: "pastedDoc", label: "Or paste one document", multiline: true },
          {
            select: "tone",
            op: "askLocal",
            label: "Answer tone",
            options: ["concise and neutral", "friendly and warm", "professional", "detailed and thorough"]
          },
          { run: ["askLocal"], label: "Ask locally" }
        ],
        results: [
          { progress: "ask", label: "Searching your knowledge base…" },
          { show: "Answer", op: "ask", as: "Markdown", label: "Answer", demo: "The Aurora Trail is rated for **50 m water resistance** (5 ATM) — fine for swimming and rain, not for diving. *[source: specs]*" },
          { show: "Retrieved Passages", op: "ask", as: "Markdown", label: "Sources used", demo: "> **specs** — Water resistance: 5 ATM (50 m). Case: recycled aluminium." },
          { progress: "askLocal", label: "Thinking locally…" },
          { show: "answer", op: "askLocal", as: "Markdown", label: "Local answer" }
        ]
      },
      {
        title: "The documents",
        op: "ask",
        controls: [
          { text: "doc_specs", op: "ask", label: "Document: specs", multiline: true },
          { text: "doc_charging", op: "ask", label: "Document: charging", multiline: true },
          { text: "doc_warranty", op: "ask", label: "Document: warranty", multiline: true }
        ],
        results: []
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
    note: "🔑 Needs OpenAI and FAL keys. Your brand name, audience, and voice persist between sessions.",
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
    note: "💸 Mockups need OpenAI and FAL. The launch video runs on Veo and costs credits per run, so it has its own button.",
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
          { note: "💸 One run of this uses the Veo video model and costs credits." },
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
    note: "💸 This app spends real money — Veo 3.1 video and Replicate MusicGen. Run it once, deliberately.",
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
          { note: "💸 Each run of Produce or Rough cut uses Veo and Replicate credits." },
          { textVar: "brief", label: "Your film in one line", multiline: true },
          { textVar: "style", label: "Visual style", multiline: true },
          { text: "Shot Count", op: "produce", label: "Number of shots" },
          { run: ["produce"], label: "Shoot my film" },
          { run: ["cut"], label: "Give me the rough cut" }
        ],
        results: [
          { progress: "produce", label: "Directing, storyboarding & shooting…" },
          { show: "direction", op: "produce", as: "Markdown", label: "Direction document", demo: "## THE BENDING LIGHT\n\n**Logline** — A keeper follows her own beam to the thing it will no longer stop pointing at." },
          { show: "storyboard", op: "produce", as: "Image", label: "Storyboard keyframes", demo: IMG },
          { show: "film", op: "produce", as: "Video", label: "Finished film", demo: VIDEO },
          { progress: "cut", label: "Cutting the timeline…" },
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
          { run: ["poster"], label: "Make my poster" }
        ],
        results: [
          { progress: "poster", label: "Designing your poster…" },
          { show: "Poster", op: "poster", as: "Image", label: "Your poster", demo: IMG }
        ]
      }
    ]
  },

  // ── 9 ──────────────────────────────────────────────────────────────────────
  {
    slug: "study-buddy",
    name: "Study Buddy",
    emoji: "🃏",
    tagline: "A deck of flashcards and the concept behind it, side by side.",
    description:
      "Structured data an app renders better than a graph does: the cards land in a table, the explanation beside them.",
    note: "🔑 Needs an OpenAI key. Your topic persists between sessions.",
    workflows: { cards: "Flashcard Generator", explain: "Prompt Template" },
    variables: [
      { id: "topic", name: "Topic", scope: "user", persist: true, type: "str", default: "Python data structures" }
    ],
    operations: [
      {
        id: "cards",
        name: "Cards",
        workflow: "cards",
        policy: "replace",
        inputs: { topic: { from: "variable", variableId: "topic" } }
      },
      {
        id: "explain",
        name: "Explain",
        workflow: "explain",
        policy: "replace",
        inputs: { Topic: { from: "variable", variableId: "topic" } }
      }
    ],
    sections: [
      {
        title: "Your deck",
        controls: [
          { textVar: "topic", label: "Study topic", multiline: true },
          { number: "num_cards", op: "cards", label: "How many cards?", min: 3, max: 30 },
          {
            select: "Audience",
            op: "explain",
            label: "Explain it to…",
            options: ["a curious 10-year-old", "a new teammate", "an expert", "someone in a hurry"]
          },
          { run: ["cards"], label: "Make flashcards" },
          { run: ["explain"], label: "Explain the concept" }
        ],
        results: [
          { progress: "cards", label: "Writing cards…" },
          { show: "Flashcards", op: "cards", as: "Table", label: "Flashcards" },
          { show: "Explanation", op: "explain", as: "Markdown", label: "The concept behind this deck", demo: "**Photosynthesis, for a curious 10-year-old:** plants are tiny chefs — sunlight, water, and the air you breathe out, cooked into sugar." }
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
    note: "🔑 Needs OpenAI, Anthropic, and Google keys — one per column.",
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
          { show: "openai", op: "compare", as: "Markdown", label: "OpenAI", demo: "**OpenAI:** leads with a crisp three-point structure and ships a concrete next step." },
          { show: "anthropic", op: "compare", as: "Markdown", label: "Anthropic", demo: "**Anthropic:** longer reasoning, names the tradeoff explicitly, flags one risk the others miss." },
          { show: "gemini", op: "compare", as: "Markdown", label: "Google", demo: "**Google:** tightest answer, strongest factual recall, lightest on caveats." }
        ]
      }
    ]
  },

  // ── 11 ─────────────────────────────────────────────────────────────────────
  {
    slug: "dataset-builder",
    name: "Dataset Builder",
    emoji: "🧮",
    tagline: "Describe the dataset you need — get it as a table.",
    description:
      "The smallest app in the set, and the reference for the Table widget: a dataframe reads better as rows than as a Preview node.",
    note: "🔑 Needs an OpenAI key.",
    workflows: { data: "Data Generator" },
    operations: [
      { id: "generate", name: "Generate", workflow: "data", policy: "replace" }
    ],
    sections: [
      {
        title: "The dataset",
        op: "generate",
        controls: [
          { text: "topic", op: "generate", label: "What data do you need?", multiline: true },
          { number: "row_count", op: "generate", label: "How many rows?", min: 5, max: 50 },
          { run: ["generate"], label: "Generate data" }
        ],
        results: [
          { progress: "generate", label: "Generating rows…" },
          { show: "generated_data", op: "generate", as: "Table", label: "Generated dataset" }
        ]
      }
    ]
  }
];
