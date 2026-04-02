import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  _matchesAnyPattern,
  _matchesAnyPatternCi,
  _isWeightFile,
  _hasShardedWeights,
  _hasQuantizedVariants,
  _hasAdapterCandidates,
  _allSameFamily,
  detectRepoPackaging,
  RepoPackagingHint,
  _isSingleFileDiffusionWeight,
  _isDiffusionArtifactCandidate,
  _calculateRepoStats,
  _inferModelTypeFromLocalConfigs,
  _derivePipelineTag,
  _buildSearchConfigForType,
  _matchesArtifactDetection,
  _matchesRepoForType,
  _matchesModelType,
  _parseGgufFlatFilename,
  _CONFIG_MODEL_TYPE_MAPPING,
  _CONFIG_MODEL_TYPE_ARCHITECTURE_MAPPING,
  CLASSNAME_TO_MODEL_TYPE,
  KNOWN_TYPE_REPO_MATCHERS,
  SINGLE_FILE_DIFFUSION_EXTENSIONS,
  HF_DEFAULT_FILE_PATTERNS
} from "../src/hf-models.js";

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

describe("_matchesAnyPattern", () => {
  it("returns true for empty pattern list (match-all)", () => {
    expect(_matchesAnyPattern("anything", [])).toBe(true);
  });

  it("matches exact string", () => {
    expect(_matchesAnyPattern("model.safetensors", ["model.safetensors"])).toBe(
      true
    );
  });

  it("matches with * wildcard", () => {
    expect(
      _matchesAnyPattern("unet_model.safetensors", ["*.safetensors"])
    ).toBe(true);
  });

  it("does not match when no pattern fits", () => {
    expect(_matchesAnyPattern("model.bin", ["*.safetensors", "*.gguf"])).toBe(
      false
    );
  });

  it("matches with ? wildcard", () => {
    expect(_matchesAnyPattern("model1", ["model?"])).toBe(true);
    expect(_matchesAnyPattern("model12", ["model?"])).toBe(false);
  });
});

