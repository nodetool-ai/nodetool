import type { OnboardingCapability } from "../../stores/ProviderOnboardingStore";

import openaiIcon from "../../icons/providers/openai.svg";
import anthropicIcon from "../../icons/providers/anthropic.svg";
import geminiColorIcon from "../../icons/providers/gemini-color.svg";
import huggingfaceColorIcon from "../../icons/providers/huggingface-color.svg";
import groqIcon from "../../icons/providers/groq.svg";
import mistralColorIcon from "../../icons/providers/mistral-color.svg";
import falColorIcon from "../../icons/providers/fal-color.svg";
import replicateIcon from "../../icons/providers/replicate.svg";
import elevenlabsIcon from "../../icons/providers/elevenlabs.svg";

export interface OnboardingProvider {
  id: string;
  name: string;
  /** Secret key / env var this provider stores its credential under. */
  secretKey: string;
  icon: string;
  /** Single-color (black) glyph — needs inverting in dark mode to stay visible. */
  mono?: boolean;
  /** Supports one-click OAuth sign-in instead of pasting a key. */
  oauth?: "openai" | "hf";
  /** Short, plain-language description of what the provider is good for. */
  tagline: string;
  /** Capabilities this provider unlocks (matches the providers endpoint). */
  capabilities: OnboardingCapability[];
  /** Page where the user creates an API key. */
  keyUrl: string;
  /** Provider pricing / docs page. */
  pricingUrl: string;
  /** One-line, beginner-friendly cost summary. */
  costHint: string;
  /** Whether a free tier or free credits are available to start. */
  freeTier?: string;
  /** Highlighted as an easy first choice. */
  recommended?: boolean;
}

/**
 * Curated set of providers surfaced in onboarding. Deliberately smaller than
 * the full API-Keys registry — the goal is to give a beginner a short, clear
 * menu of good first choices, not every option. OAuth providers come first
 * because they're the easiest to connect (no key to copy).
 */
export const ONBOARDING_PROVIDERS: OnboardingProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    secretKey: "OPENAI_API_KEY",
    icon: openaiIcon,
    mono: true,
    oauth: "openai",
    tagline: "GPT for chat, plus image, speech, and embeddings.",
    capabilities: [
      "generate_message",
      "text_to_image",
      "text_to_speech",
      "automatic_speech_recognition",
      "generate_embedding"
    ],
    keyUrl: "https://platform.openai.com/api-keys",
    pricingUrl: "https://openai.com/api/pricing/",
    costHint: "Pay per token, ~$0.15–$5 per 1M tokens depending on the model.",
    recommended: true
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    secretKey: "HF_TOKEN",
    icon: huggingfaceColorIcon,
    oauth: "hf",
    tagline: "Thousands of open models for image, chat, and audio.",
    capabilities: [
      "generate_message",
      "text_to_image",
      "text_to_speech",
      "automatic_speech_recognition"
    ],
    keyUrl: "https://huggingface.co/settings/tokens",
    pricingUrl: "https://huggingface.co/docs/inference-providers/pricing",
    costHint: "Pay for compute time on serverless inference providers.",
    freeTier: "Free monthly credits",
    recommended: true
  },
  {
    id: "anthropic",
    name: "Anthropic",
    secretKey: "ANTHROPIC_API_KEY",
    icon: anthropicIcon,
    mono: true,
    tagline: "Claude models for reasoning, writing, and agents.",
    capabilities: ["generate_message"],
    keyUrl: "https://console.anthropic.com/settings/keys",
    pricingUrl: "https://www.anthropic.com/pricing#api",
    costHint: "Pay per token, ~$0.25–$15 per 1M tokens depending on the model.",
    recommended: true
  },
  {
    id: "gemini",
    name: "Google Gemini",
    secretKey: "GEMINI_API_KEY",
    icon: geminiColorIcon,
    tagline: "Gemini for chat and images, Veo for video.",
    capabilities: [
      "generate_message",
      "text_to_image",
      "text_to_video",
      "generate_embedding"
    ],
    keyUrl: "https://aistudio.google.com/apikey",
    pricingUrl: "https://ai.google.dev/pricing",
    costHint: "Pay per token, with a generous free tier to experiment.",
    freeTier: "Free tier available",
    recommended: true
  },
  {
    id: "groq",
    name: "Groq",
    secretKey: "GROQ_API_KEY",
    icon: groqIcon,
    mono: true,
    tagline: "Very fast open-model chat on custom hardware.",
    capabilities: ["generate_message", "automatic_speech_recognition"],
    keyUrl: "https://console.groq.com/keys",
    pricingUrl: "https://groq.com/pricing/",
    costHint: "Low per-token pricing, among the cheapest for open models.",
    freeTier: "Free tier available"
  },
  {
    id: "mistral",
    name: "Mistral",
    secretKey: "MISTRAL_API_KEY",
    icon: mistralColorIcon,
    tagline: "European open models for chat and embeddings.",
    capabilities: ["generate_message", "generate_embedding"],
    keyUrl: "https://console.mistral.ai/api-keys/",
    pricingUrl: "https://mistral.ai/pricing",
    costHint: "Pay per token, competitive pricing for open models.",
    freeTier: "Free tier available"
  },
  {
    id: "fal",
    name: "FAL",
    secretKey: "FAL_API_KEY",
    icon: falColorIcon,
    tagline: "Fast image and video generation (FLUX and more).",
    capabilities: ["text_to_image", "text_to_video"],
    keyUrl: "https://fal.ai/dashboard/keys",
    pricingUrl: "https://fal.ai/pricing",
    costHint: "Pay per generation, priced per image or per second of video."
  },
  {
    id: "replicate",
    name: "Replicate",
    secretKey: "REPLICATE_API_TOKEN",
    icon: replicateIcon,
    mono: true,
    tagline: "Run open image, video, and audio models in the cloud.",
    capabilities: [
      "text_to_image",
      "text_to_video",
      "text_to_music",
      "generate_message"
    ],
    keyUrl: "https://replicate.com/account/api-tokens",
    pricingUrl: "https://replicate.com/pricing",
    costHint: "Pay for compute by the second while a model runs."
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    secretKey: "ELEVENLABS_API_KEY",
    icon: elevenlabsIcon,
    mono: true,
    tagline: "High-quality, natural text-to-speech voices.",
    capabilities: ["text_to_speech"],
    keyUrl: "https://elevenlabs.io/app/settings/api-keys",
    pricingUrl: "https://elevenlabs.io/pricing",
    costHint: "Pay per character of speech generated.",
    freeTier: "Free tier available"
  }
];

/** Human-readable label for a required capability, for the dialog subtitle. */
export const CAPABILITY_LABELS: Record<OnboardingCapability, string> = {
  generate_message: "chat and language models",
  text_to_image: "image generation",
  text_to_speech: "text-to-speech",
  automatic_speech_recognition: "speech-to-text",
  text_to_music: "music generation",
  text_to_video: "video generation",
  generate_embedding: "embeddings"
};

/**
 * Providers for a blocking capability, recommended ones first. With no
 * capability we show the whole curated list (recommended first).
 */
export const providersForCapability = (
  capability?: OnboardingCapability
): OnboardingProvider[] => {
  const matches = capability
    ? ONBOARDING_PROVIDERS.filter((p) => p.capabilities.includes(capability))
    : ONBOARDING_PROVIDERS;
  return [...matches].sort(
    (a, b) => Number(b.recommended ?? false) - Number(a.recommended ?? false)
  );
};
