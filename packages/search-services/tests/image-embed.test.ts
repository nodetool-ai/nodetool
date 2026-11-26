import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Asset, closeDb, getPortableDb, initTestDb, ModelObserver, searchItems } from "@nodetool-ai/models";
import { SqliteVecProvider } from "@nodetool-ai/vectorstore";
import {
  embeddingSpace,
  imageVectorId,
  libraryCollectionName,
  libraryCollections,
  libraryIndexStatus,
  reconcileLibraryIndex,
  runImageEmbedPass,
  runIndexerPass,
  searchLibrary,
  setAssetBytesReader,
  setLibraryEmbedder,
  setLibraryVectorProvider,
  stopLibraryIndexWrites,
  type LibraryEmbedder,
  type LibraryImage
} from "../src/index.js";
import { initPgliteDb } from "./_helpers/pglite-db.js";

const USER = "user-1";
const OTHER = "user-2";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
/** What each fake image file shows. The fake image model reads it as the picture. */
const pictures = new Map<string, string>();

/** Each dimension is a concept; a text or picture scores on it when it holds one of its words. */
const CONCEPTS = [
  ["dog", "puppy", "hound"],
  ["ocean", "sea", "waves", "beach"],
  ["mountain", "peak", "summit"]
];

function conceptVector(text: string): number[] {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return [...CONCEPTS.map((group) => (words.some((word) => group.includes(word)) ? 1 : 0)), 0.05];
}

/**
 * A fake CLIP: text and pictures map into one concept space. Image file
 * names say nothing, so only the image vectors can find them by meaning.
 */
