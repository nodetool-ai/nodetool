import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, isNotNull } from "drizzle-orm";
import {
  Asset,
  closeDb,
  getPortableDb,
  initTestDb,
  ModelObserver,
  projects,
  searchChunks,
  searchItems
} from "@nodetool-ai/models";
import { SqliteVecProvider, isManagedCollection } from "@nodetool-ai/vectorstore";
import {
  acquireSearchLease,
  EMBED_BUDGET_LEASE,
  fuseRankings,
  releaseSearchLease,
  libraryCollections,
  libraryIndexStatus,
  rebuildLibraryIndex,
  reconcileLibraryIndex,
  runEmbedPass,
  runIndexerPass,
  searchLibrary,
  setAssetBytesReader,
  setLibraryEmbedder,
  setLibraryQueryEmbedder,
  setLibraryVectorProvider,
  stopLibraryIndexWrites,
  unembeddedChunkCount,
  embeddingSpace,
  type LibraryEmbedder
} from "../src/index.js";
import { initPgliteDb } from "./_helpers/pglite-db.js";

const USER = "user-1";
const encoder = new TextEncoder();
const files = new Map<string, string>();

/**
 * A fake model: each dimension is a concept, and a text scores on a concept
 * when it holds any of its words. "puppy" and "dog" share a concept, so the
 * vector layer finds what the words alone miss.
 */
const CONCEPTS = [
  ["dog", "puppy", "hound", "canine"],
  ["ocean", "sea", "waves", "coast"],
  ["invoice", "receipt", "bill", "payment"],
  ["mountain", "peak", "summit", "alpine"]
];

function conceptVector(text: string, offset: number): number[] {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const vector = CONCEPTS.map((group) => (words.some((word) => group.includes(word)) ? 1 : 0));
  // A small constant keeps an empty text off the zero vector; `offset` makes a second space differ.
  return [...vector, 0.05 + offset];
}

function fakeEmbedder(calls: string[][], offset = 0): LibraryEmbedder {
  return {
    async embed(texts) {
      calls.push(texts);
      return texts.map((text) => conceptVector(text, offset));
    }
  };
}

const dialects: Array<[string, () => Promise<void>]> = [
  ["sqlite", async () => { initTestDb(); }],
  ["postgres", initPgliteDb]
];

let vectors: SqliteVecProvider;

beforeEach(() => {
  vectors = new SqliteVecProvider({ dbPath: ":memory:" });
  setLibraryVectorProvider(vectors);
  process.env.NODETOOL_SEARCH_EMBEDDING_PROVIDER = "fake";
  process.env.NODETOOL_SEARCH_EMBEDDING_MODEL = "concepts-v1";
  setAssetBytesReader(async (asset) => {
    const text = files.get(asset.name);
    if (text === undefined) throw new Error(`no file for ${asset.name}`);
    return encoder.encode(text);
  });
});

afterEach(async () => {
  stopLibraryIndexWrites();
  setAssetBytesReader(null);
  setLibraryEmbedder(null);
  setLibraryQueryEmbedder(null);
  setLibraryVectorProvider(null);
  vectors.close();
  files.clear();
  delete process.env.NODETOOL_SEARCH_EMBEDDING_PROVIDER;
  delete process.env.NODETOOL_SEARCH_EMBEDDING_MODEL;
  delete process.env.NODETOOL_SEARCH_EXCLUDED_PROJECTS;
  ModelObserver.clear();
  await closeDb();
});

async function seed(): Promise<{ dog: Asset; sea: Asset; bill: Asset }> {
  files.set("walk.txt", "Notes from the morning walk with the puppy in the park.");
  files.set("trip.txt", "We watched the waves along the coast all afternoon.");
  files.set("march.txt", "Payment received for the March receipt.");
  const dog = await Asset.create({ user_id: USER, name: "walk.txt", content_type: "text/plain" });
  const sea = await Asset.create({ user_id: USER, name: "trip.txt", content_type: "text/plain" });
  const bill = await Asset.create({ user_id: USER, name: "march.txt", content_type: "text/plain" });
  stopLibraryIndexWrites();
  await reconcileLibraryIndex();
  await runIndexerPass();
  return { dog, sea, bill };
}

