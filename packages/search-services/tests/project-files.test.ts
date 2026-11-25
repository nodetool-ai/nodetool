import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, initTestDb, ModelObserver } from "@nodetool-ai/models";
import {
  parseProjectFileResourceId,
  projectFileContentType,
  readLibraryPassage,
  reconcileLibraryIndex,
  runIndexerPass,
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
function folderSource(
  folders: Map<string, Map<string, { text: string; modifiedAt: number }>>,
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
    async read(_userId, projectId, path) {
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
  let folders: Map<string, Map<string, { text: string; modifiedAt: number }>>;
  let unreadable: Set<string>;

  beforeEach(async () => {
    await open();
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
});
