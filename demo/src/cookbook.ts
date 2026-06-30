/**
 * Cookbook recipe videos rendered by the Remotion harness.
 *
 * One entry per recipe in docs/cookbook/patterns.md. Each reuses the same
 * `Tutorial` composition as the beginner tutorials — a title card, the real
 * graph UI replaying the recipe (narrated by a step indicator + lower-third
 * captions), and a closing call-to-action drawn from the recipe's "When to use".
 * `Root.tsx` registers one `Cookbook-<slug>` composition per entry; the render
 * scripts (package.json) emit one MP4 per slug into web/public/cookbook/.
 */
import type { TutorialProps } from "./Tutorial";
import type { TutorialEntry } from "./tutorials";

const INTRO_SECONDS = 2.5;
const OUTRO_SECONDS = 4;

const entry = (
  slug: string,
  props: Omit<TutorialProps, "introSeconds" | "outroSeconds">
): TutorialEntry => ({
  compositionId: `Cookbook-${slug}`,
  slug,
  fps: 30,
  props: { ...props, introSeconds: INTRO_SECONDS, outroSeconds: OUTRO_SECONDS },
});

export const COOKBOOK: TutorialEntry[] = [
  entry("image-enhancement", {
    castId: "cookbook-image-enhancement",
    title: "Image Enhancement",
    subtitle: "Pattern 1 · Simple Pipeline",
    replayWindowMs: 12000,
    steps: [
      { atMs: 1300, label: "A photo", focus: "photo", zoom: 2.2 },
      { atMs: 3600, label: "Sharpen", focus: "sharpen", zoom: 2.0 },
      { atMs: 6400, label: "Auto-contrast", focus: "contrast", zoom: 2.0 },
    ],
    captions: [
      { fromMs: 1400, toMs: 3400, text: "Start with an image — the simplest pipeline is just input → process → output." },
      { fromMs: 3600, toMs: 6200, text: "An Unsharp Mask filter crisps up the detail, rendering the result right in the node." },
      { fromMs: 6500, toMs: 11500, text: "Auto Contrast balances the tones — two filters chained, no code." },
    ],
    outroTitle: "Chain any transforms",
    outroPoints: [
      "Single input, single output",
      "Each node does one job",
      "No conditional logic needed",
    ],
  }),

  entry("image-to-story", {
    castId: "cookbook-image-to-story",
    title: "Image to Story",
    subtitle: "Pattern 2 · Agent-Driven Generation",
    replayWindowMs: 18000,
    steps: [
      { atMs: 1300, label: "A picture", focus: "photo", zoom: 2.0 },
      { atMs: 3200, label: "Write a story", focus: "story", zoom: 1.9 },
      { atMs: 10300, label: "Narrate it", focus: "speak", zoom: 1.95 },
    ],
    captions: [
      { fromMs: 1400, toMs: 3000, text: "Feed a picture to a vision Agent — multimodal in, text out." },
      { fromMs: 3200, toMs: 9200, text: "The Agent writes a short story about the image, streaming as it thinks." },
      { fromMs: 10300, toMs: 16000, text: "A Text To Speech node turns the story into narration you can play." },
    ],
    outroTitle: "Generate across modalities",
    outroPoints: [
      "Image → text → audio in one graph",
      "Swap the Agent's instructions for any task",
      "Great for captions, stories, and voiceover",
    ],
  }),

  entry("movie-poster", {
    castId: "cookbook-movie-poster",
    title: "Movie Poster Generator",
    subtitle: "Pattern 3 · Streaming with Previews",
    replayWindowMs: 25500,
    steps: [
      { atMs: 1300, label: "Three inputs", focus: "strategyPrompt", zoom: 1.4 },
      { atMs: 4200, label: "Plan a strategy", focus: "strategy", zoom: 1.7 },
      { atMs: 12100, label: "Stream ideas", focus: "ideas", zoom: 1.7 },
      { atMs: 18600, label: "Render the poster", focus: "poster", zoom: 1.7 },
    ],
    captions: [
      { fromMs: 1400, toMs: 4000, text: "Title, genre, and audience fill a strategy prompt template." },
      { fromMs: 4200, toMs: 10000, text: "An Agent plans the creative direction — mirrored live in a preview." },
      { fromMs: 12100, toMs: 17400, text: "A List Generator streams poster ideas, one prompt at a time." },
      { fromMs: 18600, toMs: 23000, text: "The best idea drives a Text To Image node — the poster renders on the canvas." },
    ],
    outroTitle: "See every stage",
    outroPoints: [
      "Preview nodes show intermediate results",
      "Agent planning feeds generation",
      "Stream prompts, then render",
    ],
  }),

  entry("chat-with-docs", {
    castId: "cookbook-chat-with-docs",
    title: "Chat with Docs",
    subtitle: "Pattern 4 · Retrieval-Augmented Generation",
    replayWindowMs: 18500,
    steps: [
      { atMs: 1300, label: "Ask a question", focus: "question", zoom: 2.0 },
      { atMs: 2300, label: "Retrieve context", focus: "search", zoom: 1.9 },
      { atMs: 7300, label: "Grounded answer", focus: "answer", zoom: 1.8 },
    ],
    captions: [
      { fromMs: 1400, toMs: 2200, text: "A question both runs a search and feeds a prompt template." },
      { fromMs: 2400, toMs: 7000, text: "Hybrid Search pulls the most relevant passages from your documents." },
      { fromMs: 7300, toMs: 14000, text: "Those passages become context — the Agent streams an answer grounded in your docs." },
    ],
    outroTitle: "Answer from your sources",
    outroPoints: [
      "Search → inject context → generate",
      "Cut hallucinations with real passages",
      "Index PDFs once, query forever",
    ],
  }),

  entry("flashcards-sqlite", {
    castId: "cookbook-flashcards-sqlite",
    title: "AI Flashcards with SQLite",
    subtitle: "Pattern 5 · Database Persistence",
    replayWindowMs: 16000,
    steps: [
      { atMs: 1300, label: "Topic & table", focus: "generate", zoom: 1.6 },
      { atMs: 4100, label: "Generate cards", focus: "generate", zoom: 1.7 },
      { atMs: 11200, label: "Query & show", focus: "preview", zoom: 1.7 },
    ],
    captions: [
      { fromMs: 1400, toMs: 4000, text: "A topic fills a prompt while a SQLite table is created in parallel." },
      { fromMs: 4100, toMs: 9000, text: "A Data Generator streams structured flashcards straight into the database." },
      { fromMs: 11200, toMs: 15500, text: "Query reads them back — persistent data you can recall any time." },
    ],
    outroTitle: "Give workflows memory",
    outroPoints: [
      "Create a table, insert, then query",
      "Persist generated data across runs",
      "Build apps that remember",
    ],
  }),

  entry("summarize-newsletters", {
    castId: "cookbook-summarize-newsletters",
    title: "Summarize Newsletters",
    subtitle: "Pattern 6 · Email & Web Integration",
    replayWindowMs: 15500,
    steps: [
      { atMs: 1300, label: "Search Gmail", focus: "gmail", zoom: 1.9 },
      { atMs: 4200, label: "Summarize", focus: "summarizer", zoom: 1.8 },
      { atMs: 12200, label: "Read summary", focus: "summary", zoom: 1.9 },
    ],
    captions: [
      { fromMs: 1400, toMs: 3300, text: "Gmail Search pulls this week's newsletters by label and date." },
      { fromMs: 4200, toMs: 11000, text: "A Summarizer condenses the body to its key points, streaming as it writes." },
      { fromMs: 12200, toMs: 15000, text: "The summary and the raw body land side by side for review." },
    ],
    outroTitle: "Automate your inbox",
    outroPoints: [
      "Search Gmail, format, summarize",
      "Works for RSS and web content too",
      "Triage long reading in seconds",
    ],
  }),

  entry("realtime-agent", {
    castId: "cookbook-realtime-agent",
    title: "Realtime Agent",
    subtitle: "Pattern 7 · Realtime Processing",
    replayWindowMs: 12000,
    steps: [
      { atMs: 900, label: "Speak", focus: "mic", zoom: 2.0 },
      { atMs: 1800, label: "Realtime reply", focus: "agent", zoom: 1.9 },
      { atMs: 9000, label: "Read it", focus: "preview", zoom: 1.95 },
    ],
    captions: [
      { fromMs: 1000, toMs: 1700, text: "Streaming microphone audio flows straight into the graph." },
      { fromMs: 1900, toMs: 8000, text: "A Realtime Agent answers as you speak — text and audio at once." },
      { fromMs: 9000, toMs: 11500, text: "The reply lands in a preview, ready for the next turn." },
    ],
    outroTitle: "Build voice interfaces",
    outroPoints: [
      "Stream audio in, stream a reply out",
      "Live transcription and responses",
      "Low-latency, interactive apps",
    ],
  }),

  entry("audio-to-image", {
    castId: "cookbook-audio-to-image",
    title: "Audio to Image",
    subtitle: "Pattern 8 · Multi-Modal Workflows",
    replayWindowMs: 16500,
    steps: [
      { atMs: 1300, label: "Audio in", focus: "clip", zoom: 2.0 },
      { atMs: 2400, label: "Transcribe", focus: "transcribe", zoom: 1.9 },
      { atMs: 8300, label: "Generate image", focus: "image", zoom: 1.9 },
    ],
    captions: [
      { fromMs: 1400, toMs: 2200, text: "Start with a spoken clip — any audio you want to turn into a picture." },
      { fromMs: 2400, toMs: 7300, text: "Whisper transcribes the speech to text, streaming each phrase." },
      { fromMs: 8300, toMs: 14000, text: "The transcript becomes the prompt — an image renders from what was said." },
    ],
    outroTitle: "Convert between media",
    outroPoints: [
      "Audio → text → image, chained",
      "Whisper bridges speech and prompts",
      "Mix and match any modalities",
    ],
  }),

  entry("style-transfer", {
    castId: "cookbook-style-transfer",
    title: "Style Transfer",
    subtitle: "Pattern 9 · Advanced Image Processing",
    replayWindowMs: 16500,
    steps: [
      { atMs: 1300, label: "Two images", focus: "content", zoom: 1.7 },
      { atMs: 5100, label: "Describe content", focus: "describe", zoom: 1.8 },
      { atMs: 7900, label: "Restyle", focus: "transfer", zoom: 1.8 },
    ],
    captions: [
      { fromMs: 1400, toMs: 4900, text: "A content image and a style image — Fit normalizes the content first." },
      { fromMs: 5100, toMs: 7700, text: "Image To Text captions the content so the model knows what it's drawing." },
      { fromMs: 7900, toMs: 14000, text: "An image-to-image model re-renders it in the reference style." },
    ],
    outroTitle: "Reshape images",
    outroPoints: [
      "Preserve structure, change style",
      "Img2Img keeps the composition",
      "Caption-guided generation",
    ],
  }),

  entry("data-visualization", {
    castId: "cookbook-data-visualization",
    title: "Data Visualization",
    subtitle: "Pattern 10 · Data Processing Pipeline",
    replayWindowMs: 15500,
    steps: [
      { atMs: 1300, label: "Fetch CSV", focus: "get", zoom: 1.9 },
      { atMs: 4100, label: "Filter data", focus: "filter", zoom: 1.9 },
      { atMs: 7000, label: "Make a chart", focus: "chart", zoom: 1.8 },
    ],
    captions: [
      { fromMs: 1400, toMs: 3300, text: "Fetch CSV from the web and parse it into a dataframe." },
      { fromMs: 4100, toMs: 6700, text: "Filter the rows — the table preview updates with the result." },
      { fromMs: 7000, toMs: 13000, text: "A Chart Generator turns the data into a Plotly chart, no plotting code." },
    ],
    outroTitle: "From data to insight",
    outroPoints: [
      "Fetch, parse, filter, visualize",
      "Branch into table and chart",
      "AI-generated charts on the fly",
    ],
  }),

  entry("text-to-video", {
    castId: "cookbook-text-to-video",
    title: "Text to Video",
    subtitle: "Pattern 11 · Text-to-Video",
    replayWindowMs: 13500,
    steps: [
      { atMs: 1300, label: "A prompt", focus: "prompt", zoom: 2.0 },
      { atMs: 2400, label: "Generate video", focus: "kling", zoom: 1.95 },
      { atMs: 9700, label: "The clip", focus: "output", zoom: 2.0 },
    ],
    captions: [
      { fromMs: 1400, toMs: 2200, text: "Describe the shot you want — a single prompt is enough." },
      { fromMs: 2400, toMs: 9100, text: "A text-to-video model renders a cinematic clip, progress bar and all." },
      { fromMs: 9700, toMs: 13000, text: "The finished video plays right inside the node." },
    ],
    outroTitle: "Prompt to motion",
    outroPoints: [
      "Concept videos and storyboards",
      "5–10 second clips per run",
      "Pick 16:9, 9:16, or 1:1",
    ],
  }),

  entry("image-to-video", {
    castId: "cookbook-image-to-video",
    title: "Image to Video",
    subtitle: "Pattern 12 · Image-to-Video",
    replayWindowMs: 13500,
    steps: [
      { atMs: 1300, label: "Image + motion", focus: "image", zoom: 1.9 },
      { atMs: 2400, label: "Animate it", focus: "kling", zoom: 1.9 },
      { atMs: 9800, label: "The clip", focus: "output", zoom: 2.0 },
    ],
    captions: [
      { fromMs: 1400, toMs: 2200, text: "Start with a still image and a short motion guide." },
      { fromMs: 2400, toMs: 9100, text: "An image-to-video model brings the photo to life with that motion." },
      { fromMs: 9800, toMs: 13000, text: "The animated clip renders in the node — no keyframing by hand." },
    ],
    outroTitle: "Bring stills to life",
    outroPoints: [
      "Animate photographs and art",
      "Guide the motion with a prompt",
      "Product shots and showcases",
    ],
  }),

  entry("talking-avatar", {
    castId: "cookbook-talking-avatar",
    title: "Talking Avatar",
    subtitle: "Pattern 13 · Talking Avatar",
    replayWindowMs: 14000,
    steps: [
      { atMs: 1300, label: "Face + speech", focus: "face", zoom: 1.9 },
      { atMs: 2400, label: "Lip-sync", focus: "avatar", zoom: 1.9 },
      { atMs: 10300, label: "The clip", focus: "output", zoom: 2.0 },
    ],
    captions: [
      { fromMs: 1400, toMs: 2200, text: "A front-facing portrait plus a speech track." },
      { fromMs: 2400, toMs: 9600, text: "An avatar model lip-syncs the face to the audio." },
      { fromMs: 10300, toMs: 13500, text: "Out comes a virtual presenter, speaking your script." },
    ],
    outroTitle: "Create virtual presenters",
    outroPoints: [
      "Lip-synced avatar videos",
      "Educational and spokesperson content",
      "Standard or Pro quality",
    ],
  }),

  entry("image-upscaling", {
    castId: "cookbook-image-upscaling",
    title: "Image Upscaling",
    subtitle: "Pattern 14 · Enhancement & Upscaling",
    replayWindowMs: 12000,
    steps: [
      { atMs: 1300, label: "Low-res in", focus: "lowres", zoom: 2.0 },
      { atMs: 2400, label: "Upscale", focus: "upscale", zoom: 1.95 },
      { atMs: 8400, label: "High-res out", focus: "output", zoom: 2.0 },
    ],
    captions: [
      { fromMs: 1400, toMs: 2200, text: "Drop in a low-resolution or noisy image." },
      { fromMs: 2400, toMs: 7800, text: "A Topaz upscaler lifts the resolution and cleans up artifacts." },
      { fromMs: 8400, toMs: 11500, text: "The crisp, high-resolution result is ready to use." },
    ],
    outroTitle: "Upscale anything",
    outroPoints: [
      "Old photos and smartphone shots",
      "Denoise while you upscale",
      "Prepare images for big displays",
    ],
  }),

  entry("storyboard-to-video", {
    castId: "cookbook-storyboard-to-video",
    title: "Storyboard to Video",
    subtitle: "Pattern 15 · Storyboard to Video",
    replayWindowMs: 15500,
    steps: [
      { atMs: 1300, label: "Story + scenes", focus: "scene2", zoom: 1.5 },
      { atMs: 2800, label: "Fill transitions", focus: "sora", zoom: 1.8 },
      { atMs: 12100, label: "The film", focus: "output", zoom: 1.9 },
    ],
    captions: [
      { fromMs: 1400, toMs: 2600, text: "A story prompt plus up to three keyframe scenes." },
      { fromMs: 2800, toMs: 11000, text: "A keyframe video model fills smooth transitions between the scenes." },
      { fromMs: 12100, toMs: 15000, text: "One coherent video, assembled from your storyboard." },
    ],
    outroTitle: "Storyboards become film",
    outroPoints: [
      "1–3 keyframes per clip",
      "Smooth, narrative transitions",
      "Pre-visualize a scene fast",
    ],
  }),
];
