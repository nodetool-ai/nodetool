/**
 * Workflow-gallery demo videos rendered by the Remotion harness.
 *
 * One entry per example on the docs Workflow Gallery (docs/workflows/) that has
 * no matching cookbook recipe video. Each reuses the same `Tutorial` composition
 * as the cookbook videos — a title card, the real graph UI replaying the example
 * (narrated by a step indicator + lower-third captions), and a closing
 * call-to-action. `Root.tsx` registers one `Workflow-<slug>` composition per
 * entry; `scripts/render-workflows.ts` emits one MP4 per slug into
 * docs/assets/workflows/.
 *
 * Gallery examples that DO map to a cookbook recipe reuse that video directly
 * (see docs/workflows/*.md), so they are not repeated here.
 */
import type { TutorialProps } from "./Tutorial";
import type { TutorialEntry } from "./tutorials";

const INTRO_SECONDS = 2.5;
const OUTRO_SECONDS = 4;

const entry = (
  slug: string,
  props: Omit<TutorialProps, "introSeconds" | "outroSeconds">
): TutorialEntry => ({
  compositionId: `Workflow-${slug}`,
  slug,
  fps: 30,
  props: { ...props, introSeconds: INTRO_SECONDS, outroSeconds: OUTRO_SECONDS },
});

