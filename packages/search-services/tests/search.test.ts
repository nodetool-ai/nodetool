import { afterEach, describe, expect, it } from "vitest";
import {
  Asset,
  closeDb,
  getDatabase,
  getPortableDb,
  initTestDb,
  ModelObserver,
  searchChunks,
  searchItems,
  Workflow
} from "@nodetool-ai/models";
import { eq, sql } from "drizzle-orm";
import {
  extractDocument,
  reconcileLibraryIndex,
  searchAssets,
  searchLibrary,
  setLibraryIndexMaintained,
  snippetOf,
  stopLibraryIndexWrites
} from "../src/index.js";
import { initPgliteDb } from "./_helpers/pglite-db.js";

const USER = "user-1";

async function generatedImage(name: string, prompt: string, extra: Record<string, unknown> = {}) {
  return Asset.create({
    user_id: USER,
    name,
    content_type: "image/png",
    metadata: {
      prompt,
      generation: { provider: "fal", model: "flux-dev" },
      ...extra
    }
  });
}

const dialects: Array<[string, () => Promise<void>]> = [
  ["sqlite", async () => { initTestDb(); }],
  ["postgres", initPgliteDb]
];

afterEach(async () => {
  stopLibraryIndexWrites();
  ModelObserver.clear();
  await closeDb();
});

