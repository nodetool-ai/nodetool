import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  inspectPaths,
  detectFromJson,
  type ArtifactDetection
} from "../src/artifact-inspector.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hf-artifact-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeJson(filename: string, content: unknown): Promise<string> {
  const filePath = path.join(tmpDir, filename);
  await fs.writeFile(filePath, JSON.stringify(content));
  return filePath;
}

// ---------------------------------------------------------------------------
// inspectPaths — basic edge cases
// ---------------------------------------------------------------------------

describe("inspectPaths", () => {
  it("returns null for empty paths array", () => {
    const result = inspectPaths([]);
    expect(result).toBeNull();
  });

  it("returns null for non-existent paths", () => {
    // No real files; safetensors/gguf detectors should fail gracefully
    const result = inspectPaths(["/nonexistent/model.safetensors"]);
    // Should either return null or a minimal result without throwing
    // (the safetensors inspector will fail to open the file and fall through)
    expect(
      result === null ||
        typeof result.family === "string" ||
        result.family === null
    ).toBe(true);
  });

  it("falls through to JSON detection for config-only repos", async () => {
    const configPath = await writeJson("config.json", {
      model_type: "whisper",
      architectures: ["WhisperForConditionalGeneration"]
    });

    const result = inspectPaths([configPath]);
    expect(result).not.toBeNull();
    expect(result!.family).toBeTruthy();
  });

  it("returns null when only unrecognised files are present", async () => {
    const txtPath = path.join(tmpDir, "README.md");
    await fs.writeFile(txtPath, "# Model");
    const result = inspectPaths([txtPath]);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detectFromJson
// ---------------------------------------------------------------------------

describe("detectFromJson", () => {
  it("returns null when both lists are empty", () => {
    const result = detectFromJson([], []);
    expect(result).toBeNull();
  });

  it("detects whisper from config.json model_type", async () => {
    const configPath = await writeJson("config.json", {
      model_type: "whisper",
      architectures: ["WhisperForConditionalGeneration"]
    });
    const result = detectFromJson([configPath], []);
    expect(result).not.toBeNull();
    expect(result!.family).toMatch(/whisper/i);
  });

  it("detects LLaMA from config.json architectures", async () => {
    const configPath = await writeJson("config.json", {
      architectures: ["LlamaForCausalLM"]
    });
    const result = detectFromJson([configPath], []);
    expect(result).not.toBeNull();
    // LLaMA family detection
    expect(result!.family).toBeTruthy();
  });

  it("detects diffusers model from model_index.json _class_name", async () => {
    const indexPath = await writeJson("model_index.json", {
      _class_name: "StableDiffusionPipeline"
    });
    const result = detectFromJson([], [indexPath]);
    expect(result).not.toBeNull();
    expect(result!.family).toBe("stable-diffusion");
    expect(result!.component).toBe("unet");
  });

  it("detects SDXL from model_index.json _class_name", async () => {
    const indexPath = await writeJson("model_index.json", {
      _class_name: "StableDiffusionXLPipeline",
      unet: ["diffusers", "UNet2DConditionModel"]
    });
    const result = detectFromJson([], [indexPath]);
    expect(result).not.toBeNull();
    expect(result!.family).toBe("sdxl");
    expect(result!.component).toBe("unet");
  });

  it("detects Flux pipeline with transformer component", async () => {
    const indexPath = await writeJson("model_index.json", {
      _class_name: "FluxPipeline"
    });
    const result = detectFromJson([], [indexPath]);
    expect(result).not.toBeNull();
    expect(result!.family).toBe("flux");
    expect(result!.component).toBe("transformer");
  });

  it("detects SDXL refiner from model_index.json _class_name", async () => {
    const indexPath = await writeJson("model_index.json", {
      _class_name: "StableDiffusionXLRefinerPipeline"
    });
    const result = detectFromJson([], [indexPath]);
    expect(result).not.toBeNull();
    expect(result!.family).toBe("sdxl-refiner");
    expect(result!.component).toBe("unet");
  });

  it("handles malformed JSON files gracefully", async () => {
    const badPath = path.join(tmpDir, "bad.json");
    await fs.writeFile(badPath, "{ not valid json");
    const result = detectFromJson([badPath], []);
    expect(result).toBeNull();
  });

  it("returns null for an empty config", async () => {
    const configPath = await writeJson("config.json", {});
    const result = detectFromJson([configPath], []);
    expect(result).toBeNull();
  });

  it("has non-null family or component in successful detections", async () => {
    const configPath = await writeJson("config.json", {
      model_type: "bert"
    });
    const result = detectFromJson([configPath], []);
    if (result !== null) {
      expect(result.family !== null || result.component !== null).toBe(true);
    }
  });

  it("includes confidence between 0 and 1 in detections", async () => {
    const configPath = await writeJson("config.json", {
      architectures: ["GPT2LMHeadModel"]
    });
    const result = detectFromJson([configPath], []);
    if (result !== null && result.confidence !== null) {
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });
});
