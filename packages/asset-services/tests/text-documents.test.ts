/**
 * Markdown documents with no editor open: create, read, edit, and the
 * versions each write records (PRD R11, R16).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Asset,
  ModelObserver,
  TextDocumentVersion,
  initTestDb
} from "@nodetool-ai/models";
import {
  createLocalWorkspace,
  setProjectFolderResolver
} from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { getAssetStorageKey } from "../src/asset-paths.js";
import { ProjectAssetStorageAdapter } from "../src/project-asset-storage.js";
import { getAssetAdapter } from "../src/storage.js";
import {
  TextDocumentError,
  applyTextDocumentEdits,
  createTextDocument,
  readTextDocument,
  requireTextDocument,
  restoreTextDocumentVersion,
  writeTextDocument,
  writeTextDocumentModelInterface
} from "../src/text-documents.js";

vi.mock("../src/storage.js", () => ({ getAssetAdapter: vi.fn() }));

const USER = "owner";
const PROJECT = "project-a";

let root: string;
let rawStore: InMemoryStorageAdapter;

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-text-documents-"));
  rawStore = new InMemoryStorageAdapter();
  vi.mocked(getAssetAdapter).mockReturnValue(
    new ProjectAssetStorageAdapter(rawStore)
  );
  setProjectFolderResolver(async (projectId) => ({
    ok: true,
    projectId: projectId ?? "personal",
    workspace: createLocalWorkspace(join(root, projectId ?? "personal"))
  }));
});

afterEach(async () => {
  ModelObserver.clear();
  setProjectFolderResolver(null);
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe("text documents", () => {
  it("creates a Markdown file in the project folder and reads it back", async () => {
    const asset = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "Notes",
      content: "# Notes\n"
    });
    expect(asset.name).toBe("Notes.md");
    expect(asset.workspace_path).toBe("Notes.md");
    const loaded = await requireTextDocument(USER, asset.id);
    expect(await readTextDocument(loaded)).toBe("# Notes\n");
  });

  it("records one version per cause and advances updated_at", async () => {
    const asset = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "plan.md",
      content: "one\n"
    });
    const before = asset.updated_at;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const cause = { saveType: "agent_turn" as const, causeId: "turn-1" };
    await writeTextDocument(asset, "two\n", { cause });
    await writeTextDocument(asset, "three\n", { cause });

    expect(await readTextDocument(asset)).toBe("three\n");
    expect(asset.updated_at > before).toBe(true);
    const versions = await TextDocumentVersion.listForAsset(asset.id);
    expect(versions.map((v) => v.content)).toEqual(["one\n"]);
    expect(versions[0]?.save_type).toBe("agent_turn");
  });

  it("refuses a write against a stale revision", async () => {
    const asset = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "a.md",
      content: "a\n"
    });
    await expect(
      writeTextDocument(asset, "b\n", { expectedUpdatedAt: "2000-01-01T00:00:00.000Z" })
    ).rejects.toBeInstanceOf(TextDocumentError);
  });

  it("restores a version and keeps the replaced content as a version", async () => {
    const asset = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "r.md",
      content: "first\n"
    });
    await writeTextDocument(asset, "second\n", {
      cause: { saveType: "manual" }
    });
    const [first] = await TextDocumentVersion.listForAsset(asset.id);
    await restoreTextDocumentVersion(asset, first!.version);
    expect(await readTextDocument(asset)).toBe("first\n");
    const versions = await TextDocumentVersion.listForAsset(asset.id);
    expect(versions.map((v) => [v.save_type, v.content])).toContainEqual([
      "restore",
      "second\n"
    ]);
  });

  it("writes a legacy document under its storage key", async () => {
    const asset = new Asset({
      user_id: USER,
      name: "old.md",
      content_type: "text/markdown",
      parent_id: USER
    });
    await asset.save();
    await getAssetAdapter().store(
      getAssetStorageKey(USER, asset.id, asset.content_type),
      new TextEncoder().encode("old\n"),
      asset.content_type
    );
    expect(await readTextDocument(asset)).toBe("old\n");
    await writeTextDocument(asset, "new\n");
    expect(await readTextDocument(asset)).toBe("new\n");
  });

  it("refuses an asset that is not Markdown", async () => {
    const asset = new Asset({
      user_id: USER,
      name: "photo.png",
      content_type: "image/png",
      parent_id: USER
    });
    await asset.save();
    await expect(requireTextDocument(USER, asset.id)).rejects.toThrow(
      /not a Markdown document/
    );
  });
});

describe("applyTextDocumentEdits", () => {
  it("applies exact replacements in order", () => {
    expect(
      applyTextDocumentEdits("a b a", [
        { old_text: "b", new_text: "c" },
        { old_text: "a", new_text: "x", replace_all: true }
      ])
    ).toEqual({ text: "x c x", replacements: 3 });
  });

  it("names an ambiguous or missing edit", () => {
    expect(() =>
      applyTextDocumentEdits("a a", [{ old_text: "a", new_text: "b" }])
    ).toThrow(/occurs 2 times/);
    expect(() =>
      applyTextDocumentEdits("a", [{ old_text: "z", new_text: "b" }])
    ).toThrow(/not found/);
  });
});

describe("workflow run writes (R13)", () => {
  it("appends, keeps one pre-run version per job and records the writer", async () => {
    const asset = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "log.md",
      content: "# Log\n"
    });
    const write = (content: string, causeId: string) =>
      writeTextDocumentModelInterface({
        userId: USER,
        assetId: asset.id,
        content,
        mode: "append",
        causeId,
        provenance: { workflowId: "wf", nodeId: "save", jobId: causeId }
      });
    await write("first", "job-1");
    await write("second", "job-1");
    const saved = await requireTextDocument(USER, asset.id);
    expect(await readTextDocument(saved)).toBe("# Log\n\nfirst\n\nsecond");
    const versions = await TextDocumentVersion.listForAsset(asset.id);
    expect(versions.map((version) => version.content)).toEqual(["# Log\n"]);
    expect(versions[0].save_type).toBe("workflow_run");
    expect(saved.metadata?.written_by).toMatchObject({
      workflow_id: "wf",
      node_id: "save",
      job_id: "job-1"
    });

    await writeTextDocumentModelInterface({
      userId: USER,
      assetId: asset.id,
      content: "replaced",
      mode: "replace",
      causeId: "job-2"
    });
    expect(await readTextDocument(await requireTextDocument(USER, asset.id))).toBe("replaced");
    expect(await TextDocumentVersion.listForAsset(asset.id)).toHaveLength(2);
  });

  it("returns null for another user's document", async () => {
    const asset = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "private.md",
      content: "x"
    });
    expect(
      await writeTextDocumentModelInterface({
        userId: "intruder",
        assetId: asset.id,
        content: "y",
        mode: "replace",
        causeId: null
      })
    ).toBeNull();
  });
});
