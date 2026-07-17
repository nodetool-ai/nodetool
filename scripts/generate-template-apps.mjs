// Generates app-builder mini apps for the shipped workflow templates.
//
// For every example in packages/base-nodes/nodetool/examples/nodetool-base/:
//  1. Graphs that end without an Output node get one appended per displayable
//     terminal node (AUGMENT table below — explicit ids/handles, no guessing),
//     so the mini app has something to show.
//  2. Templates get an `app_doc` generated from the CURATION table: a
//     consistent, non-technical layout — heading, tagline, a "Try it" panel
//     with friendly input widgets (text fields, sliders bound to node
//     properties, selects for enum-like inputs) and one Run button, and a
//     results panel with one display widget per workflow output (plus an
//     optional progress bar and a "Make another" gallery button).
//  3. Every template is exported to web/public/app-preview/<slug>.json with
//     seeded demo values, which the app-preview page renders for marketing
//     screenshots. Template card art is copied to
//     web/public/app-preview/img/<slug>.jpg for image demos. Stale bundles for
//     retired/merged templates are pruned.
//
// Per-template presentation is data, not code: extend the CURATION entry, not
// this file. Supported hint keys:
//   emoji, tagline, button, note           — copy
//   inputs   { name: { label, ... } }       — (labels flow through WorkflowInput)
//   outputs  { name: { widget, label } }     — display widget per output
//   demo     { name: value | IMG/VIDEO/AUDIO } — seeded preview value
//   sliders  [ { node, property | input, label, min, max, step, pace, default } ]
//                                            — slider bound to a node property
//                                              (node+property) or a workflow
//                                              input (input); runs on change.
//   selects  { inputName: { label, options[], pace, run } }
//                                            — dropdown for an enum-like input.
//   seeds    { inputName: value }            — fill a missing input default so
//                                              first Run works with zero typing.
//   gallery  { output, button }              — render an append-disposition
//                                              output as a grid, with a
//                                              "Make another" run button.
//   progress true | "Label"                  — a progress bar in the results
//                                              panel for runs over a few seconds.
//   featured true                            — hero app (leads the /apps index).
//
// Idempotent: deterministic ids, stable output. Re-run after editing a
// template or the curation table:  node scripts/generate-template-apps.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES = path.join(
  ROOT,
  "packages/base-nodes/nodetool/examples/nodetool-base"
);
const ART = path.join(ROOT, "packages/base-nodes/nodetool/assets/nodetool-base");
const PREVIEW = path.join(ROOT, "web/public/app-preview");

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// ── Output augmentation ──────────────────────────────────────────────────────
// Templates whose graphs end without an Output/Preview node. Each entry wires a
// `nodetool.output.Output` from the named terminal node so results surface in
// the app. Entries whose output node already exists in the graph are skipped
// (no-op), so this only fires for graphs that genuinely lack a sink.
const AUGMENT = {
  "Audio To Image": [
    { terminal: "8b07b1ed-2ce9-4581-993e-efad334ab7a8", handle: "output", name: "image" }
  ],
  "Color Boost Video": [
    { terminal: "4ca8874f-5caa-413c-a329-936d90358e8e", handle: "output", name: "graded_video" }
  ],
  "Hacker News Agent": [{ terminal: "2", handle: "output", name: "analysis" }],
  "Image Enhance": [
    { terminal: "4c9c6b63-646a-4da9-8794-abd180c59041", handle: "output", name: "enhanced_image" }
  ],
  "Image To Audio Story": [
    { terminal: "ffb9de38-7e20-4f07-afa8-6b2a0423315f", handle: "audio", name: "narration" }
  ],
  "Image to Video Animation": [{ terminal: "2", handle: "output", name: "animation" }],
  "Movie Trailer Generator": [
    { terminal: "b8622937-e6d7-445f-bb19-e254b49a23ef", handle: "output", name: "trailer" }
  ],
  "Music Video Visualizer": [
    { terminal: "final_video", handle: "output", name: "music_video" }
  ],
  "Photo Enhancement Suite": [
    { terminal: "2", handle: "output", name: "enhanced_photos" }
  ],
  "Pokemon Maker": [
    { terminal: "b55c474e-e397-44a3-adc7-94bcf61eee35", handle: "output", name: "pokemon" }
  ],
  "Product Mockup Generator": [
    { terminal: "2", handle: "output", name: "mockup" },
    { terminal: "15", handle: "output", name: "scene" }
  ],
  "Product Video Generator": [
    { terminal: "97f03868-da4f-4604-b57e-5f2118847956", handle: "output", name: "product_video" }
  ],
  "Social Media Calendar Filler": [
    { terminal: "collected_images", handle: "output", name: "post_images" },
    { terminal: "collected_captions", handle: "output", name: "captions" }
  ],
  "Summarize RSS": [
    { terminal: "0659612a-1a3b-471b-b397-6ec97e33882f", handle: "text", name: "summary" }
  ],
  "Transcribe Audio": [
    { terminal: "c5191702-2a3c-440d-b3af-2db20e74a369", handle: "text", name: "transcript" }
  ]
};

// ── Curation ─────────────────────────────────────────────────────────────────
// Per-template copy and presentation. `outputs` maps output name → widget kind
// (+ label); `demo` seeds the marketing screenshot: strings render as Markdown
// text, IMG/VIDEO/AUDIO tokens become the template art / a generated clip /
// a generated waveform in the preview page. `inputs` overrides labels and
// placeholders; anything uncurated falls back to sensible defaults.
const IMG = { $demo: "image" };
const VIDEO = { $demo: "video" };
const AUDIO = { $demo: "audio" };

