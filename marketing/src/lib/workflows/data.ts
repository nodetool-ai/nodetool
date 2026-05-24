import type { WorkflowMarketplaceEntry } from "./types";

export const WORKFLOWS: WorkflowMarketplaceEntry[] = [
  {
    slug: "brand-asset-pack",
    title: "Brand Asset Pack from a Single Prompt",
    tagline:
      "Type a brief, get a full social-ready brand asset pack — hero image, square crops, story formats, and motion loops.",
    description:
      "Drop a creative brief on the canvas and NodeTool fans it out across Flux Pro, an upscaler, and a video model so you walk away with a hero image, square and 9:16 crops, plus a motion loop — all on-brand, all in one run.",
    category: "image",
    tags: ["brand", "marketing", "batch", "flux", "social"],
    models: ["Flux Pro", "Topaz Upscale", "Seedance"],
    providers: ["FAL", "Replicate"],
    runtime: "~90s",
    difficulty: "Beginner",
    video: { kind: "youtube", id: "dQw4w9WgXcQ" },
    ogImage: "/preview.png",
    steps: [
      {
        title: "Write a brief",
        detail:
          "A single text input describes the campaign — audience, tone, palette, references.",
      },
      {
        title: "Generate the hero",
        detail:
          "Flux Pro renders the master image in 16:9 with brand-safe negatives baked in.",
      },
      {
        title: "Fan out the crops",
        detail:
          "Smart-crop nodes produce square and 9:16 versions, upscaled and color-matched.",
      },
      {
        title: "Animate it",
        detail:
          "A short Seedance loop turns the hero image into a 4-second motion asset.",
      },
    ],
    useCases: [
      "Launch a campaign in an hour, not a week",
      "Run A/B tests across formats from one brief",
      "Refresh evergreen assets weekly with consistent style",
    ],
    preview: {
      nodes: [
        { id: "brief", x: 0, y: 1, title: "Brand Brief", subtitle: "Text input", icon: "MessageSquare", hue: "sky" },
        { id: "hero", x: 1, y: 0, title: "Hero Image", subtitle: "Flux Pro", icon: "Palette", hue: "violet", badge: "FAL" },
        { id: "upscale", x: 2, y: 0, title: "Upscale 4K", subtitle: "Topaz", icon: "Sparkles", hue: "amber", badge: "Replicate" },
        { id: "crops", x: 2, y: 1, title: "Crops 1:1 / 9:16", subtitle: "Smart crop", icon: "Crop", hue: "teal" },
        { id: "motion", x: 2, y: 2, title: "Motion Loop", subtitle: "Seedance", icon: "Film", hue: "rose", badge: "FAL" },
        { id: "pack", x: 3, y: 1, title: "Asset Pack", subtitle: "ZIP output", icon: "Package", hue: "emerald" },
      ],
      edges: [
        { source: "brief", target: "hero", animated: true },
        { source: "hero", target: "upscale", animated: true },
        { source: "hero", target: "crops" },
        { source: "hero", target: "motion" },
        { source: "upscale", target: "pack" },
        { source: "crops", target: "pack" },
        { source: "motion", target: "pack" },
      ],
    },
  },
  {
    slug: "video-to-shorts",
    title: "Long-form Video → Captioned Shorts",
    tagline:
      "Drop a 30-minute video, get five viral-ready vertical shorts with auto-captions and hooks.",
    description:
      "Whisper transcribes your video, a Claude agent picks the strongest 30-second moments, and ffmpeg cuts vertical exports with burnt-in captions and platform-safe title cards.",
    category: "video",
    tags: ["video", "shorts", "tiktok", "youtube", "whisper", "agent"],
    models: ["Whisper", "Claude Sonnet 4.6"],
    providers: ["OpenAI", "Anthropic"],
    runtime: "~3-5 min per 30-min source",
    difficulty: "Intermediate",
    video: { kind: "youtube", id: "dQw4w9WgXcQ" },
    ogImage: "/preview.png",
    steps: [
      { title: "Transcribe", detail: "Whisper produces a timestamped transcript with word-level offsets." },
      { title: "Pick moments", detail: "A Claude agent ranks moments by hook strength and self-contained narrative." },
      { title: "Cut", detail: "ffmpeg slices vertical 9:16 clips around chosen ranges with safe-area margins." },
      { title: "Caption & hook", detail: "Burnt-in captions plus an LLM-generated opening hook overlay." },
    ],
    useCases: [
      "Creator repurposing podcasts into TikTok / Reels / Shorts",
      "B2B teams turning webinars into LinkedIn clips",
      "Education channels pulling micro-lessons from long lectures",
    ],
    preview: {
      nodes: [
        { id: "src", x: 0, y: 1, title: "Source Video", subtitle: "MP4 upload", icon: "Video", hue: "sky" },
        { id: "whisper", x: 1, y: 1, title: "Whisper Transcribe", subtitle: "whisper-1", icon: "Mic", hue: "blue", badge: "OpenAI" },
        { id: "picker", x: 2, y: 1, title: "Moment Picker", subtitle: "Claude Agent", icon: "Brain", hue: "violet", badge: "Anthropic" },
        { id: "cutter", x: 3, y: 0, title: "ffmpeg Cut", subtitle: "9:16 vertical", icon: "Scissors", hue: "amber" },
        { id: "captions", x: 3, y: 2, title: "Burn Captions", subtitle: "Style + hook", icon: "Type", hue: "teal" },
        { id: "out", x: 4, y: 1, title: "5 Shorts", subtitle: "MP4 batch", icon: "FolderDown", hue: "emerald" },
      ],
      edges: [
        { source: "src", target: "whisper", animated: true },
        { source: "whisper", target: "picker", animated: true, label: "transcript" },
        { source: "picker", target: "cutter", label: "ranges" },
        { source: "picker", target: "captions", label: "text" },
        { source: "cutter", target: "out" },
        { source: "captions", target: "out" },
      ],
    },
  },
  {
    slug: "ai-product-photographer",
    title: "AI Product Photographer",
    tagline:
      "Turn a phone snapshot of your product into studio-grade hero shots in three lighting setups.",
    description:
      "Background removal, scene relight, and Flux compositing chain into a single canvas that takes a raw product photo and outputs studio shots in three lighting moods, upscaled and ready for the storefront.",
    category: "image",
    tags: ["ecommerce", "product", "relight", "flux", "compositing"],
    models: ["Flux Fill", "Flux Redux", "Relight"],
    providers: ["FAL", "Replicate"],
    runtime: "~45s",
    difficulty: "Beginner",
    video: { kind: "youtube", id: "dQw4w9WgXcQ" },
    ogImage: "/preview.png",
    steps: [
      { title: "Strip background", detail: "Segment-anything removes background and preserves edges." },
      { title: "Relight", detail: "Three lighting LUTs render softbox, golden hour, and high-key." },
      { title: "Composite", detail: "Flux Fill places the product into curated studio scenes." },
      { title: "Upscale", detail: "Final 4K export, color-matched and shadow-grounded." },
    ],
    useCases: [
      "Shopify and Etsy sellers replacing studio shoots",
      "Marketplace listings needing format-consistent imagery",
      "A/B testing scene/mood without re-shooting",
    ],
    preview: {
      nodes: [
        { id: "in", x: 0, y: 1, title: "Phone Photo", subtitle: "Input image", icon: "Camera", hue: "sky" },
        { id: "seg", x: 1, y: 1, title: "Segment", subtitle: "SAM", icon: "Scissors", hue: "teal" },
        { id: "relight", x: 2, y: 0, title: "Relight", subtitle: "Softbox / Golden / Key", icon: "Sun", hue: "amber" },
        { id: "scene", x: 2, y: 2, title: "Scene Compose", subtitle: "Flux Fill", icon: "Layers", hue: "violet", badge: "FAL" },
        { id: "upscale", x: 3, y: 1, title: "Upscale 4K", subtitle: "Topaz", icon: "Sparkles", hue: "rose", badge: "Replicate" },
        { id: "out", x: 4, y: 1, title: "3 Hero Shots", subtitle: "PNG batch", icon: "Image", hue: "emerald" },
      ],
      edges: [
        { source: "in", target: "seg", animated: true },
        { source: "seg", target: "relight", animated: true },
        { source: "seg", target: "scene", animated: true },
        { source: "relight", target: "upscale" },
        { source: "scene", target: "upscale" },
        { source: "upscale", target: "out" },
      ],
    },
  },
  {
    slug: "multilingual-voiceover",
    title: "Multilingual Voice-Over Pipeline",
    tagline:
      "One script in, eight languages out — same voice, lip-aware timing, ready to drop into your edit.",
    description:
      "A Claude translator preserves tone across languages, ElevenLabs voice-clones a single performance, and timing markers keep each track aligned to your edit so swapping languages is one node away.",
    category: "audio",
    tags: ["voiceover", "localization", "elevenlabs", "tts", "i18n"],
    models: ["Claude Sonnet 4.6", "ElevenLabs Multilingual v2"],
    providers: ["Anthropic", "ElevenLabs"],
    runtime: "~2 min per language",
    difficulty: "Intermediate",
    video: { kind: "youtube", id: "dQw4w9WgXcQ" },
    ogImage: "/preview.png",
    steps: [
      { title: "Source script", detail: "Markdown or SRT with optional timing markers." },
      { title: "Translate", detail: "Claude preserves tone, idiom, and brand voice across target languages." },
      { title: "Synthesize", detail: "ElevenLabs renders each track with your cloned voice." },
      { title: "Align", detail: "Timing nodes match cue points so edits drop in cleanly." },
    ],
    useCases: [
      "Indie filmmakers localizing trailers without a studio",
      "Game studios shipping VO in eight languages on launch day",
      "Corporate training localized across regional teams",
    ],
    preview: {
      nodes: [
        { id: "script", x: 0, y: 1, title: "Script (EN)", subtitle: "Markdown input", icon: "FileText", hue: "sky" },
        { id: "trans", x: 1, y: 1, title: "Translate", subtitle: "Claude Sonnet 4.6", icon: "Languages", hue: "violet", badge: "Anthropic" },
        { id: "voice", x: 2, y: 0, title: "Voice Clone", subtitle: "ElevenLabs v2", icon: "Mic", hue: "rose", badge: "ElevenLabs" },
        { id: "tts", x: 2, y: 2, title: "Synthesize × 8", subtitle: "Per-language TTS", icon: "AudioLines", hue: "amber" },
        { id: "align", x: 3, y: 1, title: "Align Timing", subtitle: "SRT markers", icon: "Clock", hue: "teal" },
        { id: "out", x: 4, y: 1, title: "8 Tracks", subtitle: "WAV + SRT", icon: "FolderDown", hue: "emerald" },
      ],
      edges: [
        { source: "script", target: "trans", animated: true },
        { source: "trans", target: "tts", animated: true, label: "translated" },
        { source: "voice", target: "tts", animated: true, label: "voice id" },
        { source: "tts", target: "align" },
        { source: "align", target: "out" },
      ],
    },
  },
  {
    slug: "rag-support-bot",
    title: "RAG Support Bot with Citations",
    tagline:
      "Point at your docs, ship a chat endpoint that answers with quotes and source links.",
    description:
      "Drop your docs into NodeTool, ingest them into a SQLite-vec store, and wire a chat agent that always answers with citations — deploy as an HTTP endpoint or embed on your site.",
    category: "rag",
    tags: ["rag", "chat", "support", "vector", "citations"],
    models: ["text-embedding-3-large", "Claude Sonnet 4.6"],
    providers: ["OpenAI", "Anthropic"],
    runtime: "Index: minutes / Query: <2s",
    difficulty: "Intermediate",
    video: { kind: "youtube", id: "dQw4w9WgXcQ" },
    ogImage: "/preview.png",
    steps: [
      { title: "Ingest docs", detail: "PDF/MD/HTML loaders chunk and embed your content." },
      { title: "Store vectors", detail: "SQLite-vec keeps everything local — no managed DB required." },
      { title: "Retrieve", detail: "Hybrid keyword + vector search returns top-k passages." },
      { title: "Answer with citations", detail: "Claude composes the answer with mandatory inline source links." },
    ],
    useCases: [
      "Internal helpdesk for engineering and ops teams",
      "Customer support bots grounded in your real docs",
      "Sales enablement assistants that cite your own product PDFs",
    ],
    preview: {
      nodes: [
        { id: "docs", x: 0, y: 1, title: "Your Docs", subtitle: "PDF / MD / HTML", icon: "FileText", hue: "sky" },
        { id: "chunk", x: 1, y: 0, title: "Chunk + Embed", subtitle: "text-embedding-3", icon: "Boxes", hue: "blue", badge: "OpenAI" },
        { id: "store", x: 2, y: 0, title: "Vector Store", subtitle: "SQLite-vec", icon: "Database", hue: "teal" },
        { id: "user", x: 1, y: 2, title: "User Query", subtitle: "Chat input", icon: "MessageSquare", hue: "amber" },
        { id: "retrieve", x: 2, y: 2, title: "Retrieve top-k", subtitle: "Hybrid search", icon: "Search", hue: "violet" },
        { id: "answer", x: 3, y: 1, title: "Answer + Cite", subtitle: "Claude Sonnet 4.6", icon: "Sparkles", hue: "rose", badge: "Anthropic" },
        { id: "out", x: 4, y: 1, title: "Chat Endpoint", subtitle: "HTTP / Embed", icon: "Globe", hue: "emerald" },
      ],
      edges: [
        { source: "docs", target: "chunk", animated: true },
        { source: "chunk", target: "store", animated: true },
        { source: "user", target: "retrieve", animated: true },
        { source: "store", target: "retrieve" },
        { source: "retrieve", target: "answer", animated: true },
        { source: "answer", target: "out" },
      ],
    },
  },
  {
    slug: "music-video-generator",
    title: "Music Video Generator",
    tagline:
      "Lyrics in, music video out — Suno scores the track, Veo renders the scenes, the canvas cuts to the beat.",
    description:
      "Type lyrics or a vibe, get a finished music video. Suno writes and performs the track, Veo renders scenes per stanza, and beat-detection nodes lock the cuts to the downbeats.",
    category: "video",
    tags: ["music", "video", "suno", "veo", "creative"],
    models: ["Suno", "Veo 3", "Beat Detect"],
    providers: ["FAL", "Replicate"],
    runtime: "~6-8 min",
    difficulty: "Advanced",
    video: { kind: "youtube", id: "dQw4w9WgXcQ" },
    ogImage: "/preview.png",
    steps: [
      { title: "Write the song", detail: "Suno generates lyrics + performance from a single prompt." },
      { title: "Detect beats", detail: "Onset detection produces a tempo map and cut points." },
      { title: "Render scenes", detail: "Veo 3 renders one shot per stanza, color-graded for cohesion." },
      { title: "Cut to beat", detail: "ffmpeg assembles scenes against the tempo map." },
    ],
    useCases: [
      "Indie artists shipping a video the same day as the track",
      "Agencies pitching music-led concepts in hours",
      "Hobbyists turning ideas into shareable artifacts",
    ],
    preview: {
      nodes: [
        { id: "prompt", x: 0, y: 1, title: "Vibe Prompt", subtitle: "Text input", icon: "MessageSquare", hue: "sky" },
        { id: "suno", x: 1, y: 0, title: "Suno", subtitle: "Track + lyrics", icon: "Music", hue: "rose", badge: "FAL" },
        { id: "beats", x: 2, y: 0, title: "Beat Detect", subtitle: "Tempo map", icon: "Activity", hue: "amber" },
        { id: "veo", x: 1, y: 2, title: "Veo 3", subtitle: "Per-stanza scenes", icon: "Film", hue: "violet", badge: "Replicate" },
        { id: "grade", x: 2, y: 2, title: "Color Grade", subtitle: "LUT match", icon: "Palette", hue: "teal" },
        { id: "cut", x: 3, y: 1, title: "Cut to Beat", subtitle: "ffmpeg", icon: "Scissors", hue: "blue" },
        { id: "out", x: 4, y: 1, title: "Music Video", subtitle: "MP4 1080p", icon: "Video", hue: "emerald" },
      ],
      edges: [
        { source: "prompt", target: "suno", animated: true },
        { source: "prompt", target: "veo", animated: true },
        { source: "suno", target: "beats", animated: true },
        { source: "veo", target: "grade" },
        { source: "beats", target: "cut" },
        { source: "grade", target: "cut" },
        { source: "cut", target: "out" },
      ],
    },
  },
  {
    slug: "storyboard-to-seedance",
    title: "Storyboard → Seedance Video",
    tagline:
      "Turn an 8-panel choreography board into a cinematic Seedance video — same characters, your location, one run.",
    description:
      "Sketch the action as a numbered 8-panel storyboard, drop a location reference, and the canvas hands both to Seedance 2.0 as visual references. ChatGPT Images 2.0 generates the choreography diagram and a matching shot-direction sheet; Seedance composes the final video keyed to your scene description.",
    category: "video",
    tags: ["storyboard", "seedance", "reference", "choreography", "cinematic"],
    models: ["ChatGPT Images 2.0", "Seedance 2.0"],
    providers: ["OpenAI", "FAL"],
    runtime: "~3-4 min",
    difficulty: "Intermediate",
    video: { kind: "youtube", id: "dQw4w9WgXcQ" },
    ogImage: "/preview.png",
    steps: [
      {
        title: "Choreography diagram",
        detail:
          "Prompt ChatGPT Images 2.0 for an 8-panel board — numbered badges, bold titles, dashed motion arrows, consistent characters.",
      },
      {
        title: "Shot direction",
        detail:
          "Feed the board plus a location reference into ChatGPT Images Edit to produce a matching shot-direction sheet — camera moves, angles, framing.",
      },
      {
        title: "Scene construction",
        detail:
          "Write the location prompt: platform, lighting, mood, atmosphere. The two boards become Seedance's visual references.",
      },
      {
        title: "Render with Seedance",
        detail:
          "Seedance 2.0 Reference renders a continuous video that follows the choreography in your chosen location.",
      },
    ],
    useCases: [
      "Action directors previz-ing fight choreography on location",
      "Music video teams locking blocking before a shoot day",
      "Game studios storyboarding cinematics with consistent characters",
    ],
    preview: {
      nodes: [
        { id: "choreoPrompt", x: 0, y: 0, title: "Choreography Prompt", subtitle: "8 panels, 4×2", icon: "MessageSquare", hue: "sky" },
        { id: "choreoImg", x: 1, y: 0, title: "ChatGPT Images 2.0", subtitle: "Storyboard board", icon: "LayoutGrid", hue: "blue", badge: "OpenAI" },
        { id: "shotPrompt", x: 0, y: 2, title: "Shot Direction Prompt", subtitle: "Camera + framing", icon: "MessageSquare", hue: "amber" },
        { id: "location", x: 0, y: 3, title: "Location Reference", subtitle: "Drone image", icon: "Image", hue: "orange" },
        { id: "shotImg", x: 1, y: 2, title: "ChatGPT Images Edit", subtitle: "Shot sheet", icon: "Camera", hue: "amber", badge: "OpenAI" },
        { id: "scenePrompt", x: 2, y: 1, title: "Scene Prompt", subtitle: "Location + mood", icon: "FileText", hue: "emerald" },
        { id: "seedance", x: 3, y: 1, title: "Seedance 2.0 Reference", subtitle: "Video render", icon: "Film", hue: "rose", badge: "FAL" },
      ],
      edges: [
        { source: "choreoPrompt", target: "choreoImg", animated: true },
        { source: "shotPrompt", target: "shotImg", animated: true },
        { source: "location", target: "shotImg", animated: true },
        { source: "choreoImg", target: "shotImg", animated: true, label: "reference" },
        { source: "choreoImg", target: "seedance", animated: true, label: "ref A" },
        { source: "shotImg", target: "seedance", animated: true, label: "ref B" },
        { source: "scenePrompt", target: "seedance", animated: true },
      ],
    },
  },
];

export function getWorkflowBySlug(slug: string): WorkflowMarketplaceEntry | undefined {
  return WORKFLOWS.find((w) => w.slug === slug);
}

export function getAllWorkflowSlugs(): string[] {
  return WORKFLOWS.map((w) => w.slug);
}

export const WORKFLOW_CATEGORIES: { id: WorkflowMarketplaceEntry["category"]; label: string }[] = [
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "agents", label: "Agents" },
  { id: "rag", label: "RAG" },
  { id: "social", label: "Social" },
];
