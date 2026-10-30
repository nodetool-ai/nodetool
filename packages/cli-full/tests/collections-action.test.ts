/**
 * Action-level tests for `nodetool collections` (src/commands/collections.ts).
 *
 * Mocks the vector provider, the document splitter, the local-db bootstrap and
 * fs so CRUD, query, index (id derivation) and the --json abort path are
 * exercised without a real vector store or filesystem.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Command } from "commander";

const count = vi.fn();
const query = vi.fn();
const upsert = vi.fn();
const getCollection = vi.fn();
const createCollection = vi.fn();
const deleteCollection = vi.fn();
const listCollections = vi.fn();
const splitDocument = vi.fn();
const readFile = vi.fn();

const collection = {
  name: "c",
  metadata: {} as Record<string, unknown>,
  count,
  query,
  upsert
};

class CollectionNotFoundError extends Error {}

vi.mock("@nodetool-ai/vectorstore", () => ({
  getDefaultVectorProvider: () => ({
    listCollections,
    getCollection,
    createCollection,
    deleteCollection
  }),
  splitDocument,
  CollectionNotFoundError
}));

vi.mock("@nodetool-ai/models", () => ({
  Workflow: { get: vi.fn().mockResolvedValue(null) }
}));

vi.mock("../src/commands/local-db.js", () => ({
  setupLocalDb: vi.fn().mockResolvedValue(undefined),
  LOCAL_USER_ID: "1"
}));

vi.mock("node:fs/promises", () => ({ readFile }));

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
  const { registerCollectionCommands } = await import(
    "../src/commands/collections.js"
  );
  const program = new Command();
  program.exitOverride();
  registerCollectionCommands(program);
  return program;
}

beforeEach(() => {
  count.mockReset();
  query.mockReset();
  upsert.mockReset();
  getCollection.mockReset().mockResolvedValue(collection);
  createCollection.mockReset();
  deleteCollection.mockReset();
  listCollections.mockReset();
  splitDocument.mockReset();
  readFile.mockReset();
});

describe("collections list", () => {
  it("skips a collection that raced a delete but keeps healthy ones", async () => {
    listCollections.mockResolvedValueOnce([
      { name: "good", metadata: { embedding_model: "m" } },
      { name: "gone", metadata: {} }
    ]);
    getCollection.mockReset().mockImplementation(async ({ name }) => {
      if (name === "gone") {
        throw new CollectionNotFoundError("gone");
      }
      return { name, metadata: {}, count: async () => 3, query, upsert };
    });
    const program = await buildProgram();
    const { stdout } = await captureOutput(() =>
      program.parseAsync(["node", "cli", "collections", "list", "--json"])
    );
    const rows = JSON.parse(stdout.trim()) as Array<{ name: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("good");
  });

  it("surfaces a non-not-found error instead of hiding it (exit 1)", async () => {
    listCollections.mockResolvedValueOnce([{ name: "bad", metadata: {} }]);
    getCollection.mockReset().mockRejectedValueOnce(new Error("provider boom"));
    const program = await buildProgram();
    const { exitCode, stderr } = await captureOutput(() =>
      program.parseAsync(["node", "cli", "collections", "list"])
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("provider boom");
  });
});

describe("collections create", () => {
  it("creates with embedding metadata", async () => {
    createCollection.mockResolvedValueOnce({ name: "docs", metadata: {} });
    const program = await buildProgram();
    const { stdout } = await captureOutput(() =>
      program.parseAsync([
        "node",
        "cli",
        "collections",
        "create",
        "docs",
        "--embedding-model",
        "text-embedding-3-small"
      ])
    );
    expect(createCollection).toHaveBeenCalledWith({
      name: "docs",
      metadata: { embedding_model: "text-embedding-3-small" }
    });
    expect(stdout).toContain("Created collection 'docs'");
  });
});

describe("collections delete", () => {
  it("deletes with --yes and emits JSON", async () => {
    deleteCollection.mockResolvedValueOnce(undefined);
    const program = await buildProgram();
    const { stdout } = await captureOutput(() =>
      program.parseAsync([
        "node",
        "cli",
        "collections",
        "delete",
        "docs",
        "--yes",
        "--json"
      ])
    );
    expect(deleteCollection).toHaveBeenCalledWith("docs");
    expect(JSON.parse(stdout.trim())).toHaveProperty("message");
  });

  it("emits JSON (not plain text) on a non-TTY abort with --json", async () => {
    const program = await buildProgram();
    const { stdout, exitCode } = await captureOutput(() =>
      program.parseAsync([
        "node",
        "cli",
        "collections",
        "delete",
        "docs",
        "--json"
      ])
    );
    // Non-TTY + no --yes → confirm() returns false → abort.
    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout.trim())).toEqual({
      deleted: false,
      aborted: true
    });
    expect(deleteCollection).not.toHaveBeenCalled();
  });
});

describe("collections query", () => {
  it("renders matches and prints (no matches) when empty", async () => {
    query.mockResolvedValueOnce([]);
    const program = await buildProgram();
    const { stdout } = await captureOutput(() =>
      program.parseAsync(["node", "cli", "collections", "query", "docs", "hi"])
    );
    expect(query).toHaveBeenCalledWith({ text: "hi", topK: 10 });
    expect(stdout).toContain("(no matches)");
  });

  it("exits(1) on invalid --n-results", async () => {
    const program = await buildProgram();
    const { exitCode, stderr } = await captureOutput(() =>
      program.parseAsync([
        "node",
        "cli",
        "collections",
        "query",
        "docs",
        "hi",
        "-n",
        "zero"
      ])
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid --n-results");
  });
});

describe("collections index", () => {
  it("derives distinct record ids from the full path, not the basename", async () => {
    readFile.mockResolvedValue("some text");
    splitDocument.mockReturnValue([
      { text: "some text", source_id: "foo.txt", start_index: 0 }
    ]);
    upsert.mockResolvedValue(undefined);
    const program = await buildProgram();
    await captureOutput(() =>
      program.parseAsync([
        "node",
        "cli",
        "collections",
        "index",
        "docs",
        "a/foo.txt",
        "b/foo.txt"
      ])
    );
    expect(upsert).toHaveBeenCalledTimes(2);
    const idA = upsert.mock.calls[0]![0][0].id as string;
    const idB = upsert.mock.calls[1]![0][0].id as string;
    expect(idA).not.toBe(idB);
    expect(idA).toBe("a_foo.txt#0");
    expect(idB).toBe("b_foo.txt#0");
  });
});
