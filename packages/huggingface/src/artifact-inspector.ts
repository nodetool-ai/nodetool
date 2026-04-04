/**
 * Lightweight artifact inspectors for cached model files.
 *
 * All inspectors are header/metadata only and avoid loading full tensors.
 * Detected metadata annotates model entries so the UI can present
 * family/component hints (e.g., Flux, SDXL, LLaMA GGUF) without expensive I/O.
 *
 * Supports: safetensors, GGUF, JSON config/model_index.
 * Skips torch .bin inspection (requires PyTorch).
 */

import * as fs from "fs";
import { detectModel } from "./safetensors-inspector.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ArtifactDetection {
  family: string | null;
  component: string | null;
  confidence: number | null;
  evidence: string[];
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Inspect a collection of cached artifact files and return the strongest signal.
 *
 * Priority: safetensors -> GGUF -> JSON config/model_index.
 * Torch .bin files are skipped (no PyTorch dependency).
 *
 * @param paths - Array of file paths to inspect.
 * @returns Detection result or null if nothing could be determined.
 */
export function inspectPaths(paths: string[]): ArtifactDetection | null {
  if (paths.length === 0) return null;

  const lowerPaths = paths.map((p) => ({
    original: p,
    lower: p.toLowerCase()
  }));

  const safetensors = lowerPaths
    .filter((p) => p.lower.endsWith(".safetensors"))
    .map((p) => p.original);
  const ggufs = lowerPaths
    .filter((p) => p.lower.endsWith(".gguf"))
    .map((p) => p.original);
  const configFiles = lowerPaths
    .filter((p) => p.lower.endsWith("config.json"))
    .map((p) => p.original);
  const modelIndexFiles = lowerPaths
    .filter((p) => p.lower.endsWith("model_index.json"))
    .map((p) => p.original);

  if (safetensors.length > 0) {
    try {
      const stfResult = detectModel(safetensors, 6);
      if (stfResult) {
        return {
          family: stfResult.family,
          component: stfResult.component,
          confidence: stfResult.confidence,
          evidence: stfResult.evidence || []
        };
      }
    } catch {
      // fall through to next format
    }
  }

  if (ggufs.length > 0) {
    const res = detectGguf(ggufs);
    if (res) return res;
  }

  if (configFiles.length > 0 || modelIndexFiles.length > 0) {
    const res = detectFromJson(configFiles, modelIndexFiles);
    if (res) return res;
  }

  return null;
}

// ---------------------------------------------------------------------------
// GGUF detection
// ---------------------------------------------------------------------------

/**
 * Parse GGUF headers to extract arch / quant info.
 *
 * GGUF format:
 * - 4 bytes: magic "GGUF"
 * - 4 bytes: version (uint32 LE)
 * - 8 bytes: tensor_count (uint64 LE)
 * - 8 bytes: kv_count (uint64 LE)
 * - kv_count key-value pairs
 *
 * Only string-type KV pairs are extracted.
 */
export function detectGguf(paths: string[]): ArtifactDetection | null {
  if (paths.length === 0) return null;

  let info: Record<string, string>;
  try {
    info = readGgufHeader(paths[0]);
  } catch {
    return null;
  }

  const arch = (info["general.architecture"] || "").toLowerCase();
  const quant = (info["general.name"] || "").toLowerCase();
  let family: string | null = null;
  const evidence: string[] = [];

  if (arch) {
    evidence.push(`arch=${arch}`);
    if (
      arch.includes("llama") ||
      arch.includes("mistral") ||
      arch.includes("gemma") ||
      arch.includes("qwen")
    ) {
      family = "llama-family";
    } else if (arch.includes("phi")) {
      family = "phi";
    } else if (arch.includes("gptneox")) {
      family = "gpt-neox";
    }
  }

  if (!family && quant.includes("qwen")) {
    family = "qwen-family";
  }

  if (quant) {
    evidence.push(`quant=${quant}`);
  }

  return {
    family: family || "gguf-unknown",
    component: "llm",
    confidence: !arch ? 0.55 : 0.75,
    evidence
  };
}

