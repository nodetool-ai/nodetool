/**
 * Local Model Fit — Normalised Model Catalog  (v1 – static seed)
 *
 * This catalog is the single source of truth for the local-model-fit domain.
 * Every entry is normalised into the `ModelCatalogEntry` schema regardless
 * of its upstream origin (Ollama, llama.cpp, LM Studio).
 *
 * ## Data-sourcing strategy
 *
 * 1. **Upstream sources**: llama.cpp model metadata, Ollama library manifests,
 *    LM Studio model index.  These provide parameter counts, quant variants,
 *    context lengths, and memory footprints.
 *
 * 2. **Normalisation**: An offline ingestion script (not shipped in v1) reads
 *    the upstream manifests, maps them to `ModelCatalogEntry[]`, and writes
 *    `modelCatalog.json`.  The runtime simply imports that file.
 *
 * 3. **v1 approach**: The catalog below is hand-curated from publicly available
 *    model cards and Ollama metadata.  It covers the most relevant local-LLM
 *    families for the nodetool use-case: chat, code, reasoning, and
 *    vision-capable models up to ~70 B parameters.
 *
 * 4. **Updating the catalog**: Replace or append entries and bump the
 *    `CATALOG_VERSION` constant.  A future ingestion pipeline will automate
 *    this step.
 *
 * Memory estimates for quant variants follow the rule-of-thumb:
 *   memoryGb ≈ params_billion × bits / 8 × 1.1   (10 % overhead for KV-cache)
 */

import type { ModelCatalogEntry } from "./types";

/** Semantic version of the catalog schema + data snapshot. */
export const CATALOG_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Catalog entries
// ---------------------------------------------------------------------------