const CURATION = {
  "Ad Creative Factory": {
    emoji: "🎬",
    tagline:
      "Turn one product photo and one offer into a batch of ready-to-test video ads.",
    button: "Generate my ads",
    layout: "columns",
    progress: "Cutting your ads…",
    inputs: {
      product_offer: { label: "Product & offer", multiline: true },
      audience: { label: "Who is it for?", multiline: true },
      variant_count: { label: "How many ad variants?" }
    },
    note: "📷 Uses the bundled product photo — swap in your own in NodeTool Studio.",
    outputs: {
      hooks: { widget: "Markdown", label: "Hook ideas" },
      finished_ads: { widget: "Video", label: "Finished ads" }
    },
    demo: {
      hooks:
        "1. **“Your watch is lying to you.”** Hard cut to the Aurora Trail's GPS trace.\n2. **“I hiked 14 miles and my phone stayed in my pocket.”**\n3. **“POV: your smartwatch actually coaches you.”**",
      finished_ads: VIDEO
    }
  },
  "Audio To Image": {
    emoji: "🎙️",
    tagline: "Describe a scene out loud — get it back as a picture.",
    button: "Turn my voice into art",
    layout: "stacked",
    progress: "Listening & painting…",
    note: "🎧 Uses the bundled voice memo — record your own in NodeTool Studio.",
    outputs: { image: { widget: "Image", label: "Your scene, visualized" } },
    demo: { image: IMG }
  },
  "Brand Asset Generator": {
    emoji: "🎨",
    tagline: "Type your brand name and vibe — get logo-ready visuals in seconds.",
    button: "Generate brand assets",
    layout: "columns",
    featured: true,
    progress: "Designing your assets…",
    inputs: {
      brand_name: { label: "Brand name" },
      tagline: { label: "Tagline" },
      primary_color: { label: "Primary color", placeholder: "#3498db" },
      brand_description: { label: "Describe your brand", multiline: true }
    },
    outputs: {
      social_assets: { widget: "Image", label: "Your brand assets" },
      brand_brief: { widget: "Markdown", label: "Brand brief" }
    },
    demo: {
      social_assets: IMG,
      brand_brief:
        "**Aurora Labs — brand direction.** Warm, optimistic, human. Nature meets precision engineering. Voice: friendly and confident, never corporate. Palette anchored on `#2F8F6B`."
    }
  },
  "Chat With Your Documents": {
    emoji: "📄",
    tagline:
      "Ask questions about your own documents — answers cite their source and refuse to guess.",
    button: "Ask",
    layout: "columns",
    progress: "Searching your knowledge base…",
    inputs: {
      question: { label: "Your question", multiline: true },
      search: { label: "Search keyword" },
      doc_specs: { label: "Document: specs", multiline: true },
      doc_charging: { label: "Document: charging", multiline: true },
      doc_warranty: { label: "Document: warranty", multiline: true }
    },
    outputs: {
      Answer: { widget: "Markdown", label: "Answer" },
      "Retrieved Passages": { widget: "Markdown", label: "Sources used" }
    },
    demo: {
      Answer:
        "The Aurora Trail is rated for **50 m water resistance** (5 ATM) — fine for swimming and rain, not for diving. *[source: specs]*",
      "Retrieved Passages":
        "> **specs** — Water resistance: 5 ATM (50 m). Case: recycled aluminium.\n> **warranty** — Water damage is covered for 2 years under normal use."
    }
  },
  "Cold Outreach Co-Pilot": {
    emoji: "✉️",
    tagline:
      "An agent researches your prospect and writes a cold email that opens with a real, specific detail.",
    button: "Research & write my email",
    layout: "columns",
    progress: "Researching your prospect…",
    inputs: {
      "Prospect / Company": { label: "Who are you reaching out to?" },
      "Your Offer": { label: "What are you offering?", multiline: true }
    },
    outputs: {
      company_summary: { widget: "Markdown", label: "Company research" },
      pain_points: { widget: "Markdown", label: "Pain points found" },
      subject: { widget: "Markdown", label: "Subject line" },
      body: { widget: "Markdown", label: "Email body" },
      follow_up: { widget: "Markdown", label: "Follow-up" }
    },
    demo: {
      company_summary:
        "**AtlasCloud** — Series B infra startup, ~120 people. Just launched a managed Postgres product; hiring 8 platform engineers.",
      pain_points:
        "- Docs mention manual failover runbooks\n- Careers page hints at on-call fatigue\n- CTO tweeted about “yak-shaving in CI” last week",
      subject: "that CI yak-shave your CTO tweeted about",
      body:
        "Hi Sara — saw Marcus's thread on CI pipelines eating platform time. We build NodeTool, a visual AI workspace teams use to automate exactly that class of glue work…",
      follow_up:
        "Circling back — happy to send a 2-minute Loom of the failover runbook automation if it's useful."
    }
  },
  "Color Boost Video": {
    emoji: "🌈",
    tagline: "Give any clip a cinematic color grade — drag one slider, watch it apply.",
    button: "Boost my video",
    layout: "stacked",
    progress: "Grading every frame…",
    note: "🎞️ Uses the bundled sample clip — drop in your own in NodeTool Studio.",
    sliders: [
      {
        input: "grading_intensity",
        label: "Grading intensity",
        min: 0,
        max: 1,
        step: 0.05,
        pace: "release"
      }
    ],
    outputs: { graded_video: { widget: "Video", label: "Graded clip" } },
    demo: { graded_video: VIDEO }
  },
  "Concept Art Iteration Board": {
    emoji: "🖌️",
    tagline: "Fan one brief into a gallery of concept-art variations — keep the ones you like.",
    button: "Generate concept art",
    layout: "columns",
    featured: true,
    progress: "Rendering variations…",
    inputs: {
      creative_brief: { label: "Creative brief", multiline: true },
      mood_keywords: { label: "Mood keywords" },
      variations: { label: "How many variations?" }
    },
    selects: {
      art_style: {
        label: "Art style",
        options: [
          "Painterly digital concept art, dramatic cinematic lighting, rich saturated color, visible brushwork, AAA game key art",
          "Ink and wash, monochrome, loose gestural linework",
          "Photobash realism, moody atmospheric haze, volumetric light",
          "Flat vector, bold shapes, limited palette",
          "Anime background art, soft gradients, golden-hour light"
        ]
      }
    },
    gallery: { output: "Concept Art", button: "Generate more variations" },
    outputs: { "Concept Art": { widget: "Image", label: "Concept art" } },
    demo: { "Concept Art": IMG }
  },
  "Conditional Logic Engine": {
    emoji: "🔀",
    tagline: "A teaching example: one number routes down a high or low branch.",
    button: "Run the logic",
    inputs: { value: { label: "Enter a number (0–100)" } },
    outputs: { Result: { widget: "Markdown", label: "Result" } },
    demo: { Result: "**75** → routed to the *high* branch: “Excellent — above the 70 threshold.”" }
  },
  "Data Generator": {
    emoji: "🧮",
    tagline: "Describe the dataset you need — an agent generates it, structured and ready.",
    button: "Generate data",
    layout: "columns",
    progress: "Generating rows…",
    inputs: {
      topic: { label: "What data do you need?", multiline: true },
      row_count: { label: "How many rows?" }
    },
    outputs: { generated_data: { widget: "Json", label: "Generated dataset" } },
    demo: {
      generated_data: [
        { city: "Lisbon", population: 545000, seaside: true },
        { city: "Porto", population: 231000, seaside: true },
        { city: "Coimbra", population: 106000, seaside: false }
      ]
    }
  },
  "Flashcard Generator": {
    emoji: "🃏",
    tagline: "Type a topic — get study flashcards as structured cards, saved for review.",
    button: "Make flashcards",
    layout: "columns",
    progress: "Writing cards…",
    inputs: {
      topic: { label: "Study topic", multiline: true },
      num_cards: { label: "How many cards?" }
    },
    outputs: { Flashcards: { widget: "Json", label: "Flashcards" } },
    demo: {
      Flashcards: [
        { front: "What does len() return for a dict?", back: "The number of keys." },
        { front: "List vs tuple?", back: "Lists are mutable; tuples are not." }
      ]
    }
  },
  "Hacker News Agent": {
    emoji: "🗞️",
    tagline: "Give it a topic — get a smart digest of what Hacker News is saying about it.",
    button: "Analyze the front page",
    layout: "stacked",
    progress: "Reading the front page…",
    inputs: { topic: { label: "Topic to dig into" } },
    outputs: { analysis: { widget: "Markdown", label: "Today's digest" } },
    demo: {
      analysis:
        "**Today on HN:** local-first software is having a moment — three of the top ten posts cover sync engines. The comment section consensus: SQLite keeps winning.\n\n**Worth your time:** a deep-dive on how coding agents are trained (412 points)."
    }
  },
  "Hook & Thumbnail Factory": {
    emoji: "🪝",
    tagline: "Give it a video topic — get scroll-stopping hooks and a gallery of matching thumbnails.",
    button: "Make hooks & thumbnails",
    layout: "columns",
    featured: true,
    progress: "Writing hooks & rendering thumbnails…",
    inputs: {
      "Video Topic": { label: "What's your video about?", multiline: true },
      "Target Audience": { label: "Who's watching?" },
      "Number of Hooks": { label: "How many hooks?" }
    },
    gallery: { output: "thumbnail_gallery", button: "Make another set" },
    outputs: {
      thumbnail_gallery: { widget: "Image", label: "Thumbnail gallery" },
      hooks: { widget: "Markdown", label: "Hook ideas" },
      thumbnail: { widget: "Image", label: "Featured thumbnail" }
    },
    demo: {
      hooks:
        "1. “You're losing $100/month by not knowing this.”\n2. “Einstein called it the 8th wonder. Banks hope you never learn it.”\n3. “$5 a day → $1M. Here's the math nobody shows you.”",
      thumbnail_gallery: IMG,
      thumbnail: IMG
    }
  },
  "Image Enhance": {
    emoji: "✨",
    tagline:
      "A live photo editor: drag Denoise, Brightness, Contrast, Saturation, and Sharpen — the preview re-renders on release.",
    button: "Enhance my photo",
    layout: "columns",
    featured: true,
    progress: "Running the filter chain…",
    note: "🖼️ Uses the bundled sample photo — drop in your own in NodeTool Studio.",
    // Each slider drives a real property on a GPU filter node. `pace: "release"`
    // re-runs the chain when the drag settles, not on every pixel of movement.
    sliders: [
      { node: "denoise-node", property: "radius", label: "Denoise", min: 0, max: 16, step: 0.5, default: 0, pace: "release" },
      { node: "tone-node", property: "brightness", label: "Brightness", min: -1, max: 1, step: 0.05, default: 0.05, pace: "release" },
      { node: "tone-node", property: "contrast", label: "Contrast", min: 0, max: 4, step: 0.05, default: 1.15, pace: "release" },
      { node: "color-node", property: "saturation", label: "Saturation", min: 0, max: 4, step: 0.05, default: 1.2, pace: "release" },
      { node: "sharpen-node", property: "amount", label: "Sharpen", min: 0, max: 4, step: 0.05, default: 1, pace: "release" }
    ],
    outputs: { enhanced_image: { widget: "Image", label: "Enhanced photo" } },
    demo: { enhanced_image: IMG }
  },
  "Image To Audio Story": {
    emoji: "🔊",
    tagline: "Point it at a picture — hear the story it tells, narrated aloud.",
    button: "Tell me its story",
    layout: "stacked",
    progress: "Writing & narrating…",
    note: "🖼️ Uses the bundled sample image — swap in any picture in NodeTool Studio.",
    outputs: { narration: { widget: "Audio", label: "Narrated story" } },
    demo: { narration: AUDIO }
  },
  "Image to Video Animation": {
    emoji: "🎥",
    tagline: "Type a scene — get a still, then watch it come alive as a cinematic clip.",
    button: "Animate my scene",
    layout: "columns",
    progress: "Animating your scene…",
    note: "💸 Uses the veo video model — a real run costs credits. Preview shows a sample.",
    inputs: {
      scene_prompt: { label: "Describe the scene", multiline: true },
      motion_prompt: { label: "How should it move?", multiline: true },
      duration_prompt: { label: "Length & pacing" },
      negative_prompt: { label: "What to avoid", multiline: true }
    },
    outputs: { animation: { widget: "Video", label: "Your animated clip" } },
    demo: { animation: VIDEO }
  },
  "Meeting Transcript Summarizer": {
    emoji: "📝",
    tagline: "Drop in a meeting recording — get the transcript, notes, and action items back.",
    button: "Summarize my meeting",
    layout: "columns",
    progress: "Transcribing & summarizing…",
    note: "🎧 Uses the bundled recording — upload your own in NodeTool Studio.",
    outputs: {
      Summary: { widget: "Markdown", label: "Meeting notes" },
      Transcript: { widget: "Markdown", label: "Full transcript" },
      "Action Items": { widget: "Json", label: "Action items" }
    },
    demo: {
      Summary:
        "**Decisions**\n- Ship the pricing page Friday\n- Maya owns the launch email",
      Transcript:
        "“…okay so if we're all aligned, let's lock Friday for the pricing page. Jonas, can you take the trial-expiry bug before Wednesday?…”",
      "Action Items": [
        { owner: "Jonas", task: "Fix the trial-expiry bug", due: "Wed" },
        { owner: "Priya", task: "Draft support FAQ", due: "Fri" }
      ]
    }
  },
  "Model Arena": {
    emoji: "⚖️",
    tagline: "One brief, three frontier models, answered side by side.",
    button: "Compare the models",
    layout: "columns",
    progress: "Asking three models…",
    inputs: {
      brief: { label: "Your brief", multiline: true },
      context: { label: "Extra context", multiline: true }
    },
    outputs: {
      openai: { widget: "Markdown", label: "OpenAI" },
      anthropic: { widget: "Markdown", label: "Anthropic" },
      gemini: { widget: "Markdown", label: "Google" }
    },
    demo: {
      openai:
        "**OpenAI (gpt-5-mini):** Leads with a crisp 3-point structure, hedges on the edge case, ships a concrete next step.",
      anthropic:
        "**Anthropic (Claude):** Longer reasoning, names the tradeoff explicitly, flags one risk the others miss.",
      gemini:
        "**Google (Gemini):** Tightest answer, strongest on the factual recall, lightest on caveats."
    }
  },
  "Movie Posters": {
    emoji: "🎬",
    tagline: "One title, one genre, one style — get a finished movie poster.",
    button: "Make my poster",
    layout: "columns",
    featured: true,
    progress: "Designing your poster…",
    inputs: {
      "Movie Title": { label: "Movie title" },
      "Visual Style": { label: "Visual style", multiline: true }
    },
    selects: {
      Genre: {
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
      }
    },
    outputs: { Poster: { widget: "Image", label: "Your poster" } },
    demo: { Poster: IMG }
  },
  "Movie Trailer Generator": {
    emoji: "🍿",
    tagline: "Type one logline — get a cinematic teaser cut shot-by-shot.",
    button: "Cut my trailer",
    layout: "columns",
    progress: "Cutting your trailer…",
    note: "💸 Uses the veo video model — a real run costs credits. Preview shows a sample.",
    inputs: {
      Logline: { label: "Your movie in one sentence", multiline: true },
      "Visual Style": { label: "Visual style", multiline: true },
      "Shot Count": { label: "Number of shots" }
    },
    outputs: { trailer: { widget: "Video", label: "Your teaser" } },
    demo: { trailer: VIDEO }
  },
  "Music Video Visualizer": {
    emoji: "🎵",
    tagline: "Feed it a track — get mood-matched visuals cut to your music.",
    button: "Visualize my track",
    layout: "columns",
    featured: true,
    progress: "Matching visuals to your track…",
    note: "🎧 Uses the bundled track — drop in your own audio in NodeTool Studio.",
    inputs: {
      genre_hint: { label: "Genre" },
      visual_style: { label: "Visual style", multiline: true },
      num_frames: { label: "Number of scenes" }
    },
    outputs: { music_video: { widget: "Video", label: "Your music video" } },
    demo: { music_video: VIDEO }
  },
  "Photo Enhancement Suite": {
    emoji: "🖼️",
    tagline: "Batch-enhance a set of photos — tune brightness and color, run the whole retouch chain.",
    button: "Enhance my photos",
    layout: "columns",
    progress: "Retouching each photo…",
    note: "🖼️ Drop in a list of photos in NodeTool Studio — no folder path needed.",
    sliders: [
      { input: "brightness_adjust", label: "Brightness", min: 0.5, max: 1.5, step: 0.05, pace: "release" },
      { input: "color_boost", label: "Color boost", min: 0, max: 2, step: 0.05, pace: "release" }
    ],
    outputs: {
      enhanced_photos: { widget: "Image", label: "Enhanced photos" }
    },
    demo: { enhanced_photos: IMG }
  },
  "Podcast Repurposing Studio": {
    emoji: "🎙️",
    tagline:
      "One episode in — show notes, a newsletter, social posts, and quote cards out.",
    button: "Repurpose my episode",
    layout: "columns",
    progress: "Repurposing your episode…",
    note: "🎧 Uses the bundled episode — upload your own audio in NodeTool Studio.",
    inputs: {
      show_context: { label: "About your show", multiline: true },
      quote_count: { label: "Quote cards to make" }
    },
    outputs: {
      show_notes: { widget: "Markdown", label: "Show notes" },
      newsletter: { widget: "Markdown", label: "Newsletter" },
      social_posts: { widget: "Markdown", label: "Social posts" },
      quote_cards: { widget: "Image", label: "Quote cards" }
    },
    demo: {
      show_notes:
        "**Ep. 42 — Ultralight, Ultra-Right**\nMaya breaks down the 5 lb base-weight myth, when titanium is worth it, and the one luxury item every guest keeps.",
      newsletter:
        "**This week on Trailhead:** the gear-weight episode everyone's been asking for. Maya's take: your fear costs you more ounces than your stove…",
      social_posts:
        "1. Your backpack isn't heavy. Your worst-case-scenario planning is. 🎒 New ep out now.\n2. “Titanium is a lifestyle, not a metal.” — this week's guest",
      quote_cards: IMG
    }
  },
  "Pokemon Maker": {
    emoji: "🐉",
    tagline: "Mix any animals you like — meet the gallery of creatures they become.",
    button: "Create my creatures",
    layout: "columns",
    featured: true,
    progress: "Designing your creatures…",
    inputs: {
      animals: { label: "Mix these animals", placeholder: "lion, eagle, koi fish" }
    },
    gallery: { output: "pokemon", button: "Make another batch" },
    outputs: { pokemon: { widget: "Image", label: "Your creatures" } },
    demo: { pokemon: IMG }
  },
  "Private Assistant": {
    emoji: "🔒",
    tagline: "Ask questions about your own notes — fully local, no API keys.",
    button: "Ask locally",
    layout: "columns",
    progress: "Thinking locally…",
    note: "🖥️ Runs end-to-end on a local Ollama model — your text never leaves your machine (needs Ollama running with a model pulled).",
    inputs: {
      document: { label: "Your notes / document", multiline: true },
      question: { label: "Your question", multiline: true }
    },
    selects: {
      tone: {
        label: "Answer tone",
        options: [
          "concise and neutral",
          "friendly and warm",
          "professional",
          "detailed and thorough",
          "plain and simple"
        ]
      }
    },
    outputs: { answer: { widget: "Markdown", label: "Answer" } },
    demo: {
      answer:
        "Based on your notes: the standup moved to **9:30am on Tuesdays**, and Priya is covering the on-call rotation next week."
    }
  },
  "Product Mockup Generator": {
    emoji: "📦",
    tagline: "Turn one product shot into a set of polished lifestyle mockups.",
    button: "Generate mockups",
    layout: "columns",
    featured: true,
    progress: "Staging your mockups…",
    note: "📷 Uses the bundled product photo — swap in yours in NodeTool Studio.",
    inputs: {
      product_name: { label: "Product name" },
      product_description: { label: "Describe the product", multiline: true },
      target_audience: { label: "Who's it for?", multiline: true },
      num_scenes: { label: "How many scenes?" }
    },
    outputs: {
      mockup: { widget: "Image", label: "Hero mockup" },
      scene: { widget: "Image", label: "Lifestyle scene" }
    },
    demo: { mockup: IMG, scene: IMG }
  },
  "Product Video Generator": {
    emoji: "📺",
    tagline: "Brief in, launch video out — a realistic 16:9 spot for your product.",
    button: "Generate launch video",
    layout: "columns",
    progress: "Producing your spot…",
    note: "💸 Uses the veo video model — a real run costs credits. Preview shows a sample.",
    inputs: {
      campaign_brief: { label: "Campaign brief", multiline: true },
      target_audience: { label: "Target audience", multiline: true },
      key_features: { label: "Key features", multiline: true }
    },
    outputs: { product_video: { widget: "Video", label: "Launch video" } },
    demo: { product_video: VIDEO }
  },
  "Prompt Template": {
    emoji: "🧩",
    tagline: "The starter pattern: typed inputs fill a prompt, an LLM answers, the output renders.",
    button: "Explain it",
    layout: "columns",
    inputs: {
      Topic: { label: "Topic" },
      Audience: { label: "Explain it to…" }
    },
    outputs: { Explanation: { widget: "Markdown", label: "Explanation" } },
    demo: {
      Explanation:
        "**Photosynthesis, for a curious 10-year-old:** plants are tiny chefs. They take sunlight, water, and the air you breathe out, and cook it into sugar — their food. The leftover? The oxygen *you* breathe in."
    }
  },
  "Research Agent": {
    emoji: "🕵️",
    tagline: "Give it a topic and audience — the agent searches, browses, and streams back a cited brief.",
    button: "Run the research",
    layout: "columns",
    progress: "Searching & browsing sources…",
    inputs: {
      topic: { label: "Research topic", multiline: true },
      audience: { label: "Who is it for?", multiline: true }
    },
    outputs: { brief: { widget: "Markdown", label: "Research brief" } },
    demo: {
      brief:
        "**On-device LLMs — briefing for a product team.**\n\n- **State of play:** 3–8B models now run usably on laptops and high-end phones. *[1]*\n- **Tradeoff:** ~half the quality of frontier models, but zero API cost and full privacy. *[2]*\n- **Recommendation:** ship a local tier for privacy-sensitive flows; keep cloud for hard reasoning.\n\n_Sources: [1] ollama.com, [2] arXiv:2404.xxxxx_"
    }
  },
  "Research Paper Summarizer": {
    emoji: "🔬",
    tagline: "Name a topic — get the key paper summarized in plain terms.",
    button: "Summarize the research",
    layout: "stacked",
    progress: "Reading the paper…",
    inputs: { topic: { label: "Research topic" } },
    outputs: { Summary: { widget: "Markdown", label: "Summary" } },
    demo: {
      Summary:
        "**Attention Is All You Need — in plain terms:** the paper replaces recurrence entirely with attention, trains 10× faster, and sets new translation records. The trick: let every word look at every other word at once."
    }
  },
  "SEO Content Engine": {
    emoji: "📈",
    tagline: "One topic in — a keyword-targeted article batch out, with hero images.",
    button: "Plan & write my articles",
    layout: "columns",
    progress: "Planning & drafting…",
    inputs: {
      business: { label: "Your business", multiline: true },
      audience_and_seeds: { label: "Audience & seed topics", multiline: true },
      article_count: { label: "Articles to write" }
    },
    outputs: {
      content_plan: { widget: "Markdown", label: "Content plan" },
      article_titles: { widget: "Markdown", label: "Article titles" },
      meta_descriptions: { widget: "Markdown", label: "Meta descriptions" },
      keywords: { widget: "Markdown", label: "Keywords" },
      article_bodies: { widget: "Markdown", label: "Articles" },
      hero_images: { widget: "Image", label: "Hero images" }
    },
    demo: {
      content_plan:
        "**Cluster: first-gear decisions**\n1. Ultralight backpacks under $200 (KD 18)\n2. Trail runners vs. hiking boots (KD 22)\n3. The 10 essentials, minimalist edition (KD 12)",
      article_titles:
        "1. Trail Runners vs. Hiking Boots: What Beginners Actually Need\n2. Ultralight Backpacks Under $200 That Don't Cut Corners",
      meta_descriptions:
        "Skip the ankle-support myth. Here's what first-time hikers really need on their feet — and what to save money on.",
      keywords: "trail runners for hiking, beginner hiking shoes, ultralight backpack under 200",
      article_bodies:
        "**Trail runners vs. hiking boots: what beginners actually need**\n\nYou don't need ankle support. You need to stop buying footwear for a hike you're not doing…",
      hero_images: IMG
    }
  },
  "Social Media Calendar Filler": {
    emoji: "📅",
    tagline: "Fill a month of social posts — a structured calendar with an image for every row.",
    button: "Fill my calendar",
    layout: "columns",
    progress: "Filling your calendar…",
    inputs: {
      brand_name: { label: "Brand name" },
      monthly_theme: { label: "This month's theme", multiline: true },
      target_audience: { label: "Audience", multiline: true },
      brand_voice: { label: "Brand voice", multiline: true },
      posts_per_week: { label: "Posts per week" }
    },
    outputs: {
      content_calendar: { widget: "Json", label: "Content calendar" },
      post_images: { widget: "Image", label: "Post visuals" },
      captions: { widget: "Markdown", label: "Captions & hashtags" }
    },
    demo: {
      content_calendar: [
        { day: "Mon", hook: "Your team isn't slow. Your handoffs are.", format: "carousel" },
        { day: "Wed", hook: "We measured 30 days of context-switching.", format: "single" }
      ],
      post_images: IMG,
      captions:
        "**Mon** — Your team isn't slow. Your handoffs are. Here's the fix 🧵\n#productivity #automation\n\n**Wed** — We measured 30 days of context-switching. The results hurt.\n#futureofwork"
    }
  },
  "Summarize RSS": {
    emoji: "📰",
    tagline: "Your feed, read for you — paste a URL, get a clean daily brief.",
    button: "Brief me",
    layout: "stacked",
    progress: "Reading your feed…",
    inputs: { feed_url: { label: "RSS feed URL", placeholder: "https://…/feed.xml" } },
    outputs: { summary: { widget: "Markdown", label: "Today's brief" } },
    demo: {
      summary:
        "**Today's brief:** EU passes the AI liability directive; two labs ship smaller on-device models; and a solo dev's local-first note app tops Product Hunt."
    }
  },
  "Transcribe Audio": {
    emoji: "🎤",
    tagline: "Speech to text with word-level timestamps — paste-ready in seconds.",
    button: "Transcribe",
    layout: "stacked",
    progress: "Transcribing…",
    note: "🎧 Uses the bundled recording — upload any audio in NodeTool Studio.",
    outputs: { transcript: { widget: "Markdown", label: "Transcript" } },
    demo: {
      transcript:
        "“Welcome back to the show. **[00:00:02]** Today we're talking about why the best product demos tell a story **[00:00:07]** instead of listing features…”"
    }
  },
  "Workflow As A Tool": {
    emoji: "🧰",
    tagline: "An orchestrator agent delegates to specialist sub-agents wired in as callable tools.",
    button: "Run the team",
    layout: "columns",
    progress: "Delegating to sub-agents…",
    inputs: { topic: { label: "Topic to write about", multiline: true } },
    outputs: { article: { widget: "Markdown", label: "Finished article" } },
    demo: {
      article:
        "**The quiet rise of local-first software.**\n\nResearch (Gemini) gathered the facts; a Copy Editor (Claude) tightened the prose; the manager stitched them into one draft — a composition no single agent wrote alone."
    }
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const humanize = (name) =>
  String(name)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

// Encode a node-property binding the way the app runtime reads it (nodeBinding.ts).
const nodePropertyBinding = (nodeId, property) => `node:${nodeId}#${property}`;

// Every plain input renders as a WorkflowInput widget: the app runtime resolves
// the right control (text/number/media picker/model select) from the InputNode's
// type. An enum-like input curated with `selects` renders as a dropdown instead.
function widgetForInput(node, curated) {
  const name = node.data?.name;
  if (!name) return null;
  const sel = curated?.selects?.[name];
  if (sel) {
    return {
      type: "Select",
      props: {
        id: `in-${slugify(name)}`,
        binding: name,
        label: sel.label ?? humanize(name),
        options: (sel.options ?? []).map((v) => ({ value: v })),
        events: sel.run
          ? [{ trigger: "change", kind: "run", pace: sel.pace ?? "live", key: "", value: "" }]
          : []
      }
    };
  }
  return {
    type: "WorkflowInput",
    props: { id: `in-${slugify(name)}`, binding: name, events: [] }
  };
}

// A slider drives either a node property (node + property) or a workflow input
// (input). Dragging dispatches a run; pace decides whether that fires live or on
// release. Ranges come straight from the curation entry.
function sliderWidget(entry) {
  const binding = entry.input
    ? entry.input
    : nodePropertyBinding(entry.node, entry.property);
  const idBase = entry.input ?? `${entry.node}-${entry.property}`;
  return {
    type: "Slider",
    props: {
      id: `slider-${slugify(idBase)}`,
      binding,
      label: entry.label ?? humanize(entry.property ?? entry.input ?? "value"),
      min: entry.min ?? 0,
      max: entry.max ?? 100,
      step: entry.step ?? 1,
      events: [
        { trigger: "change", kind: "run", pace: entry.pace ?? "release", key: "", value: "" }
      ]
    }
  };
}

function widgetForOutput(name, spec) {
  const id = `out-${slugify(name)}`;
  const widget = spec?.widget ?? "Markdown";
  const base = { id, binding: name };
  if (widget === "Image") return { type: "Image", props: { ...base, fit: "contain", height: 280, placeholder: "Your result appears here" } };
  if (widget === "Video") return { type: "Video", props: { ...base, height: 320, placeholder: "Your video appears here" } };
  if (widget === "Audio") return { type: "Audio", props: { ...base, placeholder: "Your audio appears here" } };
  if (widget === "Json") return { type: "Json", props: base };
  return { type: "Markdown", props: { ...base, text: "" } };
}

function buildAppDoc(example, curated) {
  const name = example.name;
  const graph = example.graph;
  const tagline = curated?.tagline ?? example.description?.split(/\.\s/)[0] ?? "";
  const button = curated?.button ?? "Run";

  const inputNodes = graph.nodes.filter((n) => n.type.startsWith("nodetool.input."));
  const outputNodes = graph.nodes.filter(
    (n) => n.type.includes(".output.") || n.type.endsWith("base_node.Preview")
  );

  const sliders = curated?.sliders ?? [];
  // A slider bound to a workflow input replaces that input's default widget.
  const sliderInputs = new Set(sliders.filter((s) => s.input).map((s) => s.input));

  const inputWidgets = inputNodes
    .filter((n) => !sliderInputs.has(n.data?.name))
    .map((n) => widgetForInput(n, curated))
    .filter(Boolean);

  const tryItems = [...inputWidgets, ...sliders.map(sliderWidget)];
  tryItems.push({
    type: "Button",
    props: {
      id: "btn-run",
      label: button,
      variant: "contained",
      color: "primary",
      events: [{ trigger: "click", kind: "run", key: "", value: "" }]
    }
  });

  const displayNodes = outputNodes.filter(
    (n) => (n.data?.name || n.id) !== "chunk"
  );
  const showHeadings = displayNodes.length > 1;

  const resultItems = [];
  if (curated?.progress) {
    resultItems.push({
      type: "Progress",
      props: {
        id: "progress-run",
        label: typeof curated.progress === "string" ? curated.progress : "Working…",
        binding: ""
      }
    });
  }
  for (const n of displayNodes) {
    const outName = n.data?.name || n.id;
    const spec = curated?.outputs?.[outName] ?? curated?.outputs?.__first;
    const label = spec?.label ?? humanize(outName);
    if (showHeadings) {
      resultItems.push({
        type: "Heading",
        props: { id: `lbl-${slugify(outName)}`, text: label, level: "3" }
      });
    }
    resultItems.push(widgetForOutput(outName, spec));
    // An append-disposition gallery gets a "Make another" run button beneath it.
    if (curated?.gallery && curated.gallery.output === outName) {
      resultItems.push({
        type: "Button",
        props: {
          id: "btn-make-another",
          label: curated.gallery.button ?? "Make another",
          variant: "outlined",
          color: "primary",
          events: [{ trigger: "click", kind: "run", key: "", value: "" }]
        }
      });
    }
  }

  const tryPanel = {
    type: "Container",
    props: { id: "panel-try", title: "Try it", content: tryItems }
  };
  const resultsPanel = {
    type: "Container",
    props: { id: "panel-results", title: "Results", content: resultItems }
  };

  const content = [];
  if (tagline) {
    content.push({ type: "Text", props: { id: "t-tagline", text: tagline } });
  }
  content.push({
    type: "Columns",
    props: { id: "cols-main", gap: 24, left: [tryPanel], right: [resultsPanel] }
  });

  return {
    version: 2,
    data: {
      root: { props: { title: name } },
      content,
      zones: {}
    }
  };
}

// Seed missing input defaults and node-property defaults so the app runs on the
// first click with zero typing (inputs) and opens on a sensible state (sliders).
// Non-destructive: only fills a value that is currently unset.
function applySeeds(example, curated) {
  if (!curated) return;
  for (const [name, value] of Object.entries(curated.seeds ?? {})) {
    const node = example.graph.nodes.find(
      (n) => n.type.startsWith("nodetool.input.") && n.data?.name === name
    );
    if (!node) continue;
    const cur = node.data?.value;
    if (cur === undefined || cur === null || cur === "") {
      node.data = node.data ?? {};
      node.data.value = value;
    }
  }
  for (const s of curated.sliders ?? []) {
    if (!s.node || s.default === undefined) continue;
    const node = example.graph.nodes.find((n) => n.id === s.node);
    if (!node) continue;
    node.data = node.data ?? {};
    node.data.properties = node.data.properties ?? {};
    if (node.data.properties[s.property] === undefined) {
      node.data.properties[s.property] = s.default;
    }
  }
}

// Position a new Output node just right of its source on the editor canvas.
function nodePosition(node) {
  const ui = node.ui_properties ?? {};
  const pos = ui.position ?? { x: 0, y: 0 };
  return { x: (pos.x ?? 0) + 320, y: pos.y ?? 0 };
}

function augmentOutputs(example) {
  const entries = AUGMENT[example.name];
  if (!entries) return false;
  const graph = example.graph;
  const existing = new Set(graph.nodes.map((n) => n.id));
  let changed = false;
  for (const { terminal, handle, name } of entries) {
    const outId = `output-${slugify(name)}`;
    if (existing.has(outId)) continue;
    const src = graph.nodes.find((n) => n.id === terminal);
    if (!src) {
      throw new Error(`${example.name}: terminal node ${terminal} not found`);
    }
    graph.nodes.push({
      id: outId,
      type: "nodetool.output.Output",
      data: { name },
      ui_properties: { position: nodePosition(src), selectable: true }
    });
    graph.edges.push({
      id: `edge-${outId}`,
      source: terminal,
      sourceHandle: handle,
      target: outId,
      targetHandle: "value",
      ui_properties: null
    });
    changed = true;
  }
  return changed;
}

// ── Preview export (screenshot rig input) ────────────────────────────────────

const MEDIA_INPUT = /(Image|Audio|Video|Document|DataFrame|Dataframe|FilePath|FolderPath|Folder|RealtimeAudio)Input$/;

function demoValues(example, curated) {
  const values = {};
  // Inputs: the template defaults double as inviting demo values.
  for (const n of example.graph.nodes) {
    if (!n.type.startsWith("nodetool.input.")) continue;
    if (MEDIA_INPUT.test(n.type)) continue;
    const name = n.data?.name;
    const v = n.data?.value;
    if (!name || v === undefined || v === null) continue;
    if (typeof v === "object") continue;
    values[name] = v;
  }
  // Slider seeds: a node-property slider shows its default in the preview.
  for (const s of curated?.sliders ?? []) {
    if (s.default === undefined) continue;
    const key = s.input ?? nodePropertyBinding(s.node, s.property);
    values[key] = s.default;
  }
  for (const [key, v] of Object.entries(curated?.demo ?? {})) {
    if (key === "__first") {
      const firstOut = example.graph.nodes.find(
        (n) => n.type.includes(".output.") || n.type.endsWith("base_node.Preview")
      );
      if (firstOut) values[firstOut.data?.name || firstOut.id] = v;
      continue;
    }
    values[key] = v;
  }
  return values;
}

// ── Main ─────────────────────────────────────────────────────────────────────

fs.mkdirSync(path.join(PREVIEW, "img"), { recursive: true });
const manifest = [];
const liveSlugs = new Set();
let generated = 0;
let augmented = 0;

for (const file of fs.readdirSync(EXAMPLES).filter((f) => f.endsWith(".json")).sort()) {
  const full = path.join(EXAMPLES, file);
  const example = JSON.parse(fs.readFileSync(full, "utf8"));
  const curated = CURATION[example.name];
  const slug = slugify(example.name);
  liveSlugs.add(slug);

  applySeeds(example, curated);
  if (augmentOutputs(example)) augmented++;

  example.app_doc = buildAppDoc(example, curated);
  generated++;

  fs.writeFileSync(full, JSON.stringify(example, null, 2) + "\n", "utf8");

  // Preview bundle for the screenshot rig.
  const art = path.join(ART, `${example.name}.jpg`);
  let image = null;
  if (fs.existsSync(art)) {
    image = `/app-preview/img/${slug}.jpg`;
    fs.copyFileSync(art, path.join(PREVIEW, "img", `${slug}.jpg`));
  }
  const preview = {
    slug,
    name: example.name,
    description: example.description ?? "",
    featured: Boolean(curated?.featured),
    image,
    app_doc: example.app_doc,
    values: demoValues(example, curated)
  };
  fs.writeFileSync(
    path.join(PREVIEW, `${slug}.json`),
    JSON.stringify(preview, null, 2) + "\n",
    "utf8"
  );
  manifest.push({ slug, name: example.name, featured: Boolean(curated?.featured) });
}

fs.writeFileSync(
  path.join(PREVIEW, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8"
);

// Prune preview bundles + card art for templates that no longer exist
// (retired/merged slugs), so stale mini apps don't linger on the marketing rig.
let pruned = 0;
for (const f of fs.readdirSync(PREVIEW)) {
  if (!f.endsWith(".json") || f === "manifest.json") continue;
  const slug = f.replace(/\.json$/, "");
  if (liveSlugs.has(slug)) continue;
  fs.rmSync(path.join(PREVIEW, f));
  const img = path.join(PREVIEW, "img", `${slug}.jpg`);
  if (fs.existsSync(img)) fs.rmSync(img);
  pruned++;
}

const featuredCount = manifest.filter((m) => m.featured).length;
console.log(
  `templates: ${manifest.length} · app_docs generated: ${generated} · graphs augmented: ${augmented} · featured: ${featuredCount} · stale bundles pruned: ${pruned}`
);
console.log(`preview bundles → ${path.relative(ROOT, PREVIEW)}`);
