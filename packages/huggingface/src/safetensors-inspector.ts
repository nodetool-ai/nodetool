/**
 * Detect model family/component from safetensors headers.
 *
 * Reads only the JSON header from .safetensors files (8-byte LE length prefix
 * + JSON blob). Never loads full tensor payloads.
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DetectionResult {
  family: string;
  component: string;
  confidence: number;
  evidence: string[];
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Internal index
// ---------------------------------------------------------------------------

interface Index {
  files: string[];
  keysPerFile: Map<string, string[]>;
  keyToFile: Map<string, string>;
  /** Parsed header metadata per file (tensor name -> {dtype, shape, data_offsets}). */
  headerMeta: Map<string, Record<string, TensorMeta>>;
}

interface TensorMeta {
  dtype: string;
  shape: number[];
  data_offsets: [number, number];
}

// ---------------------------------------------------------------------------
// Header reading
// ---------------------------------------------------------------------------

/**
 * Read the JSON header from a .safetensors file.
 * Format: 8-byte little-endian uint64 header length, then UTF-8 JSON blob.
 */
function readSafetensorsHeader(filePath: string): Record<string, TensorMeta> {
  const fd = fs.openSync(filePath, "r");
  try {
    const lenBuf = Buffer.alloc(8);
    fs.readSync(fd, lenBuf, 0, 8, 0);
    const headerLen = Number(lenBuf.readBigUInt64LE(0));

    const headerBuf = Buffer.alloc(headerLen);
    fs.readSync(fd, headerBuf, 0, headerLen, 8);
    const parsed = JSON.parse(headerBuf.toString("utf-8"));

    // The header JSON contains tensor entries keyed by name, plus an optional
    // "__metadata__" key. Filter out __metadata__.
    const result: Record<string, TensorMeta> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key === "__metadata__") continue;
      result[key] = value as TensorMeta;
    }
    return result;
  } finally {
    fs.closeSync(fd);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasAny(keys: readonly string[], substr: string): boolean {
  return keys.some((k) => k.includes(substr));
}

function hasRegex(keys: readonly string[], pattern: string): boolean {
  const re = new RegExp(pattern);
  return keys.some((k) => re.test(k));
}

function findFirst(keys: readonly string[], pattern: string): string | null {
  const re = new RegExp(pattern);
  for (const k of keys) {
    if (re.test(k)) return k;
  }
  return null;
}

function getShape(index: Index, key: string): number[] | null {
  const filePath = index.keyToFile.get(key);
  if (!filePath) return null;
  const meta = index.headerMeta.get(filePath);
  if (!meta) return null;
  const entry = meta[key];
  if (!entry || !entry.shape) return null;
  return entry.shape;
}

// ---------------------------------------------------------------------------
// Input normalisation
// ---------------------------------------------------------------------------

function normalizeInputs(src: string | string[]): string[] {
  const paths = typeof src === "string" ? [src] : src;
  const out: string[] = [];
  for (const p of paths) {
    try {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        const entries = fs
          .readdirSync(p)
          .filter((e) => e.endsWith(".safetensors"))
          .map((e) => path.join(p, e))
          .sort();
        out.push(...entries);
      } else if (p.endsWith(".safetensors")) {
        out.push(p);
      }
    } catch {
      // skip non-existent paths
    }
  }
  return [...new Set(out)].sort();
}

// ---------------------------------------------------------------------------
// Index building
// ---------------------------------------------------------------------------

function buildIndex(files: string[]): Index {
  const keysPerFile = new Map<string, string[]>();
  const keyToFile = new Map<string, string>();
  const headerMeta = new Map<string, Record<string, TensorMeta>>();

  for (const fp of files) {
    const header = readSafetensorsHeader(fp);
    headerMeta.set(fp, header);
    const keys = Object.keys(header);
    keysPerFile.set(fp, keys);
    for (const key of keys) {
      keyToFile.set(key, fp);
    }
  }

  return { files, keysPerFile, keyToFile, headerMeta };
}

// ---------------------------------------------------------------------------
// Component inference
// ---------------------------------------------------------------------------

