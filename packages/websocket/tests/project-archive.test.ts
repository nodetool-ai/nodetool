import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  Asset,
  emptyScriptDocument,
  Game,
  getPortableDb,
  Message,
  PERSONAL_PROJECT_KIND,
  Project,
  PROJECT_ARCHIVE_TABLES,
  Script,
  Storyboard,
  Thread,
  TimelineSequence,
  Workflow,
  Workspace,
  initTestDb,
  type StoryboardDocument
} from "@nodetool-ai/models";
import { createLocalWorkspace } from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { getAssetStorageKey } from "../src/lib/asset-paths.js";
import {
  importProjectArchive,
  ProjectArchiveError,
  readProjectArchiveManifest,
  writeProjectArchive,
  type OpenWorkspace
} from "../src/lib/project-archive.js";
import { collectZip, ZipStreamWriter } from "../src/lib/zip-stream.js";

const owner = "archive-owner";
const importer = "archive-importer";

let root: string;
let storage: InMemoryStorageAdapter;
const openWorkspace: OpenWorkspace = (row) => createLocalWorkspace(row.path);
const workspacePath = async (_userId: string, workspaceId: string) =>
  nodePath.join(root, "imported", workspaceId);

const storyboardDocument = (entityId: string): StoryboardDocument => ({
  screenplay: null,
  shots: [],
  brief: "",
  style: "",
  entityIds: [entityId],
  aspectRatio: "16:9",
  setupStage: "done",
  genre: "",
  directorModel: null,
  imageModel: null,
  videoModel: null
});

async function exportProject(userId: string, projectId: string) {
  let manifest: Awaited<ReturnType<typeof writeProjectArchive>> | undefined;
  const bytes = await collectZip(async (writer) => {
    manifest = await writeProjectArchive(
      { userId, projectId, storage, openWorkspace },
      writer
    );
  });
  if (!manifest) throw new Error("no manifest");
  return { bytes, manifest };
}

function importArchive(bytes: Uint8Array, userId = importer, name?: string) {
  return importProjectArchive(bytes, {
    userId,
    storage,
    openWorkspace,
    workspacePath,
    ...(name ? { name } : {})
  });
}

/** A project with one of everything, and the ids the assertions follow. */
async function seedProject() {
  const project = (await Project.insertNew({
    user_id: owner,
    name: "Launch spot",
    kind: "spot"
  }))!;
  const projectId = project.id;

  const folder = await Asset.create<Asset>({
    user_id: owner,
    project_id: projectId,
    parent_id: owner,
    name: "Refs",
    content_type: "folder"
  });
  const image = await Asset.create<Asset>({
    user_id: owner,
    project_id: projectId,
    parent_id: folder.id,
    name: "hero.png",
    content_type: "image/png",
    size: 3
  });
  await storage.store(
    getAssetStorageKey(owner, image.id, "image/png"),
    new Uint8Array([1, 2, 3]),
    "image/png"
  );

  const timeline = await TimelineSequence.create<TimelineSequence>({
    user_id: owner,
    project_id: projectId,
    name: "Cut",
    document: JSON.stringify({
      tracks: [],
      clips: [{ id: "clip-1", assetId: image.id }],
      markers: [],
      transcript: []
    })
  });
  const board = await Storyboard.create<Storyboard>({
    user_id: owner,
    project_id: projectId,
    name: "Board",
    timeline_id: timeline.id,
    document: JSON.stringify(storyboardDocument(image.id))
  });
  const script = await Script.create<Script>({
    user_id: owner,
    project_id: projectId,
    name: "Script",
    storyboard_id: board.id,
    timeline_id: timeline.id,
    document: JSON.stringify(emptyScriptDocument())
  });

  const workspaceDir = nodePath.join(root, "source-workspace");
  const workspace = await Workspace.create<Workspace>({
    user_id: owner,
    project_id: projectId,
    name: "Project files",
    path: workspaceDir
  });
  const files = createLocalWorkspace(workspaceDir);
  await files.write("notes/readme.txt", "hello");

  const workflow = await Workflow.create<Workflow>({
    user_id: owner,
    project_id: projectId,
    name: "Make hero",
    access: "public",
    workspace_id: workspace.id,
    graph: {
      nodes: [
        {
          id: "n1",
          type: "nodetool.constant.Image",
          data: { value: { type: "image", uri: `asset://${image.id}.png` } }
        }
      ],
      edges: []
    }
  });

  const thread = await Thread.create<Thread>({
    user_id: owner,
    project_id: projectId,
    title: "Agent",
    workflow_id: workflow.id
  });
  await Message.create<Message>({
    user_id: owner,
    thread_id: thread.id,
    role: "user",
    content: `Use asset://${image.id}.png`
  });
  const agentThreadId = await Project.ensureThread(owner, projectId);

  const gameId = "a".repeat(31) + "1";
  const revision = "b".repeat(31) + "2";
  await Game.insertNew({
    id: gameId,
    userId: owner,
    projectId,
    workspaceId: workspace.id,
    name: "Game",
    revision
  });
  await files.write(
    `games/${gameId}/revisions/${revision}/game.json`,
    JSON.stringify({ id: gameId, revision })
  );
  await getPortableDb()
    .insert(PROJECT_ARCHIVE_TABLES.game_revision_messages.table)
    .values({
      revision,
      game_id: gameId,
      message: "first",
      created_at: new Date().toISOString()
    });

  return {
    projectId,
    folder,
    image,
    timeline,
    board,
    script,
    workspace,
    workflow,
    thread,
    agentThreadId,
    gameId,
    revision
  };
}

