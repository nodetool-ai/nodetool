import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, writeFile, rm, symlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Force the optional native binding to look "not installed" regardless of the
// environment: it IS present in CI (a real dependency of electron/cli) but not
// in a bare package install. Keep the real node-builtin importer so the GGUF
// directory scan still works.
vi.mock("@nodetool-ai/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/config")>();
  return {
    ...actual,
    importOptionalModule: async (name: string) => {
      throw new Error(`Cannot find module '${name}'`);
    }
  };
});

import { NodeLlamaCppProvider } from "../../src/providers/node-llama-cpp-provider.js";

describe("NodeLlamaCppProvider", () => {
  let modelsDir: string;
  let hubDir: string;
  let prevHubCache: string | undefined;

  beforeEach(async () => {
    modelsDir = await mkdtemp(join(tmpdir(), "nlc-models-"));
    // Model discovery also reads the HuggingFace hub cache, so point it at an
    // empty directory — otherwise these assertions pick up whatever GGUFs the
    // developer happens to have downloaded.
    hubDir = await mkdtemp(join(tmpdir(), "nlc-hub-empty-"));
    prevHubCache = process.env.HF_HUB_CACHE;
    process.env.HF_HUB_CACHE = hubDir;
  });

  afterEach(async () => {
    if (prevHubCache === undefined) delete process.env.HF_HUB_CACHE;
    else process.env.HF_HUB_CACHE = prevHubCache;
    await rm(modelsDir, { recursive: true, force: true });
    await rm(hubDir, { recursive: true, force: true });
  });

  it("requires no secrets and reports its provider id", () => {
    expect(NodeLlamaCppProvider.requiredSecrets()).toEqual([]);
    const provider = new NodeLlamaCppProvider();
    expect(provider.provider).toBe("node_llama_cpp");
  });

  it("claims native tool support (grammar-constrained functions)", async () => {
    const provider = new NodeLlamaCppProvider();
    await expect(provider.hasToolSupport("any")).resolves.toBe(true);
  });

  it("lists GGUF files from the models directory, ignoring other files", async () => {
    await writeFile(join(modelsDir, "model-a.gguf"), "x");
    await writeFile(join(modelsDir, "model-b.GGUF"), "x");
    await writeFile(join(modelsDir, "readme.txt"), "x");
    await writeFile(join(modelsDir, "notes.md"), "x");

    const provider = new NodeLlamaCppProvider({
      NODE_LLAMA_CPP_MODELS_DIR: modelsDir
    });
    const models = await provider.getAvailableLanguageModels();

    expect(models.map((m) => m.id)).toEqual(["model-a.gguf", "model-b.GGUF"]);
    expect(models.every((m) => m.provider === "node_llama_cpp")).toBe(true);
    expect(models[0]).toMatchObject({
      id: "model-a.gguf",
      name: "model-a.gguf"
    });
  });

  it("also exposes GGUF files as embedding models", async () => {
    await writeFile(join(modelsDir, "embed.gguf"), "x");
    const provider = new NodeLlamaCppProvider({
      NODE_LLAMA_CPP_MODELS_DIR: modelsDir
    });
    const models = await provider.getAvailableEmbeddingModels();
    expect(models.map((m) => m.id)).toEqual(["embed.gguf"]);
  });

  it("returns an empty model list when the directory is missing", async () => {
    const provider = new NodeLlamaCppProvider({
      NODE_LLAMA_CPP_MODELS_DIR: join(modelsDir, "does-not-exist")
    });
    await expect(provider.getAvailableLanguageModels()).resolves.toEqual([]);
  });

  it("throws an actionable error when node-llama-cpp is not installed", async () => {
    const provider = new NodeLlamaCppProvider({
      NODE_LLAMA_CPP_MODELS_DIR: modelsDir
    });
    await expect(
      provider.generateMessage({
        messages: [{ role: "user", content: "hi" }],
        model: "model.gguf"
      })
    ).rejects.toThrow(/node-llama-cpp/);
  });

  it("flags context-size errors as context-length errors", () => {
    const provider = new NodeLlamaCppProvider();
    expect(
      provider.isContextLengthError(new Error("requested context size exceeds"))
    ).toBe(true);
    expect(provider.isContextLengthError(new Error("network down"))).toBe(
      false
    );
  });
});