describe("fuseRankings", () => {
  it("ranks an id found by both lists above ids found by one", () => {
    expect(fuseRankings([["a", "b", "c"], ["d", "b"]])).toEqual(["b", "a", "d", "c"]);
  });
});

describe.each(dialects)("library search by meaning on %s", (_name, init) => {
  it("stays in keyword mode and says nothing while search by meaning is not set up", async () => {
    await init();
    delete process.env.NODETOOL_SEARCH_EMBEDDING_PROVIDER;
    await seed();
    expect(await runEmbedPass()).toEqual({ embedded: 0 });
    const result = await searchLibrary({ userId: USER, query: "dog" });
    expect(result.index.mode).toBe("keyword");
    expect(result.index.note).toBeUndefined();
    expect(result.hits).toEqual([]);
  });

  it("embeds chunks into a hidden collection and finds items by meaning", async () => {
    await init();
    const calls: string[][] = [];
    setLibraryEmbedder(fakeEmbedder(calls));
    const { dog, sea } = await seed();

    const space = embeddingSpace("fake", "concepts-v1");
    expect(await unembeddedChunkCount(USER, space)).toBeGreaterThan(0);
    const pass = await runEmbedPass();
    expect(pass.embedded).toBeGreaterThan(0);
    expect(await unembeddedChunkCount(USER, space)).toBe(0);
    // The item title is sent with each passage.
    expect(calls.flat().some((text) => text.startsWith("walk.txt\n\n"))).toBe(true);

    const collections = await vectors.listCollections();
    expect(collections).toHaveLength(1);
    expect(isManagedCollection(collections[0]!.name, collections[0]!.metadata)).toBe(true);
    expect(collections[0]!.dimension).toBe(CONCEPTS.length + 1);

    // "dog" is in no text: only the vector layer can find the puppy walk.
    const result = await searchLibrary({ userId: USER, query: "dog" });
    expect(result.index.mode).toBe("hybrid");
    expect(result.hits.map((hit) => hit.resourceId)).toEqual([dog.id]);
    expect(result.hits[0]!.matches[0]!.snippet).toContain("puppy");

    // A word match and a meaning match fuse; the item matching both ranks first.
    const both = await searchLibrary({ userId: USER, query: "sea waves" });
    expect(both.hits[0]!.resourceId).toBe(sea.id);

    const keyword = await searchLibrary({ userId: USER, query: "dog", mode: "keyword" });
    expect(keyword.index.mode).toBe("keyword");
    expect(keyword.hits).toEqual([]);

    // Another owner's vectors are never searched.
    const other = await searchLibrary({ userId: "someone-else", query: "dog" });
    expect(other.hits).toEqual([]);
  });

  it("falls back to words with a note when the query cannot be embedded", async () => {
    await init();
    setLibraryEmbedder(fakeEmbedder([]));
    await seed();
    await runEmbedPass();
    setLibraryQueryEmbedder(async () => null);
    const result = await searchLibrary({ userId: USER, query: "puppy" });
    expect(result.index.mode).toBe("keyword");
    expect(result.index.note).toMatch(/unavailable/);
    expect(result.hits).toHaveLength(1);
  });

  it("scopes vector hits to the project partition", async () => {
    await init();
    setLibraryEmbedder(fakeEmbedder([]));
    const { dog } = await seed();
    await runEmbedPass();
    const inProject = await searchLibrary({ userId: USER, query: "dog", projectId: dog.project_id ?? "" });
    expect(inProject.hits.map((hit) => hit.resourceId)).toEqual([dog.id]);
    const elsewhere = await searchLibrary({ userId: USER, query: "dog", projectId: "no-such-project" });
    expect(elsewhere.hits).toEqual([]);
  });

  it("removes vectors when their item is deleted", async () => {
    await init();
    setLibraryEmbedder(fakeEmbedder([]));
    const { dog } = await seed();
    await runEmbedPass();
    const [collection] = await libraryCollections(USER);
    const before = await (await vectors.getCollection({ name: collection!.name })).count();
    await dog.delete();
    await reconcileLibraryIndex();
    const after = await (await vectors.getCollection({ name: collection!.name })).count();
    expect(after).toBeLessThan(before);
    expect((await searchLibrary({ userId: USER, query: "dog" })).hits).toEqual([]);
  });

  it("rebuilds in a new space, answers from the old one meanwhile, then drops it", async () => {
    await init();
    setLibraryEmbedder(fakeEmbedder([]));
    const { dog } = await seed();
    await runEmbedPass();

    process.env.NODETOOL_SEARCH_EMBEDDING_MODEL = "concepts-v2";
    setLibraryEmbedder(fakeEmbedder([], 0.01));
    const queried: string[] = [];
    setLibraryQueryEmbedder(async (text, space) => {
      queried.push(space.id);
      return conceptVector(text, space.model === "concepts-v2" ? 0.01 : 0);
    });
    // Part of the rebuild: the old space is still complete, so it answers.
    await runEmbedPass({ limit: 1 });
    const during = await searchLibrary({ userId: USER, query: "dog" });
    expect(queried.at(-1)).toBe("fake:concepts-v1");
    expect(during.hits.map((hit) => hit.resourceId)).toEqual([dog.id]);
    expect((await libraryCollections(USER)).map((c) => c.space.id).sort()).toEqual([
      "fake:concepts-v1",
      "fake:concepts-v2"
    ]);

    await runEmbedPass();
    expect((await libraryCollections(USER)).map((c) => c.space.id)).toEqual(["fake:concepts-v2"]);
    const after = await searchLibrary({ userId: USER, query: "dog" });
    expect(queried.at(-1)).toBe("fake:concepts-v2");
    expect(after.hits.map((hit) => hit.resourceId)).toEqual([dog.id]);
  });

  it("pages a hybrid result past the fusion window without gaps or repeats", async () => {
    await init();
    setLibraryEmbedder(fakeEmbedder([]));
    const tiles = new Set<string>();
    for (let n = 0; n < 215; n += 1) {
      tiles.add((await Asset.create({ user_id: USER, name: `tile-${n}.png`, content_type: "image/png" })).id);
    }
    for (let n = 0; n < 5; n += 1) {
      await Asset.create({ user_id: USER, name: `plain-${n}.png`, content_type: "image/png" });
    }
    await reconcileLibraryIndex();
    await runEmbedPass();

    const seen: string[] = [];
    let cursor: string | null | undefined;
    let total = -1;
    do {
      const request: Parameters<typeof searchLibrary>[0] = { userId: USER, query: "tile", limit: 40 };
      if (cursor) request.cursor = cursor;
      const page = await searchLibrary(request);
      expect(page.index).toMatchObject({ mode: "hybrid" });
      if (total < 0) total = page.total;
      expect(page.total).toBe(total);
      seen.push(...page.hits.map((hit) => hit.resourceId));
      cursor = page.nextCursor;
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(total);
    for (const id of tiles) expect(seen).toContain(id);
  }, 120_000);

  it("skips items another indexer has claimed, so no chunk is paid for twice", async () => {
    await init();
    const calls: string[][] = [];
    setLibraryEmbedder(fakeEmbedder(calls));
    const { dog } = await seed();
    const future = new Date(Date.now() + 60_000).toISOString();
    await getPortableDb()
      .update(searchItems)
      .set({ lease_owner: "other-indexer", lease_expires_at: future })
      .where(eq(searchItems.resource_id, dog.id));
    await runEmbedPass();
    expect(calls.flat().some((text) => text.includes("puppy"))).toBe(false);
    // The other claim is untouched, and the rest were embedded and released.
    const [held] = await getPortableDb().select().from(searchItems).where(eq(searchItems.resource_id, dog.id));
    expect(held?.lease_owner).toBe("other-indexer");
    const free = await getPortableDb().select().from(searchItems).where(isNotNull(searchItems.lease_owner));
    expect(free).toHaveLength(1);
  });

  it("makes no paid call while another indexer holds the budget lease", async () => {
    await init();
    const calls: string[][] = [];
    setLibraryEmbedder(fakeEmbedder(calls));
    await seed();
    expect(await acquireSearchLease(EMBED_BUDGET_LEASE, "other-indexer", 60_000)).toBe(true);
    expect(await runEmbedPass()).toEqual({ embedded: 0, stopped: "budget_busy" });
    expect(calls).toEqual([]);
    // Released, the next pass goes ahead.
    await releaseSearchLease(EMBED_BUDGET_LEASE, "other-indexer");
    expect((await runEmbedPass()).embedded).toBeGreaterThan(0);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("embeds a moved item again under its new project", async () => {
    await init();
    setLibraryEmbedder(fakeEmbedder([]));
    const { dog } = await seed();
    await runEmbedPass();
    const now = new Date().toISOString();
    await getPortableDb()
      .insert(projects)
      .values({ id: "proj-new", user_id: USER, name: "New", created_at: now, updated_at: now });
    dog.project_id = "proj-new";
    await dog.save();
    await reconcileLibraryIndex();
    expect(await unembeddedChunkCount(USER, embeddingSpace("fake", "concepts-v1"))).toBeGreaterThan(0);
    await runEmbedPass();
    const moved = await searchLibrary({ userId: USER, query: "dog", projectId: "proj-new" });
    expect(moved.hits.map((hit) => hit.resourceId)).toEqual([dog.id]);
  });

  it("removes the vectors of a project once it is excluded", async () => {
    await init();
    setLibraryEmbedder(fakeEmbedder([]));
    const { dog } = await seed();
    await runEmbedPass();
    expect((await searchLibrary({ userId: USER, query: "dog" })).hits.map((hit) => hit.resourceId)).toEqual([dog.id]);
    process.env.NODETOOL_SEARCH_EXCLUDED_PROJECTS = dog.project_id ?? "";
    await runEmbedPass();
    const [collection] = await libraryCollections(USER);
    const remaining = await (await vectors.getCollection({ name: collection!.name })).count();
    const embedded = await getPortableDb()
      .select({ id: searchChunks.id })
      .from(searchChunks)
      .where(isNotNull(searchChunks.embedding_space));
    expect(remaining).toBe(embedded.length);
    expect((await searchLibrary({ userId: USER, query: "dog", mode: "semantic" })).hits).toEqual([]);
  });

  it("never sends the text of an excluded project to the model", async () => {
    await init();
    const calls: string[][] = [];
    setLibraryEmbedder(fakeEmbedder(calls));
    const { dog } = await seed();
    process.env.NODETOOL_SEARCH_EXCLUDED_PROJECTS = dog.project_id ?? "";
    await runEmbedPass();
    expect(calls.flat().some((text) => text.includes("puppy"))).toBe(false);
    const chunks = await getPortableDb()
      .select({ space: searchChunks.embedding_space })
      .from(searchChunks)
      .where(eq(searchChunks.embedding_space, "fake:concepts-v1"));
    expect(chunks).toEqual([]);
  });
});

describe.each(dialects)("library index status on %s", (_name, init) => {
  it("reports items, vectors and spaces, and a vector rebuild embeds every chunk again", async () => {
    await init();
    setLibraryEmbedder(fakeEmbedder([]));
    await seed();
    await runEmbedPass();
    const status = await libraryIndexStatus(USER);
    expect(status.items).toMatchObject({ ready: 3, pending: 0, failed: 0, total: 3 });
    expect(status.semantic.space).toBe("fake:concepts-v1");
    expect(status.semantic.remaining).toBe(0);
    expect(status.semantic.embedded).toBe(status.chunks);
    expect(status.semantic.collections).toEqual(["fake:concepts-v1"]);

    await rebuildLibraryIndex(USER, "vectors");
    const rebuilding = await libraryIndexStatus(USER);
    expect(rebuilding.semantic.embedded).toBe(0);
    expect(rebuilding.semantic.collections).toEqual([]);
    await runEmbedPass();
    expect((await libraryIndexStatus(USER)).semantic.remaining).toBe(0);
  });

  it("a full rebuild extracts every file again", async () => {
    await init();
    await seed();
    await rebuildLibraryIndex(USER, "all");
    expect((await libraryIndexStatus(USER)).items.pending).toBe(3);
    await runIndexerPass();
    expect((await libraryIndexStatus(USER)).items.ready).toBe(3);
  });
});
