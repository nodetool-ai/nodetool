// Generates app-builder mini apps for the shipped workflow templates.
//
// For every example in packages/base-nodes/nodetool/examples/nodetool-base/:
//  1. Graphs that end without an Output node get one appended per displayable
//     terminal node (AUGMENT table below — explicit ids/handles, no guessing),
//     so the mini app has something to show.
//  2. Templates without an `app_doc` get one generated from the CURATION table:
//     a consistent, non-technical layout — heading, tagline, a "Try it" panel
//     with friendly input widgets and one Run button, and a results panel with
//     one display widget per workflow output.
//  3. Every template (including the hand-built apps) is exported to
//     web/public/app-preview/<slug>.json with seeded demo values, which the
//     app-preview page renders for marketing screenshots. Template card art is
//     copied to web/public/app-preview/img/<slug>.jpg for image demos.
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
// the app (and in workflow outputs generally). Handles verified against the
// node classes: video/image/kie nodes emit `output`, TextToSpeech `audio`,
// Summarizer/ASR/Agent `text`, GoogleSearch `text`.
const AUGMENT = {
  "Agent Google Search": [
    { terminal: "d6a1dc18-d26c-45c4-9196-2d6524018b1b", handle: "text", name: "results" }
  ],
  "Audio To Image": [
    { terminal: "8b07b1ed-2ce9-4581-993e-efad334ab7a8", handle: "output", name: "image" }
  ],
  "Brand Asset Generator": [{ terminal: "2", handle: "output", name: "brand_asset" }],
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
    { terminal: "2", handle: "output", name: "enhanced_photos" },
    { terminal: "14", handle: "output", name: "upscaled_photos" }
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
  "Story to Video Generator": [
    { terminal: "video_generator", handle: "output", name: "video" }
  ],
  "Summarize Audio": [
    { terminal: "99c95069-03f6-4f45-bb66-ab3482f79496", handle: "text", name: "summary" }
  ],
  "Summarize RSS": [
    { terminal: "0659612a-1a3b-471b-b397-6ec97e33882f", handle: "text", name: "summary" }
  ],
  "Transcribe Audio": [
    { terminal: "c5191702-2a3c-440d-b3af-2db20e74a369", handle: "text", name: "transcript" }
  ],
  "YouTube Research Agent": [
    { terminal: "claude-agent-node", handle: "text", name: "research" }
  ],
  "YouTube Thumbnail Pipeline": [
    { terminal: "collected_thumbnails", handle: "output", name: "thumbnails" }
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
  "Agent Google Search": {
    emoji: "🔎",
    tagline: "Ask anything — an agent runs the Google searches and reports back.",
    button: "Search with the agent",
    layout: "stacked",
    outputs: { results: { widget: "Markdown", label: "What the agent found" } },
    demo: {
      results:
        "**Top findings for “best trail running shoes 2026”:**\n\n- Runner's World crowns the Speedgoat 6 for technical terrain\n- Three independent reviews flag the Norda 005 for durability\n- Reddit threads consistently recommend sizing up half a size"
    }
  },
  "Audio To Image": {
    emoji: "🎙️",
    tagline: "Describe a scene out loud — get it back as a picture.",
    button: "Turn my voice into art",
    layout: "stacked",
    note: "🎧 Uses the bundled voice memo — record your own in NodeTool Studio.",
    outputs: { image: { widget: "Image", label: "Your scene, visualized" } },
    demo: { image: IMG }
  },
  "Brand Asset Generator": {
    emoji: "🎨",
    tagline: "Type your brand name and vibe — get logo-ready visuals in seconds.",
    button: "Generate brand assets",
    layout: "columns",
    inputs: {
      brand_name: { label: "Brand name" },
      tagline: { label: "Tagline" },
      primary_color: { label: "Primary color (hex)", placeholder: "#3498db" },
      brand_description: { label: "Describe your brand", multiline: true }
    },
    outputs: { brand_asset: { widget: "Image", label: "Your brand asset" } },
    demo: { brand_asset: IMG }
  },
  "Cold Outreach Co-Pilot": {
    emoji: "✉️",
    tagline:
      "An agent researches your prospect and writes a cold email that opens with a real, specific detail.",
    button: "Research & write my email",
    layout: "columns",
    inputs: {
      "Prospect / Company": { label: "Who are you reaching out to?" },
      "Your Offer": { label: "What are you offering?", multiline: true }
    },
    outputs: {
      company_summary: { widget: "Markdown", label: "Company research" },
      pain_points: { widget: "Markdown", label: "Pain points found" },
      personalized_email: { widget: "Markdown", label: "Your email, ready to send" }
    },
    demo: {
      company_summary:
        "**AtlasCloud** — Series B infra startup, ~120 people. Just launched a managed Postgres product; hiring 8 platform engineers.",
      pain_points:
        "- Docs mention manual failover runbooks\n- Careers page hints at on-call fatigue\n- CTO tweeted about “yak-shaving in CI” last week",
      personalized_email:
        "**Subject: that CI yak-shave your CTO tweeted about**\n\nHi Sara — saw Marcus's thread on CI pipelines eating platform time. We build NodeTool, a visual AI workspace teams use to automate exactly that class of glue work…"
    }
  },
  "Color Boost Video": {
    emoji: "🌈",
    tagline: "Give any clip a cinematic color grade — no editor required.",
    button: "Boost my video",
    layout: "stacked",
    note: "🎞️ Uses the bundled sample clip — drop in your own in NodeTool Studio.",
    outputs: { graded_video: { widget: "Video", label: "Graded clip" } },
    demo: { graded_video: VIDEO }
  },
  "Data Generator": {
    emoji: "🧮",
    tagline: "Describe the dataset you need — an agent generates it, structured and ready.",
    button: "Generate data",
    layout: "stacked",
    outputs: { generated_data: { widget: "Json", label: "Generated dataset" } },
    demo: {
      generated_data: [
        { city: "Lisbon", population: 545000, seaside: true },
        { city: "Porto", population: 231000, seaside: true },
        { city: "Coimbra", population: 106000, seaside: false }
      ]
    }
  },
  "Fetch Papers": {
    emoji: "📚",
    tagline: "Automatically fetch the latest research papers, downloaded and organized.",
    button: "Fetch papers",
    layout: "stacked",
    outputs: { __first: { widget: "Markdown", label: "Fetched papers" } },
    demo: {
      __first:
        "- **Attention Is All You Need** — downloaded ✓\n- **BERT: Pre-training of Deep Bidirectional Transformers** — downloaded ✓\n- **GPT-4 Technical Report** — downloaded ✓"
    }
  },
  "Hacker News Agent": {
    emoji: "🗞️",
    tagline: "One click for a smart digest of today's Hacker News front page.",
    button: "Analyze today's front page",
    layout: "stacked",
    outputs: { analysis: { widget: "Markdown", label: "Today's digest" } },
    demo: {
      analysis:
        "**Today on HN:** local-first software is having a moment — three of the top ten posts cover sync engines. The comment section consensus: SQLite keeps winning.\n\n**Worth your time:** a deep-dive on how Anthropic trains coding agents (412 points)."
    }
  },
  "Hook & Thumbnail Factory": {
    emoji: "🪝",
    tagline: "Give it a video topic — get scroll-stopping hooks and a matching thumbnail.",
    button: "Make hooks & thumbnail",
    layout: "columns",
    inputs: {
      "Video Topic": { label: "What's your video about?", multiline: true },
      "Target Audience": { label: "Who's watching?" }
    },
    outputs: {
      hooks: { widget: "Markdown", label: "Hook ideas" },
      thumbnail: { widget: "Image", label: "Thumbnail" }
    },
    demo: {
      hooks:
        "1. “You're losing $100/month by not knowing this.”\n2. “Einstein called it the 8th wonder. Banks hope you never learn it.”\n3. “$5 a day → $1M. Here's the math nobody shows you.”",
      thumbnail: IMG
    }
  },
  "Image Enhance": {
    emoji: "✨",
    tagline: "Sharper, brighter, cleaner — enhance any photo in one click.",
    button: "Enhance my photo",
    layout: "stacked",
    note: "🖼️ Uses the bundled sample photo — drop in your own in NodeTool Studio.",
    outputs: { enhanced_image: { widget: "Image", label: "Enhanced photo" } },
    demo: { enhanced_image: IMG }
  },
  "Image To Audio Story": {
    emoji: "🔊",
    tagline: "Point it at a picture — hear the story it tells, narrated aloud.",
    button: "Tell me its story",
    layout: "stacked",
    note: "🖼️ Uses the bundled sample image — swap in any picture in NodeTool Studio.",
    outputs: { narration: { widget: "Audio", label: "Narrated story" } },
    demo: { narration: AUDIO }
  },
  "Image to Video Animation": {
    emoji: "🎥",
    tagline: "Type a scene — get a still, then watch it come alive as a cinematic clip.",
    button: "Animate my scene",
    layout: "columns",
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
    tagline: "Drop in a meeting recording — get the transcript and crisp notes back.",
    button: "Summarize my meeting",
    layout: "columns",
    note: "🎧 Uses the bundled recording — upload your own in NodeTool Studio.",
    outputs: {
      Summary: { widget: "Markdown", label: "Meeting notes" },
      Transcript: { widget: "Markdown", label: "Full transcript" }
    },
    demo: {
      Summary:
        "**Decisions**\n- Ship the pricing page Friday\n- Maya owns the launch email\n\n**Action items**\n- [ ] Jonas: fix the trial-expiry bug by Wed\n- [ ] Priya: draft FAQ for support",
      Transcript:
        "“…okay so if we're all aligned, let's lock Friday for the pricing page. Jonas, can you take the trial-expiry bug before Wednesday?…”"
    }
  },
  "Movie Trailer Generator": {
    emoji: "🍿",
    tagline: "Type one logline — get a cinematic teaser cut shot-by-shot.",
    button: "Cut my trailer",
    layout: "columns",
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
    tagline: "Batch-enhance a whole folder of photos — color, brightness, upscaling.",
    button: "Enhance my photos",
    layout: "columns",
    note: "📁 Points at the bundled sample folder — choose your own in NodeTool Studio.",
    inputs: {
      brightness_adjust: { label: "Brightness" },
      color_boost: { label: "Color boost" }
    },
    outputs: {
      enhanced_photos: { widget: "Image", label: "Enhanced" },
      upscaled_photos: { widget: "Image", label: "Upscaled" }
    },
    demo: { enhanced_photos: IMG, upscaled_photos: IMG }
  },
  "Podcast Repurposing Studio": {
    emoji: "🎙️",
    tagline:
      "One episode in — show notes, a newsletter, social posts, and quote cards out.",
    button: "Repurpose my episode",
    layout: "columns",
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
    tagline: "Mix any animals you like — meet the creature they become.",
    button: "Create my creature",
    layout: "stacked",
    inputs: {
      animals: { label: "Mix these animals", placeholder: "lion, eagle, dragon, bear" }
    },
    outputs: { pokemon: { widget: "Image", label: "Your creature" } },
    demo: { pokemon: IMG }
  },
  "Product Mockup Generator": {
    emoji: "📦",
    tagline: "Turn one product shot into a set of polished lifestyle mockups.",
    button: "Generate mockups",
    layout: "columns",
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
    note: "📷 Uses the bundled product image — replace it in NodeTool Studio.",
    inputs: {
      campaign_brief: { label: "Campaign brief", multiline: true },
      target_audience: { label: "Target audience", multiline: true },
      key_features: { label: "Key features", multiline: true }
    },
    outputs: { product_video: { widget: "Video", label: "Launch video" } },
    demo: { product_video: VIDEO }
  },
  "SEO Content Engine": {
    emoji: "📈",
    tagline: "One topic in — a keyword-targeted article batch out, with hero images.",
    button: "Plan & write my articles",
    layout: "columns",
    inputs: {
      business: { label: "Your business", multiline: true },
      audience_and_seeds: { label: "Audience & seed topics", multiline: true },
      article_count: { label: "Articles to write" }
    },
    outputs: {
      content_plan: { widget: "Markdown", label: "Content plan" },
      articles: { widget: "Markdown", label: "Articles" },
      hero_images: { widget: "Image", label: "Hero images" }
    },
    demo: {
      content_plan:
        "**Cluster: first-gear decisions**\n1. Ultralight backpacks under $200 (KD 18)\n2. Trail runners vs. hiking boots (KD 22)\n3. The 10 essentials, minimalist edition (KD 12)",
      articles:
        "**Trail runners vs. hiking boots: what beginners actually need**\n\nYou don't need ankle support. You need to stop buying footwear for a hike you're not doing…",
      hero_images: IMG
    }
  },
  "Social Media Calendar Filler": {
    emoji: "📅",
    tagline: "Fill a month of social posts — images, captions, and hashtags included.",
    button: "Fill my calendar",
    layout: "columns",
    inputs: {
      brand_name: { label: "Brand name" },
      monthly_theme: { label: "This month's theme", multiline: true },
      target_audience: { label: "Audience", multiline: true },
      brand_voice: { label: "Brand voice", multiline: true },
      posts_per_week: { label: "Posts per week" }
    },
    outputs: {
      post_images: { widget: "Image", label: "Post visuals" },
      captions: { widget: "Markdown", label: "Captions & hashtags" }
    },
    demo: {
      post_images: IMG,
      captions:
        "**Mon** — Your team isn't slow. Your handoffs are. Here's the fix 🧵\n#productivity #automation\n\n**Wed** — We measured 30 days of context-switching. The results hurt.\n#futureofwork"
    }
  },
  "Story to Video Generator": {
    emoji: "🚀",
    tagline: "Type a story idea — watch it become a cinematic AI-generated video.",
    button: "Generate my video",
    layout: "stacked",
    inputs: {
      story_theme: { label: "Your story idea", multiline: true }
    },
    outputs: { video: { widget: "Video", label: "Your video" } },
    demo: { video: VIDEO }
  },
  "Summarize Audio": {
    emoji: "🎧",
    tagline: "Any recording in — the gist out. Transcribed and summarized for you.",
    button: "Summarize it",
    layout: "stacked",
    note: "🎧 Uses the bundled recording — upload any audio in NodeTool Studio.",
    outputs: { summary: { widget: "Markdown", label: "Summary" } },
    demo: {
      summary:
        "**In 30 seconds:** the speaker walks through Q3 results — revenue up 18%, churn down to 2.1% — and commits to shipping the mobile app before the holidays."
    }
  },
  "Summarize RSS": {
    emoji: "📰",
    tagline: "Your feeds, read for you — one click for a clean daily brief.",
    button: "Brief me",
    layout: "stacked",
    outputs: { summary: { widget: "Markdown", label: "Today's brief" } },
    demo: {
      summary:
        "**Today's brief:** EU passes the AI liability directive; OpenAI and Anthropic both ship smaller on-device models; and a solo dev's local-first note app tops Product Hunt."
    }
  },
  "Transcribe Audio": {
    emoji: "🎤",
    tagline: "Speech to text with word-level timestamps — paste-ready in seconds.",
    button: "Transcribe",
    layout: "stacked",
    note: "🎧 Uses the bundled recording — upload any audio in NodeTool Studio.",
    outputs: { transcript: { widget: "Markdown", label: "Transcript" } },
    demo: {
      transcript:
        "“Welcome back to the show. **[00:00:02]** Today we're talking about why the best product demos tell a story **[00:00:07]** instead of listing features…”"
    }
  },
  "YouTube Research Agent": {
    emoji: "▶️",
    tagline: "An agent scours YouTube and distills what actually matters.",
    button: "Run the research",
    layout: "stacked",
    outputs: { research: { widget: "Markdown", label: "Research findings" } },
    demo: {
      research:
        "**Top creators covering “AI agents” this month:**\n- Fireship's explainer (2.1M views) — best beginner framing\n- Three long-form deep dives all cite the same benchmark\n- Gap found: nobody covers deployment costs"
    }
  },
  "YouTube Thumbnail Pipeline": {
    emoji: "🖼️",
    tagline: "Generate a batch of bold, click-worthy thumbnail variations.",
    button: "Generate thumbnails",
    layout: "columns",
    inputs: {
      video_title: { label: "Video title" },
      video_topic: { label: "What's the video about?", multiline: true },
      thumbnail_text: { label: "Text on the thumbnail" },
      num_variations: { label: "How many variations?" }
    },
    outputs: { thumbnails: { widget: "Image", label: "Thumbnail variations" } },
    demo: { thumbnails: IMG }
  },
  // Hand-built apps (app_doc kept as-is) still need demo values for previews.
  "Concept Art Iteration Board": {
    emoji: "🖌️",
    demo: { "Concept Art": IMG }
  },
  "Conditional Logic Engine": {
    emoji: "🔀",
    demo: { Result: "**75** → routed to the *high* branch: “Excellent — above the 70 threshold.”" }
  },
  "Creative Story Ideas": {
    emoji: "✨",
    demo: {
      Ideas:
        "1. **The Cartographer's Debt** — a mapmaker who owes a year of memories to the forest he once charted wrong.\n2. **Emberwake** — a reluctant hero inherits a dragon's hoard… and its enemies.\n3. **The Quiet Crown** — the kingdom's true ruler is whoever the crows follow."
    }
  },
  "Flashcard Generator": {
    emoji: "🃏",
    demo: {
      Flashcards:
        "**Q:** What does `len()` return for a dict?\n**A:** The number of keys.\n\n**Q:** What's the difference between a list and a tuple?\n**A:** Lists are mutable; tuples are not."
    }
  },
  "Learning Path Generator": {
    emoji: "🧭",
    demo: {
      "Learning Path":
        "**Week 1 — Containers, demystified.** Run your first container; break it; fix it.\n**Week 2 — Images & Dockerfiles.** Build, tag, and ship your own.\n**Week 3 — Compose.** Wire a web app to a database."
    }
  },
  "Movie Posters": {
    emoji: "🎬",
    demo: { Poster: IMG }
  },
  "Research Paper Summarizer": {
    emoji: "🔬",
    demo: {
      Summary:
        "**Attention Is All You Need — in plain terms:** the paper replaces recurrence entirely with attention, trains 10× faster, and sets new translation records. The trick: let every word look at every other word at once."
    }
  },
  "Wikipedia Agent": {
    emoji: "🌐",
    demo: {
      Findings:
        "**LLM fine-tuning — key facts gathered:**\n- Full fine-tuning updates all weights; LoRA touches <1%\n- Instruction tuning ≠ RLHF: one teaches format, the other preference\n- The 2024 survey counts 40+ PEFT methods"
    }
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const MEDIA_INPUT = /(Image|Audio|Video|Document|DataFrame|Dataframe|FilePath|FolderPath|Folder|RealtimeAudio)Input$/;

const humanize = (name) =>
  String(name)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

function widgetForInput(node, curated) {
  const type = node.type;
  const data = node.data ?? {};
  const name = data.name;
  const c = curated?.inputs?.[name] ?? {};
  const label = c.label ?? humanize(name);
  const id = `in-${slugify(name)}`;

  if (MEDIA_INPUT.test(type)) return null; // covered by the panel note

  if (type === "nodetool.input.BooleanInput") {
    return { type: "Switch", props: { id, binding: name, label, events: [] } };
  }
  if (type === "nodetool.input.SelectInput") {
    const options = (data.options ?? []).map((o) => ({ value: String(o) }));
    return { type: "Select", props: { id, binding: name, label, options, events: [] } };
  }
  if (
    type === "nodetool.input.IntegerInput" ||
    type === "nodetool.input.FloatInput"
  ) {
    const isFloat = type.endsWith("FloatInput");
    if (typeof data.min === "number" && typeof data.max === "number") {
      return {
        type: "Slider",
        props: {
          id,
          binding: name,
          label,
          min: data.min,
          max: data.max,
          step: isFloat ? 0.05 : 1,
          events: []
        }
      };
    }
    return {
      type: "NumberInput",
      props: { id, binding: name, label, min: 0, max: 100, step: 1, events: [] }
    };
  }
  // Everything string-ish (String/Text/Message/Color inputs).
  const def = typeof data.value === "string" ? data.value : "";
  const multiline = c.multiline ?? def.length > 60;
  const placeholder = c.placeholder ?? (def ? def.slice(0, 80) : `Enter ${label.toLowerCase()}…`);
  return {
    type: "TextInput",
    props: { id, binding: name, label, placeholder, multiline, events: [] }
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
  const emoji = curated?.emoji ?? "⚡";
  const tagline = curated?.tagline ?? example.description?.split(/\.\s/)[0] ?? "";
  const button = curated?.button ?? "Run";

  const inputNodes = graph.nodes.filter((n) => n.type.startsWith("nodetool.input."));
  const outputNodes = graph.nodes.filter(
    (n) => n.type.includes(".output.") || n.type.endsWith("base_node.Preview")
  );

  const inputWidgets = inputNodes
    .map((n) => widgetForInput(n, curated))
    .filter(Boolean);

  const tryItems = [...inputWidgets];
  if (curated?.note) {
    tryItems.push({ type: "Text", props: { id: "note-media", text: curated.note } });
  }
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

  const resultItems = [];
  for (const n of outputNodes) {
    const outName = n.data?.name || n.id;
    if (outName === "chunk") continue; // streaming side-channel, not a result
    const spec = curated?.outputs?.[outName] ?? curated?.outputs?.__first;
    const label = spec?.label ?? humanize(outName);
    if (resultItems.length > 0 || outputNodes.length > 1) {
      resultItems.push({
        type: "Heading",
        props: { id: `lbl-${slugify(outName)}`, text: label, level: "3" }
      });
    }
    resultItems.push(widgetForOutput(outName, spec));
  }

  const tryPanel = {
    type: "Container",
    props: { id: "panel-try", title: "Try it", content: tryItems }
  };
  const resultsPanel = {
    type: "Container",
    props: { id: "panel-results", title: "Results", content: resultItems }
  };

  const layout = curated?.layout ?? "columns";
  const body =
    layout === "columns"
      ? [{ type: "Columns", props: { id: "cols-main", gap: 24, left: [tryPanel], right: [resultsPanel] } }]
      : [tryPanel, resultsPanel];

  return {
    version: 2,
    data: {
      root: { props: { title: name } },
      content: [
        { type: "Heading", props: { id: "h-title", text: `${emoji} ${name}`, level: "1" } },
        { type: "Text", props: { id: "t-tagline", text: tagline } },
        ...body
      ],
      zones: {}
    }
  };
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
let generated = 0;
let augmented = 0;

for (const file of fs.readdirSync(EXAMPLES).filter((f) => f.endsWith(".json")).sort()) {
  const full = path.join(EXAMPLES, file);
  const example = JSON.parse(fs.readFileSync(full, "utf8"));
  const curated = CURATION[example.name];
  const slug = slugify(example.name);

  if (augmentOutputs(example)) augmented++;

  if (!example.app_doc) {
    example.app_doc = buildAppDoc(example, curated);
    generated++;
  }

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
    image,
    app_doc: example.app_doc,
    values: demoValues(example, curated)
  };
  fs.writeFileSync(
    path.join(PREVIEW, `${slug}.json`),
    JSON.stringify(preview, null, 2) + "\n",
    "utf8"
  );
  manifest.push({ slug, name: example.name });
}

fs.writeFileSync(
  path.join(PREVIEW, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8"
);

console.log(
  `templates: ${manifest.length} · app_docs generated: ${generated} · graphs augmented: ${augmented}`
);
console.log(`preview bundles → ${path.relative(ROOT, PREVIEW)}`);