describe("project files", () => {
  beforeEach(async () => {
    initTestDb();
    storage = new InMemoryStorageAdapter();
    root = await mkdtemp(nodePath.join(tmpdir(), "project-archive-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("exports every project row, asset, and workspace file", async () => {
    const seeded = await seedProject();
    const { bytes, manifest } = await exportProject(owner, seeded.projectId);

    expect(manifest.project.name).toBe("Launch spot");
    expect(manifest.counts).toMatchObject({
      assets: 2,
      workflows: 1,
      storyboards: 1,
      scripts: 1,
      timeline_sequences: 1,
      threads: 2,
      messages: 1,
      workspaces: 1,
      games: 1,
      game_revision_messages: 1
    });
    expect(manifest.assets.map((a) => a.id)).toEqual([seeded.image.id]);
    expect(manifest.workspace_files.map((f) => f.path).sort()).toEqual([
      `games/${seeded.gameId}/revisions/${seeded.revision}/game.json`,
      "notes/readme.txt"
    ]);
    expect(readProjectArchiveManifest(bytes).project.id).toBe(seeded.projectId);

    // The owner and the exporting machine's paths stay out of the file.
    const records = strFromU8(
      unzipSync(bytes, { filter: (f) => f.name === "records.json" })[
        "records.json"
      ]!
    );
    expect(records).not.toContain(owner);
    expect(records).not.toContain(root);
  });

  it("imports as a new project with every id and reference rewritten", async () => {
    const seeded = await seedProject();
    const { bytes } = await exportProject(owner, seeded.projectId);

    const result = await importArchive(bytes);
    const project = result.project;
    expect(project.id).not.toBe(seeded.projectId);
    expect(project.user_id).toBe(importer);
    expect(project.name).toBe("Launch spot");
    expect(project.kind).toBe("spot");
    expect(result.missing).toEqual([]);
    expect(result.checksumMismatches).toEqual([]);

    const assets = await Asset.listByProject(importer, project.id);
    const image = assets.find((a) => a.name === "hero.png")!;
    const folder = assets.find((a) => a.content_type === "folder")!;
    expect(image.id).not.toBe(seeded.image.id);
    expect(image.parent_id).toBe(folder.id);
    expect(folder.parent_id).toBe(importer);
    expect(
      await storage.retrieve(
        storage.uriForKey(getAssetStorageKey(importer, image.id, "image/png"))
      )
    ).toEqual(new Uint8Array([1, 2, 3]));

    const [board] = await Storyboard.listByProject(project.id, importer);
    expect(board!.toDocument().entityIds).toEqual([image.id]);
    const [timeline] = await TimelineSequence.listByProject(
      project.id,
      importer
    );
    expect(board!.timeline_id).toBe(timeline!.id);
    expect(timeline!.document).toContain(image.id);
    const [script] = await Script.listByProject(project.id, importer);
    expect(script!.storyboard_id).toBe(board!.id);

    const workflows = (await Workflow.paginate(importer, {
      projectId: project.id
    }))[0];
    expect(workflows).toHaveLength(1);
    const workflow = workflows[0]!;
    expect(workflow.access).toBe("private");
    expect(JSON.stringify(workflow.graph)).toContain(`asset://${image.id}.png`);

    const [workspace] = await Workspace.listByProject(importer, project.id);
    expect(workflow.workspace_id).toBe(workspace!.id);
    expect(workspace!.path).toBe(nodePath.join(root, "imported", workspace!.id));
    const files = createLocalWorkspace(workspace!.path);
    expect(await files.readText("notes/readme.txt")).toBe("hello");

    const threads = await Thread.listByProject(importer, project.id);
    expect(threads).toHaveLength(2);
    const thread = threads.find((t) => t.title === "Agent");
    expect(thread!.workflow_id).toBe(workflow.id);
    expect(project.thread_id).not.toBeNull();
    expect(project.thread_id).not.toBe(seeded.agentThreadId);
    expect(threads.map((t) => t.id)).toContain(project.thread_id);
    const [messages] = await Message.paginate(thread!.id, { limit: 10 });
    expect(messages).toHaveLength(1);
    expect(messages[0]!.user_id).toBe(importer);
    expect(messages[0]!.content).toBe(`Use asset://${image.id}.png`);

    const [game] = await Game.listByProject(importer, project.id);
    expect(game!.id).not.toBe(seeded.gameId);
    expect(game!.workspace_id).toBe(workspace!.id);
    expect(game!.source_root).toBe(`games/${game!.id}`);
    const source = JSON.parse(
      (await files.readText(
        `games/${game!.id}/revisions/${game!.current_revision}/game.json`
      ))!
    ) as { id: string; revision: string };
    expect(source).toEqual({ id: game!.id, revision: game!.current_revision });
    const revisionMessages = await Game.listRevisionMessages(importer, game!.id);
    expect(revisionMessages.get(game!.current_revision)).toBe("first");

    // The source project is untouched.
    expect(await Asset.find(owner, seeded.image.id)).not.toBeNull();
    expect(
      (await Storyboard.listByProject(seeded.projectId, owner))[0]!.id
    ).toBe(seeded.board.id);
  });

  it("imports the same file twice as two independent projects", async () => {
    const seeded = await seedProject();
    const { bytes } = await exportProject(owner, seeded.projectId);
    const first = await importArchive(bytes, owner);
    const second = await importArchive(bytes, owner, "Second copy");
    expect(second.project.id).not.toBe(first.project.id);
    expect(second.project.name).toBe("Second copy");
    const firstAssets = await Asset.listByProject(owner, first.project.id);
    const secondAssets = await Asset.listByProject(owner, second.project.id);
    expect(firstAssets).toHaveLength(2);
    expect(secondAssets).toHaveLength(2);
    const ids = new Set([...firstAssets, ...secondAssets].map((a) => a.id));
    expect(ids.size).toBe(4);
  });

  it("round-trips: a re-exported import matches the original counts", async () => {
    const seeded = await seedProject();
    const original = await exportProject(owner, seeded.projectId);
    const imported = await importArchive(original.bytes);
    const again = await exportProject(importer, imported.project.id);
    expect(again.manifest.counts).toEqual(original.manifest.counts);
    expect(again.manifest.assets.map((a) => a.sha256)).toEqual(
      original.manifest.assets.map((a) => a.sha256)
    );
    // Game JSON names the game's new id, so only the other files match byte for byte.
    const plain = (m: typeof original.manifest) =>
      m.workspace_files
        .filter((f) => !f.path.endsWith(".json"))
        .map((f) => f.sha256);
    expect(again.manifest.workspace_files).toHaveLength(
      original.manifest.workspace_files.length
    );
    expect(plain(again.manifest)).toEqual(plain(original.manifest));
  });

  it("imports the Personal project as an ordinary named project", async () => {
    const personal = await Project.ensurePersonal(owner);
    expect(personal.kind).toBe(PERSONAL_PROJECT_KIND);
    const { bytes } = await exportProject(owner, personal.id);
    const result = await importArchive(bytes, owner);
    expect(result.project.kind).toBe("");
    expect((await Project.ensurePersonal(owner)).id).toBe(personal.id);
  });

  it("refuses a file from a newer format version and creates nothing", async () => {
    const seeded = await seedProject();
    const { bytes } = await exportProject(owner, seeded.projectId);
    const entries = unzipSync(bytes);
    const manifest = JSON.parse(strFromU8(entries["manifest.json"]!)) as {
      version: number;
    };
    manifest.version = 99;
    entries["manifest.json"] = strToU8(JSON.stringify(manifest));
    await expect(importArchive(zipSync(entries))).rejects.toBeInstanceOf(
      ProjectArchiveError
    );
    expect(await Project.listByUser(importer)).toEqual([]);
  });

  it("never keeps an external path from the file", async () => {
    const seeded = await seedProject();
    const { bytes } = await exportProject(owner, seeded.projectId);
    const entries = unzipSync(bytes);
    const records = JSON.parse(strFromU8(entries["records.json"]!)) as Record<
      string,
      Array<Record<string, unknown>>
    >;
    records["assets"]!.push({
      id: "c".repeat(32),
      parent_id: null,
      name: "secrets",
      content_type: "text/plain",
      external_path: "/etc/passwd",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    entries["records.json"] = strToU8(JSON.stringify(records));

    const result = await importArchive(zipSync(entries));
    const assets = await Asset.listByProject(importer, result.project.id);
    expect(assets.find((a) => a.name === "secrets")?.external_path).toBeNull();
  });

  it("removes stored bytes and workspace files when the rows fail to insert", async () => {
    const seeded = await seedProject();
    const { bytes } = await exportProject(owner, seeded.projectId);
    const entries = unzipSync(bytes);
    const records = JSON.parse(strFromU8(entries["records.json"]!)) as Record<
      string,
      Array<Record<string, unknown>>
    >;
    // A storyboard without its required document column cannot be inserted.
    delete records["storyboards"]![0]!["document"];
    entries["records.json"] = strToU8(JSON.stringify(records));

    await expect(importArchive(zipSync(entries))).rejects.toThrow();
    expect(await Project.listByUser(importer)).toEqual([]);
    const stored = await storage.list("");
    expect(stored.entries.map((entry) => entry.key)).not.toContainEqual(
      expect.stringContaining(importer)
    );
    const leftovers = await createLocalWorkspace(
      nodePath.join(root, "imported")
    ).list("", { recursive: true });
    expect(leftovers.filter((entry) => !entry.isDirectory)).toEqual([]);
  });
  it.each(["missing", "wrong-table"])("rejects a message parent from %s before writes", async (kind) => {
    const seeded = await seedProject();
    const { bytes } = await exportProject(owner, seeded.projectId);
    const entries = unzipSync(bytes);
    const records = JSON.parse(strFromU8(entries["records.json"]!));
    records.messages[0].thread_id = kind === "missing" ? "e".repeat(32) : seeded.image.id;
    entries["records.json"] = strToU8(JSON.stringify(records));
    await expect(importArchive(zipSync(entries))).rejects.toThrow(/thread_id/);
    expect(await Project.listByUser(importer)).toEqual([]);
  });

  it("rehashes current and historical drafts after rewriting game references", async () => {
    const seeded = await seedProject();
    const files = createLocalWorkspace(seeded.workspace.path);
    const { createHash } = await import("node:crypto");
    const source = JSON.stringify({ id: seeded.gameId, revision: seeded.revision });
    const digest = createHash("sha256").update(source).digest("hex");
    const version = `${digest}.YQ.${"d".repeat(32)}`;
    await files.write(`games/${seeded.gameId}/drafts/${version}.json`, source);
    await getPortableDb().update(PROJECT_ARCHIVE_TABLES.games.table).set({ draft_version_id: version });
    await getPortableDb().insert(PROJECT_ARCHIVE_TABLES.game_draft_changes.table).values({
      id: "f".repeat(32), game_id: seeded.gameId, actor: "user", ops: "[]", summary: "edit",
      before_updated_at: "a", before_digest: version, created_at: new Date().toISOString()
    });
    const { bytes } = await exportProject(owner, seeded.projectId);
    const result = await importArchive(bytes);
    const records = await import("@nodetool-ai/models").then((m) => m.readProjectArchiveRecords(importer, result.project.id));
    const game = records.games[0]!;
    const workspace = new Workspace(records.workspaces[0]!);
    const rewritten = await createLocalWorkspace(workspace.path).readText(`${game.source_root}/drafts/${game.draft_version_id}.json`);
    expect(rewritten).not.toBeNull();
    expect(String(game.draft_version_id).split(".")[0]).toBe(createHash("sha256").update(rewritten!).digest("hex"));
    expect(records.game_draft_changes[0]!.before_digest).toBe(game.draft_version_id);
  });

  it("removes workspace roots after an asset store failure", async () => {
    const seeded = await seedProject();
    const { bytes } = await exportProject(owner, seeded.projectId);
    let created = "";
    await expect(importProjectArchive(bytes, {
      userId: importer, storage, openWorkspace,
      workspacePath: async (_user, id) => {
        created = await workspacePath(importer, id);
        const { mkdir } = await import("node:fs/promises");
        await mkdir(created, { recursive: true });
        return created;
      },
      storeAssetBytes: async () => { throw new Error("store failed"); }
    })).rejects.toThrow("store failed");
    const { access } = await import("node:fs/promises");
    await expect(access(created)).rejects.toThrow();
  });

  it("rejects exports exceeding the importer aggregate limit, including metadata", async () => {
    const seeded = await seedProject();
    await expect(collectZip((writer) => writeProjectArchive({
      userId: owner, projectId: seeded.projectId, storage, openWorkspace, maxBytes: 4
    }, writer))).rejects.toThrow(/archive size limit/);
  });

  it("rolls back thumbnails created by the production asset hook", async () => {
    const seeded = await seedProject();
    const { bytes } = await exportProject(owner, seeded.projectId);
    const entries = unzipSync(bytes);
    const records = JSON.parse(strFromU8(entries["records.json"]!));
    delete records.storyboards[0].document;
    entries["records.json"] = strToU8(JSON.stringify(records));
    const { projectArchiveHost } = await import("../src/lib/project-archive-host.js");
    const host = projectArchiveHost();
    const { getAssetAdapter } = await import("../src/lib/storage.js");
    const { getAssetThumbnailKey } = await import("../src/lib/asset-paths.js");
    let thumbnail = "";
    await expect(importProjectArchive(zipSync(entries), {
      userId: importer, storage: getAssetAdapter(), openWorkspace, workspacePath,
      removeAssetBytes: host.removeAssetBytes,
      storeAssetBytes: async ({ userId, assetId, contentType, bytes }) => {
        const adapter = getAssetAdapter();
        await adapter.store(getAssetStorageKey(userId, assetId, contentType), bytes, contentType);
        thumbnail = adapter.uriForKey(getAssetThumbnailKey(userId, assetId));
        await adapter.store(getAssetThumbnailKey(userId, assetId), new Uint8Array([1]), "image/jpeg");
      }
    })).rejects.toThrow();
    expect(await getAssetAdapter().exists(thumbnail)).toBe(false);
  });

  it("rejects exports with more entries than import accepts", async () => {
    const seeded = await seedProject();
    const files = createLocalWorkspace(seeded.workspace.path);
    const writer = new ZipStreamWriter(async () => {});
    await expect(writeProjectArchive({
      userId: owner, projectId: seeded.projectId, storage,
      openWorkspace: () => ({
        ...files,
        list: async () => Array.from({ length: 100_001 }, (_, index) => ({
          path: `${index}.txt`, name: `${index}.txt`, size: 0, modifiedAt: 0, isDirectory: false
        })),
        read: async () => new Uint8Array()
      })
    }, writer)).rejects.toThrow(/archive entry limit/);
  }, 20_000);

  it("counts emitted ZIP bytes including directory overhead", async () => {
    let emitted = 0;
    const writer = new ZipStreamWriter(async (chunk) => { emitted += chunk.length; });
    await writer.add("asset.bin", new Uint8Array([1, 2, 3]));
    expect(writer.bytesWritten).toBe(emitted);
    expect(emitted).toBeGreaterThan(3);
    await writer.finish();
    expect(writer.bytesWritten).toBe(emitted);
  });

});
