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
  TextDocumentMissingFileError,
  applyTextDocumentEdits,
  createTextDocument,
  deleteTextDocumentVersion,
  getAssetInfoModelInterface,
  readTextDocument,
  recordTextDocumentVersion,
  renameTextDocumentVersion,
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

  it("restores a version, preserves overwritten draft, and appends restored snapshot as latest", async () => {
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
    const { restored, latest } = await restoreTextDocumentVersion(asset, first!.version);
    expect(restored.version).toBe(first!.version);
    expect(await readTextDocument(asset)).toBe("first\n");

    const versions = await TextDocumentVersion.listForAsset(asset.id);
    expect(versions).toHaveLength(3);
    expect(versions[0]?.version).toBe(latest.version);
    expect(versions[0]?.save_type).toBe("restore");
    expect(versions[0]?.content).toBe("first\n");
    expect(versions[0]?.name).toBe(`Restored from Version ${first!.version}`);
    expect(versions[1]?.save_type).toBe("restore");
    expect(versions[1]?.content).toBe("second\n");
    expect(versions[2]?.version).toBe(first!.version);
    expect(versions[2]?.content).toBe("first\n");
  });

  it("avoids duplicating current content on restore when newest version already matches", async () => {
    const asset = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "r2.md",
      content: "v1\n"
    });
    const snap1 = await recordTextDocumentVersion(asset, "v1\n", { saveType: "manual" }, "Draft 1");
    await writeTextDocument(asset, "v2\n");
    await recordTextDocumentVersion(asset, "v2\n", { saveType: "manual" }, "Draft 2");

    const { latest } = await restoreTextDocumentVersion(asset, snap1.version);
    expect(await readTextDocument(asset)).toBe("v1\n");
    const versions = await TextDocumentVersion.listForAsset(asset.id);
    expect(versions.map((v) => [v.version, v.name, v.content])).toEqual([
      [latest.version, "Restored from Draft 1", "v1\n"],
      [2, "Draft 2", "v2\n"],
      [1, "Draft 1", "v1\n"]
    ]);
  });

  it("treats restoring a version identical to current content as a no-op with zero new version rows", async () => {
    const asset = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "noop-restore.md",
      content: "same content\n"
    });
    const snap = await recordTextDocumentVersion(
      asset,
      "same content\n",
      { saveType: "manual" },
      "Current"
    );
    const updatedAtBefore = asset.updated_at;
    await new Promise((resolve) => setTimeout(resolve, 5));

    const outcome = await restoreTextDocumentVersion(asset, snap.version);
    expect(outcome.changed).toBe(false);
    expect(outcome.restored.version).toBe(snap.version);
    expect(outcome.latest.version).toBe(snap.version);
    expect(outcome.asset.updated_at).toBe(updatedAtBefore);
    expect(await TextDocumentVersion.listForAsset(asset.id)).toHaveLength(1);
    expect(await readTextDocument(asset)).toBe("same content\n");
  });

  it("fails restore with CAS conflict when a concurrent autosave updates the document", async () => {
    const asset = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "race.md",
      content: "v1\n"
    });
    const snap1 = await recordTextDocumentVersion(asset, "v1\n", { saveType: "manual" }, "V1");
    await writeTextDocument(asset, "v2\n");
    const staleSnapshot = await requireTextDocument(USER, asset.id);
    const versionsBefore = await TextDocumentVersion.listForAsset(asset.id);

    // Concurrent autosave happens after staleSnapshot was loaded, advancing DB updated_at.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const concurrent = await requireTextDocument(USER, asset.id);
    await writeTextDocument(concurrent, "autosaved v3\n");

    await expect(
      restoreTextDocumentVersion(staleSnapshot, snap1.version)
    ).rejects.toThrow(/changed since it was read/);

    // Disk keeps the concurrent autosave and no stray pre-restore snapshot was added.
    const latestAsset = await requireTextDocument(USER, asset.id);
    expect(await readTextDocument(latestAsset)).toBe("autosaved v3\n");
    expect(await TextDocumentVersion.listForAsset(asset.id)).toHaveLength(
      versionsBefore.length
    );
  });

  it("propagates real workspace read errors instead of swallowing them on write and restore", async () => {
    const asset = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "io-fail.md",
      content: "v1\n"
    });
    const snap1 = await recordTextDocumentVersion(asset, "v1\n", { saveType: "manual" });

    const realWorkspace = createLocalWorkspace(join(root, PROJECT));
    const ioFailure = new Error("EIO: disk read failed");
    const failingWorkspace = {
      ...realWorkspace,
      read: async () => {
        throw ioFailure;
      }
    };
    setProjectFolderResolver(async (projectId) => ({
      ok: true,
      projectId: projectId ?? PROJECT,
      workspace: failingWorkspace
    }));

    await expect(
      writeTextDocument(asset, "v2\n", { cause: { saveType: "manual" } })
    ).rejects.toThrow("EIO: disk read failed");

    await expect(
      restoreTextDocumentVersion(asset, snap1.version)
    ).rejects.toThrow("EIO: disk read failed");
  });

  it("throws TextDocumentMissingFileError when the backing file is absent and still allows restore", async () => {
    const asset = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "missing.md",
      content: "recovered\n"
    });
    const snap = await recordTextDocumentVersion(asset, "recovered\n", { saveType: "manual" });
    const ws = createLocalWorkspace(join(root, PROJECT));
    await ws.delete("missing.md");

    await expect(readTextDocument(asset)).rejects.toBeInstanceOf(
      TextDocumentMissingFileError
    );

    const restored = await restoreTextDocumentVersion(asset, snap.version);
    expect(restored.changed).toBe(true);
    expect(await readTextDocument(asset)).toBe("recovered\n");
  });

  it("renames and deletes stored versions and throws on missing versions", async () => {
    const asset = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "snaps.md",
      content: "hello\n"
    });
    const snap = await recordTextDocumentVersion(asset, "hello\n", { saveType: "manual" }, "Before");
    const renamed = await renameTextDocumentVersion(asset, snap.version, "  Milestone 1  ");
    expect(renamed.name).toBe("Milestone 1");

    const cleared = await renameTextDocumentVersion(asset, snap.version, "   ");
    expect(cleared.name).toBeNull();

    await expect(renameTextDocumentVersion(asset, 99, "Missing")).rejects.toBeInstanceOf(
      TextDocumentError
    );

    await deleteTextDocumentVersion(asset, snap.version);
    expect(await TextDocumentVersion.listForAsset(asset.id)).toEqual([]);
    expect(await readTextDocument(asset)).toBe("hello\n");

    await expect(deleteTextDocumentVersion(asset, snap.version)).rejects.toBeInstanceOf(
      TextDocumentError
    );
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

describe("getAssetInfoModelInterface", () => {
  it("returns an owned asset's identity and null for a stranger or a missing id", async () => {
    const asset = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "info.md",
      content: "x"
    });
    const info = await getAssetInfoModelInterface({
      userId: USER,
      assetId: asset.id
    });
    expect(info).toMatchObject({
      id: asset.id,
      name: "info.md",
      content_type: asset.content_type
    });
    expect(info).toHaveProperty("workspace_path");
    expect(
      await getAssetInfoModelInterface({ userId: "other", assetId: asset.id })
    ).toBeNull();
    expect(
      await getAssetInfoModelInterface({ userId: USER, assetId: "missing" })
    ).toBeNull();
  });
});
