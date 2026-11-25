import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  Asset,
  closeDb,
  getPortableDb,
  initTestDb,
  ModelObserver,
  projects,
  searchItems,
  Workflow
} from "@nodetool-ai/models";
import {
  chunkLines,
  chunkMarkdown,
  chunkPlainText,
  claimPendingItems,
  completeItem,
  dropClaimedItem,
  flushLibraryIndexWrites,
  MAX_ATTEMPTS,
  PASSAGE_CHARS,
  readLibraryPassage,
  reconcileLibraryIndex,
  runIndexerPass,
  searchLibrary,
  setAssetBytesReader,
  stopLibraryIndexWrites
} from "../src/index.js";
import { documentTextGroups } from "../src/content.js";
import { initPgliteDb } from "./_helpers/pglite-db.js";

const USER = "user-1";
const encoder = new TextEncoder();

/** Files by asset name, read by the indexer instead of storage. */
const files = new Map<string, string>();

function useFiles(): void {
  setAssetBytesReader(async (asset) => {
    const text = files.get(asset.name);
    if (text === undefined) throw new Error(`no file for ${asset.name}`);
    return encoder.encode(text);
  });
}

async function itemOf(resourceId: string) {
  const [row] = await getPortableDb()
    .select()
    .from(searchItems)
    .where(eq(searchItems.resource_id, resourceId));
  return row;
}

const NOTES = [
  "# Field notes",
  "",
  "Opening paragraph about the trip.",
  "",
  "## Birds",
  "",
  "We saw a kingfisher diving into the river near the old mill.",
  "",
  "## Weather",
  "",
  "Fog all morning, clear by noon."
].join("\n");

const dialects: Array<[string, () => Promise<void>]> = [
  ["sqlite", async () => { initTestDb(); }],
  ["postgres", initPgliteDb]
];

afterEach(async () => {
  stopLibraryIndexWrites();
  setAssetBytesReader(null);
  files.clear();
  ModelObserver.clear();
  await closeDb();
});

