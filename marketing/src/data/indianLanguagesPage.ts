import type { QaPair } from "@/lib/jsonld";

/**
 * Copy for /indian-languages, shared by the page and its Markdown mirror
 * (scripts/generate-llms-txt.mjs).
 *
 * Every claim here was checked against the product:
 * - Sarvam languages, models and voices: packages/runtime/src/providers/sarvam-provider.ts
 *   (SARVAM_TTS_LANGUAGES, SARVAM_ASR_LANGUAGES, BULBUL_MODELS,
 *   BULBUL_V4_FLASH_SPEAKERS, SAARAS_MODELS, the script detection in
 *   inferTtsLanguage, and the "clips under 30 seconds" limit).
 * - SARVAM_API_KEY: packages/config/src/setting-catalog.ts.
 * - Hindi in the Script guide's language list: web/src/components/setup/script/VoicesStep.tsx.
 *   The guide does not send the language to the speech call, so Sarvam reads
 *   it from the script of the text.
 * - Word timings as captions and SRT export: docs/harnesses.md (script voicing),
 *   packages/timeline/src/subtitles.ts, web/src/components/script/ScriptDocumentPane.tsx.
 * - Kokoro Hindi on fal: src/data/modelDirectory.generated.ts.
 * - Local Whisper: packages/whisper-cpp.
 * - Hindi interface: web/src/i18n/locales.ts, machine translated per web/src/i18n/README.md.
 * Change this file when those change.
 */

export const INDIAN_TITLE = "AI Voiceover in Hindi, Tamil & Indian Languages | NodeTool";
export const INDIAN_DESCRIPTION =
  "Voice scripts in Hindi, Tamil, Telugu, Bengali and six more Indian languages with Sarvam Bulbul voices, transcribe 22 Indian languages, export SRT captions, and cut 9:16 for Shorts and Reels.";

export const INDIAN_EYEBROW = "Indian languages";
export const INDIAN_H1 = "Voice your videos in Hindi, Tamil and eight more Indian languages.";

export const INDIAN_LEAD =
  "NodeTool connects to Sarvam AI with your own key. Write a script in Hindi, Tamil, Telugu or another Indian language, pick a Bulbul voice for each speaker, and NodeTool voices every line and lays the takes on a timeline. Saaras transcribes 22 Indian languages and English, and the voiced script exports as SRT captions. Studio is free and open source.";

/** Display names for SARVAM_TTS_LANGUAGES, in that list's order. */
export const VOICE_LANGUAGES: string[] = [
  "Bengali",
  "English (India)",
  "Gujarati",
  "Hindi",
  "Kannada",
  "Malayalam",
  "Marathi",
  "Odia",
  "Punjabi",
  "Tamil",
  "Telugu",
];

/** Display names for SARVAM_ASR_LANGUAGES, in that list's order. */
export const TRANSCRIBE_LANGUAGES: string[] = [
  "Hindi",
  "Bengali",
  "Kannada",
  "Malayalam",
  "Marathi",
  "Odia",
  "Punjabi",
  "Tamil",
  "Telugu",
  "English (India)",
  "Gujarati",
  "Assamese",
  "Urdu",
  "Nepali",
  "Konkani",
  "Kashmiri",
  "Sindhi",
  "Sanskrit",
  "Santali",
  "Manipuri",
  "Bodo",
  "Maithili",
  "Dogri",
];

export type Feature = { title: string; body: string };

export const VOICE_FEATURES: Feature[] = [
  {
    title: "Bulbul v2, v3 and v4 Flash",
    body: "Three generations of Sarvam's text-to-speech. Pick the model and a named voice per speaker in the Script guide, the same way you pick any other voice.",
  },
  {
    title: "Voices with a style",
    body: "Bulbul v4 Flash voices carry a language and a style in their name, such as ads, narration, documentary, news, kids, devotional and reels. Most are Hindi.",
  },
  {
    title: "Hinglish voices",
    body: "Bulbul v4 Flash has voices for English and Hindi mixed in one line.",
  },
  {
    title: "The language comes from the text",
    body: "Write the line in Devanagari, Tamil, Telugu, Bengali, Gujarati, Gurmukhi, Odia, Kannada or Malayalam script. Sarvam reads the language from the script. Marathi shares Devanagari with Hindi, so pick a Marathi voice for it.",
  },
];