function inferComponent(index: Index): string {
  const allKeys = Array.from(index.keyToFile.keys());

  // LoRA adapter
  if (hasRegex(allKeys, "(lora_(A|B|down|up)\\.weight)$")) {
    const hasStructuralKeys = allKeys.some(
      (key) =>
        key.includes("down_blocks.") ||
        key.includes("up_blocks.") ||
        key.includes("model.layers.") ||
        key.includes("transformer.h.")
    );
    if (!hasStructuralKeys) {
      return "lora_adapter";
    }
  }

  // Diffusers-style UNet
  if (
    allKeys.some(
      (k) =>
        k.startsWith("down_blocks.") ||
        k.startsWith("up_blocks.") ||
        k.startsWith("mid_block.")
    )
  ) {
    return "unet";
  }

  // CompVis/SD-style single-file checkpoint
  if (allKeys.some((k) => k.startsWith("model.diffusion_model."))) {
    return "unet";
  }

  // Transformer denoiser
  if (
    allKeys.some((k) => k.startsWith("transformer_blocks.")) &&
    !allKeys.some(
      (k) =>
        k.startsWith("down_blocks.") ||
        k.startsWith("up_blocks.") ||
        k.startsWith("mid_block.")
    )
  ) {
    return "transformer_denoiser";
  }

  // VAE
  if (
    hasAny(allKeys, "quant_conv.weight") ||
    hasRegex(allKeys, "^(encoder|decoder)\\.")
  ) {
    if (hasAny(allKeys, "decoder.conv_out.weight")) {
      return "vae";
    }
  }

  // Text encoder
  if (
    hasRegex(
      allKeys,
      "(?:^|\\.)(text_model|transformer\\.text_model)\\.encoder\\.layers\\.\\d+\\.self_attn\\.q_proj\\.weight$"
    )
  ) {
    return "text_encoder";
  }

  // Whisper ASR
  if (
    hasRegex(
      allKeys,
      "^model\\.encoder\\.layers\\.\\d+\\.self_attn\\.q_proj\\.weight$"
    ) &&
    hasRegex(
      allKeys,
      "^model\\.decoder\\.layers\\.\\d+\\.self_attn\\.q_proj\\.weight$"
    )
  ) {
    return "asr";
  }

  // TTS
  if (hasAny(allKeys, "text_encoder.") && hasAny(allKeys, "decoder.")) {
    if (
      hasRegex(allKeys, "(duration_predictor|pitch_predictor|energy_predictor)")
    ) {
      return "tts";
    }
  }

  // LLM
  if (
    allKeys.some(
      (k) =>
        k.startsWith("model.layers.") ||
        k.startsWith("transformer.h.") ||
        k.startsWith("gpt_neox.layers.") ||
        k.startsWith("model.decoder.layers.")
    ) ||
    hasRegex(allKeys, "(bert|roberta)\\.encoder\\.layer\\.\\d+")
  ) {
    return "llm";
  }

  return "unknown";
}

// ---------------------------------------------------------------------------
// Common details helper
// ---------------------------------------------------------------------------

function commonDetails(
  index: Index,
  sample: number = 10
): Record<string, unknown> {
  const keys = Array.from(index.keyToFile.keys()).sort();
  return {
    num_files: index.files.length,
    num_tensors: keys.length,
    sample_keys: keys.slice(0, sample)
  };
}

// ---------------------------------------------------------------------------
// Classification: Diffusion
// ---------------------------------------------------------------------------

