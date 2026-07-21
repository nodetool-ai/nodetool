import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
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

  beforeEach(async () => {
    modelsDir = await mkdtemp(join(tmpdir(), "nlc-models-"));
  });

  afterEach(async () => {
    await rm(modelsDir, { recursive: true, force: true });
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