describe.each(dialects)("library indexer on %s", (_name, init) => {
  it("extracts a Markdown file so its body is searchable, with the heading path", async () => {
    await init();
    useFiles();
    files.set("notes.md", NOTES);
    const asset = await Asset.create({ user_id: USER, name: "notes.md", content_type: "text/markdown" });
    stopLibraryIndexWrites();
    await reconcileLibraryIndex();
    expect((await itemOf(asset.id))?.state).toBe("pending");

    // Before extraction only the name matches; the body does not.
    expect((await searchLibrary({ userId: USER, query: "kingfisher" })).hits).toEqual([]);

    expect(await runIndexerPass()).toEqual({ processed: 1, ready: 1, skipped: 0, failed: 0 });
    expect((await itemOf(asset.id))?.state).toBe("ready");
    const result = await searchLibrary({ userId: USER, query: "kingfisher" });
    expect(result.hits.map((hit) => hit.resourceId)).toEqual([asset.id]);
    const match = result.hits[0]!.matches[0]!;
    expect(match.field).toBe("body");
    expect(match.locator).toMatchObject({ headings: ["Field notes", "Birds"] });
    expect(result.index.pending).toBe(0);
  });

  it("reads the passage at a locator with its neighbours, by full or short id", async () => {
    await init();
    useFiles();
    files.set("notes.md", NOTES);
    const asset = await Asset.create({ user_id: USER, name: "notes.md", content_type: "text/markdown" });
    stopLibraryIndexWrites();
    await reconcileLibraryIndex();
    await runIndexerPass();

    const hit = (await searchLibrary({ userId: USER, query: "kingfisher" })).hits[0]!;
    const read = await readLibraryPassage({
      userId: USER,
      id: asset.id.slice(0, 12),
      locator: hit.matches[0]!.locator!,
      before: 1,
      after: 1
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.item.resourceId).toBe(asset.id);
    expect(read.passages[read.matched]!.text).toContain("kingfisher");
    expect(read.passages.length).toBeGreaterThan(1);
    expect(read.passages.length).toBeLessThanOrEqual(3);

    const missing = await readLibraryPassage({ userId: USER, id: asset.id, locator: { page: 99 } });
    expect(missing.ok).toBe(false);
    const other = await readLibraryPassage({ userId: "someone-else", id: asset.id });
    expect(other.ok).toBe(false);
  });

  it("refuses to read an item whose source or project is gone", async () => {
    await init();
    useFiles();
    files.set("gone.md", NOTES);
    files.set("hidden.md", NOTES);
    const now = new Date().toISOString();
    await getPortableDb()
      .insert(projects)
      .values({ id: "proj-1", user_id: USER, name: "Old", created_at: now, updated_at: now });
    const gone = await Asset.create({ user_id: USER, name: "gone.md", content_type: "text/markdown" });
    const hidden = await Asset.create({
      user_id: USER,
      name: "hidden.md",
      content_type: "text/markdown",
      project_id: "proj-1"
    });
    stopLibraryIndexWrites();
    await reconcileLibraryIndex();
    await runIndexerPass();
    expect((await readLibraryPassage({ userId: USER, id: gone.id })).ok).toBe(true);
    expect((await readLibraryPassage({ userId: USER, id: hidden.id })).ok).toBe(true);

    // Neither change reaches the index: the inline writes are off.
    await gone.delete();
    await getPortableDb().update(projects).set({ deleted_at: now }).where(eq(projects.id, "proj-1"));
    expect(await itemOf(gone.id)).toBeDefined();
    expect((await readLibraryPassage({ userId: USER, id: gone.id })).ok).toBe(false);
    expect((await readLibraryPassage({ userId: USER, id: hidden.id })).ok).toBe(false);
  });

  it("indexes the text inside a workflow graph, located by node", async () => {
    await init();
    const workflow = await Workflow.create({
      user_id: USER,
      name: "Poster maker",
      access: "private",
      graph: {
        nodes: [
          {
            id: "node-prompt",
            type: "nodetool.text.Template",
            data: { prompt: "A vintage travel poster of a lighthouse at sunset" }
          }
        ],
        edges: []
      }
    });
    await flushLibraryIndexWrites();
    await reconcileLibraryIndex();
    await runIndexerPass();
    const result = await searchLibrary({ userId: USER, query: "lighthouse" });
    expect(result.hits.map((hit) => hit.resourceId)).toEqual([workflow.id]);
    expect(result.hits[0]!.matches[0]!.locator).toMatchObject({ node_id: "node-prompt" });
  });

  it("retries a failed extraction with backoff, then gives up, and the item stays findable", async () => {
    await init();
    useFiles();
    const asset = await Asset.create({ user_id: USER, name: "unreadable.txt", content_type: "text/plain" });
    stopLibraryIndexWrites();
    await reconcileLibraryIndex();

    expect(await runIndexerPass()).toMatchObject({ processed: 1, failed: 1 });
    let item = await itemOf(asset.id);
    expect(item?.state).toBe("pending");
    expect(item?.attempts).toBe(1);
    expect(item?.error).toContain("no file");
    // Backoff: the item is not claimable right away.
    expect(await runIndexerPass()).toMatchObject({ processed: 0 });

    for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await getPortableDb()
        .update(searchItems)
        .set({ next_attempt_at: null })
        .where(eq(searchItems.id, item!.id));
      await runIndexerPass();
    }
    item = await itemOf(asset.id);
    expect(item?.state).toBe("failed");
    const result = await searchLibrary({ userId: USER, query: "unreadable" });
    expect(result.hits.map((hit) => hit.resourceId)).toEqual([asset.id]);
    expect(result.index.failed).toBe(1);
  });

  it("drops an extraction that finished after the file changed", async () => {
    await init();
    useFiles();
    files.set("draft.txt", "first version about otters");
    const asset = await Asset.create({ user_id: USER, name: "draft.txt", content_type: "text/plain" });
    stopLibraryIndexWrites();
    await reconcileLibraryIndex();

    const [claimed] = await claimPendingItems("test", 1);
    expect(claimed).toBeDefined();
    // Another claimer sees nothing while the lease holds.
    expect(await claimPendingItems("other", 1)).toEqual([]);

    asset.content_hash = "changed";
    await asset.save();
    await reconcileLibraryIndex();
    const stale = await completeItem(claimed!, {
      status: "ready",
      chunks: [{ field: "body", text: "first version about otters" }]
    });
    expect(stale).toBe(false);
    expect((await searchLibrary({ userId: USER, query: "otters" })).hits).toEqual([]);
  });

  it("keeps an item when its source is back or rewritten before the drop", async () => {
    await init();
    useFiles();
    files.set("keep.txt", "kept");
    const asset = await Asset.create({ user_id: USER, name: "keep.txt", content_type: "text/plain" });
    stopLibraryIndexWrites();
    await reconcileLibraryIndex();

    // The extractor saw the source missing, but it exists when the drop runs.
    const [first] = await claimPendingItems("test", 1);
    expect(await dropClaimedItem(first!)).toBe(false);
    expect(await itemOf(asset.id)).toBeDefined();

    // The source is gone, but an inline write rewrote the item meanwhile.
    await getPortableDb().update(searchItems).set({ lease_expires_at: null }).where(eq(searchItems.resource_id, asset.id));
    const [second] = await claimPendingItems("test", 1);
    await asset.delete();
    await getPortableDb().update(searchItems).set({ source_version: "rewritten" }).where(eq(searchItems.resource_id, asset.id));
    expect(await dropClaimedItem(second!)).toBe(false);
    expect(await itemOf(asset.id)).toBeDefined();

    // With the claim intact and the source gone, the drop goes through.
    await getPortableDb().update(searchItems).set({ lease_expires_at: null }).where(eq(searchItems.resource_id, asset.id));
    const [third] = await claimPendingItems("test", 1);
    expect(await dropClaimedItem(third!)).toBe(true);
    expect(await itemOf(asset.id)).toBeUndefined();
  });

  it("marks a file it cannot read as skipped and keeps it findable by name", async () => {
    await init();
    useFiles();
    files.set("big.txt", "x");
    const asset = await Asset.create({
      user_id: USER,
      name: "big.txt",
      content_type: "text/plain",
      size: 60 * 1024 * 1024
    });
    stopLibraryIndexWrites();
    await reconcileLibraryIndex();
    expect(await runIndexerPass()).toMatchObject({ skipped: 1 });
    const item = await itemOf(asset.id);
    expect(item?.state).toBe("skipped");
    expect(item?.error).toContain("larger than");
    expect((await searchLibrary({ userId: USER, query: "big" })).hits).toHaveLength(1);
  });
});

