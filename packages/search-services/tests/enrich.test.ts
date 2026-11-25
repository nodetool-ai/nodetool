import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  Asset,
  closeDb,
  getPortableDb,
  initTestDb,
  ModelObserver,
  searchChunks,
  searchItems
} from "@nodetool-ai/models";
import {
  MAX_ENRICH_ATTEMPTS,
  readLibraryPassage,
  reconcileLibraryIndex,
  runEnrichPass,
  runIndexerPass,
  searchLibrary,
  setAssetBytesReader,
  setLibraryEnricher,
  stopLibraryIndexWrites,
  transcriptChunks,
  type EnrichInput,
  type LibraryEnricher
} from "../src/index.js";
import { initPgliteDb } from "./_helpers/pglite-db.js";

const USER = "user-1";

interface Calls {
  caption: EnrichInput[];
  transcribe: EnrichInput[];
}

function fakeEnricher(calls: Calls, fail = false): LibraryEnricher {
  return {
    async caption(input) {
      calls.caption.push(input);
      if (fail) throw new Error("caption model is down");
      return "A red lighthouse on a rocky shore at dusk.";
    },
    async transcribe(input) {
      calls.transcribe.push(input);
      return [
        { text: "Welcome to the quarterly budget review.", start: 0, end: 4 },
        { text: "Revenue grew in every region.", start: 4, end: 9 }
      ];
    }
  };
}

const dialects: Array<[string, () => Promise<void>]> = [
  ["sqlite", async () => { initTestDb(); }],
  ["postgres", initPgliteDb]
];

beforeEach(() => {
  setAssetBytesReader(async () => new Uint8Array([1, 2, 3]));
  process.env.NODETOOL_SEARCH_CAPTION_MODEL = "fake:vision-1";
  process.env.NODETOOL_SEARCH_TRANSCRIPT_MODEL = "fake:asr-1";
});

afterEach(async () => {
  stopLibraryIndexWrites();
  setAssetBytesReader(null);
  setLibraryEnricher(null);
  delete process.env.NODETOOL_SEARCH_CAPTION_MODEL;
  delete process.env.NODETOOL_SEARCH_TRANSCRIPT_MODEL;
  delete process.env.NODETOOL_SEARCH_EXCLUDED_PROJECTS;
  ModelObserver.clear();
  await closeDb();
});

async function index(): Promise<void> {
  stopLibraryIndexWrites();
  await reconcileLibraryIndex();
  await runIndexerPass();
}

describe("transcriptChunks", () => {
  it("keeps each passage's time range", () => {
    const chunks = transcriptChunks([
      { text: "one", start: 0, end: 1 },
      { text: "two", start: 1, end: 2.5 }
    ]);
    expect(chunks).toEqual([{ field: "transcript", text: "one two", locator: { start: 0, end: 2.5 } }]);
  });

  it("chunks an untimed transcript as plain text", () => {
    const chunks = transcriptChunks([{ text: "no times here" }]);
    expect(chunks).toEqual([{ field: "transcript", text: "no times here", locator: null }]);
  });
});

describe.each(dialects)("enrichment on %s", (_name, open) => {
  beforeEach(open);

  it("captions an image without a prompt and finds it by what it shows", async () => {
    const photo = await Asset.create({ user_id: USER, name: "IMG_0042.jpg", content_type: "image/jpeg" });
    await index();
    expect((await searchLibrary({ userId: USER, query: "lighthouse" })).hits).toHaveLength(0);

    const calls: Calls = { caption: [], transcribe: [] };
    setLibraryEnricher(fakeEnricher(calls));
    const pass = await runEnrichPass();
    expect(pass).toMatchObject({ enriched: 1, failed: 0 });
    expect(calls.caption[0]?.model).toMatchObject({ provider: "fake", model: "vision-1" });

    const result = await searchLibrary({ userId: USER, query: "lighthouse" });
    expect(result.hits.map((hit) => hit.resourceId)).toEqual([photo.id]);
    expect(result.hits[0]?.matches[0]?.field).toBe("caption");

    // Done once: a second pass calls nothing.
    expect(await runEnrichPass()).toMatchObject({ enriched: 0 });
    expect(calls.caption).toHaveLength(1);
  });

  it("does not caption an image that has a prompt", async () => {
    await Asset.create({
      user_id: USER,
      name: "render.png",
      content_type: "image/png",
      metadata: { prompt: "a lighthouse in a storm" }
    });
    await index();
    const calls: Calls = { caption: [], transcribe: [] };
    setLibraryEnricher(fakeEnricher(calls));
    await runEnrichPass();
    expect(calls.caption).toHaveLength(0);
    expect(await runEnrichPass()).toMatchObject({ enriched: 0 });
  });

  it("transcribes audio with time ranges a read can jump to", async () => {
    const audio = await Asset.create({ user_id: USER, name: "meeting.mp3", content_type: "audio/mpeg" });
    await index();
    setLibraryEnricher(fakeEnricher({ caption: [], transcribe: [] }));
    await runEnrichPass();

    const result = await searchLibrary({ userId: USER, query: "budget review" });
    expect(result.hits.map((hit) => hit.resourceId)).toEqual([audio.id]);
    const match = result.hits[0]!.matches[0]!;
    expect(match.field).toBe("transcript");
    expect(match.locator).toEqual({ start: 0, end: 9 });

    const read = await readLibraryPassage({ userId: USER, id: audio.id, locator: match.locator });
    expect(read.ok && read.passages[read.matched]?.text).toContain("Revenue grew");
  });

  it("keeps enrichment chunks when the item is extracted again", async () => {
    const audio = await Asset.create({ user_id: USER, name: "memo.mp3", content_type: "audio/mpeg" });
    await index();
    setLibraryEnricher(fakeEnricher({ caption: [], transcribe: [] }));
    await runEnrichPass();
    await audio.update({ name: "memo renamed.mp3" });
    await index();
    const chunks = await getPortableDb()
      .select({ field: searchChunks.field })
      .from(searchChunks)
      .innerJoin(searchItems, eq(searchItems.id, searchChunks.item_id))
      .where(eq(searchItems.resource_id, audio.id));
    expect(chunks.map((chunk) => chunk.field)).toContain("transcript");
  });

  it("stops retrying after the last failed attempt", async () => {
    await Asset.create({ user_id: USER, name: "IMG_1.jpg", content_type: "image/jpeg" });
    await index();
    const calls: Calls = { caption: [], transcribe: [] };
    setLibraryEnricher(fakeEnricher(calls, true));
    for (let round = 0; round < MAX_ENRICH_ATTEMPTS + 2; round += 1) await runEnrichPass();
    expect(calls.caption).toHaveLength(MAX_ENRICH_ATTEMPTS);
    const [row] = await getPortableDb()
      .select({ error: searchItems.enrich_error })
      .from(searchItems)
      .where(eq(searchItems.kind, "image"));
    expect(row?.error).toBe("caption model is down");
  });

  it("sends nothing from an excluded project or with no model set", async () => {
    const photo = await Asset.create({ user_id: USER, name: "IMG_2.jpg", content_type: "image/jpeg" });
    await index();
    const calls: Calls = { caption: [], transcribe: [] };
    setLibraryEnricher(fakeEnricher(calls));
    process.env.NODETOOL_SEARCH_EXCLUDED_PROJECTS = photo.project_id ?? "default";
    await runEnrichPass();
    delete process.env.NODETOOL_SEARCH_EXCLUDED_PROJECTS;
    delete process.env.NODETOOL_SEARCH_CAPTION_MODEL;
    await runEnrichPass();
    expect(calls.caption).toHaveLength(0);
  });
});