export const FLOW_STEPS: Feature[] = [
  {
    title: "Write or import the script",
    body: "Start a Script project and write the lines in your language, or paste a script you already have. The agent can draft or translate it with any chat model you have connected, Sarvam's own chat models included.",
  },
  {
    title: "Cast the voices",
    body: "Choose a Bulbul voice for each speaker and listen to a sample on your own words before voicing the whole script.",
  },
  {
    title: "Voice and cut",
    body: "Each line is voiced as its own take, so a line you rewrite is the only one voiced again. The takes go onto a timeline you keep editing, with word timings as captions.",
  },
  {
    title: "Export captions and the cut",
    body: "Export the voiced script's captions as an SRT file for YouTube or any player, and export the timeline as video.",
  },
];

export const MORE_JOBS: { title: string; body: string; href: string; linkLabel: string }[] = [
  {
    title: "Dub an existing video",
    body: "Transcribe the source, translate it close to the original length, review the words, then voice the new track. The recipe walks through it step by step.",
    href: "/recipes/multilingual-video-dubber",
    linkLabel: "Multilingual video dubber recipe",
  },
  {
    title: "Translate a script for dubbing",
    body: "A ready workflow that translates a spoken script into the language you name and keeps it close to the original length.",
    href: "/templates/translate-a-script-for-dubbing",
    linkLabel: "Translation template",
  },
  {
    title: "Cut 9:16 for Shorts and Reels",
    body: "Resize a landscape clip to 1080×1920. This step runs on your computer with no provider charge.",
    href: "/templates/cut-a-landscape-clip-for-vertical",
    linkLabel: "Vertical cut template",
  },
];

export const COST_POINTS: string[] = [
  "Sarvam bills your own Sarvam account at its published prices. NodeTool adds nothing on top.",
  "A multilingual Whisper model can transcribe on your own computer with whisper.cpp, with no per-call charge.",
];

export const INDIAN_LIMITS: string[] = [
  "Sarvam needs its own API key, which you add in Settings. Get it from the Sarvam dashboard.",
  "Saaras transcribes clips under 30 seconds per call. Split longer audio first.",
  "The Script guide lists Hindi as a writing language. Other Indian languages work when you write in their script and pick a Bulbul voice.",
  "This site and the documentation are in English. The app interface is also available in Hindi, machine translated and partial.",
];

export const INDIAN_FAQ: QaPair[] = [
  {
    question: "Can I make AI voiceovers in Hindi?",
    answer:
      "Yes. Connect a Sarvam key, write the script in Hindi, and choose a Bulbul voice. NodeTool voices each line and places the takes on a timeline. Kokoro Hindi on fal is another option for a Hindi voice.",
  },
  {
    question: "Which Indian languages can NodeTool voice?",
    answer:
      "Sarvam Bulbul voices Bengali, Gujarati, Hindi, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu and Indian English.",
  },
  {
    question: "Which Indian languages can it transcribe?",
    answer:
      "Sarvam Saaras transcribes 22 Indian languages and English: Hindi, Bengali, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu, Gujarati, Assamese, Urdu, Nepali, Konkani, Kashmiri, Sindhi, Sanskrit, Santali, Manipuri, Bodo, Maithili and Dogri.",
  },
  {
    question: "Can I add Hindi or Tamil subtitles to a video?",
    answer:
      "Yes. Voiced script lines carry word timings, and the script exports them as an SRT subtitle file you can upload to YouTube or load in a player.",
  },
  {
    question: "Do I need a GPU?",
    answer:
      "No. Sarvam runs on Sarvam's servers, so any computer that runs Studio can use it. A GPU only matters if you choose to run open-weight models on your own computer.",
  },
  {
    question: "What does it cost?",
    answer:
      "Studio is free. You pay Sarvam, or any other provider you use, directly at its published prices. Local models have no per-call charge.",
  },
  {
    question: "Is the app available in Hindi?",
    answer:
      "Yes. Choose हिन्दी under Settings → General → Appearance. The translation is machine made and some screens still show English.",
  },
];

export const INDIAN_LINKS: { label: string; href: string }[] = [
  { label: "NodeTool in Hindi (हिन्दी)", href: "/hi" },
  { label: "AI video editor", href: "/ai-video-editor" },
  { label: "Multilingual video dubber recipe", href: "/recipes/multilingual-video-dubber" },
  { label: "Pricing and your own keys", href: "/pricing" },
  { label: "Every supported model", href: "/models" },
  { label: "Sarvam AI in the providers reference", href: "https://docs.nodetool.ai/providers#sarvam-ai" },
];
