import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getPortableDb, initTestDb, ModelObserver, projects, searchItems } from "@nodetool-ai/models";
import {
  MAX_CONTENT_BYTES,
  parseProjectFileResourceId,
  projectFileContentType,
  readLibraryPassage,
  reconcileLibraryIndex,
  runIndexerPass,
  searchAssets,
  searchLibrary,
  setProjectFileSource,
  stopLibraryIndexWrites,
  type ProjectFile,
  type ProjectFileSource
} from "../src/index.js";
import { initPgliteDb } from "./_helpers/pglite-db.js";

const USER = "user-1";
const PROJECT = "proj1";
const encoder = new TextEncoder();

/** An in-memory folder per project. `unreadable` projects throw on listing. */
/** Paths the source read, in order. */
const reads: string[] = [];

function folderSource(
  folders: Map<string, Map<string, { text: string; modifiedAt: number; size?: number }>>,
  unreadable: Set<string>
): ProjectFileSource {
  return {
    async projects(userId) {
      if (userId && userId !== USER) return [];
      return [...folders.keys()].map((projectId) => ({ userId: USER, projectId }));
    },
    async files(_userId, projectId): Promise<ProjectFile[]> {
      if (unreadable.has(projectId)) throw new Error("drive is not mounted");
      return [...(folders.get(projectId) ?? new Map()).entries()].map(([path, file]) => ({
        path,
        size: encoder.encode(file.text).byteLength,
        modifiedAt: file.modifiedAt
      }));
    },
    async size(_userId, projectId, path) {
      const file = folders.get(projectId)?.get(path);
      return file ? (file.size ?? encoder.encode(file.text).byteLength) : null;
    },
    async read(_userId, projectId, path) {
      reads.push(path);
      const file = folders.get(projectId)?.get(path);
      return file ? encoder.encode(file.text) : null;
    }
  };
}

const dialects: Array<[string, () => Promise<void>]> = [
  ["sqlite", async () => { initTestDb(); }],
  ["postgres", initPgliteDb]
];

afterEach(async () => {
  stopLibraryIndexWrites();
  setProjectFileSource(null);
  ModelObserver.clear();
  await closeDb();
});

async function index(): Promise<void> {
  stopLibraryIndexWrites();
  await reconcileLibraryIndex();
  await runIndexerPass();
}

describe("project file names", () => {
  it("reads only the formats the extractors handle", () => {
    expect(projectFileContentType("notes/plan.md")).toBe("text/markdown");
    expect(projectFileContentType("brief.PDF")).toBe("application/pdf");
    expect(projectFileContentType("photo.jpg")).toBeNull();
    expect(projectFileContentType("Makefile")).toBeNull();
  });

  it("splits a resource id at the first colon", () => {
    expect(parseProjectFileResourceId("p1:notes/a:b.md")).toEqual({ projectId: "p1", path: "notes/a:b.md" });
    expect(parseProjectFileResourceId("nocolon")).toBeNull();
  });
});

describe.each(dialects)("project folder files on %s", (_name, open) => {
  let folders: Map<string, Map<string, { text: string; modifiedAt: number; size?: number }>>;
  let unreadable: Set<string>;

  beforeEach(async () => {
    await open();
    reads.length = 0;
    const now = new Date().toISOString();
    await getPortableDb()
      .insert(projects)
      .values({ id: PROJECT, user_id: USER, name: "Launch", created_at: now, updated_at: now });
    folders = new Map([
      [
        PROJECT,
        new Map([
          ["notes/launch.md", { text: "# Launch\n\nThe venue is the old harbour warehouse.", modifiedAt: 1_000 }],
          ["cover.jpg", { text: "not text", modifiedAt: 1_000 }]
        ])
      ]
    ]);
    unreadable = new Set();
  });

  it("indexes a Markdown file and reads the passage that matched", async () => {
    setProjectFileSource(folderSource(folders, unreadable));
    await index();
    const result = await searchLibrary({ userId: USER, query: "harbour warehouse" });
    expect(result.hits).toHaveLength(1);
    const hit = result.hits[0]!;
    expect(hit).toMatchObject({
      resourceType: "project_file",
      resourceId: `${PROJECT}:notes/launch.md`,
      title: "launch.md",
      projectId: PROJECT,
      folderPath: "notes"
    });
    const read = await readLibraryPassage({ userId: USER, id: hit.resourceId });
    expect(read.ok && read.passages[0]?.text).toContain("old harbour warehouse");
    // A folder file is a document, not an asset: the asset search leaves it out.
    expect((await searchAssets(USER, "harbour warehouse")).total).toBe(0);
  });

  it("re-reads a changed file and removes a deleted one", async () => {
    setProjectFileSource(folderSource(folders, unreadable));
    await index();
    folders.get(PROJECT)!.set("notes/launch.md", { text: "The venue moved to the rooftop.", modifiedAt: 2_000 });
    await index();
    expect((await searchLibrary({ userId: USER, query: "rooftop" })).hits).toHaveLength(1);
    expect((await searchLibrary({ userId: USER, query: "warehouse" })).hits).toHaveLength(0);

    folders.get(PROJECT)!.delete("notes/launch.md");
    await index();
    expect((await searchLibrary({ userId: USER, query: "rooftop" })).hits).toHaveLength(0);
  });

  it("keeps the items of a folder it cannot read, and of every folder without a source", async () => {
    setProjectFileSource(folderSource(folders, unreadable));
    await index();
    unreadable.add(PROJECT);
    await index();
    expect((await searchLibrary({ userId: USER, query: "warehouse" })).hits).toHaveLength(1);
    setProjectFileSource(null);
    await index();
    expect((await searchLibrary({ userId: USER, query: "warehouse" })).hits).toHaveLength(1);
  });

  it("removes the items of a deleted project, and refuses to read them meanwhile", async () => {
    setProjectFileSource(folderSource(folders, unreadable));
    await index();
    const id = `${PROJECT}:notes/launch.md`;
    expect((await readLibraryPassage({ userId: USER, id })).ok).toBe(true);

    await getPortableDb()
      .update(projects)
      .set({ deleted_at: new Date().toISOString() })
      .where(eq(projects.id, PROJECT));
    expect((await readLibraryPassage({ userId: USER, id })).ok).toBe(false);
    // The source no longer lists a deleted project; the reconcile still removes its items.
    await index();
    const left = await getPortableDb().select().from(searchItems).where(eq(searchItems.resource_type, "project_file"));
    expect(left).toEqual([]);
  });

  it("skips a file over the size limit without reading it", async () => {
    folders.get(PROJECT)!.set("huge.txt", { text: "small", modifiedAt: 1_000, size: MAX_CONTENT_BYTES + 1 });
    setProjectFileSource(folderSource(folders, unreadable));
    await index();
    expect(reads).not.toContain("huge.txt");
    const [item] = await getPortableDb()
      .select({ state: searchItems.state })
      .from(searchItems)
      .where(eq(searchItems.resource_id, `${PROJECT}:huge.txt`));
    expect(item?.state).toBe("skipped");
  });
});