function classifyDiffusion(
  index: Index,
  maxShapeReads: number
): DetectionResult {
  const keys = Array.from(index.keyToFile.keys());
  const evidence: string[] = [];
  let confidence = 0.0;
  let family = "unknown";
  const component = inferComponent(index);
  let readShapes = 0;

  if (component === "transformer_denoiser") {
    const ditHints = [
      "(?:^|\\.)x_embedder\\.",
      "(?:^|\\.)t_embedder\\.",
      "(?:^|\\.)pe_embedder\\.",
      "(?:^|\\.)pos_embed",
      "(?:^|\\.)patch_embed\\.proj\\.weight",
      "(?:^|\\.)adaln_",
      "(?:^|\\.)caption|context_(?:proj|embed)"
    ];
    if (ditHints.some((hint) => hasRegex(keys, hint))) {
      return {
        family: "flux",
        component,
        confidence: 0.98,
        evidence: [
          "Found transformer_blocks.* without UNet blocks",
          "Found DiT style embedder keys such as x_embedder or pe_embedder"
        ],
        details: {}
      };
    }

    return {
      family: "flux-like",
      component,
      confidence: 0.75,
      evidence: [
        "Transformer denoiser detected by top level transformer_blocks.*"
      ],
      details: {}
    };
  }

  if (component === "unet") {
    // CompVis/SD-style single-file checkpoint
    if (keys.some((k) => k.startsWith("model.diffusion_model."))) {
      if (hasAny(keys, "conditioner.embedders.")) {
        family = "sdxl-base";
        confidence = 0.9;
        evidence.push(
          "CompVis-style checkpoint with conditioner.embedders.* (SDXL hallmark)"
        );
      } else if (hasAny(keys, "cond_stage_model.transformer.")) {
        family = "sd1";
        confidence = 0.9;
        evidence.push(
          "CompVis-style checkpoint with cond_stage_model.transformer.* (SD1.x hallmark)"
        );
      } else if (hasAny(keys, "cond_stage_model.model.")) {
        family = "sd2";
        confidence = 0.88;
        evidence.push(
          "CompVis-style checkpoint with cond_stage_model.model.* (SD2.x hallmark)"
        );
      } else {
        family = "sd1";
        confidence = 0.8;
        evidence.push(
          "CompVis-style checkpoint with model.diffusion_model.* (likely SD1.x)"
        );
      }
      return { family, component, confidence, evidence, details: {} };
    }

    const probe = findFirst(
      keys,
      "^down_blocks\\.0\\.resnets\\.0\\.conv1\\.weight$"
    );
    if (probe && readShapes < maxShapeReads) {
      const shape = getShape(index, probe);
      readShapes += 1;
      if (shape && shape.length === 4 && shape[1] >= 1024) {
        return {
          family: "sdxl-refiner",
          component,
          confidence: 0.97,
          evidence: [
            `${probe} second dim ${shape[1]} suggests refiner input 1280`
          ],
          details: {}
        };
      }
    }

    if (
      hasRegex(
        keys,
        "^down_blocks\\.\\d+\\.attentions\\.\\d+\\.transformer_blocks\\.\\d+\\.attn1\\.to_q\\.weight$"
      )
    ) {
      family = "sdxl-base";
      confidence = 0.93;
      evidence.push(
        "UNet attentions include transformer_blocks.* which is characteristic of SDXL"
      );
    } else {
      evidence.push("UNet present without top level transformer denoiser");
    }

    if (
      hasRegex(
        keys,
        "(?:^|\\.)(text_model|transformer\\.text_model)\\.encoder\\.layers\\.0\\.self_attn\\.q_proj\\.weight$"
      )
    ) {
      if (
        hasRegex(
          keys,
          "(^|\\.)(text_model)\\.encoder\\.layers\\.0\\.self_attn\\.q_proj\\.weight$"
        )
      ) {
        if (family === "unknown") {
          family = "sd2";
          confidence = 0.92;
        } else {
          confidence = Math.max(confidence, 0.92);
        }
        evidence.push(
          "Found OpenCLIP naming: text_model.encoder.layers.0.self_attn.q_proj.weight"
        );
      }
      if (
        hasRegex(
          keys,
          "(^|\\.)(transformer\\.text_model)\\.encoder\\.layers\\.0\\.self_attn\\.q_proj\\.weight$"
        )
      ) {
        if (family === "unknown") {
          family = "sd1";
          confidence = 0.92;
        } else {
          if (family !== "sdxl-base") {
            family = "sd1";
          }
          confidence = Math.max(confidence, 0.92);
        }
        evidence.push(
          "Found OpenAI CLIP naming: transformer.text_model.encoder.layers.0.self_attn.q_proj.weight"
        );
      }
    }

    if (family === "unknown" || family === "sd1" || family === "sd2") {
      const crossK = findFirst(keys, "\\.attn2\\.to_k\\.weight$");
      if (crossK && readShapes < maxShapeReads) {
        const shape = getShape(index, crossK);
        readShapes += 1;
        if (shape && shape.length === 2) {
          const crossDim = shape[1];
          if (crossDim === 768 || crossDim === 1024) {
            const pred = crossDim === 768 ? "sd1" : "sd2";
            if (family === "unknown") {
              family = pred;
            }
            confidence = Math.max(confidence, 0.88);
            evidence.push(`${crossK} cross_dim=${crossDim} → ${pred}`);
          }
        }
      }
    }

    if (family === "sdxl-base") {
      return { family, component, confidence, evidence, details: {} };
    }
    if (family === "sd1" || family === "sd2") {
      return { family, component, confidence, evidence, details: {} };
    }

    return {
      family: "sd-or-sdxl-unknown",
      component,
      confidence: 0.4,
      evidence: [
        ...evidence,
        "UNet present but patterns were insufficient to decide"
      ],
      details: {}
    };
  }

  if (component === "vae") {
    return {
      family: "sd-vae",
      component,
      confidence: 0.9,
      evidence: [
        "Found quant_conv and decoder.conv_out weights, typical SD VAE"
      ],
      details: {}
    };
  }

  if (component === "text_encoder") {
    if (
      hasRegex(
        keys,
        "(^|\\.)(text_model)\\.encoder\\.layers\\.0\\.self_attn\\.q_proj\\.weight$"
      )
    ) {
      return {
        family: "openclip-text-encoder",
        component,
        confidence: 0.95,
        evidence: ["OpenCLIP text encoder naming convention detected"],
        details: {}
      };
    }
    if (
      hasRegex(
        keys,
        "(^|\\.)(transformer\\.text_model)\\.encoder\\.layers\\.0\\.self_attn\\.q_proj\\.weight$"
      )
    ) {
      return {
        family: "clip-text-encoder",
        component,
        confidence: 0.95,
        evidence: ["OpenAI CLIP text encoder naming convention detected"],
        details: {}
      };
    }
    return {
      family: "text-encoder-unknown",
      component,
      confidence: 0.4,
      evidence: ["Text encoder present without recognizable CLIP naming"],
      details: {}
    };
  }

  return {
    family: "unknown",
    component,
    confidence: 0.0,
    evidence: ["No diffusion family rules fired"],
    details: {}
  };
}