describe("_matchesAnyPatternCi", () => {
  it("matches case-insensitively", () => {
    expect(_matchesAnyPatternCi("FLUX_MODEL", ["*flux*"])).toBe(true);
    expect(_matchesAnyPatternCi("Stable-Diffusion", ["*stable*"])).toBe(true);
  });

  it("returns false when no pattern matches", () => {
    expect(_matchesAnyPatternCi("bert-base", ["*flux*"])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// _isWeightFile
// ---------------------------------------------------------------------------

describe("_isWeightFile", () => {
  it("recognises .safetensors", () => {
    expect(_isWeightFile("model.safetensors")).toBe(true);
  });

  it("recognises .bin", () => {
    expect(_isWeightFile("pytorch_model.bin")).toBe(true);
  });

  it("recognises .gguf", () => {
    expect(_isWeightFile("model.gguf")).toBe(true);
  });

  it("recognises .ckpt", () => {
    expect(_isWeightFile("v1-5.ckpt")).toBe(true);
  });

  it("rejects non-weight files", () => {
    expect(_isWeightFile("config.json")).toBe(false);
    expect(_isWeightFile("tokenizer.json")).toBe(false);
    expect(_isWeightFile("README.md")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// _hasShardedWeights
// ---------------------------------------------------------------------------

describe("_hasShardedWeights", () => {
  it("detects model.safetensors.index.json", () => {
    expect(_hasShardedWeights(["model.safetensors.index.json"])).toBe(true);
  });

  it("detects -00001-of- shard pattern", () => {
    expect(_hasShardedWeights(["model-00001-of-00004.safetensors"])).toBe(true);
  });

  it("detects .index.json suffix", () => {
    expect(_hasShardedWeights(["pytorch_model.bin.index.json"])).toBe(true);
  });

  it("returns false for regular files", () => {
    expect(_hasShardedWeights(["model.safetensors", "config.json"])).toBe(
      false
    );
  });
});

// ---------------------------------------------------------------------------
// _hasQuantizedVariants
// ---------------------------------------------------------------------------

describe("_hasQuantizedVariants", () => {
  it("returns true for multiple GGUF files", () => {
    expect(
      _hasQuantizedVariants(["model.Q4_K_M.gguf", "model.Q8_0.gguf"])
    ).toBe(true);
  });

  it("returns false for a single GGUF file", () => {
    expect(_hasQuantizedVariants(["model.gguf"])).toBe(false);
  });

  it("returns true for mix of quant markers", () => {
    expect(
      _hasQuantizedVariants(["model.gptq.safetensors", "model.awq.safetensors"])
    ).toBe(true);
  });

  it("returns false for regular weight files", () => {
    expect(_hasQuantizedVariants(["model.safetensors", "config.json"])).toBe(
      false
    );
  });
});

// ---------------------------------------------------------------------------
// _hasAdapterCandidates
// ---------------------------------------------------------------------------

describe("_hasAdapterCandidates", () => {
  it("returns true when a lora file is present", () => {
    expect(
      _hasAdapterCandidates([["pytorch_lora_weights.safetensors", 5_000_000]])
    ).toBe(true);
  });

  it("returns true for ip-adapter files", () => {
    expect(_hasAdapterCandidates([["ip-adapter.safetensors", 5_000_000]])).toBe(
      true
    );
  });

  it("returns false for a single large weight file (no adapter markers)", () => {
    // Single file → length is 1 so the "small + multi-file" check doesn't apply
    expect(_hasAdapterCandidates([["model.safetensors", 5_000_000_000]])).toBe(
      false
    );
  });
});

// ---------------------------------------------------------------------------
// _allSameFamily
// ---------------------------------------------------------------------------

describe("_allSameFamily", () => {
  it("returns false for empty list", () => {
    expect(_allSameFamily([])).toBe(false);
  });

  it("returns false for more than 3 files", () => {
    expect(_allSameFamily(["a.gguf", "b.gguf", "c.gguf", "d.gguf"])).toBe(
      false
    );
  });

  it("returns true for two quant variants of the same model", () => {
    expect(_allSameFamily(["model.q4.gguf", "model.q8.gguf"])).toBe(true);
  });

  it("returns false for clearly different base names", () => {
    expect(
      _allSameFamily(["flux_model.safetensors", "bert_model.safetensors"])
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectRepoPackaging
// ---------------------------------------------------------------------------

describe("detectRepoPackaging", () => {
  it("returns REPO_BUNDLE for sharded weights", () => {
    const hint = detectRepoPackaging("org/model", [
      ["model-00001-of-00004.safetensors", 4_000_000_000],
      ["model-00002-of-00004.safetensors", 4_000_000_000],
      ["model.safetensors.index.json", 10_000]
    ]);
    expect(hint).toBe(RepoPackagingHint.REPO_BUNDLE);
  });

  it("returns PER_FILE for multiple GGUF quantizations", () => {
    const hint = detectRepoPackaging("org/model", [
      ["model.Q4_K_M.gguf", 2_000_000_000],
      ["model.Q8_0.gguf", 4_000_000_000]
    ]);
    expect(hint).toBe(RepoPackagingHint.PER_FILE);
  });

  it("returns REPO_BUNDLE for a single weight file", () => {
    const hint = detectRepoPackaging("org/model", [
      ["model.safetensors", 10_000_000_000],
      ["config.json", 1000]
    ]);
    expect(hint).toBe(RepoPackagingHint.REPO_BUNDLE);
  });

  it("returns UNKNOWN when there are no weight files", () => {
    const hint = detectRepoPackaging("org/model", [
      ["config.json", 1000],
      ["README.md", 500]
    ]);
    expect(hint).toBe(RepoPackagingHint.UNKNOWN);
  });
});

// ---------------------------------------------------------------------------
// _isSingleFileDiffusionWeight
// ---------------------------------------------------------------------------

describe("_isSingleFileDiffusionWeight", () => {
  it("returns true for a top-level safetensors file", () => {
    expect(_isSingleFileDiffusionWeight("v1-5-pruned.safetensors")).toBe(true);
  });

  it("returns false for standard weight filenames", () => {
    expect(_isSingleFileDiffusionWeight("model.safetensors")).toBe(false);
    expect(_isSingleFileDiffusionWeight("pytorch_model.bin")).toBe(false);
  });

  it("returns false for files in subdirectories", () => {
    expect(_isSingleFileDiffusionWeight("unet/model.safetensors")).toBe(false);
  });

  it("returns false for non-weight extensions", () => {
    expect(_isSingleFileDiffusionWeight("config.json")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// _isDiffusionArtifactCandidate
// ---------------------------------------------------------------------------

describe("_isDiffusionArtifactCandidate", () => {
  it("returns true for model_index.json", () => {
    expect(_isDiffusionArtifactCandidate("model_index.json")).toBe(true);
  });

  it("returns true for config.json", () => {
    expect(_isDiffusionArtifactCandidate("unet/config.json")).toBe(true);
  });

  it("returns true for safetensors files", () => {
    expect(_isDiffusionArtifactCandidate("model.safetensors")).toBe(true);
  });

  it("returns false for non-candidate files", () => {
    expect(_isDiffusionArtifactCandidate("tokenizer.json")).toBe(false);
    expect(_isDiffusionArtifactCandidate("README.md")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// _calculateRepoStats
// ---------------------------------------------------------------------------

describe("_calculateRepoStats", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hf-models-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns zero size for empty file list", () => {
    const [size, entries] = _calculateRepoStats(tmpDir, []);
    expect(size).toBe(0);
    expect(entries).toHaveLength(0);
  });

  it("calculates size for real files", async () => {
    const content = "x".repeat(100);
    await fs.writeFile(path.join(tmpDir, "model.safetensors"), content);
    const [size, entries] = _calculateRepoStats(tmpDir, ["model.safetensors"]);
    expect(size).toBe(100);
    expect(entries).toHaveLength(1);
    expect(entries[0][0]).toBe("model.safetensors");
    expect(entries[0][1]).toBe(100);
  });

  it("handles missing files gracefully (size = 0)", () => {
    const [size, entries] = _calculateRepoStats(tmpDir, [
      "nonexistent.safetensors"
    ]);
    expect(size).toBe(0);
    expect(entries[0][1]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// _inferModelTypeFromLocalConfigs — architecture mapping
// ---------------------------------------------------------------------------

describe("_inferModelTypeFromLocalConfigs", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hf-infer-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns null when snapshotDir is null", () => {
    const result = _inferModelTypeFromLocalConfigs([], null);
    expect(result).toBeNull();
  });

  it("returns null when no config files are present", () => {
    const result = _inferModelTypeFromLocalConfigs(
      [["README.md", 100]],
      tmpDir
    );
    expect(result).toBeNull();
  });

  it("infers type from _class_name (diffusers)", async () => {
    const config = { _class_name: "StableDiffusionPipeline" };
    await fs.writeFile(
      path.join(tmpDir, "model_index.json"),
      JSON.stringify(config)
    );
    const result = _inferModelTypeFromLocalConfigs(
      [["model_index.json", 100]],
      tmpDir
    );
    expect(result).toBe("hf.stable_diffusion");
  });

  it("infers type from model_type field", async () => {
    const config = { model_type: "whisper" };
    await fs.writeFile(
      path.join(tmpDir, "config.json"),
      JSON.stringify(config)
    );
    const result = _inferModelTypeFromLocalConfigs(
      [["config.json", 100]],
      tmpDir
    );
    expect(result).toBe("hf.automatic_speech_recognition");
  });

  it("infers type from architectures array (LlamaForCausalLM)", async () => {
    const config = { architectures: ["LlamaForCausalLM"] };
    await fs.writeFile(
      path.join(tmpDir, "config.json"),
      JSON.stringify(config)
    );
    const result = _inferModelTypeFromLocalConfigs(
      [["config.json", 100]],
      tmpDir
    );
    expect(result).toBe("hf.text_generation");
  });

  it("infers type from architectures array (WhisperForConditionalGeneration)", async () => {
    const config = { architectures: ["WhisperForConditionalGeneration"] };
    await fs.writeFile(
      path.join(tmpDir, "config.json"),
      JSON.stringify(config)
    );
    const result = _inferModelTypeFromLocalConfigs(
      [["config.json", 100]],
      tmpDir
    );
    expect(result).toBe("hf.automatic_speech_recognition");
  });

  it("infers type from architectures array (CLIPModel)", async () => {
    const config = { architectures: ["CLIPModel"] };
    await fs.writeFile(
      path.join(tmpDir, "config.json"),
      JSON.stringify(config)
    );
    const result = _inferModelTypeFromLocalConfigs(
      [["config.json", 100]],
      tmpDir
    );
    expect(result).toBe("hf.zero_shot_image_classification");
  });

  it("returns null for unknown architecture", async () => {
    const config = { architectures: ["SomeUnknownArchitecture"] };
    await fs.writeFile(
      path.join(tmpDir, "config.json"),
      JSON.stringify(config)
    );
    const result = _inferModelTypeFromLocalConfigs(
      [["config.json", 100]],
      tmpDir
    );
    expect(result).toBeNull();
  });

  it("prefers shallower config files", async () => {
    await fs.mkdir(path.join(tmpDir, "sub"), { recursive: true });
    // Root config has model_type = "whisper"
    await fs.writeFile(
      path.join(tmpDir, "config.json"),
      JSON.stringify({ model_type: "whisper" })
    );
    // Sub-dir config has model_type = "bert"
    await fs.writeFile(
      path.join(tmpDir, "sub", "config.json"),
      JSON.stringify({ model_type: "bert" })
    );
    const result = _inferModelTypeFromLocalConfigs(
      [
        ["config.json", 100],
        ["sub/config.json", 100]
      ],
      tmpDir
    );
    expect(result).toBe("hf.automatic_speech_recognition"); // root wins
  });
});

// ---------------------------------------------------------------------------
// _derivePipelineTag
// ---------------------------------------------------------------------------

describe("_derivePipelineTag", () => {
  it("returns task when explicitly provided", () => {
    expect(_derivePipelineTag("hf.flux", "text_generation")).toBe(
      "text-generation"
    );
  });

  it("returns text-to-image for flux types", () => {
    expect(_derivePipelineTag("hf.flux")).toBe("text-to-image");
    expect(_derivePipelineTag("hf.stable_diffusion")).toBe("text-to-image");
  });

  it("returns image-to-image for qwen_image_edit", () => {
    expect(_derivePipelineTag("hf.qwen_image_edit")).toBe("image-to-image");
  });

  it("strips _checkpoint suffix before mapping", () => {
    expect(_derivePipelineTag("hf.flux_checkpoint")).toBe("text-to-image");
  });

  it("converts underscores to dashes for unknown slugs", () => {
    expect(_derivePipelineTag("hf.some_custom_type")).toBe("some-custom-type");
  });
});

// ---------------------------------------------------------------------------
// _buildSearchConfigForType
// ---------------------------------------------------------------------------

describe("_buildSearchConfigForType", () => {
  it("returns config for known types", () => {
    const config = _buildSearchConfigForType("hf.flux");
    expect(config).not.toBeNull();
    expect(config).toHaveProperty("filename_pattern");
  });

  it("returns a wildcard fallback for unknown hf.* types", () => {
    const config = _buildSearchConfigForType("hf.unknown_future_type");
    expect(config).not.toBeNull();
    expect(config!.repo_pattern).toEqual(["*"]);
  });

  it("returns null for non-hf.* types that are not known", () => {
    const config = _buildSearchConfigForType("comfy.some_type");
    expect(config).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// _matchesArtifactDetection
// ---------------------------------------------------------------------------

describe("_matchesArtifactDetection", () => {
  it("matches flux family for hf.flux type", () => {
    expect(
      _matchesArtifactDetection("hf.flux", "flux-1-dev", "transformer")
    ).toBe(true);
  });

  it("does not match non-flux family for hf.flux", () => {
    expect(
      _matchesArtifactDetection("hf.flux", "stable-diffusion-xl", "unet")
    ).toBe(false);
  });

  it("matches stable-diffusion family for hf.stable_diffusion", () => {
    expect(
      _matchesArtifactDetection("hf.stable_diffusion", "sd1.5", "unet")
    ).toBe(true);
  });

  it("matches sdxl for hf.stable_diffusion_xl", () => {
    expect(
      _matchesArtifactDetection("hf.stable_diffusion_xl", "sdxl-base", "unet")
    ).toBe(true);
  });

  it("returns false for unhandled type", () => {
    expect(
      _matchesArtifactDetection("hf.controlnet", "flux", "transformer")
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// _matchesRepoForType
// ---------------------------------------------------------------------------

describe("_matchesRepoForType", () => {
  it("matches a known repo for hf.flux", () => {
    expect(
      _matchesRepoForType(
        "hf.flux",
        "black-forest-labs/flux.1-dev",
        "black-forest-labs/flux.1-dev"
      )
    ).toBe(true);
  });

  it("returns false for an unknown repo", () => {
    expect(
      _matchesRepoForType("hf.flux", "unknown/model", "unknown/model")
    ).toBe(false);
  });

  it("returns false when type has no matchers", () => {
    expect(_matchesRepoForType("hf.controlnet", "some/repo", "some/repo")).toBe(
      false
    );
  });
});

// ---------------------------------------------------------------------------
// _matchesModelType
// ---------------------------------------------------------------------------

describe("_matchesModelType", () => {
  it("matches by explicit model type field", () => {
    const model = {
      id: "org/flux",
      type: "hf.flux",
      name: "Flux",
      repo_id: "org/flux",
      path: null
    };
    expect(_matchesModelType(model, "hf.flux")).toBe(true);
  });

  it("matches flux by pipeline_tag text-to-image when no type set", () => {
    const model = {
      id: "org/flux",
      type: null,
      name: "Flux",
      repo_id: "org/flux",
      path: null,
      pipeline_tag: "text-to-image"
    };
    // pipeline_tag text-to-image doesn't directly match hf.flux unless keywords hit
    // The keyword matcher for hf.flux is ["flux"] so repo_id or tags must include "flux"
    expect(_matchesModelType(model, "hf.flux")).toBe(true);
  });

  it("returns false for mismatched type", () => {
    const model = {
      id: "org/bert",
      type: "hf.feature_extraction",
      name: "BERT",
      repo_id: "org/bert",
      path: null
    };
    expect(_matchesModelType(model, "hf.flux")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// _parseGgufFlatFilename
// ---------------------------------------------------------------------------

describe("_parseGgufFlatFilename", () => {
  it("uses manifest lookup when available", () => {
    const lookup = new Map<string, [string, string]>([
      [
        "lmstudio-ai_gemma-2b-it-GGUF_gemma-2b-it-q4_k_m.gguf",
        ["lmstudio-ai/gemma-2b-it-GGUF", "gemma-2b-it-q4_k_m.gguf"]
      ]
    ]);
    const [repoId, repo, filename] = _parseGgufFlatFilename(
      "lmstudio-ai_gemma-2b-it-GGUF_gemma-2b-it-q4_k_m.gguf",
      lookup
    );
    expect(repoId).toBe("lmstudio-ai/gemma-2b-it-GGUF");
    expect(repo).toBe("gemma-2b-it-GGUF");
    expect(filename).toBe("gemma-2b-it-q4_k_m.gguf");
  });

  it("falls back to heuristic parsing", () => {
    const lookup = new Map<string, [string, string]>();
    const [repoId, repo, filename] = _parseGgufFlatFilename(
      "lmstudio_model_model-q4.gguf",
      lookup
    );
    expect(repoId).toBe("lmstudio/model");
    expect(repo).toBe("model");
    expect(filename).toBe("model-q4.gguf");
  });

  it("returns fallback tuple for entries with no underscore", () => {
    const lookup = new Map<string, [string, string]>();
    const [repoId, repo, filename] = _parseGgufFlatFilename(
      "nounderscores.gguf",
      lookup
    );
    expect(repoId).toBe("");
    expect(repo).toBe("");
    expect(filename).toBe("nounderscores.gguf");
  });
});

// ---------------------------------------------------------------------------
// Constant sanity checks
// ---------------------------------------------------------------------------

describe("_CONFIG_MODEL_TYPE_MAPPING", () => {
  it("maps whisper to automatic_speech_recognition", () => {
    expect(_CONFIG_MODEL_TYPE_MAPPING["whisper"]).toBe(
      "hf.automatic_speech_recognition"
    );
  });

  it("maps llama to text_generation", () => {
    expect(_CONFIG_MODEL_TYPE_MAPPING["llama"]).toBe("hf.text_generation");
  });

  it("maps clip to zero_shot_image_classification", () => {
    expect(_CONFIG_MODEL_TYPE_MAPPING["clip"]).toBe(
      "hf.zero_shot_image_classification"
    );
  });
});

describe("_CONFIG_MODEL_TYPE_ARCHITECTURE_MAPPING", () => {
  it("maps LlamaForCausalLM to hf.text_generation", () => {
    expect(_CONFIG_MODEL_TYPE_ARCHITECTURE_MAPPING["LlamaForCausalLM"]).toBe(
      "hf.text_generation"
    );
  });

  it("maps CLIPModel to hf.zero_shot_image_classification", () => {
    expect(_CONFIG_MODEL_TYPE_ARCHITECTURE_MAPPING["CLIPModel"]).toBe(
      "hf.zero_shot_image_classification"
    );
  });

  it("maps WhisperForConditionalGeneration to hf.automatic_speech_recognition", () => {
    expect(
      _CONFIG_MODEL_TYPE_ARCHITECTURE_MAPPING["WhisperForConditionalGeneration"]
    ).toBe("hf.automatic_speech_recognition");
  });

  it("maps Qwen2VLForConditionalGeneration to hf.image_text_to_text", () => {
    expect(
      _CONFIG_MODEL_TYPE_ARCHITECTURE_MAPPING["Qwen2VLForConditionalGeneration"]
    ).toBe("hf.image_text_to_text");
  });

  it("does not contain any unknown hf types", () => {
    for (const [arch, hfType] of Object.entries(
      _CONFIG_MODEL_TYPE_ARCHITECTURE_MAPPING
    )) {
      expect(hfType).toMatch(/^hf\./);
    }
  });
});

describe("CLASSNAME_TO_MODEL_TYPE", () => {
  it("maps StableDiffusionPipeline to hf.stable_diffusion", () => {
    expect(CLASSNAME_TO_MODEL_TYPE["StableDiffusionPipeline"]).toBe(
      "hf.stable_diffusion"
    );
  });

  it("maps FluxPipeline to hf.flux", () => {
    expect(CLASSNAME_TO_MODEL_TYPE["FluxPipeline"]).toBe("hf.flux");
  });
});

describe("SINGLE_FILE_DIFFUSION_EXTENSIONS", () => {
  it("includes .safetensors", () => {
    expect(SINGLE_FILE_DIFFUSION_EXTENSIONS).toContain(".safetensors");
  });

  it("includes .ckpt", () => {
    expect(SINGLE_FILE_DIFFUSION_EXTENSIONS).toContain(".ckpt");
  });

  it("includes .svdq", () => {
    expect(SINGLE_FILE_DIFFUSION_EXTENSIONS).toContain(".svdq");
  });
});

describe("HF_DEFAULT_FILE_PATTERNS", () => {
  it("includes *.safetensors and *.gguf", () => {
    expect(HF_DEFAULT_FILE_PATTERNS).toContain("*.safetensors");
    expect(HF_DEFAULT_FILE_PATTERNS).toContain("*.gguf");
  });
});