describe("chunking", () => {
  it("cuts plain text into passages near the target size with character ranges", () => {
    const paragraph = "word ".repeat(100).trim();
    const text = Array.from({ length: 10 }, () => paragraph).join("\n\n");
    const chunks = chunkPlainText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(PASSAGE_CHARS);
      const { start, end } = chunk.locator as { start: number; end: number };
      expect(end).toBeGreaterThan(start);
    }
  });

  it("never puts two sections in one Markdown passage", () => {
    const chunks = chunkMarkdown("# A\n\nalpha\n\n## B\n\nbeta");
    const beta = chunks.find((chunk) => chunk.text.includes("beta"));
    expect(beta?.text).not.toContain("alpha");
    expect(beta?.locator).toMatchObject({ headings: ["A", "B"] });
  });

  it("splits one very long line at word boundaries", () => {
    const chunks = chunkPlainText("lorem ipsum ".repeat(400));
    expect(chunks.length).toBeGreaterThan(4);
    expect(chunks.every((chunk) => chunk.text.length <= PASSAGE_CHARS)).toBe(true);
  });

  it("cuts code by line ranges", () => {
    const code = Array.from({ length: 200 }, (_, n) => `const value${n} = ${n};`).join("\n");
    const chunks = chunkLines(code);
    expect(chunks[0]!.locator).toMatchObject({ line_start: 1 });
    const last = chunks.at(-1)!.locator as { line_end: number };
    expect(last.line_end).toBe(200);
  });
});

describe("documentTextGroups", () => {
  it("stops at a nesting depth instead of overflowing the stack", () => {
    let deep: Record<string, unknown> = { text: "bottom of the well" };
    for (let n = 0; n < 100_000; n += 1) deep = { child: deep };
    const groups = documentTextGroups({ text: "top level words", nested: deep });
    expect(groups.get("")).toEqual(["top level words"]);
  });
});