function readGgufHeader(filePath: string): Record<string, string> {
  const fd = fs.openSync(filePath, "r");
  try {
    // Magic
    const magicBuf = Buffer.alloc(4);
    fs.readSync(fd, magicBuf, 0, 4, null);
    if (magicBuf.toString("ascii") !== "GGUF") {
      throw new Error("Not a GGUF file");
    }

    // Version (uint32 LE)
    const versionBuf = Buffer.alloc(4);
    fs.readSync(fd, versionBuf, 0, 4, null);
    // const version = versionBuf.readUInt32LE(0); // unused but consumed

    // tensor_count (uint64 LE) - skip
    const skipBuf = Buffer.alloc(8);
    fs.readSync(fd, skipBuf, 0, 8, null);

    // kv_count (uint64 LE)
    const kvCountBuf = Buffer.alloc(8);
    fs.readSync(fd, kvCountBuf, 0, 8, null);
    const kvCount = Number(kvCountBuf.readBigUInt64LE(0));

    const info: Record<string, string> = {};

    for (let i = 0; i < kvCount; i++) {
      // Key: uint32 length + UTF-8 bytes
      const keyLenBuf = Buffer.alloc(4);
      fs.readSync(fd, keyLenBuf, 0, 4, null);
      const keyLen = keyLenBuf.readUInt32LE(0);
      const keyBuf = Buffer.alloc(keyLen);
      fs.readSync(fd, keyBuf, 0, keyLen, null);
      const key = keyBuf.toString("utf-8");

      // Value type: uint32 LE
      const typeBuf = Buffer.alloc(4);
      fs.readSync(fd, typeBuf, 0, 4, null);
      const valueType = typeBuf.readUInt32LE(0);

      if (valueType === 2) {
        // String: uint32 length + UTF-8 bytes
        // Note: GGUF v3 uses uint64 for string lengths but many files use uint32.
        // We read uint32 here matching the Python reference.
        const strLenBuf = Buffer.alloc(4);
        fs.readSync(fd, strLenBuf, 0, 4, null);
        const strLen = strLenBuf.readUInt32LE(0);
        const strBuf = Buffer.alloc(strLen);
        fs.readSync(fd, strBuf, 0, strLen, null);
        info[key] = strBuf.toString("utf-8");
      } else {
        skipGgufValue(fd, valueType);
      }
    }

    return info;
  } finally {
    fs.closeSync(fd);
  }
}

function skipGgufValue(fd: number, valueType: number): void {
  if (valueType === 0 || valueType === 1) {
    // uint8 / int8
    const buf = Buffer.alloc(1);
    fs.readSync(fd, buf, 0, 1, null);
  } else if (valueType === 3 || valueType === 4) {
    // Array types: skip length (uint64) + payload
    const lenBuf = Buffer.alloc(8);
    fs.readSync(fd, lenBuf, 0, 8, null);
    const length = Number(lenBuf.readBigUInt64LE(0));
    const payload = Buffer.alloc(length);
    fs.readSync(fd, payload, 0, length, null);
  } else {
    // Fallback: skip 8 bytes to avoid misalignment
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, null);
  }
}

// ---------------------------------------------------------------------------
// Diffusers pipeline class name → { family, component } table
// ---------------------------------------------------------------------------

/**
 * Maps known diffusers pipeline class names to { family, component } pairs.
 * Exact string matching avoids the fragility of substring checks.
 */
const _PIPELINE_CLASS_DETECTION: Readonly<
  Record<string, { family: string; component: string }>
> = {
  StableDiffusionPipeline: { family: "stable-diffusion", component: "unet" },
  StableDiffusionImg2ImgPipeline: {
    family: "stable-diffusion",
    component: "unet"
  },
  StableDiffusionInpaintPipeline: {
    family: "stable-diffusion",
    component: "unet"
  },
  StableDiffusionUpscalePipeline: {
    family: "stable-diffusion",
    component: "unet"
  },
  StableDiffusionXLPipeline: { family: "sdxl", component: "unet" },
  StableDiffusionXLImg2ImgPipeline: { family: "sdxl", component: "unet" },
  StableDiffusionXLInpaintPipeline: { family: "sdxl", component: "unet" },
  StableDiffusionXLControlNetPipeline: { family: "sdxl", component: "unet" },
  StableDiffusionXLRefinerPipeline: {
    family: "sdxl-refiner",
    component: "unet"
  },
  StableDiffusion3Pipeline: { family: "sd3", component: "transformer" },
  StableDiffusion3Img2ImgPipeline: { family: "sd3", component: "transformer" },
  StableDiffusion3InpaintPipeline: { family: "sd3", component: "transformer" },
  FluxPipeline: { family: "flux", component: "transformer" },
  FluxFillPipeline: { family: "flux", component: "transformer" },
  FluxControlNetPipeline: { family: "flux", component: "transformer" },
  FluxKontextPipeline: { family: "flux", component: "transformer" },
  FluxDepthPipeline: { family: "flux", component: "transformer" },
  FluxReduxPipeline: { family: "flux", component: "transformer" },
  QwenImagePipeline: { family: "qwen-image", component: "transformer" },
  QwenImageEditPlusPipeline: { family: "qwen-image", component: "transformer" },
  PixArtAlphaPipeline: { family: "pixart-alpha", component: "transformer" },
  PixArtSigmaPipeline: { family: "pixart-sigma", component: "transformer" }
};

/**
 * Infer family/component from config.json or model_index.json files.
 */