// ---------------------------------------------------------------------------
// Classification: LLM
// ---------------------------------------------------------------------------

function classifyLlm(index: Index): DetectionResult {
  const keys = Array.from(index.keyToFile.keys());

  if (
    hasRegex(
      keys,
      "^gpt_neox\\.layers\\.\\d+\\.attention\\.query_key_value\\.weight$"
    )
  ) {
    return {
      family: "gpt-neox",
      component: "llm",
      confidence: 0.98,
      evidence: ["Found gpt_neox.layers.N.attention.query_key_value.weight"],
      details: {}
    };
  }

  if (
    hasRegex(
      keys,
      "^transformer\\.h\\.\\d+\\.self_attention\\.query_key_value\\.weight$"
    )
  ) {
    if (hasAny(keys, "transformer.word_embeddings_layernorm.weight")) {
      return {
        family: "bloom",
        component: "llm",
        confidence: 0.95,
        evidence: [
          "Found transformer.h.N.self_attention.query_key_value.weight",
          "Found transformer.word_embeddings_layernorm.weight (BLOOM hallmark)"
        ],
        details: {}
      };
    }
    return {
      family: "falcon",
      component: "llm",
      confidence: 0.9,
      evidence: [
        "Found transformer.h.N.self_attention.query_key_value.weight without BLOOM layernorm"
      ],
      details: {}
    };
  }

  if (hasRegex(keys, "^model\\.layers\\.\\d+\\.self_attn\\.q_proj\\.weight$")) {
    if (
      hasRegex(
        keys,
        "^model\\.layers\\.\\d+\\.attention\\.(wqkv|w_qkv)\\.weight$"
      )
    ) {
      return {
        family: "qwen-family",
        component: "llm",
        confidence: 0.9,
        evidence: [
          "Found model.layers.N.attention.wqkv or w_qkv fused projection"
        ],
        details: {}
      };
    }
    return {
      family: "llama-family",
      component: "llm",
      confidence: 0.88,
      evidence: ["Found model.layers.N.self_attn.q_proj.weight"],
      details: {}
    };
  }

  if (
    hasRegex(
      keys,
      "^model\\.decoder\\.layers\\.\\d+\\.self_attn\\.q_proj\\.weight$"
    )
  ) {
    return {
      family: "opt",
      component: "llm",
      confidence: 0.94,
      evidence: ["Found model.decoder.layers.N.self_attn.q_proj.weight"],
      details: {}
    };
  }

  if (hasRegex(keys, "^transformer\\.h\\.\\d+\\.attn\\.q_proj\\.weight$")) {
    return {
      family: "gpt-j",
      component: "llm",
      confidence: 0.85,
      evidence: ["Found transformer.h.N.attn.q_proj.weight"],
      details: {}
    };
  }

  if (hasRegex(keys, "^transformer\\.blocks\\.\\d+\\.attn\\.Wqkv\\.weight$")) {
    return {
      family: "mpt",
      component: "llm",
      confidence: 0.95,
      evidence: ["Found transformer.blocks.N.attn.Wqkv.weight"],
      details: {}
    };
  }

  if (
    hasRegex(
      keys,
      "^encoder\\.block\\.\\d+\\.layer\\.0\\.SelfAttention\\.q\\.weight$"
    )
  ) {
    return {
      family: "t5",
      component: "llm",
      confidence: 0.95,
      evidence: ["Found encoder.block.N.layer.0.SelfAttention.q.weight"],
      details: {}
    };
  }

  if (
    hasRegex(
      keys,
      "^bert\\.encoder\\.layer\\.\\d+\\.attention\\.self\\.query\\.weight$"
    )
  ) {
    return {
      family: "bert",
      component: "llm",
      confidence: 0.96,
      evidence: ["Found bert.encoder.layer.N.attention.self.query.weight"],
      details: {}
    };
  }

  if (
    hasRegex(
      keys,
      "^roberta\\.encoder\\.layer\\.\\d+\\.attention\\.self\\.query\\.weight$"
    )
  ) {
    return {
      family: "roberta",
      component: "llm",
      confidence: 0.96,
      evidence: ["Found roberta.encoder.layer.N.attention.self.query.weight"],
      details: {}
    };
  }

  return {
    family: "llm-unknown",
    component: "llm",
    confidence: 0.4,
    evidence: [
      "LLM component detected but no family specific signature matched"
    ],
    details: {}
  };
}

