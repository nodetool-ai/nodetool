/**
 * `create_collection` and `delete_collection` against a real vector store.
 *
 * `capabilities-collections.test.ts` mocks `@nodetool-ai/vectorstore` whole,
 * which is right for the readers and indexers but leaves the lifecycle calls
 * untested: what they do is talk to the provider's own name and metadata
 * rules. So this file installs a real sqlite-vec provider on a temporary
 * database as the process default and walks one collection through its life —
 * create, index into, refuse a stranger, delete — asserting on what the store
 * holds afterwards rather than on what the capability said.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  OWNER_METADATA_KEY,
  SqliteVecProvider,
  SqliteVecStore,
  resetDefaultVectorProvider,
  setDefaultVectorProvider,
  type EmbeddingFunction
} from "@nodetool-ai/vectorstore";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";

/** A deterministic three-dimensional embedding: no model, no key. */
const embed: EmbeddingFunction = {
  async generate(texts) {
    return texts.map((text) => {
      const v = [1, 1, 1];
      for (let i = 0; i < text.length; i++) v[i % 3] += text.charCodeAt(i);
      const norm = Math.hypot(...v);
      return v.map((x) => x / norm);
    });
  }
};

let dbPath: string;
let store: SqliteVecStore;
let provider: SqliteVecProvider;

beforeEach(() => {
  dbPath = join(
    tmpdir(),
    `capabilities-collections-${process.pid}-${Math.random().toString(36).slice(2)}.db`
  );
  store = new SqliteVecStore(dbPath);
  provider = new SqliteVecProvider({ store });
  setDefaultVectorProvider(provider);
});

afterEach(() => {
  resetDefaultVectorProvider();
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(dbPath + suffix, { force: true });
    } catch {
      // A handle Windows still holds; the file is in the temp dir.
    }
  }
});

function as(userId: string) {
  const context = { userId } as unknown as ProcessingContext;
  return (name: string, args: Record<string, unknown> = {}) =>
    createCapabilityRun({ context, gate: UNGATED }).invoke(name, args) as Promise<
      Record<string, unknown>
    >;
}

describe("create_collection", () => {
  it("creates a collection stamped with its owner and embedding choice", async () => {
    const alice = as("alice");

    await expect(
      alice("create_collection", {
        name: "research-notes",
        embedding_model: "text-embedding-3-small",
        embedding_provider: "openai"
      })
    ).resolves.toEqual({ name: "research-notes", created: true });

    const infos = await provider.listCollections();
    expect(infos.map((info) => info.name)).toEqual(["research-notes"]);
    expect(infos[0].metadata).toMatchObject({
      [OWNER_METADATA_KEY]: "alice",
      embedding_model: "text-embedding-3-small",
      embedding_provider: "openai"
    });
  });

  it("names a duplicate instead of forwarding the driver's error", async () => {
    const alice = as("alice");
    await alice("create_collection", { name: "dup" });

    await expect(alice("create_collection", { name: "dup" })).resolves.toEqual({
      error: "Collection dup already exists."
    });
    expect((await provider.listCollections()).map((c) => c.name)).toEqual(["dup"]);
  });

  it("refuses a name the REST layer could never route to", async () => {
    const result = await as("alice")("create_collection", { name: "a/b" });

    expect(String(result.error)).toContain("path separators");
    expect(await provider.listCollections()).toEqual([]);
  });
});

describe("delete_collection", () => {
  it("walks one collection through create, index, refuse a stranger, delete", async () => {
    const alice = as("alice");
    const mallory = as("mallory");
    await alice("create_collection", { name: "lifecycle" });

    // Index through the capability that writes into a bound collection.
    const bound = await provider.getCollection({
      name: "lifecycle",
      embeddingFunction: embed
    });
    const indexed = (await createCapabilityRun({
      context: { userId: "alice" } as unknown as ProcessingContext,
      gate: UNGATED,
      vectorCollection: bound
    }).invoke("vector_index", {
      text: "Collections are owned by the user who made them.",
      source_id: "doc-1"
    })) as Record<string, unknown>;
    expect(indexed.status).toBe("success");
    expect(await bound.count()).toBe(1);

    // Another user neither sees it nor can delete it; it survives the attempt.
    expect(await mallory("list_collections")).toEqual({ collections: [] });
    await expect(
      mallory("delete_collection", { name: "lifecycle" })
    ).resolves.toEqual({ error: "Collection lifecycle belongs to another user." });
    expect((await provider.listCollections()).map((c) => c.name)).toEqual([
      "lifecycle"
    ]);

    await expect(
      alice("delete_collection", { name: "lifecycle" })
    ).resolves.toEqual({ name: "lifecycle", deleted: true });
    expect(await provider.listCollections()).toEqual([]);
    expect(await alice("list_collections")).toEqual({ collections: [] });
  });

  it("reports a collection that does not exist", async () => {
    await expect(
      as("alice")("delete_collection", { name: "ghost" })
    ).resolves.toEqual({ error: "Collection ghost was not found." });
  });

  it("lets anyone delete a collection that predates ownership stamps", async () => {
    await provider.createCollection({ name: "legacy", metadata: {} });

    await expect(
      as("bob")("delete_collection", { name: "legacy" })
    ).resolves.toEqual({ name: "legacy", deleted: true });
    expect(await provider.listCollections()).toEqual([]);
  });
});