/**
 * GGUFs land in two places: the flat llama.cpp cache and the HuggingFace hub
 * cache the app's downloader writes to. The hub layout nests them under
 * `models--org--repo/snapshots/<sha>/` and stores each as a symlink into
 * `blobs/`, so a scan that only read one flat directory and required
 * `isFile()` found nothing — a downloaded model was never selectable.
 */
describe("NodeLlamaCppProvider – GGUF discovery", () => {
  let hubDir: string;
  let prevHubCache: string | undefined;

  beforeEach(async () => {
    hubDir = await mkdtemp(join(tmpdir(), "nlc-hub-"));
    prevHubCache = process.env.HF_HUB_CACHE;
    process.env.HF_HUB_CACHE = hubDir;
  });

  afterEach(async () => {
    if (prevHubCache === undefined) delete process.env.HF_HUB_CACHE;
    else process.env.HF_HUB_CACHE = prevHubCache;
    await rm(hubDir, { recursive: true, force: true });
  });

  it("lists a symlinked GGUF in the models directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nlc-sym-"));
    try {
      await writeFile(join(dir, "real.bin"), "x");
      await symlink(join(dir, "real.bin"), join(dir, "linked.gguf"));

      const provider = new NodeLlamaCppProvider({
        NODE_LLAMA_CPP_MODELS_DIR: dir
      });
      const models = await provider.getAvailableLanguageModels();
      expect(models.map((m) => m.id)).toContain("linked.gguf");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("discovers GGUFs in the HuggingFace hub cache with a readable name", async () => {
    const snapshot = join(
      hubDir,
      "models--ggml-org--gemma-3-4b-it-GGUF",
      "snapshots",
      "abc123"
    );
    await mkdir(snapshot, { recursive: true });
    const blob = join(hubDir, "blob-data");
    await writeFile(blob, "x");
    await symlink(blob, join(snapshot, "gemma-3-4b-it-Q4_K_M.gguf"));

    const emptyDir = await mkdtemp(join(tmpdir(), "nlc-empty-"));
    try {
      const provider = new NodeLlamaCppProvider({
        NODE_LLAMA_CPP_MODELS_DIR: emptyDir
      });
      const models = await provider.getAvailableLanguageModels();

      expect(models).toHaveLength(1);
      // Absolute id so the model loads from wherever the hub cache lives.
      expect(models[0].id).toBe(join(snapshot, "gemma-3-4b-it-Q4_K_M.gguf"));
      expect(models[0].name).toBe(
        "gemma-3-4b-it-Q4_K_M.gguf (ggml-org/gemma-3-4b-it-GGUF)"
      );
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  it("keeps bare filenames for models in the models directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nlc-flat-"));
    try {
      await writeFile(join(dir, "local.gguf"), "x");
      const provider = new NodeLlamaCppProvider({
        NODE_LLAMA_CPP_MODELS_DIR: dir
      });
      const models = await provider.getAvailableLanguageModels();
      // Relative ids keep already-saved workflow references working.
      expect(models.map((m) => m.id)).toEqual(["local.gguf"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("ignores non-GGUF files in the hub cache", async () => {
    const snapshot = join(hubDir, "models--org--repo", "snapshots", "sha");
    await mkdir(snapshot, { recursive: true });
    await writeFile(join(snapshot, "config.json"), "{}");
    await writeFile(join(snapshot, "README.md"), "hi");

    const emptyDir = await mkdtemp(join(tmpdir(), "nlc-empty2-"));
    try {
      const provider = new NodeLlamaCppProvider({
        NODE_LLAMA_CPP_MODELS_DIR: emptyDir
      });
      expect(await provider.getAvailableLanguageModels()).toEqual([]);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });
});
