/**
 * Text documents router: list, save and restore a Markdown document's
 * stored versions (docs/document-editor/prd.md, R11).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  it("saves, lists, reads and restores versions", async () => {
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

    await writeTextDocument(asset, "second\n");
    const listed = await caller().textDocuments.versions({ asset_id: asset.id });
    expect(listed.versions.map((v) => v.name)).toEqual(["Start"]);

    const one = await caller().textDocuments.version({
      asset_id: asset.id,
      version: saved.version!.version
    });
    expect(one.content).toBe("first\n");

    await caller().textDocuments.restore({
      asset_id: asset.id,
      version: saved.version!.version
    });
    expect(await readTextDocument(asset)).toBe("first\n");
  });

  it("skips an autosave version of unchanged content", async () => {
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
    expect(first.version).not.toBeNull();
    expect(second.version).toBeNull();
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

  it("imports a text file and exports the document as HTML", async () => {
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

