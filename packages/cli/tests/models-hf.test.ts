/**
 * Tests for `nodetool models hf-*` and `recommended` commands.
 *
 * Mocks @nodetool/huggingface + @nodetool/runtime so we don't hit the
 * network or the local HF cache.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";

// ─── Mocks ─────────────────────────────────────────────────────────────────

const searchHfHub = vi.fn();
const listAllHfModels = vi.fn();
const readCachedHfModels = vi.fn();
const startDownload = vi.fn();

class FakeDownloadManager {
  startDownload = startDownload;
}

vi.mock("@nodetool/huggingface", () => ({
  searchHfHub,
  listAllHfModels,
  readCachedHfModels,
  DownloadManager: FakeDownloadManager,
  SUPPORTED_MODEL_TYPES: ["qwen2", "llama", "hf.text_to_image"] as const,
  GENERIC_HF_TYPES: new Set([
    "hf.text_to_image",
    "hf.image_to_image",
    "hf.model",
    "hf.model_generic"
  ])
}));

vi.mock("@nodetool/runtime", () => ({
  RECOMMENDED_MODELS: [
    {
      id: "gpt-4o-mini",
      type: "language_model",
      name: "GPT-4o mini",
      repo_id: null,
      path: null,
      downloaded: false,
      modality: "language",
      task: "text_generation",
      provider: "openai"
    },
    {
      id: "claude-3-5-sonnet-latest",
      type: "language_model",
      name: "Claude 3.5 Sonnet",
      repo_id: null,
      path: null,
      downloaded: false,
      modality: "language",
      task: "text_generation",
      provider: "anthropic"
    },
    {
      id: "text-embedding-3-small",
      type: "embedding_model",
      name: "Text Embedding 3 Small",
      repo_id: null,
      path: null,
      downloaded: false,
      modality: "language",
      task: "embedding",
      provider: "openai"
    },
    {
      id: "whisper-1",
      type: "asr_model",
      name: "Whisper",
      repo_id: null,
      path: null,
      downloaded: false,
      modality: "asr",
      provider: "openai"
    }
  ]
}));

vi.mock("@trpc/client", () => ({
  createTRPCClient: vi.fn(),
  httpBatchLink: vi.fn()
}));
vi.mock("superjson", () => ({ default: {} }));

// ─── Helpers ───────────────────────────────────────────────────────────────

async function captureOutput(
  fn: () => Promise<void> | void
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  let stdout = "";
  let stderr = "";
  let exitCode: number | null = null;
  const origLog = console.log;
  const origErr = console.error;
  const origExit = process.exit;
  console.log = (...args: unknown[]) => {
    stdout += args.map(String).join(" ") + "\n";
  };
  console.error = (...args: unknown[]) => {
    stderr += args.map(String).join(" ") + "\n";
  };
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`__EXIT__${code ?? 0}`);
  }) as typeof process.exit;
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith("__EXIT__")) throw e;
  } finally {
    console.log = origLog;
    console.error = origErr;
    process.exit = origExit;
  }
  return { stdout, stderr, exitCode };
}

async function buildProgram(): Promise<Command> {
  const { registerHfCommands } = await import("../src/commands/models-hf.js");
  const { registerRecommendedCommand } = await import(
    "../src/commands/models-recommended.js"
  );
  const program = new Command();
  program.exitOverride();
  const models = program.command("models");
  registerHfCommands(models);
  registerRecommendedCommand(models);
  return program;
}

beforeEach(() => {
  searchHfHub.mockReset();
  listAllHfModels.mockReset();
  readCachedHfModels.mockReset();
  startDownload.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── hf-types ──────────────────────────────────────────────────────────────

describe("models hf-types", () => {
  it("prints the list of types", async () => {
    const program = await buildProgram();
    const { stdout } = await captureOutput(() =>
      program.parseAsync(["node", "cli", "models", "hf-types"])
    );
    expect(stdout).toContain("qwen2");
    expect(stdout).toContain("llama");
    expect(stdout).toContain("hf.text_to_image");
  });

  it("emits valid JSON with --json", async () => {
    const program = await buildProgram();
    const { stdout } = await captureOutput(() =>
      program.parseAsync(["node", "cli", "models", "hf-types", "--json"])
    );
    const parsed = JSON.parse(stdout.trim());
    expect(parsed).toHaveProperty("types");
    expect(parsed).toHaveProperty("generic");
    expect(Array.isArray(parsed.types)).toBe(true);
  });
});

// ─── list-hf ───────────────────────────────────────────────────────────────

describe("models list-hf", () => {
  it("forwards --task and --limit to searchHfHub", async () => {
    searchHfHub.mockResolvedValueOnce([]);
    const program = await buildProgram();
    await captureOutput(() =>
      program.parseAsync([
        "node",
        "cli",
        "models",
        "list-hf",
        "hf.text_to_image",
        "--task",
        "text-to-image",
        "--limit",
        "7"
      ])
    );
    expect(searchHfHub).toHaveBeenCalledWith({
      modelType: "hf.text_to_image",
      task: "text-to-image",
      limit: 7
    });
  });

  it("exits(1) when searchHfHub throws", async () => {
    searchHfHub.mockRejectedValueOnce(new Error("Unknown model type 'foo'"));
    const program = await buildProgram();
    const { exitCode, stderr } = await captureOutput(() =>
      program.parseAsync(["node", "cli", "models", "list-hf", "foo"])
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unknown");
  });
});

// ─── list-hf-all ───────────────────────────────────────────────────────────

describe("models list-hf-all", () => {
  it("forwards --repo-only and --limit", async () => {
    listAllHfModels.mockResolvedValueOnce([]);
    const program = await buildProgram();
    await captureOutput(() =>
      program.parseAsync([
        "node",
        "cli",
        "models",
        "list-hf-all",
        "--repo-only",
        "--limit",
        "3"
      ])
    );
    expect(listAllHfModels).toHaveBeenCalledWith({
      limit: 3,
      repoOnly: true
    });
  });
});

// ─── hf-cache ──────────────────────────────────────────────────────────────

describe("models hf-cache", () => {
  it("filters --downloaded-only", async () => {
    readCachedHfModels.mockResolvedValueOnce([
      { id: "a/repo", type: "hf.flux", downloaded: true, size_on_disk: 1024 },
      { id: "b/repo", type: "hf.flux", downloaded: false, size_on_disk: 0 }
    ]);
    const program = await buildProgram();
    const { stdout } = await captureOutput(() =>
      program.parseAsync([
        "node",
        "cli",
        "models",
        "hf-cache",
        "--downloaded-only",
        "--json"
      ])
    );
    const parsed = JSON.parse(stdout.trim()) as Array<{ id: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.id).toBe("a/repo");
  });
});

// ─── download-hf ───────────────────────────────────────────────────────────

describe("models download-hf", () => {
  it("invokes DownloadManager.startDownload", async () => {
    startDownload.mockResolvedValueOnce(undefined);
    const program = await buildProgram();
    await captureOutput(() =>
      program.parseAsync([
        "node",
        "cli",
        "models",
        "download-hf",
        "--repo-id",
        "foo/bar"
      ])
    );
    expect(startDownload).toHaveBeenCalledTimes(1);
    const [repoId, opts] = startDownload.mock.calls[0]!;
    expect(repoId).toBe("foo/bar");
    expect(opts).toMatchObject({
      path: null,
      allowPatterns: null,
      ignorePatterns: null,
      cacheDir: null
    });
  });

  it("collects repeated --allow-patterns / --ignore-patterns", async () => {
    startDownload.mockResolvedValueOnce(undefined);
    const program = await buildProgram();
    await captureOutput(() =>
      program.parseAsync([
        "node",
        "cli",
        "models",
        "download-hf",
        "--repo-id",
        "foo/bar",
        "-a",
        "*.safetensors",
        "-a",
        "*.json",
        "-i",
        "*.bin"
      ])
    );
    const [, opts] = startDownload.mock.calls[0]!;
    expect(opts.allowPatterns).toEqual(["*.safetensors", "*.json"]);
    expect(opts.ignorePatterns).toEqual(["*.bin"]);
  });
});

// ─── recommended ───────────────────────────────────────────────────────────

describe("models recommended", () => {
  it("filters by --category and caps with --limit", async () => {
    const program = await buildProgram();
    const { stdout } = await captureOutput(() =>
      program.parseAsync([
        "node",
        "cli",
        "models",
        "recommended",
        "--category",
        "language-text-generation",
        "--limit",
        "1",
        "--json"
      ])
    );
    const rows = JSON.parse(stdout.trim()) as Array<{ id: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("gpt-4o-mini");
  });

  it("exits(1) on unknown --category", async () => {
    const program = await buildProgram();
    const { exitCode, stderr } = await captureOutput(() =>
      program.parseAsync([
        "node",
        "cli",
        "models",
        "recommended",
        "--category",
        "bogus"
      ])
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid --category");
  });

  it("filters language → 3 rows from the fixture", async () => {
    const program = await buildProgram();
    const { stdout } = await captureOutput(() =>
      program.parseAsync([
        "node",
        "cli",
        "models",
        "recommended",
        "--category",
        "language",
        "--json"
      ])
    );
    const rows = JSON.parse(stdout.trim()) as unknown[];
    expect(rows).toHaveLength(3);
  });
});
