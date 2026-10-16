/**
 * GGUF models the llama.cpp local provider recommends. The model picker
 * lists each one with a Download button until its file is in the Hugging Face
 * cache. A recommended model's id is `hf:<repo>/<file>`, which the provider
 * resolves to the cached file.
 */
import type { ModelAdapterInfo } from "./types.js";

export interface RecommendedGguf {
  repoId: string;
  file: string;
  name: string;
}

export const RECOMMENDED_CHAT_GGUFS: readonly RecommendedGguf[] = [
  {
    repoId: "unsloth/Qwen3-4B-Instruct-2507-GGUF",
    file: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
    name: "Qwen3 4B Instruct (2.5 GB)"
  },
  {
    repoId: "unsloth/gemma-3-4b-it-GGUF",
    file: "gemma-3-4b-it-Q4_K_M.gguf",
    name: "Gemma 3 4B (2.5 GB)"
  },
  {
    repoId: "bartowski/Llama-3.2-3B-Instruct-GGUF",
    file: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    name: "Llama 3.2 3B Instruct (2.0 GB)"
  },
  {
    repoId: "unsloth/Qwen3-8B-GGUF",
    file: "Qwen3-8B-Q4_K_M.gguf",
    name: "Qwen3 8B (5.0 GB)"
  }
];

export const RECOMMENDED_EMBEDDING_GGUFS: readonly RecommendedGguf[] = [
  {
    repoId: "nomic-ai/nomic-embed-text-v1.5-GGUF",
    file: "nomic-embed-text-v1.5.Q8_0.gguf",
    name: "Nomic Embed Text v1.5 (150 MB)"
  },
  {
    repoId: "Qwen/Qwen3-Embedding-0.6B-GGUF",
    file: "Qwen3-Embedding-0.6B-Q8_0.gguf",
    name: "Qwen3 Embedding 0.6B (640 MB)"
  }
];

const HF_PREFIX = "hf:";

export function recommendedGgufId(model: RecommendedGguf): string {
  return `${HF_PREFIX}${model.repoId}/${model.file}`;
}

/** The repository and file a `hf:<org>/<repo>/<file>` id names, or null. */
export function parseHfModelId(id: string): { repoId: string; file: string } | null {
  if (!id.startsWith(HF_PREFIX)) {
    return null;
  }
  const parts = id.slice(HF_PREFIX.length).split("/");
  if (parts.length < 3 || parts.some((part) => part === "" || part === "..")) {
    return null;
  }
  return { repoId: `${parts[0]}/${parts[1]}`, file: parts.slice(2).join("/") };
}

export function recommendedGgufAdapter(model: RecommendedGguf): ModelAdapterInfo {
  return {
    state: "installed",
    artifactRef: { source: "huggingface", repoId: model.repoId, path: model.file }
  };
}