export const MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  // ── Llama 3.2 family ─────────────────────────────────────────────────
  {
    id: "llama-3.2-1b",
    name: "Llama 3.2 1B",
    family: "Llama",
    provider: "ollama",
    paramLabel: "1B",
    description: "Compact Llama 3.2 model optimised for on-device tasks.",
    releaseDate: "2024-09-25",
    architecture: "transformer",
    tags: ["chat"],
    paramsBillion: 1,
    activeParamsBillion: 1,
    contextLength: 131072,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 0.8, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 1.3, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "llama-3.2-3b",
    name: "Llama 3.2 3B",
    family: "Llama",
    provider: "ollama",
    paramLabel: "3B",
    description: "Balanced Llama 3.2 for chat and instruction following.",
    releaseDate: "2024-09-25",
    architecture: "transformer",
    tags: ["chat"],
    paramsBillion: 3,
    activeParamsBillion: 3,
    contextLength: 131072,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 2.0, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 3.5, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "llama-3.2-11b-vision",
    name: "Llama 3.2 11B Vision",
    family: "Llama",
    provider: "ollama",
    paramLabel: "11B",
    description: "Vision-capable Llama 3.2 supporting image + text inputs.",
    releaseDate: "2024-09-25",
    architecture: "transformer",
    tags: ["chat", "vision"],
    paramsBillion: 11,
    activeParamsBillion: 11,
    contextLength: 131072,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 7.0, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 12.0, bits: 8, runtime: "ollama" },
    ],
  },

  // ── Llama 3.1 family ─────────────────────────────────────────────────
  {
    id: "llama-3.1-8b",
    name: "Llama 3.1 8B",
    family: "Llama",
    provider: "ollama",
    paramLabel: "8B",
    description: "Solid 8B Llama model, good balance of speed and quality.",
    releaseDate: "2024-07-23",
    architecture: "transformer",
    tags: ["chat", "code"],
    paramsBillion: 8,
    activeParamsBillion: 8,
    contextLength: 131072,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 4.9, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 8.5, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "llama-3.1-70b",
    name: "Llama 3.1 70B",
    family: "Llama",
    provider: "ollama",
    paramLabel: "70B",
    description: "Large Llama model with strong reasoning and code capabilities.",
    releaseDate: "2024-07-23",
    architecture: "transformer",
    tags: ["chat", "code", "reasoning"],
    paramsBillion: 70,
    activeParamsBillion: 70,
    contextLength: 131072,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 40.0, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 75.0, bits: 8, runtime: "ollama" },
    ],
  },

  // ── DeepSeek R1 family ───────────────────────────────────────────────
  {
    id: "deepseek-r1-1.5b",
    name: "DeepSeek R1 1.5B",
    family: "DeepSeek",
    provider: "ollama",
    paramLabel: "1.5B",
    description: "Compact reasoning model with chain-of-thought capabilities.",
    releaseDate: "2025-01-20",
    architecture: "transformer",
    tags: ["chat", "reasoning"],
    paramsBillion: 1.5,
    activeParamsBillion: 1.5,
    contextLength: 65536,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 1.1, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 1.8, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "deepseek-r1-7b",
    name: "DeepSeek R1 7B",
    family: "DeepSeek",
    provider: "ollama",
    paramLabel: "7B",
    description: "Reasoning-focused 7B model with strong chain-of-thought.",
    releaseDate: "2025-01-20",
    architecture: "transformer",
    tags: ["chat", "reasoning", "code"],
    paramsBillion: 7,
    activeParamsBillion: 7,
    contextLength: 65536,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 4.4, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 8.0, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "deepseek-r1-14b",
    name: "DeepSeek R1 14B",
    family: "DeepSeek",
    provider: "ollama",
    paramLabel: "14B",
    description: "Strong reasoning model at the 14B scale.",
    releaseDate: "2025-01-20",
    architecture: "transformer",
    tags: ["chat", "reasoning", "code"],
    paramsBillion: 14,
    activeParamsBillion: 14,
    contextLength: 65536,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 8.5, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 15.5, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "deepseek-r1-32b",
    name: "DeepSeek R1 32B",
    family: "DeepSeek",
    provider: "ollama",
    paramLabel: "32B",
    description: "High-quality reasoning at 32B — strong general-purpose model.",
    releaseDate: "2025-01-20",
    architecture: "transformer",
    tags: ["chat", "reasoning", "code"],
    paramsBillion: 32,
    activeParamsBillion: 32,
    contextLength: 65536,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 19.5, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 35.0, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "deepseek-r1-70b",
    name: "DeepSeek R1 70B",
    family: "DeepSeek",
    provider: "ollama",
    paramLabel: "70B",
    description: "Full-size DeepSeek R1 with top-tier reasoning.",
    releaseDate: "2025-01-20",
    architecture: "transformer",
    tags: ["chat", "reasoning", "code"],
    paramsBillion: 70,
    activeParamsBillion: 70,
    contextLength: 65536,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 40.0, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 75.0, bits: 8, runtime: "ollama" },
    ],
  },

  // ── Qwen 3 family ───────────────────────────────────────────────────
  {
    id: "qwen3-0.6b",
    name: "Qwen3 0.6B",
    family: "Qwen",
    provider: "ollama",
    paramLabel: "0.6B",
    description: "Ultra-light Qwen3 for constrained devices.",
    releaseDate: "2025-04-29",
    architecture: "transformer",
    tags: ["chat"],
    paramsBillion: 0.6,
    activeParamsBillion: 0.6,
    contextLength: 40960,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 0.6, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 0.9, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "qwen3-1.7b",
    name: "Qwen3 1.7B",
    family: "Qwen",
    provider: "ollama",
    paramLabel: "1.7B",
    description: "Small but capable Qwen3 for fast local inference.",
    releaseDate: "2025-04-29",
    architecture: "transformer",
    tags: ["chat"],
    paramsBillion: 1.7,
    activeParamsBillion: 1.7,
    contextLength: 40960,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 1.2, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 2.1, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "qwen3-4b",
    name: "Qwen3 4B",
    family: "Qwen",
    provider: "ollama",
    paramLabel: "4B",
    description: "Well-rounded Qwen3 at the 4B sweet spot.",
    releaseDate: "2025-04-29",
    architecture: "transformer",
    tags: ["chat", "code"],
    paramsBillion: 4,
    activeParamsBillion: 4,
    contextLength: 40960,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 2.7, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 4.8, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "qwen3-8b",
    name: "Qwen3 8B",
    family: "Qwen",
    provider: "ollama",
    paramLabel: "8B",
    description: "Strong 8B Qwen3 with good multilingual support.",
    releaseDate: "2025-04-29",
    architecture: "transformer",
    tags: ["chat", "code"],
    paramsBillion: 8,
    activeParamsBillion: 8,
    contextLength: 40960,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 5.0, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 9.0, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "qwen3-14b",
    name: "Qwen3 14B",
    family: "Qwen",
    provider: "ollama",
    paramLabel: "14B",
    description: "High-quality 14B Qwen3 for demanding tasks.",
    releaseDate: "2025-04-29",
    architecture: "transformer",
    tags: ["chat", "code", "reasoning"],
    paramsBillion: 14,
    activeParamsBillion: 14,
    contextLength: 40960,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 8.7, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 15.8, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "qwen3-32b",
    name: "Qwen3 32B",
    family: "Qwen",
    provider: "ollama",
    paramLabel: "32B",
    description: "Large Qwen3 rivalling much bigger models.",
    releaseDate: "2025-04-29",
    architecture: "transformer",
    tags: ["chat", "code", "reasoning"],
    paramsBillion: 32,
    activeParamsBillion: 32,
    contextLength: 40960,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 19.5, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 35.0, bits: 8, runtime: "ollama" },
    ],
  },

  // ── Gemma 3 family ───────────────────────────────────────────────────
  {
    id: "gemma3-1b",
    name: "Gemma 3 1B",
    family: "Gemma",
    provider: "ollama",
    paramLabel: "1B",
    description: "Compact Google Gemma 3 for lightweight tasks.",
    releaseDate: "2025-03-12",
    architecture: "transformer",
    tags: ["chat"],
    paramsBillion: 1,
    activeParamsBillion: 1,
    contextLength: 32768,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 0.8, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 1.3, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "gemma3-4b",
    name: "Gemma 3 4B",
    family: "Gemma",
    provider: "ollama",
    paramLabel: "4B",
    description: "Efficient 4B Gemma 3 with vision support.",
    releaseDate: "2025-03-12",
    architecture: "transformer",
    tags: ["chat", "vision"],
    paramsBillion: 4,
    activeParamsBillion: 4,
    contextLength: 32768,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 2.7, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 4.8, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "gemma3-12b",
    name: "Gemma 3 12B",
    family: "Gemma",
    provider: "ollama",
    paramLabel: "12B",
    description: "Strong 12B Gemma 3 with multimodal abilities.",
    releaseDate: "2025-03-12",
    architecture: "transformer",
    tags: ["chat", "vision"],
    paramsBillion: 12,
    activeParamsBillion: 12,
    contextLength: 32768,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 7.5, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 13.5, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "gemma3-27b",
    name: "Gemma 3 27B",
    family: "Gemma",
    provider: "ollama",
    paramLabel: "27B",
    description: "Flagship Gemma 3, excellent quality for its size.",
    releaseDate: "2025-03-12",
    architecture: "transformer",
    tags: ["chat", "vision", "code", "reasoning"],
    paramsBillion: 27,
    activeParamsBillion: 27,
    contextLength: 32768,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 16.5, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 29.5, bits: 8, runtime: "ollama" },
    ],
  },

  // ── Mistral family ───────────────────────────────────────────────────
  {
    id: "mistral-7b",
    name: "Mistral 7B",
    family: "Mistral",
    provider: "ollama",
    paramLabel: "7B",
    description: "Original Mistral 7B — fast and reliable for general tasks.",
    releaseDate: "2023-09-27",
    architecture: "transformer",
    tags: ["chat", "code"],
    paramsBillion: 7,
    activeParamsBillion: 7,
    contextLength: 32768,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 4.4, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 7.7, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "mistral-nemo-12b",
    name: "Mistral Nemo 12B",
    family: "Mistral",
    provider: "ollama",
    paramLabel: "12B",
    description: "Mistral Nemo — improved quality over Mistral 7B.",
    releaseDate: "2024-07-18",
    architecture: "transformer",
    tags: ["chat", "code"],
    paramsBillion: 12,
    activeParamsBillion: 12,
    contextLength: 131072,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 7.5, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 13.0, bits: 8, runtime: "ollama" },
    ],
  },

  // ── Phi family ───────────────────────────────────────────────────────
  {
    id: "phi-4-14b",
    name: "Phi-4 14B",
    family: "Phi",
    provider: "ollama",
    paramLabel: "14B",
    description: "Microsoft Phi-4 — strong reasoning at 14B.",
    releaseDate: "2024-12-12",
    architecture: "transformer",
    tags: ["chat", "reasoning", "code"],
    paramsBillion: 14,
    activeParamsBillion: 14,
    contextLength: 16384,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 8.5, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 15.5, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "phi-3-mini-3.8b",
    name: "Phi-3 Mini 3.8B",
    family: "Phi",
    provider: "ollama",
    paramLabel: "3.8B",
    description: "Tiny Microsoft Phi for constrained setups.",
    releaseDate: "2024-04-23",
    architecture: "transformer",
    tags: ["chat"],
    paramsBillion: 3.8,
    activeParamsBillion: 3.8,
    contextLength: 4096,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 2.4, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 4.2, bits: 8, runtime: "ollama" },
    ],
  },

  // ── CodeGemma ────────────────────────────────────────────────────────
  {
    id: "codegemma-7b",
    name: "CodeGemma 7B",
    family: "Gemma",
    provider: "ollama",
    paramLabel: "7B",
    description: "Code-specialised Gemma model with FIM support.",
    releaseDate: "2024-04-09",
    architecture: "transformer",
    tags: ["code"],
    paramsBillion: 7,
    activeParamsBillion: 7,
    contextLength: 8192,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 4.4, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 7.7, bits: 8, runtime: "ollama" },
    ],
  },

  // ── Qwen 2.5 Coder ──────────────────────────────────────────────────
  {
    id: "qwen2.5-coder-7b",
    name: "Qwen 2.5 Coder 7B",
    family: "Qwen",
    provider: "ollama",
    paramLabel: "7B",
    description: "Code-specialised Qwen 2.5 model.",
    releaseDate: "2024-11-12",
    architecture: "transformer",
    tags: ["code"],
    paramsBillion: 7,
    activeParamsBillion: 7,
    contextLength: 32768,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 4.4, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 7.7, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "qwen2.5-coder-14b",
    name: "Qwen 2.5 Coder 14B",
    family: "Qwen",
    provider: "ollama",
    paramLabel: "14B",
    description: "Larger code-focused Qwen 2.5 for complex programming tasks.",
    releaseDate: "2024-11-12",
    architecture: "transformer",
    tags: ["code"],
    paramsBillion: 14,
    activeParamsBillion: 14,
    contextLength: 32768,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 8.7, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 15.8, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "qwen2.5-coder-32b",
    name: "Qwen 2.5 Coder 32B",
    family: "Qwen",
    provider: "ollama",
    paramLabel: "32B",
    description: "Top-tier open-source coding model from Qwen.",
    releaseDate: "2024-11-12",
    architecture: "transformer",
    tags: ["code"],
    paramsBillion: 32,
    activeParamsBillion: 32,
    contextLength: 32768,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 19.5, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 35.0, bits: 8, runtime: "ollama" },
    ],
  },

  // ── LLaVA (vision) ──────────────────────────────────────────────────
  {
    id: "llava-7b",
    name: "LLaVA 1.6 7B",
    family: "LLaVA",
    provider: "ollama",
    paramLabel: "7B",
    description: "Vision-language model for image understanding.",
    releaseDate: "2024-01-30",
    architecture: "transformer",
    tags: ["chat", "vision"],
    paramsBillion: 7,
    activeParamsBillion: 7,
    contextLength: 4096,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 4.5, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 8.0, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "llava-13b",
    name: "LLaVA 1.6 13B",
    family: "LLaVA",
    provider: "ollama",
    paramLabel: "13B",
    description: "Larger LLaVA for higher-quality image understanding.",
    releaseDate: "2024-01-30",
    architecture: "transformer",
    tags: ["chat", "vision"],
    paramsBillion: 13,
    activeParamsBillion: 13,
    contextLength: 4096,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 8.0, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 14.5, bits: 8, runtime: "ollama" },
    ],
  },

  // ── StarCoder2 ───────────────────────────────────────────────────────
  {
    id: "starcoder2-3b",
    name: "StarCoder2 3B",
    family: "StarCoder",
    provider: "ollama",
    paramLabel: "3B",
    description: "Compact code generation model from BigCode.",
    releaseDate: "2024-02-28",
    architecture: "transformer",
    tags: ["code"],
    paramsBillion: 3,
    activeParamsBillion: 3,
    contextLength: 16384,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 2.0, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 3.5, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "starcoder2-7b",
    name: "StarCoder2 7B",
    family: "StarCoder",
    provider: "ollama",
    paramLabel: "7B",
    description: "Mid-size code generation model.",
    releaseDate: "2024-02-28",
    architecture: "transformer",
    tags: ["code"],
    paramsBillion: 7,
    activeParamsBillion: 7,
    contextLength: 16384,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 4.4, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 7.7, bits: 8, runtime: "ollama" },
    ],
  },
  {
    id: "starcoder2-15b",
    name: "StarCoder2 15B",
    family: "StarCoder",
    provider: "ollama",
    paramLabel: "15B",
    description: "Largest StarCoder2 for complex code tasks.",
    releaseDate: "2024-02-28",
    architecture: "transformer",
    tags: ["code"],
    paramsBillion: 15,
    activeParamsBillion: 15,
    contextLength: 16384,
    variants: [
      { id: "q4_k_m", label: "Q4_K_M (4-bit)", memoryGb: 9.2, bits: 4, runtime: "ollama" },
      { id: "q8_0",   label: "Q8_0 (8-bit)",   memoryGb: 16.5, bits: 8, runtime: "ollama" },
    ],
  },
];

/**
 * Get all unique tag values across the catalog.
 */
export const getAllCatalogTags = (): string[] => {
  const set = new Set<string>();
  for (const entry of MODEL_CATALOG) {
    for (const tag of entry.tags) {
      set.add(tag);
    }
  }
  return Array.from(set).sort();
};

/**
 * Get all unique family names across the catalog.
 */
export const getAllCatalogFamilies = (): string[] => {
  const set = new Set<string>();
  for (const entry of MODEL_CATALOG) {
    set.add(entry.family);
  }
  return Array.from(set).sort();
};
