/**
 * Labels for the full model list on `/models`. The list itself is generated
 * into `modelDirectory.generated.ts` by `scripts/generate-model-directory.mjs`.
 */
import {
  canonicalModels,
  modelDirectory,
  type ModelDirectoryKind,
} from "./modelDirectory.generated";
import { PROVIDER_DISPLAY } from "./providerDisplay";

export { canonicalModels, modelDirectory };

export const MODEL_KIND_LABEL: Record<ModelDirectoryKind, string> = {
  language: "Language and vision",
  image: "Image",
  video: "Video",
  audio: "Speech, music and audio",
  transcription: "Transcription",
  "3d": "3D",
  embedding: "Embedding",
  other: "Training and other",
};

/** Names for runtime provider ids that `PROVIDER_DISPLAY` does not cover. */
const PROVIDER_NAMES: Record<string, string> = {
  aki: "AKI",
  alibaba: "Alibaba Cloud",
  antigravity: "Antigravity (Google sign-in)",
  cerebras: "Cerebras",
  chatgpt: "ChatGPT in Chrome",
  claude_agent_sdk: "Sign in with Claude",
  codex: "Sign in with ChatGPT",
  cohere: "Cohere",
  deepseek: "DeepSeek",
  dreamina: "Dreamina in Chrome",
  evolink: "Evolink",
  gemini_web: "Gemini in Chrome",
  gmi: "GMI Cloud",
  groq: "Groq",
  higgsfield: "Higgsfield",
  huggingface: "Hugging Face (local)",
  jina: "Jina AI",
  llama_cpp: "llama.cpp server",
  lmstudio: "LM Studio",
  meshy: "Meshy",
  meta: "Meta AI",
  minimax: "MiniMax",
  mistral: "Mistral AI",
  moonshot: "Kimi (Moonshot)",
  node_llama_cpp: "llama.cpp (built in)",
  ollama: "Ollama",
  openrouter: "OpenRouter",
  opper: "Opper",
  requesty: "Requesty",
  reve: "Reve",
  rodin: "Rodin",
  toapis: "ToAPIs",
  useapi: "useapi.net",
  vgenv: "vgenv",
  voyage: "Voyage AI",
  xai: "xAI",
};

export function modelProviderName(id: string): string {
  return PROVIDER_DISPLAY[id]?.name ?? PROVIDER_NAMES[id] ?? id;
}

/**
 * Distinct provider model ids across every kind and provider, and how many
 * models carry an Artificial Analysis canonical id.
 */
export function modelDirectoryCounts(): {
  models: number;
  providers: number;
  canonical: number;
} {
  const ids = new Set<string>();
  const providers = new Set<string>();
  for (const m of canonicalModels) {
    for (const r of m.routes) {
      providers.add(r.provider);
      ids.add(`${r.provider}:${r.id}`);
    }
  }
  for (const group of modelDirectory) {
    for (const p of group.providers) {
      providers.add(p.provider);
      for (const m of p.models) ids.add(`${p.provider}:${m.id}`);
    }
    for (const p of group.liveProviders) providers.add(p);
  }
  return {
    models: ids.size,
    providers: providers.size,
    canonical: canonicalModels.length,
  };
}
