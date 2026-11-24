/**
 * Text documents router: list, save and restore a Markdown document's
 * stored versions (docs/document-editor/prd.md, R11).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shortResourceId } from "@nodetool-ai/protocol";
import { ModelObserver, Workflow, initTestDb } from "@nodetool-ai/models";
import { createLocalWorkspace, setProjectFolderResolver } from "@nodetool-ai/runtime";
import {
  createTextDocument,
  readTextDocument,
  writeTextDocument
} from "@nodetool-ai/asset-services/text-documents";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);
const OWNER = "doc-owner";

function caller(userId = OWNER) {
  return createCaller({
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context);
}

let root: string;

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-trpc-docs-"));
  setProjectFolderResolver(async (projectId) => ({
    ok: true,
    projectId: projectId ?? "personal",
    workspace: createLocalWorkspace(join(root, projectId ?? "personal"))
  }));
});

afterEach(async () => {
  ModelObserver.clear();
  setProjectFolderResolver(null);
  await rm(root, { recursive: true, force: true });
});

describe("textDocuments router", () => {
  it("saves, lists, reads, renames, restores, and deletes versions", async () => {
    const asset = await createTextDocument({
      userId: OWNER,
      projectId: "p1",
      name: "notes.md",
      content: "first\n"
    });
    const saved = await caller().textDocuments.createVersion({
      asset_id: asset.id,
      name: "Start"
    });
    expect(saved.version?.save_type).toBe("manual");

    const renamed = await caller().textDocuments.renameVersion({
      asset_id: asset.id,
      version: saved.version!.version,
      name: "Initial Draft"
    });
    expect(renamed.version.name).toBe("Initial Draft");

    await writeTextDocument(asset, "second\n");
    const listed = await caller().textDocuments.versions({ asset_id: asset.id });
    expect(listed.versions.map((v) => v.name)).toEqual(["Initial Draft"]);

    const one = await caller().textDocuments.version({
      asset_id: asset.id,
      version: saved.version!.version
    });
    expect(one.content).toBe("first\n");

    const restored = await caller().textDocuments.restore({
      asset_id: asset.id,
      version: saved.version!.version
    });
    expect(restored.restored_version).toBe(saved.version!.version);
    expect(restored.latest_version).toBeDefined();
    expect(await readTextDocument(asset)).toBe("first\n");

    const afterRestore = await caller().textDocuments.versions({ asset_id: asset.id });
    expect(afterRestore.versions[0]).toMatchObject({
      version: restored.latest_version,
      name: "Restored from Initial Draft",
      save_type: "restore"
    });
    expect(afterRestore.versions).toHaveLength(3);

    const deleted = await caller().textDocuments.deleteVersion({
      asset_id: asset.id,
      version: saved.version!.version
    });
    expect(deleted.deleted_version).toBe(saved.version!.version);

    await expect(
      caller().textDocuments.deleteVersion({
        asset_id: asset.id,
        version: saved.version!.version
      })
    ).rejects.toThrow(/has no version/);

    const agentTurn = await caller().textDocuments.createVersion({
      asset_id: asset.id,
      save_type: "agent_turn",
      name: "Before accepted proposal"
    });
    expect(agentTurn.version?.save_type).toBe("agent_turn");
  });

  it("skips duplicate automatic autosave and unnamed agent_turn versions of unchanged content", async () => {
    const asset = await createTextDocument({
      userId: OWNER,
      projectId: "p1",
      name: "a.md",
      content: "same\n"
    });
    const first = await caller().textDocuments.createVersion({
      asset_id: asset.id,
      save_type: "autosave"
    });
    const second = await caller().textDocuments.createVersion({
      asset_id: asset.id,
      save_type: "autosave"
    });
    const duplicateAgentTurn = await caller().textDocuments.createVersion({
      asset_id: asset.id,
      save_type: "agent_turn"
    });
    expect(first.version).not.toBeNull();
    expect(second.version).toBeNull();
    expect(duplicateAgentTurn.version).toBeNull();
  });

  it("does not show another user's document", async () => {
    const asset = await createTextDocument({
      userId: OWNER,
      projectId: "p1",
      name: "private.md",
      content: "x\n"
    });
    await expect(
      caller("someone-else").textDocuments.versions({ asset_id: asset.id })
    ).rejects.toThrow(/not found/);
  });

  it("lists the workflows that reference the document", async () => {
    const asset = await createTextDocument({
      userId: OWNER,
      projectId: "p1",
      name: "brief.md",
      content: "x\n"
    });
    await Workflow.create<Workflow>({
      id: "wf-brief",
      user_id: OWNER,
      name: "Uses the brief",
      graph: {
        nodes: [
          {
            id: "doc",
            type: "nodetool.constant.Document",
            data: { value: { type: "document", asset_id: asset.id } }
          }
        ],
        edges: []
      }
    });
    expect(await caller().textDocuments.references({ asset_id: asset.id })).toEqual({
      workflows: [{ workflow_id: "wf-brief", name: "Uses the brief", node_ids: ["doc"] }]
    });
  });

  it("imports a text file and exports the document as HTML, MD, and TXT with destination folder", async () => {
    const { saveProjectAsset } = await import("@nodetool-ai/asset-services");
    const source = await saveProjectAsset({
      userId: OWNER,
      projectId: "p1",
      name: "draft.txt",
      contentType: "text/plain",
      bytes: new TextEncoder().encode("# Draft\n\nHello.\n")
    });
    const imported = await caller().textDocuments.import({ asset_id: source.id });
    expect(imported).toMatchObject({ name: "draft.md", path: source.workspace_path?.replace(/txt$/, "md") });

    const exported = await caller().textDocuments.export({
      asset_id: imported.asset_id,
      format: "html"
    });
    expect(exported).toMatchObject({ name: "draft.html", path: source.workspace_path?.replace(/txt$/, "html") });

    const exportedMd = await caller().textDocuments.export({
      asset_id: imported.asset_id,
      format: "md",
      directory: "Exports/Sub",
      name: "Final Notes.md"
    });
    expect(exportedMd).toMatchObject({
      name: "Final Notes.md",
      path: "Exports/Sub/Final-Notes.md"
    });

    const exportedTxt = await caller().textDocuments.export({
      asset_id: imported.asset_id,
      format: "txt",
      directory: ""
    });
    expect(exportedTxt).toMatchObject({
      name: "draft.txt",
      path: "draft.txt"
    });

    await expect(
      caller().textDocuments.export({
        asset_id: imported.asset_id,
        format: "md",
        directory: "../escape"
      })
    ).rejects.toThrow(/project folder/);

    for (const reserved of [".nodetool", ".nodetool/sub", "foo/.nodetool"]) {
      await expect(
        caller().textDocuments.export({
          asset_id: imported.asset_id,
          format: "md",
          directory: reserved
        })
      ).rejects.toThrow(/reserved \.nodetool folder/);
    }
  });

  it("accepts exact 12-character resource ID prefixes for rename, restore, export, and delete", async () => {
    const asset = await createTextDocument({
      userId: OWNER,
      projectId: "p1",
      name: "short-id.md",
      content: "first\n"
    });
    const shortId = shortResourceId(asset.id);
    expect(shortId).toHaveLength(12);

    const saved = await caller().textDocuments.createVersion({
      asset_id: shortId,
      name: "Start"
    });
    const versionNum = saved.version!.version;

    const renamed = await caller().textDocuments.renameVersion({
      asset_id: shortId,
      version: versionNum,
      name: "Renamed via short id"
    });
    expect(renamed.version.name).toBe("Renamed via short id");

    await writeTextDocument(asset, "second\n");
    const restored = await caller().textDocuments.restore({
      asset_id: shortId,
      version: versionNum
    });
    expect(restored.restored_version).toBe(versionNum);
    expect(await readTextDocument(asset)).toBe("first\n");

    const exported = await caller().textDocuments.export({
      asset_id: shortId,
      format: "md",
      directory: "exports",
      name: "ShortExport"
    });
    expect(exported.path).toBe("exports/ShortExport.md");

    const deleted = await caller().textDocuments.deleteVersion({
      asset_id: shortId,
      version: versionNum
    });
    expect(deleted.deleted_version).toBe(versionNum);
  });

  it("asks for a Google sign-in before a Google Docs export", async () => {
    const asset = await createTextDocument({
      userId: OWNER,
      projectId: "p1",
      name: "g.md",
      content: "x\n"
    });
    await expect(
      caller().textDocuments.exportGoogleDoc({ asset_id: asset.id })
    ).rejects.toThrow(/Sign in with Google/);
  });

  it("refuses a Google Docs import that names no document", async () => {
    await expect(
      caller().textDocuments.importGoogleDoc({ document: "not a doc", project_id: "p1" })
    ).rejects.toThrow(/Google Doc link/);
  });
});