// ---------------------------------------------------------------------------
// Classification: ASR
// ---------------------------------------------------------------------------

function classifyAsr(index: Index): DetectionResult {
  const keys = Array.from(index.keyToFile.keys());

  if (
    hasRegex(
      keys,
      "^model\\.encoder\\.layers\\.\\d+\\.self_attn\\.q_proj\\.weight$"
    ) &&
    hasRegex(
      keys,
      "^model\\.decoder\\.layers\\.\\d+\\.self_attn\\.q_proj\\.weight$"
    )
  ) {
    return {
      family: "whisper",
      component: "asr",
      confidence: 0.95,
      evidence: ["Found Whisper-style encoder and decoder layers"],
      details: {}
    };
  }

  return {
    family: "asr-unknown",
    component: "asr",
    confidence: 0.5,
    evidence: ["ASR component detected but no specific family matched"],
    details: {}
  };
}

// ---------------------------------------------------------------------------
// Classification: TTS
// ---------------------------------------------------------------------------

function classifyTts(index: Index): DetectionResult {
  const keys = Array.from(index.keyToFile.keys());

  if (hasRegex(keys, "(duration_predictor|pitch_predictor|energy_predictor)")) {
    return {
      family: "tts-generic",
      component: "tts",
      confidence: 0.85,
      evidence: [
        "Found duration/pitch/energy predictors typical of TTS models"
      ],
      details: {}
    };
  }

  return {
    family: "tts-unknown",
    component: "tts",
    confidence: 0.5,
    evidence: ["TTS component detected but no specific family matched"],
    details: {}
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Detect model family from one or more .safetensors files.
 *
 * @param src - A file path, directory path, or array of paths.
 * @param maxShapeReads - Maximum number of tensor shapes to inspect from headers.
 * @returns Detection result with family, component, confidence, evidence, and details.
 */
export function detectModel(
  src: string | string[],
  maxShapeReads: number = 8
): DetectionResult {
  const files = normalizeInputs(src);
  if (files.length === 0) {
    throw new Error("No .safetensors files found.");
  }

  const index = buildIndex(files);
  const component = inferComponent(index);

  if (component === "lora_adapter") {
    return {
      family: "lora-adapter",
      component,
      confidence: 0.98,
      evidence: ["Found LoRA keys such as 'lora_up.weight' or 'lora_A.weight'"],
      details: commonDetails(index, 12)
    };
  }

  if (component === "llm") {
    const result = classifyLlm(index);
    Object.assign(result.details, commonDetails(index, 10));
    return result;
  }

  if (component === "asr") {
    const result = classifyAsr(index);
    Object.assign(result.details, commonDetails(index, 10));
    return result;
  }

  if (component === "tts") {
    const result = classifyTts(index);
    Object.assign(result.details, commonDetails(index, 10));
    return result;
  }

  if (
    component === "unet" ||
    component === "transformer_denoiser" ||
    component === "text_encoder" ||
    component === "vae"
  ) {
    const result = classifyDiffusion(index, maxShapeReads);
    Object.assign(result.details, commonDetails(index, 12));
    return result;
  }

  return {
    family: "unknown",
    component,
    confidence: 0.0,
    evidence: ["No known component signatures found"],
    details: commonDetails(index, 12)
  };
}

// Re-export the header reader for use by other modules
export { readSafetensorsHeader, type TensorMeta };
