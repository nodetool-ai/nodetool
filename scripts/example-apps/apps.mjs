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
// Control kinds: input, text, number, slider, select, image, video, audio,
// switch, color, run, note. Result kinds: progress, show, showVar, heading, note.
// `text`, `select` and `slider` take an input name or `{ node, prop }` to drive
// a node property inside the graph; `default` seeds the preview value.
// See buildControl() in the builder for the exact props each one emits.

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
      "Pick what should change — lighting, background, pose, palette, camera angle — and an edit model alters only that. Composition and subject survive because the model edits in place instead of regenerating.",
    note: "🔑 Needs a FAL key (Nano Banana edit). Billed per image.",
    workflows: { edit: "Edit a Still with Words" },
    variables: [
      { id: "picture", name: "Your image", scope: "instance", type: "image" }
    ],
    operations: [
      {
        id: "edit",
        name: "Edit",
        workflow: "edit",
        policy: "replace",
        inputs: { picture: { from: "variable", variableId: "picture" } }
      }
    ],
    sections: [
      {
        title: "Vary it",
        op: "edit",
        controls: [
          { image: "picture", label: "Your image" },
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
              "Shift the colour palette to muted teal and sand tones",
              "Render it as a loose watercolour illustration, keep the composition",
              "Move the camera to a low angle looking up, same subject and setting"
            ]
          },
          {
            slider: { node: "ed", prop: "strength" },
            op: "edit",
            label: "How far to go",
            min: 0.2,
            max: 1,
            step: 0.05,
            default: 0.6
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
    featured: true,
    tagline: "New setting, new light, or a clean cutout — without a reshoot.",
    description:
      "One product photo, three treatments. Put it on a described set, relight it for a season, or strip the background to a real alpha channel for compositing.",
    note: "🔑 Needs a FAL key. Each treatment is one or two image calls.",
    workflows: {
      backdrop: "Put a Product on a Studio Backdrop",
      relight: "Relight a Product for a Seasonal Campaign",
      cutout: "Cut a Product Out of Its Background"
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
        title: "New setting",
        op: "backdrop",
        controls: [
          {
            select: { node: "comp", prop: "prompt" },
            op: "backdrop",
            label: "Setting",
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
          { run: ["backdrop"], label: "Place it on the set" }
        ],
        results: [
          { progress: "backdrop", label: "Cutting out and placing…" },
          { show: "styled", op: "backdrop", as: "Image", label: "On the set", demo: IMG }
        ]
      },
      {
        title: "New light",
        op: "relight",
        controls: [
          {
            select: { node: "rl", prop: "prompt" },
            op: "relight",
            label: "Season and light",
            default: "warm low winter sun from the left, long soft shadows",
            options: [
              "warm low winter sun from the left, long soft shadows",
              "bright summer noon, hard overhead sun, short crisp shadows",
              "soft spring window light from the right, gentle falloff",
              "autumn golden hour from behind, amber rim light",
              "cool blue evening light, neon reflections"
            ]
          },
          { run: ["relight"], label: "Relight it" }
        ],
        results: [
          { progress: "relight", label: "Relighting…" },
          { show: "seasonal", op: "relight", as: "Image", label: "Relit", demo: IMG }
        ]
      },
      {
        title: "Clean cutout",
        op: "cutout",
        controls: [{ run: ["cutout"], label: "Cut it out" }],
        results: [
          { progress: "cutout", label: "Removing the background…" },
          { show: "cutout", op: "cutout", as: "Image", label: "Cutout with alpha", demo: IMG }
        ]
      }
    ]
  },

  // ── 14 ─────────────────────────────────────────────────────────────────────
  {
    slug: "product-shot-video",
    name: "Product Shot Video",
    emoji: "🎥",
    featured: true,
    tagline: "A product photo becomes a hero loop or a turntable clip.",
    description:
      "Image-to-video keeps the product identical and adds only the camera move. Pick a motion for a looping ad, or spin a packshot into a turntable for the product page.",
    note: "🔑 The ad loop runs Kling on Kie and needs a KIE key. The turntable runs LTX on FAL and needs a FAL key. Both are billed per generation.",
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
        title: "Hero loop",
        op: "loop",
        controls: [
          {
            select: "motion",
            op: "loop",
            label: "Camera move",
            options: [
              "Slow orbit around the product as a soft highlight travels across its surface",
              "Slow push in toward the product as the background falls out of focus",
              "Gentle dolly from left to right, product fixed, light sweeping across",
              "Rise from a low angle to eye level, product centred, soft reflections",
              "Hold still while steam and light drift around the product"
            ]
          },
          { run: ["loop"], label: "Make the loop" }
        ],
        results: [
          { progress: "loop", label: "Animating…" },
          { show: "ad_loop", op: "loop", as: "Video", label: "Hero loop", demo: VIDEO }
        ]
      },
      {
        title: "Turntable",
        op: "turntable",
        controls: [
          {
            select: { node: "v", prop: "prompt" },
            op: "turntable",
            label: "Spin",
            default: "slow orbit around the product, fixed lighting, product stays centred",
            options: [
              "slow orbit around the product, fixed lighting, product stays centred",
              "full 360 degree turntable rotation, product centred, studio lighting fixed",
              "slow half turn revealing the back of the product, fixed lighting",
              "gentle rocking turn, product centred, soft studio light"
            ]
          },
          { run: ["turntable"], label: "Spin it" }
        ],
        results: [
          { progress: "turntable", label: "Rendering the turntable…" },
          { show: "turntable", op: "turntable", as: "Video", label: "Turntable clip", demo: VIDEO }
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
    note: "💸 Needs Gemini, OpenAI and Google Veo keys. Every shot is one Veo call, metered per second of video, so start with a small shot count.",
    workflows: { trailer: "Movie Trailer Generator" },
    operations: [
      { id: "trailer", name: "Direct", workflow: "trailer", policy: "replace" }
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
              "clean sci-fi, cool white light, wide static compositions, glass and steel, minimal colour",
              "animated storybook, painterly textures, soft gradients, gentle camera drift"
            ]
          },
          { slider: "Shot Count", op: "trailer", label: "How many shots?", min: 1, max: 8, step: 1 },
          { run: ["trailer"], label: "Direct the video" }
        ],
        results: [
          { progress: "trailer", label: "Writing, rendering and cutting shots…" },
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
    featured: true,
    tagline: "See the look as a still, then bring it to life.",
    description:
      "Describe a scene and get an editorial still first. When the frame is right, choose a camera move and animate that exact image — the second step preserves subject, framing and colour.",
    note: "🔑 Needs a FAL key. The still is one FLUX call, the motion one LTX call.",
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
        title: "The look",
        op: "look",
        controls: [
          { text: "subject", op: "look", label: "Describe the scene", multiline: true },
          { run: ["look"], label: "Show me the look" }
        ],
        results: [
          { progress: "look", label: "Rendering the still…" },
          { showVar: "still", as: "Image", label: "The still", demo: IMG }
        ]
      },
      {
        title: "Bring it to life",
        op: "motion",
        controls: [
          {
            select: "motion",
            op: "motion",
            label: "Camera move",
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
            label: "Seconds",
            min: 2,
            max: 8,
            step: 1,
            default: 6
          },
          { run: ["motion"], label: "Animate the still" }
        ],
        results: [
          { progress: "motion", label: "Animating…" },
          { show: "animated", op: "motion", as: "Video", label: "The moving shot", demo: VIDEO }
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
      "Upload footage, name the look and what must survive, and a video-to-video model applies the style. Strength is the dial: low keeps the original read, high commits to the new look.",
    note: "🔑 Needs a FAL key (Lucy Edit). Billed per clip.",
    workflows: { restyle: "Video Restyle Studio" },
    operations: [
      { id: "restyle", name: "Restyle", workflow: "restyle", policy: "replace" }
    ],
    sections: [
      {
        title: "Restyle a clip",
        op: "restyle",
        controls: [
          { input: "source_video", op: "restyle", label: "The clip" },
          {
            select: "style",
            op: "restyle",
            label: "The look",
            options: [
              "1980s anime cel animation, hand-inked outlines, flat gouache colour, visible film grain",
              "claymation, soft studio light, fingerprints in the clay, stop-motion cadence",
              "black and white 16mm documentary, heavy grain, high contrast",
              "oil painting, thick impasto brushwork, warm gallery light",
              "neon cyberpunk, wet reflections, magenta and cyan rim light",
              "pencil sketch on paper, cross-hatched shading, visible paper grain"
            ]
          },
          { text: "preserve", op: "restyle", label: "What must survive" },
          {
            slider: { node: "restyle", prop: "strength" },
            op: "restyle",
            label: "Strength",
            min: 0.1,
            max: 1,
            step: 0.05,
            default: 0.45
          },
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
      "Text-to-speech voices the script, then a lip-sync model redrives the mouth in the source footage so the delivery matches. Localise a take, fix a fluffed line, or spin one recording into many variants.",
    note: "🔑 Needs a FAL key for lip-sync and an Inworld key for the voice. Both steps are billed per run.",
    workflows: { revoice: "AI Spokesperson" },
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
            slider: { node: "speech", prop: "speed" },
            op: "revoice",
            label: "Speaking pace",
            min: 0.7,
            max: 1.3,
            step: 0.05,
            default: 1
          },
          { run: ["revoice"], label: "Revoice the clip" }
        ],
        results: [
          { progress: "revoice", label: "Voicing and syncing…" },
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
    note: "🔑 Needs a FAL key. One call per upscale.",
    workflows: {
      faithful: "Upscale a Still",
      clarity: "Take a Product Shot to Print Resolution"
    },
    variables: [
      { id: "picture", name: "Your image", scope: "instance", type: "image" }
    ],
    operations: [
      {
        id: "faithful",
        name: "Faithful",
        workflow: "faithful",
        policy: "replace",
        inputs: { picture: { from: "variable", variableId: "picture" } }
      },
      {
        id: "clarity",
        name: "Clarity",
        workflow: "clarity",
        policy: "replace",
        inputs: { photo: { from: "variable", variableId: "picture" } }
      }
    ],
    sections: [
      {
        title: "Your image",
        controls: [{ image: "picture", label: "The image to enlarge" }]
      },
      {
        title: "Faithful",
        op: "faithful",
        controls: [
          {
            slider: { node: "up", prop: "scale" },
            op: "faithful",
            label: "Scale",
            min: 2,
            max: 4,
            step: 1,
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
            slider: { node: "up", prop: "scale" },
            op: "clarity",
            label: "Scale",
            min: 2,
            max: 4,
            step: 1,
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
    featured: false,
    tagline: "One offer, three registers of copy, five headlines and a hero image.",
    description:
      "Type the offer once. Three agents run side by side: ad copy written plain, playful and premium; five headlines each taking a different angle; and a hero image whose prompt stays visible so it can be corrected rather than guessed at.",
    note: "🔑 Needs an OpenAI key for the writing and a FAL key for the image.",
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
          "Aurora Trail running shoes: a third lighter than last season, grip that holds on wet rock, launching this Friday"
      }
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
        id: "headlines",
        name: "Headlines",
        workflow: "headlines",
        policy: "parallel",
        inputs: { offer: { from: "variable", variableId: "offer" } }
      },
      {
        id: "visual",
        name: "Visual",
        workflow: "visual",
        policy: "parallel",
        inputs: { idea: { from: "variable", variableId: "offer" } }
      }
    ],
    sections: [
      {
        title: "The offer",
        controls: [
          { textVar: "offer", label: "What are you advertising?", multiline: true },
          { run: ["copy", "headlines", "visual"], label: "Make the ad" }
        ],
        results: [
          { progress: "copy", label: "Writing copy…" },
          { show: "variants", op: "copy", as: "Markdown", label: "Ad copy", demo: "**Plain**\nAurora Trail. A third lighter. Grips wet rock. Out Friday.\n\n**Playful**\nYour old shoes just got a text: it's over.\n\n**Premium**\nEngineered for the ground that gives nothing back." },
          { show: "headlines", op: "headlines", as: "Markdown", label: "Headlines", demo: "1. Lighter than your excuses\n2. Grip that argues with gravity\n3. Built for the rock, not the treadmill" },
          { show: "image", op: "visual", as: "Image", label: "Hero image", demo: IMG },
          { show: "prompt_used", op: "visual", as: "Markdown", label: "Prompt used" }
        ]
      }
    ]
  }
];