function fakeClip(imageCalls: LibraryImage[][]): LibraryEmbedder {
  return {
    async embed(texts) {
      return texts.map(conceptVector);
    },
    async embedImages(images) {
      imageCalls.push(images);
      return images.map((image) => conceptVector(decoder.decode(image.bytes)));
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
  process.env.NODETOOL_SEARCH_IMAGE_EMBEDDING_MODEL = "fake:clip-v1";
  setAssetBytesReader(async (asset) => {
    const picture = pictures.get(asset.name);
    if (picture === undefined) throw new Error(`no file for ${asset.name}`);
    return encoder.encode(picture);
  });
});

afterEach(async () => {
  stopLibraryIndexWrites();
  setAssetBytesReader(null);
  setLibraryEmbedder(null);
  setLibraryVectorProvider(null);
  vectors.close();
  pictures.clear();
  delete process.env.NODETOOL_SEARCH_IMAGE_EMBEDDING_MODEL;
  delete process.env.NODETOOL_SEARCH_SEMANTIC;
  delete process.env.NODETOOL_SEARCH_EXCLUDED_PROJECTS;
  ModelObserver.clear();
  await closeDb();
});

async function image(userId: string, name: string, shows: string, contentType = "image/png"): Promise<Asset> {
  pictures.set(name, shows);
  return Asset.create({ user_id: userId, name, content_type: contentType });
}

async function seed(): Promise<{ puppy: Asset; hound: Asset; beach: Asset }> {
  const puppy = await image(USER, "IMG_0001.png", "a puppy on the grass");
  const hound = await image(USER, "IMG_0002.jpg", "a hound running", "image/jpeg");
  const beach = await image(USER, "IMG_0003.png", "waves on the beach");
  stopLibraryIndexWrites();
  await reconcileLibraryIndex();
  await runIndexerPass();
  return { puppy, hound, beach };
}

async function itemIdOf(asset: Asset): Promise<string> {
  const [row] = await getPortableDb()
    .select({ id: searchItems.id })
    .from(searchItems)
    .where(eq(searchItems.resource_id, asset.id));
  return row!.id;
}

describe.each(dialects)("image vectors on %s", (_name, init) => {
  it("finds images by what they show, with no caption and no text model", async () => {
    await init();
    const calls: LibraryImage[][] = [];
    setLibraryEmbedder(fakeClip(calls));
    const { puppy, hound, beach } = await seed();

    expect(await runImageEmbedPass()).toEqual({ embedded: 3, failed: 0 });
    expect(calls.flat().map((call) => call.contentType).sort()).toEqual(["image/jpeg", "image/png", "image/png"]);

    const result = await searchLibrary({ userId: USER, query: "dog photos" });
    expect(result.index.mode).toBe("hybrid");
    expect(result.hits.map((hit) => hit.resourceId).sort()).toEqual([hound.id, puppy.id].sort());
    expect(result.hits[0]!.matches).toEqual([{ field: "image", snippet: "", locator: null }]);
    expect(result.hits.some((hit) => hit.resourceId === beach.id)).toBe(false);

    const status = await libraryIndexStatus(USER);
    expect(status.semantic.images).toEqual({ space: "fake:clip-v1", embedded: 3, remaining: 0 });

    // Every vector is current: a second pass calls no model.
    calls.length = 0;
    expect(await runImageEmbedPass()).toEqual({ embedded: 0, failed: 0 });
    expect(calls).toEqual([]);
  });

  it("finds images that look alike for similar_to", async () => {
    await init();
    setLibraryEmbedder(fakeClip([]));
    const { puppy, hound } = await seed();
    await runImageEmbedPass();
    const result = await searchLibrary({ userId: USER, query: "", similarTo: await itemIdOf(puppy) });
    expect(result.index.mode).toBe("semantic");
    expect(result.hits.map((hit) => hit.resourceId)).toEqual([hound.id]);
  });

  it("never returns another owner's images", async () => {
    await init();
    setLibraryEmbedder(fakeClip([]));
    await seed();
    await image(OTHER, "IMG_9000.png", "a puppy asleep");
    await reconcileLibraryIndex();
    await runIndexerPass();
    await runImageEmbedPass();
    const mine = await searchLibrary({ userId: USER, query: "puppy pictures" });
    const theirs = await searchLibrary({ userId: OTHER, query: "puppy pictures" });
    expect(mine.hits).toHaveLength(2);
    expect(theirs.hits.map((hit) => hit.title)).toEqual(["IMG_9000.png"]);
  });

  it("removes an image's vector with its item", async () => {
    await init();
    setLibraryEmbedder(fakeClip([]));
    const { puppy } = await seed();
    await runImageEmbedPass();
    const space = embeddingSpace("fake", "clip-v1");
    const collection = await vectors.getCollection({ name: libraryCollectionName(USER, space, "image") });
    const itemId = await itemIdOf(puppy);
    expect(await collection.get({ ids: [imageVectorId(itemId)] })).toHaveLength(1);
    await puppy.delete();
    await reconcileLibraryIndex();
    expect(await collection.get({ ids: [imageVectorId(itemId)] })).toHaveLength(0);
    expect(await collection.count()).toBe(2);
  });

  it("embeds every image again under a new model and drops the old image collection", async () => {
    await init();
    setLibraryEmbedder(fakeClip([]));
    await seed();
    await runImageEmbedPass();
    process.env.NODETOOL_SEARCH_IMAGE_EMBEDDING_MODEL = "fake:clip-v2";
    expect(await runImageEmbedPass()).toEqual({ embedded: 3, failed: 0 });
    expect((await libraryCollections(USER, "image")).map((c) => c.space.id)).toEqual(["fake:clip-v2"]);
    // Text collections are a different role and are left alone.
    expect(await libraryCollections(USER, "text")).toEqual([]);
  });

  it("records a format no model reads instead of sending it", async () => {
    await init();
    const calls: LibraryImage[][] = [];
    setLibraryEmbedder(fakeClip(calls));
    const svg = await image(USER, "logo.svg", "<svg/>", "image/svg+xml");
    stopLibraryIndexWrites();
    await reconcileLibraryIndex();
    await runIndexerPass();
    expect(await runImageEmbedPass()).toEqual({ embedded: 0, failed: 0 });
    expect(calls).toEqual([]);
    const [row] = await getPortableDb()
      .select({ error: searchItems.image_embed_error, version: searchItems.image_embedded_version })
      .from(searchItems)
      .where(eq(searchItems.resource_id, svg.id));
    expect(row!.error).toMatch(/image\/svg\+xml are not embedded/);
    expect(row!.version).not.toBeNull();
  });

  it("does nothing without an image model, or when search by meaning is off", async () => {
    await init();
    const calls: LibraryImage[][] = [];
    setLibraryEmbedder(fakeClip(calls));
    await seed();
    process.env.NODETOOL_SEARCH_SEMANTIC = "off";
    expect(await runImageEmbedPass()).toEqual({ embedded: 0, failed: 0 });
    delete process.env.NODETOOL_SEARCH_SEMANTIC;
    delete process.env.NODETOOL_SEARCH_IMAGE_EMBEDDING_MODEL;
    expect(await runImageEmbedPass()).toEqual({ embedded: 0, failed: 0 });
    expect(calls).toEqual([]);
    expect((await searchLibrary({ userId: USER, query: "dog photos" })).index.mode).toBe("keyword");
  });
});