describe.each(dialects)("library search on %s", (_name, init) => {
  it("finds an asset by a word of its prompt, not only its name", async () => {
    await init();
    const fox = await generatedImage("render-001.png", "A red fox sleeping in the snow at dawn");
    await generatedImage("render-002.png", "A lighthouse on a cliff");

    const result = await searchLibrary({ userId: USER, query: "fox" });
    expect(result.hits.map((hit) => hit.resourceId)).toEqual([fox.id]);
    expect(result.hits[0]?.matches[0]).toMatchObject({ field: "prompt" });
    expect(result.hits[0]?.matches[0]?.snippet).toContain("red fox");
    expect(result.index).toEqual({ mode: "keyword", pending: 0, failed: 0 });
    expect(result.total).toBe(1);
  });

  it("matches case-insensitively and by word prefix", async () => {
    await init();
    const beach = await Asset.create({ user_id: USER, name: "Sunset-Beach.PNG", content_type: "image/png" });

    for (const query of ["sunset", "SUNSET beach", "sun"]) {
      const result = await searchLibrary({ userId: USER, query });
      expect(result.hits.map((hit) => hit.resourceId), query).toEqual([beach.id]);
    }
  });

  it("keeps substring matches on names", async () => {
    await init();
    const photo = await Asset.create({ user_id: USER, name: "myphoto.jpg", content_type: "image/jpeg" });
    const result = await searchLibrary({ userId: USER, query: "photo" });
    expect(result.hits.map((hit) => hit.resourceId)).toEqual([photo.id]);
  });

  it("never returns another owner's items", async () => {
    await init();
    await Asset.create({ user_id: "someone-else", name: "fox.png", content_type: "image/png" });
    const result = await searchLibrary({ userId: USER, query: "fox" });
    expect(result.hits).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("indexes tags and filters on them, the provider and the kind", async () => {
    await init();
    const tagged = await generatedImage("a.png", "castle", { tags: ["Hero", "night"] });
    await generatedImage("b.png", "castle");
    await Asset.create({ user_id: USER, name: "castle.mp3", content_type: "audio/mpeg" });

    const byTag = await searchLibrary({ userId: USER, query: "", filter: { tags: ["hero"] } });
    expect(byTag.hits.map((hit) => hit.resourceId)).toEqual([tagged.id]);
    expect(byTag.hits[0]?.metadata?.tags).toEqual(["hero", "night"]);

    const tagWord = await searchLibrary({ userId: USER, query: "night" });
    expect(tagWord.hits.map((hit) => hit.resourceId)).toEqual([tagged.id]);

    const images = await searchLibrary({ userId: USER, query: "castle", kinds: ["image"] });
    expect(images.total).toBe(2);
    const fal = await searchLibrary({ userId: USER, query: "castle", filter: { provider: "fal" } });
    expect(fal.total).toBe(2);
    const audio = await searchLibrary({ userId: USER, query: "castle", kinds: ["audio"] });
    expect(audio.total).toBe(1);
  });

  it("follows renames and deletes through the inline writes", async () => {
    await init();
    const asset = await Asset.create({ user_id: USER, name: "draft.png", content_type: "image/png" });
    expect((await searchLibrary({ userId: USER, query: "draft" })).total).toBe(1);

    asset.name = "final.png";
    await asset.save();
    expect((await searchLibrary({ userId: USER, query: "draft" })).total).toBe(0);
    expect((await searchLibrary({ userId: USER, query: "final" })).total).toBe(1);

    await asset.delete();
    expect((await searchLibrary({ userId: USER, query: "final" })).total).toBe(0);
    const left = await getPortableDb().select().from(searchItems).where(eq(searchItems.resource_id, asset.id));
    expect(left).toEqual([]);
  });

  it("indexes documents by name and description", async () => {
    await init();
    const workflow = await Workflow.create({
      user_id: USER,
      name: "Podcast cleanup",
      description: "Removes background hum from interviews",
      graph: { nodes: [], edges: [] }
    });
    const result = await searchLibrary({ userId: USER, query: "interviews" });
    expect(result.hits.map((hit) => [hit.kind, hit.resourceId])).toEqual([["workflow", workflow.id]]);
    expect(result.hits[0]?.matches[0]?.field).toBe("description");
  });

  it("pages with a cursor and reports the total", async () => {
    await init();
    for (let n = 0; n < 5; n += 1) {
      await Asset.create({ user_id: USER, name: `tile-${n}.png`, content_type: "image/png" });
    }
    const first = await searchLibrary({ userId: USER, query: "tile", limit: 2 });
    expect(first.hits).toHaveLength(2);
    expect(first.total).toBe(5);
    const second = await searchLibrary({ userId: USER, query: "tile", limit: 2, cursor: first.nextCursor });
    const third = await searchLibrary({ userId: USER, query: "tile", limit: 2, cursor: second.nextCursor });
    expect(third.nextCursor).toBeNull();
    const seen = [...first.hits, ...second.hits, ...third.hits].map((hit) => hit.resourceId);
    expect(new Set(seen).size).toBe(5);
  });

  it("reconciles rows written without a change signal", async () => {
    await init();
    stopLibraryIndexWrites();
    const asset = await Asset.create({ user_id: USER, name: "orphan.png", content_type: "image/png" });
    expect(await getPortableDb().select().from(searchItems)).toEqual([]);

    expect(await reconcileLibraryIndex()).toEqual({ indexed: 1, excluded: 0, removed: 0, pending: 0 });
    expect(await getPortableDb().select().from(searchChunks)).not.toEqual([]);
    expect(await reconcileLibraryIndex()).toEqual({ indexed: 0, excluded: 0, removed: 0, pending: 0 });

    await asset.delete();
    expect(await reconcileLibraryIndex()).toEqual({ indexed: 0, excluded: 0, removed: 1, pending: 0 });
  });

  it("does not reconcile on a query in a host that maintains the index", async () => {
    await init();
    setLibraryIndexMaintained(true);
    try {
      stopLibraryIndexWrites();
      await Asset.create({ user_id: USER, name: "unsignalled.png", content_type: "image/png" });
      expect((await searchLibrary({ userId: USER, query: "unsignalled" })).total).toBe(0);
      await reconcileLibraryIndex();
      expect((await searchLibrary({ userId: USER, query: "unsignalled" })).total).toBe(1);
    } finally {
      setLibraryIndexMaintained(false);
    }
  });

  it("answers asset searches with rows, folder paths and the full total", async () => {
    await init();
    const folder = await Asset.create({ user_id: USER, name: "Renders", content_type: "folder", parent_id: USER });
    const inside = await Asset.create({ user_id: USER, name: "cat.png", content_type: "image/png", parent_id: folder.id });
    await Asset.create({ user_id: USER, name: "cat.wav", content_type: "audio/wav" });

    const all = await searchAssets(USER, "cat");
    expect(all.total).toBe(2);
    expect(all.assets.every((asset) => asset instanceof Asset)).toBe(true);
    expect(all.folderPaths.get(inside.id)).toBe("Home / Renders");

    const images = await searchAssets(USER, "cat", { contentType: "image/" });
    expect(images.assets.map((asset) => asset.id)).toEqual([inside.id]);
    // The folder itself is not a library item.
    expect((await searchAssets(USER, "renders")).total).toBe(0);
  });

  it("updates the folder path of every asset under a renamed folder", async () => {
    await init();
    const outer = await Asset.create({ user_id: USER, name: "Renders", content_type: "folder", parent_id: USER });
    const inner = await Asset.create({ user_id: USER, name: "Night", content_type: "folder", parent_id: outer.id });
    const deep = await Asset.create({ user_id: USER, name: "owl.png", content_type: "image/png", parent_id: inner.id });
    expect((await searchAssets(USER, "owl")).folderPaths.get(deep.id)).toBe("Home / Renders / Night");

    outer.name = "Archive";
    await outer.save();
    expect((await searchAssets(USER, "owl")).folderPaths.get(deep.id)).toBe("Home / Archive / Night");
  });

  it("matches across accents in either direction", async () => {
    await init();
    const accented = await Asset.create({ user_id: USER, name: "Café menu.png", content_type: "image/png" });
    const plain = await Asset.create({ user_id: USER, name: "resume.pdf", content_type: "application/pdf" });
    const cafe = await searchLibrary({ userId: USER, query: "cafe" });
    expect(cafe.hits.map((hit) => hit.resourceId)).toEqual([accented.id]);
    const resume = await searchLibrary({ userId: USER, query: "résumé" });
    expect(resume.hits.map((hit) => hit.resourceId)).toEqual([plain.id]);
  });

  it("filters on favorite: false as well as true", async () => {
    await init();
    const starred = await Asset.create({ user_id: USER, name: "star-a.png", content_type: "image/png" });
    starred.favorite = true;
    await starred.save();
    const other = await Asset.create({ user_id: USER, name: "star-b.png", content_type: "image/png" });
    const yes = await searchLibrary({ userId: USER, query: "star", filter: { favorite: true } });
    expect(yes.hits.map((hit) => hit.resourceId)).toEqual([starred.id]);
    const no = await searchLibrary({ userId: USER, query: "star", filter: { favorite: false } });
    expect(no.hits.map((hit) => hit.resourceId)).toEqual([other.id]);
  });
});

describe("search tables on postgres", () => {
  it("enable row level security so the public API roles cannot read them", async () => {
    await initPgliteDb();
    const connection = getDatabase();
    if (connection.dialect !== "postgres") throw new Error("expected postgres");
    const result = await connection.db.execute(
      sql`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('nodetool_search_items', 'nodetool_search_chunks', 'nodetool_search_leases') ORDER BY relname`
    );
    expect(result.rows).toEqual([
      { relname: "nodetool_search_chunks", relrowsecurity: true },
      { relname: "nodetool_search_items", relrowsecurity: true },
      { relname: "nodetool_search_leases", relrowsecurity: true }
    ]);
  });
});

describe("snippetOf", () => {
  it("centres a long passage on the first term", () => {
    const text = `${"lorem ".repeat(60)}the red fox ${"ipsum ".repeat(60)}`;
    const snippet = snippetOf(text, ["fox"]);
    expect(snippet).toContain("red fox");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
  });
});

describe("document descriptions", () => {
  it("reads the description a JS script keeps inside its document", () => {
    const item = extractDocument("js_script", {
      id: "s1",
      user_id: USER,
      name: "Summer",
      document: JSON.stringify({ description: "Sums numbers.", code: "" }),
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
    expect(item.chunks).toContainEqual({ field: "description", text: "Sums numbers." });
  });
});