export const WORKFLOWS: TutorialEntry[] = [
  entry("transcribe-audio", {
    castId: "workflow-transcribe-audio",
    title: "Transcribe Audio",
    subtitle: "Workflow Gallery",
    replayWindowMs: 12000,
    steps: [
      { atMs: 1300, label: "Audio in", focus: "clip", zoom: 2.0 },
      { atMs: 2900, label: "Transcribe", focus: "asr", zoom: 1.9 },
      { atMs: 9300, label: "Read the text", focus: "output", zoom: 2.0 },
    ],
    captions: [
      { fromMs: 1400, toMs: 2700, text: "Start with a spoken clip — any recording you want in text." },
      { fromMs: 2900, toMs: 8200, text: "An ASR model transcribes the speech, streaming each phrase as it decodes." },
      { fromMs: 9300, toMs: 11500, text: "The finished transcript lands in the output, ready to reuse." },
    ],
    outroTitle: "Speech to text",
    outroPoints: [
      "Whisper-class transcription",
      "Word-level detail",
      "Feed it into any downstream node",
    ],
  }),

  entry("data-generator", {
    castId: "workflow-data-generator",
    title: "Data Generator",
    subtitle: "Workflow Gallery",
    replayWindowMs: 9500,
    steps: [
      { atMs: 1000, label: "Describe a dataset", focus: "generate", zoom: 1.8 },
      { atMs: 3500, label: "Stream rows", focus: "generate", zoom: 1.8 },
      { atMs: 8000, label: "Preview the table", focus: "preview", zoom: 1.8 },
    ],
    captions: [
      { fromMs: 1100, toMs: 3300, text: "Describe the dataset you want — columns and all." },
      { fromMs: 3500, toMs: 7000, text: "A Data Generator streams structured records straight into a table." },
      { fromMs: 8000, toMs: 9200, text: "The finished dataframe previews right on the canvas." },
    ],
    outroTitle: "Synthetic data on demand",
    outroPoints: [
      "Typed columns, structured rows",
      "Seed tests and demos fast",
      "Pipe it into SQLite or a chart",
    ],
  }),

  entry("creative-story-ideas", {
    castId: "workflow-creative-story-ideas",
    title: "Creative Story Ideas",
    subtitle: "Workflow Gallery",
    replayWindowMs: 12000,
    steps: [
      { atMs: 1000, label: "Genre & character", focus: "genre", zoom: 1.6 },
      { atMs: 2400, label: "Fill the prompt", focus: "prompt", zoom: 1.8 },
      { atMs: 4700, label: "Stream ideas", focus: "ideas", zoom: 1.7 },
    ],
    captions: [
      { fromMs: 1100, toMs: 2200, text: "Two inputs — a genre and a character — set the scene." },
      { fromMs: 2400, toMs: 4400, text: "They fill a prompt template, no code required." },
      { fromMs: 4700, toMs: 11500, text: "A List Generator streams story concepts one at a time." },
    ],
    outroTitle: "Brainstorm at scale",
    outroPoints: [
      "Inputs → template → generate",
      "Swap the genre for any topic",
      "Great for writers and creators",
    ],
  }),

  entry("meeting-transcript-summarizer", {
    castId: "workflow-meeting-transcript-summarizer",
    title: "Meeting Transcript Summarizer",
    subtitle: "Workflow Gallery",
    replayWindowMs: 16500,
    steps: [
      { atMs: 1300, label: "Recording in", focus: "audio", zoom: 1.9 },
      { atMs: 2900, label: "Transcribe", focus: "asr", zoom: 1.8 },
      { atMs: 8500, label: "Summarize", focus: "summarizer", zoom: 1.8 },
      { atMs: 14700, label: "Read the notes", focus: "notes", zoom: 1.9 },
    ],
    captions: [
      { fromMs: 1400, toMs: 2700, text: "Drop in a meeting recording." },
      { fromMs: 2900, toMs: 7300, text: "An ASR model transcribes it, streaming as it goes." },
      { fromMs: 8500, toMs: 13500, text: "A Summarizer condenses the transcript into action items." },
      { fromMs: 14700, toMs: 16300, text: "Concise meeting notes, ready to share." },
    ],
    outroTitle: "Never take minutes again",
    outroPoints: [
      "Transcribe, then summarize",
      "Action items in seconds",
      "Works for calls and interviews",
    ],
  }),

  entry("categorize-mails", {
    castId: "workflow-categorize-mails",
    title: "Categorize Mails",
    subtitle: "Workflow Gallery",
    replayWindowMs: 10500,
    steps: [
      { atMs: 600, label: "Search Gmail", focus: "gmail", zoom: 1.9 },
      { atMs: 2700, label: "Format email", focus: "template", zoom: 1.8 },
      { atMs: 4500, label: "Classify", focus: "classifier", zoom: 1.8 },
      { atMs: 8900, label: "Apply label", focus: "addlabel", zoom: 1.9 },
    ],
    captions: [
      { fromMs: 700, toMs: 2500, text: "Gmail Search pulls your most recent mail." },
      { fromMs: 2700, toMs: 4300, text: "Each message is formatted into a compact prompt." },
      { fromMs: 4500, toMs: 8500, text: "A Classifier picks the best category with an LLM." },
      { fromMs: 8900, toMs: 10200, text: "The matching Gmail label is applied automatically." },
    ],
    outroTitle: "An inbox that sorts itself",
    outroPoints: [
      "Search → classify → label",
      "Newsletter, Work, Family, Friends",
      "Runs on a schedule",
    ],
  }),

  entry("color-boost-video", {
    castId: "workflow-color-boost-video",
    title: "Color Boost Video",
    subtitle: "Workflow Gallery",
    replayWindowMs: 17000,
    steps: [
      { atMs: 1000, label: "A clip", focus: "clip", zoom: 1.9 },
      { atMs: 2100, label: "Split into frames", focus: "frames", zoom: 1.8 },
      { atMs: 3400, label: "Grade each frame", focus: "exposure", zoom: 1.6 },
      { atMs: 11200, label: "Reassemble", focus: "assemble", zoom: 1.8 },
    ],
    captions: [
      { fromMs: 1100, toMs: 2000, text: "Start with a short video clip." },
      { fromMs: 2100, toMs: 3300, text: "For Each Frame splits it into stills." },
      { fromMs: 3400, toMs: 10500, text: "Exposure and Saturation grade every frame for cinematic color." },
      { fromMs: 11200, toMs: 17500, text: "Frame To Video reassembles the graded frames into the finished clip." },
    ],
    outroTitle: "Grade like a pro",
    outroPoints: [
      "Per-frame color control",
      "Exposure, saturation, vibrance",
      "No timeline scrubbing",
    ],
  }),

  entry("fetch-papers", {
    castId: "workflow-fetch-papers",
    title: "Fetch Papers",
    subtitle: "Workflow Gallery",
    replayWindowMs: 17000,
    steps: [
      { atMs: 700, label: "Fetch a page", focus: "get", zoom: 1.8 },
      { atMs: 3200, label: "Extract links", focus: "links", zoom: 1.7 },
      { atMs: 5200, label: "Keep PDFs", focus: "filter", zoom: 1.7 },
      { atMs: 7200, label: "Download each", focus: "download", zoom: 1.6 },
    ],
    captions: [
      { fromMs: 800, toMs: 3000, text: "Get Text fetches a README from the web." },
      { fromMs: 3200, toMs: 5000, text: "Extract Links pulls every URL into a table." },
      { fromMs: 5200, toMs: 7000, text: "Filter keeps just the PDF papers." },
      { fromMs: 7200, toMs: 16300, text: "For Each downloads them one by one; Collect gathers the results." },
    ],
    outroTitle: "Batch downloads, hands-free",
    outroPoints: [
      "Scrape, filter, then loop",
      "For Each + Collect over any list",
      "Build a research corpus fast",
    ],
  }),
];