export function detectFromJson(
  configFiles: string[],
  modelIndexFiles: string[]
): ArtifactDetection | null {
  const configs = configFiles.map((p) => safeLoadJson(p));
  const modelIndexes = modelIndexFiles.map((p) => safeLoadJson(p));

  // Check model_index.json for diffusers components
  for (const mi of modelIndexes) {
    if (!mi) continue;

    // Handle _class_name as a string (real diffusers model_index.json format).
    // Use an exact lookup table to avoid fragile substring ordering.
    if (typeof mi._class_name === "string") {
      const detection = _PIPELINE_CLASS_DETECTION[mi._class_name];
      if (detection) {
        return {
          family: detection.family,
          component: detection.component,
          confidence: 0.75,
          evidence: [`model_index.json _class_name: ${mi._class_name}`]
        };
      }
    }

    const pipelines = mi.pipelines || mi._class_name;
    if (Array.isArray(pipelines)) {
      const pipelineStrs = pipelines.map((p: unknown) =>
        String(p).toLowerCase()
      );
      if (
        pipelineStrs.some((p: string) => p.includes("unet2dconditionmodel"))
      ) {
        return {
          family: "sd-or-sdxl-unknown",
          component: "unet",
          confidence: 0.6,
          evidence: ["model_index.json lists UNet2DConditionModel"]
        };
      }
    }
    if (mi.transformers) {
      const tfms = mi.transformers;
      if (Array.isArray(tfms)) {
        const names = tfms.map((t: unknown) => String(t).toLowerCase());
        if (names.some((n: string) => n.includes("cliptextmodel"))) {
          return {
            family: "clip-text-encoder",
            component: "text_encoder",
            confidence: 0.55,
            evidence: ["model_index.json lists CLIPTextModel"]
          };
        }
      }
    }
  }

  // Inspect configs (HuggingFace transformer configs)
  for (const cfg of configs) {
    if (!cfg) continue;
    const modelType = String(cfg.model_type || "").toLowerCase();
    const rawArchs = cfg.architectures;
    const archs = (Array.isArray(rawArchs) ? rawArchs : []).map((a: unknown) =>
      String(a).toLowerCase()
    );
    if (modelType || archs.length > 0) {
      const fam = familyFromModelType(modelType, archs);
      if (fam) return fam;
    }
    // Vision encoders
    if (cfg.vision_config !== undefined && cfg.text_config !== undefined) {
      return {
        family: "multimodal-vision-text",
        component: "vision_text",
        confidence: 0.5,
        evidence: ["config contains both vision_config and text_config"]
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Model type -> family mapping
// ---------------------------------------------------------------------------

/**
 * Map model_type strings and architecture names to families.
 */
export function familyFromModelType(
  modelType: string,
  archs: string[]
): ArtifactDetection | null {
  const mt = modelType;
  const has = (target: string): boolean =>
    mt.includes(target) || archs.some((a) => a.includes(target));

  if (has("bert") && !has("roberta") && !has("deberta")) {
    return {
      family: "bert",
      component: "llm",
      confidence: 0.9,
      evidence: ["model_type/arch includes bert"]
    };
  }
  if (has("roberta")) {
    return {
      family: "roberta",
      component: "llm",
      confidence: 0.9,
      evidence: ["model_type/arch includes roberta"]
    };
  }
  if (has("deberta")) {
    return {
      family: "deberta",
      component: "llm",
      confidence: 0.8,
      evidence: ["model_type/arch includes deberta"]
    };
  }
  if (has("bart")) {
    return {
      family: "opt",
      component: "llm",
      confidence: 0.7,
      evidence: ["model_type/arch includes bart/decoder"]
    };
  }
  if (has("gpt2")) {
    return {
      family: "gpt2",
      component: "llm",
      confidence: 0.7,
      evidence: ["model_type/arch includes gpt2"]
    };
  }
  if (has("clip")) {
    return {
      family: "clip-text-encoder",
      component: "text_encoder",
      confidence: 0.6,
      evidence: ["model_type/arch includes clip"]
    };
  }
  if (has("whisper")) {
    return {
      family: "whisper",
      component: "llm",
      confidence: 0.7,
      evidence: ["model_type/arch includes whisper"]
    };
  }
  if (has("vit")) {
    return {
      family: "vision",
      component: "vision_encoder",
      confidence: 0.5,
      evidence: ["model_type/arch includes vit"]
    };
  }
  if (has("yolos") || has("detr")) {
    return {
      family: "vision",
      component: "detection",
      confidence: 0.6,
      evidence: ["model_type/arch includes yolos/detr"]
    };
  }
  if (has("segformer")) {
    return {
      family: "vision",
      component: "segmentation",
      confidence: 0.6,
      evidence: ["model_type/arch includes segformer"]
    };
  }
  if (has("blip")) {
    return {
      family: "blip",
      component: "vision_text",
      confidence: 0.6,
      evidence: ["model_type/arch includes blip"]
    };
  }
  if (has("llama")) {
    return {
      family: "llama-family",
      component: "llm",
      confidence: 0.7,
      evidence: ["model_type/arch includes llama"]
    };
  }
  if (has("mistral")) {
    return {
      family: "llama-family",
      component: "llm",
      confidence: 0.7,
      evidence: ["model_type/arch includes mistral"]
    };
  }
  if (has("qwen")) {
    return {
      family: "qwen-family",
      component: "llm",
      confidence: 0.7,
      evidence: ["model_type/arch includes qwen"]
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeLoadJson(filePath: string): Record<string, unknown> | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
