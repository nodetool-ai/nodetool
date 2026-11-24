/**
 * The `text-documents` capabilities — Markdown documents created, read,
 * edited and versioned with no editor open (PRD R16), and the pre-turn
 * version a `write_file` or `edit_file` on a document records (R8, R11).
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shortResourceId } from "@nodetool-ai/protocol";
import {
  createLocalWorkspace,
  headlessGate,
  setProjectFolderResolver,
  type ProcessingContext,
  type Workspace
} from "@nodetool-ai/runtime";
import { ModelObserver, TextDocumentVersion, initTestDb } from "@nodetool-ai/models";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import {
  STAGED_DOCUMENT_EDITS_CONTEXT_KEY,
  blockWorkspaceMarkdownWrites,
  stageWorkspaceDocument,
  type StagedDocumentEditHandler
} from "../src/capabilities/text-documents.js";
import { BUILTIN_TOOL_NAMES, getBuiltinTools } from "../src/tools/builtin-tools.js";
import { GOOGLE_WORKSPACE_TOOL_NAMES } from "../src/tools/google-workspace-tools.js";
import { searchTools } from "../src/tools/tool-search.js";

const USER = "doc-owner";
const PROJECT = "doc-project";

let root: string;
let workspace: Workspace;

function contextFor(
  jobId: string,
  threadId: string | null = "thread-1",
  googleToken: string | null = null,
  customWorkspace: Workspace = workspace
): ProcessingContext {
  const values = new Map<string, unknown>();
  const wsDir = customWorkspace.localDir;
  return {
    getSecret: async (key: string) => (key === "GOOGLE_ACCESS_TOKEN" ? googleToken : null),
    userId: USER,
    projectId: PROJECT,
    jobId,
    threadId,
    workspace: customWorkspace,
    workspaceDir: wsDir,
    resolveWorkspacePath: (rel: string) => {
      if (!wsDir) throw new Error("No local workspace");
      return resolve(wsDir, rel);
    },
    get: (key: string) => values.get(key),
    set: (key: string, value: unknown) => values.set(key, value)
  } as unknown as ProcessingContext;
}

async function call(
  name: string,
  args: Record<string, unknown>,
  context: ProcessingContext = contextFor("turn-1")
): Promise<Record<string, unknown>> {
  const tool = toolForCapabilityName(name, () =>
    createCapabilityRun({ context, gate: UNGATED })
  );
  return (await tool.process(context, args)) as Record<string, unknown>;
}

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-doc-tools-"));
  workspace = createLocalWorkspace(join(root, PROJECT));
  setProjectFolderResolver(async (projectId) => ({
    ok: true,
    projectId: projectId ?? PROJECT,
    workspace
  }));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  ModelObserver.clear();
  setProjectFolderResolver(null);
  await rm(root, { recursive: true, force: true });
});

describe("text-documents capabilities", () => {
  it("creates, reads and edits a document by path", async () => {
    const created = await call("create_document", {
      name: "Plan",
      content: "# Plan\n\nDraft.\n"
    });
    expect(created["path"]).toBe("Plan.md");

    const edited = await call("edit_document", {
      path: "Plan.md",
      edits: [{ old_text: "Draft.", new_text: "Final." }]
    });
    expect(edited).toMatchObject({ changed: true, replacements: 1 });

    const appended = await call("edit_document", {
      asset_id: created["asset_id"],
      append: "- one\n"
    });
    expect(appended["changed"]).toBe(true);

    const read = await call("read_document", { asset_id: created["asset_id"] });
    expect(read["content"]).toBe("# Plan\n\nFinal.\n\n- one\n");
  });

  it("records one pre-turn version for every edit in a turn", async () => {
    const created = await call("create_document", { name: "a.md", content: "v1\n" });
    const id = created["asset_id"];
    await call("edit_document", { asset_id: id, content: "v2\n" });
    await call("edit_document", { asset_id: id, content: "v3\n" });
    await call("edit_document", { asset_id: id, content: "v4\n" }, contextFor("turn-2"));

    const listed = await call("list_document_versions", { asset_id: id });
    const versions = listed["versions"] as { save_type: string; cause_id: string }[];
    expect(versions.map((v) => v.cause_id)).toEqual(["turn-2", "turn-1"]);
    expect(versions.every((v) => v.save_type === "agent_turn")).toBe(true);
  });

  it("marks a write from a workflow run as workflow_run", async () => {
    const created = await call("create_document", { name: "w.md", content: "a\n" });
    await call(
      "edit_document",
      { asset_id: created["asset_id"], content: "b\n" },
      contextFor("job-9", null)
    );
    const [version] = await TextDocumentVersion.listForAsset(String(created["asset_id"]));
    expect(version).toMatchObject({ save_type: "workflow_run", cause_id: "job-9" });
  });

  it("saves, renames, restores, and deletes versions", async () => {
    const created = await call("create_document", { name: "r.md", content: "keep\n" });
    const id = created["asset_id"];
    const saved = await call("create_document_version", { asset_id: id, name: "Before" });
    const renamed = await call("rename_document_version", {
      asset_id: id,
      version: saved["version"],
      name: "Checkpoint A"
    });
    expect(renamed["name"]).toBe("Checkpoint A");

    await call("edit_document", { asset_id: id, content: "changed\n" });
    const restored = await call("restore_document_version", {
      asset_id: id,
      version: saved["version"]
    });
    expect(restored["restored_version"]).toBe(saved["version"]);
    expect(typeof restored["latest_version"]).toBe("number");
    const read = await call("read_document", { asset_id: id });
    expect(read["content"]).toBe("keep\n");

    const listedAfterRestore = await call("list_document_versions", { asset_id: id });
    const versionsAfterRestore = listedAfterRestore["versions"] as {
      version: number;
      name: string | null;
      save_type: string;
    }[];
    expect(versionsAfterRestore[0]).toMatchObject({
      version: restored["latest_version"],
      name: "Restored from Checkpoint A",
      save_type: "restore"
    });

    const deleted = await call("delete_document_version", {
      asset_id: id,
      version: saved["version"]
    });
    expect(deleted["deleted_version"]).toBe(saved["version"]);
    const listedAfterDelete = await call("list_document_versions", { asset_id: id });
    const remainingVersions = (listedAfterDelete["versions"] as { version: number }[]).map(
      (v) => v.version
    );
    expect(remainingVersions).not.toContain(saved["version"]);
  });

  it("always prompts through the permission gate for delete_document_version and never remembers standing approval", async () => {
    const created = await call("create_document", { name: "gated.md", content: "v1\n" });
    const id = String(created["asset_id"]);
    const snap1 = await call("create_document_version", { asset_id: id, name: "Snap 1" });
    const snap2 = await call("create_document_version", { asset_id: id, name: "Snap 2" });
    const snap3 = await call("create_document_version", { asset_id: id, name: "Snap 3" });
    const ctx = contextFor("turn-delete-gate");

    // 1. Plan mode still blocks without prompting
    const planApproval = vi.fn(async () => "allow" as const);
    const planRun = createCapabilityRun({
      context: ctx,
      gate: {
        mode: "plan",
        sessionAllow: new Set(["delete_document_version"]),
        requestApproval: planApproval
      }
    });
    const planResult = (await planRun.invoke("delete_document_version", {
      asset_id: id,
      version: snap1["version"]
    })) as Record<string, unknown>;
    expect(planResult["error"]).toBe("blocked_in_plan_mode");
    expect(planApproval).not.toHaveBeenCalled();

    // 2. Even in auto mode and pre-seeded in sessionAllow/alwaysAllow, requestApproval is invoked;
    // returning "deny" leaves the snapshot intact and returns permission_denied.
    const denyApproval = vi.fn(async () => "deny" as const);
    const autoDenyRun = createCapabilityRun({
      context: ctx,
      gate: {
        mode: "auto",
        sessionAllow: new Set(["delete_document_version"]),
        alwaysAllow: new Set(["delete_document_version"]),
        requestApproval: denyApproval
      }
    });
    const denied = (await autoDenyRun.invoke("delete_document_version", {
      asset_id: id,
      version: snap1["version"]
    })) as Record<string, unknown>;
    expect(denyApproval).toHaveBeenCalledTimes(1);
    expect(denied["error"]).toBe("permission_denied");
    expect(
      (await TextDocumentVersion.listForAsset(id)).map((v) => v.version)
    ).toContain(snap1["version"]);

    // 3. Under headlessGate (auto mode with denying approver), snapshot is not deleted.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const headlessRun = createCapabilityRun({
        context: ctx,
        gate: headlessGate("test-headless")
      });
      const headlessResult = (await headlessRun.invoke("delete_document_version", {
        asset_id: id,
        version: snap1["version"]
      })) as Record<string, unknown>;
      expect(headlessResult["error"]).toBe("permission_denied");
      expect(
        (await TextDocumentVersion.listForAsset(id)).map((v) => v.version)
      ).toContain(snap1["version"]);
    } finally {
      warnSpy.mockRestore();
    }

    // 4. Returning standing approval ("allow_for_chat") deletes the snapshot, does NOT add
    // "delete_document_version" to sessionAllow, and prompts again on the next call.
    const sessionAllow = new Set<string>();
    const standingApproval = vi.fn(async () => "allow_for_chat" as const);
    const autoAllowRun = createCapabilityRun({
      context: ctx,
      gate: {
        mode: "auto",
        sessionAllow,
        requestApproval: standingApproval
      }
    });
    const deleted1 = (await autoAllowRun.invoke("delete_document_version", {
      asset_id: id,
      version: snap1["version"]
    })) as Record<string, unknown>;
    expect(deleted1["deleted_version"]).toBe(snap1["version"]);
    expect(standingApproval).toHaveBeenCalledTimes(1);
    expect(sessionAllow.has("delete_document_version")).toBe(false);

    const deleted2 = (await autoAllowRun.invoke("delete_document_version", {
      asset_id: id,
      version: snap2["version"]
    })) as Record<string, unknown>;
    expect(deleted2["deleted_version"]).toBe(snap2["version"]);
    expect(standingApproval).toHaveBeenCalledTimes(2);
    expect(sessionAllow.has("delete_document_version")).toBe(false);

    // Remaining snapshot snap3 is untouched.
    expect(
      (await TextDocumentVersion.listForAsset(id)).map((v) => v.version)
    ).toContain(snap3["version"]);
  });

  it("accepts exact 12-character resource ID prefixes for version and export capabilities", async () => {
    const created = await call("create_document", { name: "prefix.md", content: "alpha\n" });
    const fullId = String(created["asset_id"]);
    const shortId = shortResourceId(fullId);
    expect(shortId).toHaveLength(12);

    const snap = await call("create_document_version", { asset_id: shortId, name: "V1" });
    const renamed = await call("rename_document_version", {
      asset_id: shortId,
      version: snap["version"],
      name: "V1 Renamed"
    });
    expect(renamed["asset_id"]).toBe(fullId);
    expect(renamed["name"]).toBe("V1 Renamed");

    await call("edit_document", { asset_id: shortId, content: "beta\n" });
    const restored = await call("restore_document_version", {
      asset_id: shortId,
      version: snap["version"]
    });
    expect(restored["asset_id"]).toBe(fullId);
    expect(restored["restored_version"]).toBe(snap["version"]);

    const exported = await call("export_document", {
      asset_id: shortId,
      format: "md",
      directory: "exports",
      name: "PrefixCopy"
    });
    expect(exported["path"]).toBe("exports/PrefixCopy.md");

    const deleted = await call("delete_document_version", {
      asset_id: shortId,
      version: snap["version"]
    });
    expect(deleted["asset_id"]).toBe(fullId);
    expect(deleted["deleted_version"]).toBe(snap["version"]);
  });

  it("answers an edit that does not apply with an error", async () => {
    const created = await call("create_document", { name: "e.md", content: "x\n" });
    const result = await call("edit_document", {
      asset_id: created["asset_id"],
      edits: [{ old_text: "missing", new_text: "y" }]
    });
    expect(String(result["error"])).toMatch(/not found/);
  });

  it("records a pre-turn version when edit_file or write_file changes a document", async () => {
    // One turn, one context: write_file needs the read edit_file recorded.
    const turn = contextFor("turn-1");
    const created = await call("create_document", { name: "f.md", content: "one\n" }, turn);
    const id = String(created["asset_id"]);
    await call("edit_file", { path: "f.md", old_string: "one", new_string: "two" }, turn);
    await call("write_file", { file_path: "f.md", content: "three\n" }, turn);

    const versions = await TextDocumentVersion.listForAsset(id);
    expect(versions.map((v) => v.content)).toEqual(["one\n"]);
    const read = await call("read_document", { asset_id: id });
    expect(read["content"]).toBe("three\n");
  });

  it("imports an HTML file as a Markdown document beside it", async () => {
    const { saveProjectAsset } = await import("@nodetool-ai/asset-services");
    await saveProjectAsset({
      userId: USER,
      projectId: PROJECT,
      name: "brief.html",
      contentType: "text/html",
      directory: "inbox",
      bytes: new TextEncoder().encode("<h1>Brief</h1><p>Ship <strong>it</strong>.</p>")
    });
    const imported = await call("import_document", { path: "inbox/brief.html" });
    expect(imported["path"]).toBe("inbox/brief.md");
    const read = await call("read_document", { asset_id: imported["asset_id"] });
    expect(String(read["content"])).toMatch(/^# Brief/);
    expect(String(read["content"])).toContain("**it**");
  });

  it("refuses to import a file type it cannot read", async () => {
    const { saveProjectAsset } = await import("@nodetool-ai/asset-services");
    const saved = await saveProjectAsset({
      userId: USER,
      projectId: PROJECT,
      name: "clip.wav",
      contentType: "audio/wav",
      bytes: new Uint8Array([1, 2, 3])
    });
    const result = await call("import_document", { asset_id: saved.id });
    expect(String(result["error"])).toMatch(/cannot be imported/);
  });

  it("exports a document as HTML, Markdown, or plain text into a chosen folder", async () => {
    const created = await call("create_document", {
      name: "Notes",
      content: "# Notes\n\nOne *two*.\n",
      directory: "docs"
    });
    const exportedHtml = await call("export_document", {
      asset_id: created["asset_id"],
      format: "html"
    });
    expect(exportedHtml["path"]).toBe("docs/Notes.html");
    const html = await workspace.read("docs/Notes.html");
    const text = new TextDecoder().decode(html);
    expect(text).toContain("<h1");
    expect(text).toContain("<em>two</em>");

    const exportedMd = await call("export_document", {
      asset_id: created["asset_id"],
      format: "md",
      directory: "/exports/release/",
      name: "Snapshot Copy.md"
    });
    expect(exportedMd["path"]).toBe("exports/release/Snapshot-Copy.md");
    expect(new TextDecoder().decode(await workspace.read("exports/release/Snapshot-Copy.md"))).toBe(
      "# Notes\n\nOne *two*.\n"
    );

    const exportedTxt = await call("export_document", {
      asset_id: created["asset_id"],
      format: "txt",
      directory: "",
      name: "Plain.txt"
    });
    expect(exportedTxt["path"]).toBe("Plain.txt");
    expect(new TextDecoder().decode(await workspace.read("Plain.txt"))).toBe(
      "# Notes\n\nOne *two*.\n"
    );

    const badDir = await call("export_document", {
      asset_id: created["asset_id"],
      format: "md",
      directory: "../outside"
    });
    expect(String(badDir["error"])).toMatch(/project folder/);

    for (const reserved of [".nodetool", ".nodetool/sub", "foo/.nodetool", ".NodeTool/sub"]) {
      const reservedRes = await call("export_document", {
        asset_id: created["asset_id"],
        format: "md",
        directory: reserved
      });
      expect(String(reservedRes["error"])).toMatch(/reserved \.nodetool folder/);
    }
  });

  it("stages edit_document, edit_file, and write_file without touching disk when staged approval is active", async () => {
    const created = await call("create_document", {
      name: "staged.md",
      content: "# Title\n\nOriginal paragraph.\n"
    });
    const other = await call("create_document", {
      name: "other.md",
      content: "Other doc.\n"
    });
    const assetId = String(created["asset_id"]);
    const proposals: Array<{
      proposalId: string;
      assetId: string;
      baseContent: string;
      proposedContent: string;
    }> = [];
    const handler: StagedDocumentEditHandler = {
      assetId,
      workspacePath: String(created["path"]),
      projectId: PROJECT,
      currentContent: null,
      baseContent: null,
      onProposal: (p) => proposals.push(p)
    };
    const stagedCtx = contextFor("turn-staged");
    stagedCtx.set(STAGED_DOCUMENT_EDITS_CONTEXT_KEY, handler);

    // 1. edit_document stages without touching disk
    const edit1 = await call(
      "edit_document",
      {
        asset_id: assetId,
        edits: [{ old_text: "Original paragraph.", new_text: "Revised paragraph." }]
      },
      stagedCtx
    );
    expect(edit1).toMatchObject({ changed: true, staged: true, replacements: 1 });
    expect(await workspace.readText("staged.md")).toBe("# Title\n\nOriginal paragraph.\n");
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      assetId,
      baseContent: "# Title\n\nOriginal paragraph.\n",
      proposedContent: "# Title\n\nRevised paragraph.\n"
    });

    // Follow-up read_document sees staged content
    const read1 = await call("read_document", { asset_id: assetId }, stagedCtx);
    expect(read1["content"]).toBe("# Title\n\nRevised paragraph.\n");

    // 2. edit_file on the staged document builds on staged content and keeps baseContent intact
    const edit2 = await call(
      "edit_file",
      { path: "staged.md", old_string: "Revised", new_string: "Polished" },
      stagedCtx
    );
    expect(edit2).toMatchObject({ success: true, staged: true, replacements: 1 });
    expect(await workspace.readText("staged.md")).toBe("# Title\n\nOriginal paragraph.\n");
    expect(proposals).toHaveLength(2);
    expect(proposals[1]).toMatchObject({
      assetId,
      baseContent: "# Title\n\nOriginal paragraph.\n",
      proposedContent: "# Title\n\nPolished paragraph.\n"
    });

    // 3. write_file on the staged document also stages instead of writing disk
    const writeResult = await call(
      "write_file",
      { file_path: "staged.md", content: "# Final\n\nComplete rewrite.\n" },
      stagedCtx
    );
    expect(String(writeResult)).toMatch(/Staged changes/);
    expect(await workspace.readText("staged.md")).toBe("# Title\n\nOriginal paragraph.\n");
    expect(proposals).toHaveLength(3);
    expect(proposals[2]?.proposedContent).toBe("# Final\n\nComplete rewrite.\n");
    expect(proposals[2]?.baseContent).toBe("# Title\n\nOriginal paragraph.\n");
    expect(await TextDocumentVersion.listForAsset(assetId)).toHaveLength(0);

    // 4. Editing a DIFFERENT document writes directly to disk as usual
    await call(
      "edit_document",
      { asset_id: other["asset_id"], content: "Updated other.\n" },
      stagedCtx
    );
    expect(await workspace.readText("other.md")).toBe("Updated other.\n");
  });

  it("stages restore_document_version and exports staged content without modifying disk", async () => {
    const created = await call("create_document", {
      name: "staged-restore.md",
      content: "# Original\n\nBody v1.\n"
    });
    const assetId = String(created["asset_id"]);
    const v1 = await call("create_document_version", { asset_id: assetId, name: "V1" });
    await call("edit_document", { asset_id: assetId, content: "# Updated\n\nBody v2.\n" });
    const versionsBefore = await TextDocumentVersion.listForAsset(assetId);

    const proposals: Array<{
      proposalId: string;
      assetId: string;
      baseContent: string;
      proposedContent: string;
    }> = [];
    const handler: StagedDocumentEditHandler = {
      assetId,
      workspacePath: String(created["path"]),
      projectId: PROJECT,
      currentContent: null,
      baseContent: null,
      onProposal: (p) => proposals.push(p)
    };
    const stagedCtx = contextFor("turn-staged-restore", "thread-1", "token-1");
    stagedCtx.set(STAGED_DOCUMENT_EDITS_CONTEXT_KEY, handler);

    // Restoring v1 stages the restore instead of writing disk or adding restore rows
    const restored = await call(
      "restore_document_version",
      { asset_id: assetId, version: v1["version"] },
      stagedCtx
    );
    expect(restored).toMatchObject({
      restored_version: v1["version"],
      staged: true,
      changed: true
    });
    expect(await workspace.readText("staged-restore.md")).toBe("# Updated\n\nBody v2.\n");
    expect(await TextDocumentVersion.listForAsset(assetId)).toHaveLength(versionsBefore.length);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      assetId,
      baseContent: "# Updated\n\nBody v2.\n",
      proposedContent: "# Original\n\nBody v1.\n"
    });

    // Restoring the same version again is a no-op
    const noop = await call(
      "restore_document_version",
      { asset_id: assetId, version: v1["version"] },
      stagedCtx
    );
    expect(noop).toMatchObject({ restored_version: v1["version"], changed: false });
    expect(proposals).toHaveLength(1);

    // export_document exports staged content (md and txt), not stale disk content
    const exportedMd = await call(
      "export_document",
      { asset_id: assetId, format: "md", directory: "out", name: "StagedOut" },
      stagedCtx
    );
    expect(await workspace.readText(String(exportedMd["path"]))).toBe("# Original\n\nBody v1.\n");

    const exportedTxt = await call(
      "export_document",
      { asset_id: assetId, format: "txt", directory: "out", name: "StagedOutTxt" },
      stagedCtx
    );
    expect(await workspace.readText(String(exportedTxt["path"]))).toBe("# Original\n\nBody v1.\n");

    // export_google_doc also exports staged content
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ id: "g-staged", name: "StagedDoc", webViewLink: "https://docs.google.com/document/d/g-staged" })
    );
    vi.stubGlobal("fetch", fetchMock);
    const gdoc = await call("export_google_doc", { asset_id: assetId }, stagedCtx);
    expect(gdoc["document_id"]).toBe("g-staged");
    const uploadBody = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(uploadBody).toContain("# Original");
    expect(uploadBody).not.toContain("# Updated");
  });

  it("intercepts workspace mutations via stageWorkspaceDocument and local convert_document output", async () => {
    const created = await call("create_document", {
      name: "guarded.md",
      content: "# Guarded\n\nDisk content.\n"
    });
    const assetId = String(created["asset_id"]);
    await workspace.write("source.md", "# Replacement\n\nCopied content.\n");
    await workspace.write("input.html", "<h1>Converted</h1><p>From HTML.</p>");

    const proposals: Array<{
      proposalId: string;
      assetId: string;
      baseContent: string;
      proposedContent: string;
    }> = [];
    const handler: StagedDocumentEditHandler = {
      assetId,
      workspacePath: String(created["path"]),
      projectId: PROJECT,
      currentContent: null,
      baseContent: null,
      onProposal: (p) => proposals.push(p)
    };
    const stagedWs = stageWorkspaceDocument(workspace, "guarded.md", handler);

    // F13: staged workspace hides localDir and blocks materialize on the staged path
    expect(workspace.localDir).not.toBeNull();
    expect(stagedWs.localDir).toBeNull();
    await expect(stagedWs.materialize("guarded.md")).rejects.toThrow(
      /Cannot materialize the open document while staged approval is active/
    );
    expect(await workspace.readText("guarded.md")).toBe("# Guarded\n\nDisk content.\n");
    const otherMaterialized = await stagedWs.materialize("source.md");
    expect(otherMaterialized).toContain("source.md");

    // Direct workspace.write stages without mutating disk
    await stagedWs.write("guarded.md", "# Staged\n\nVia workspace.\n");
    expect(await workspace.readText("guarded.md")).toBe("# Guarded\n\nDisk content.\n");
    expect(await stagedWs.readText("guarded.md")).toBe("# Staged\n\nVia workspace.\n");
    expect(new TextDecoder().decode((await stagedWs.read("guarded.md"))!)).toBe(
      "# Staged\n\nVia workspace.\n"
    );
    expect(proposals).toHaveLength(1);

    // writeNew returns false when the staged file already exists
    expect(await stagedWs.writeNew("guarded.md", "should not overwrite")).toBe(false);
    expect(proposals).toHaveLength(1);

    // copy FROM staged path writes staged bytes to destination
    await stagedWs.copy("guarded.md", "copy-out.md");
    expect(await workspace.readText("copy-out.md")).toBe("# Staged\n\nVia workspace.\n");

    // copy TO staged path stages source bytes instead of overwriting disk
    await stagedWs.copy("source.md", "guarded.md");
    expect(await workspace.readText("guarded.md")).toBe("# Guarded\n\nDisk content.\n");
    expect(await stagedWs.readText("guarded.md")).toBe("# Replacement\n\nCopied content.\n");
    expect(proposals).toHaveLength(2);

    // delete, deleteAll, and move touching the staged path are refused
    await expect(stagedWs.delete("guarded.md")).rejects.toThrow(/staged approval is active/);
    await expect(stagedWs.deleteAll("")).rejects.toThrow(/staged approval is active/);
    await expect(stagedWs.move("guarded.md", "moved.md")).rejects.toThrow(
      /staged approval is active/
    );
    await expect(stagedWs.move("source.md", "guarded.md")).rejects.toThrow(
      /staged approval is active/
    );
    expect(await workspace.readText("guarded.md")).toBe("# Guarded\n\nDisk content.\n");

    // convert_document writing to the staged markdown file on a local workspace also stages
    const stagedCtx = contextFor("turn-convert-staged", "thread-1", null, stagedWs);
    stagedCtx.set(STAGED_DOCUMENT_EDITS_CONTEXT_KEY, handler);
    const converted = await call(
      "convert_document",
      {
        input_file: "input.html",
        output_file: "guarded.md",
        from_format: "html",
        to_format: "markdown"
      },
      stagedCtx
    );
    expect(converted["status"]).toBe("success");
    expect(await workspace.readText("guarded.md")).toBe("# Guarded\n\nDisk content.\n");
    expect(proposals).toHaveLength(3);
    expect(proposals[2]?.proposedContent).toContain("Converted");
  });

  it("blocks all Markdown workspace mutations and fails closed when blockWorkspaceMarkdownWrites or refuseReason is active", async () => {
    const created = await call("create_document", {
      name: "protected.md",
      content: "# Protected\n\nOriginal.\n"
    });
    const assetId = String(created["asset_id"]);
    const snap = await call("create_document_version", { asset_id: assetId, name: "Base" });
    await workspace.write("notes/nested.markdown", "Nested doc.\n");
    await workspace.write("plain.txt", "Plain text.\n");

    const reason = "Focused document could not be loaded for staged approval; direct writes are blocked.";
    const blockedWs = blockWorkspaceMarkdownWrites(workspace, reason);

    expect(workspace.localDir).not.toBeNull();
    expect(blockedWs.localDir).toBeNull();

    const tempLocal = join(root, "temp-absorb.md");
    await writeFile(tempLocal, "Absorbed.\n", "utf-8");

    // All mutating / materializing operations targeting Markdown files or directories throw
    await expect(blockedWs.write("protected.md", "changed")).rejects.toThrow(reason);
    await expect(blockedWs.writeNew("fresh.markdown", "new")).rejects.toThrow(reason);
    await expect(blockedWs.absorb(tempLocal, "protected.md")).rejects.toThrow(reason);
    await expect(blockedWs.absorbNew(tempLocal, "fresh.md")).rejects.toThrow(reason);
    await expect(blockedWs.delete("protected.md")).rejects.toThrow(reason);
    await expect(blockedWs.deleteAll("protected.md")).rejects.toThrow(reason);
    await expect(blockedWs.deleteAll("notes")).rejects.toThrow(reason);
    await expect(blockedWs.deleteAll("")).rejects.toThrow(reason);
    await expect(blockedWs.move("protected.md", "plain2.txt")).rejects.toThrow(reason);
    await expect(blockedWs.move("plain.txt", "renamed.md")).rejects.toThrow(reason);
    await expect(blockedWs.move("notes", "notes-moved")).rejects.toThrow(reason);
    await expect(blockedWs.copy("plain.txt", "protected.md")).rejects.toThrow(reason);
    await expect(blockedWs.materialize("protected.md")).rejects.toThrow(reason);

    // Reads and non-Markdown operations continue working normally
    expect(await blockedWs.readText("protected.md")).toBe("# Protected\n\nOriginal.\n");
    await blockedWs.write("plain.txt", "Updated plain.\n");
    expect(await workspace.readText("plain.txt")).toBe("Updated plain.\n");
    await blockedWs.copy("protected.md", "copy.txt");
    expect(await workspace.readText("copy.txt")).toBe("# Protected\n\nOriginal.\n");
    expect(await blockedWs.materialize("plain.txt")).toContain("plain.txt");

    // refuseReason on StagedDocumentEditHandler blocks edit_document, restore_document_version,
    // edit_file, and write_file without touching disk
    const blockedCtx = contextFor("turn-refused", "thread-1", null, blockedWs);
    blockedCtx.set(STAGED_DOCUMENT_EDITS_CONTEXT_KEY, {
      assetId,
      workspacePath: null,
      projectId: PROJECT,
      refuseReason: reason,
      currentContent: null,
      baseContent: null,
      onProposal: () => {}
    } satisfies StagedDocumentEditHandler);

    const editDocRes = await call(
      "edit_document",
      { asset_id: assetId, content: "Overwritten.\n" },
      blockedCtx
    );
    expect(editDocRes).toEqual({ error: reason });

    const restoreRes = await call(
      "restore_document_version",
      { asset_id: assetId, version: snap["version"] },
      blockedCtx
    );
    expect(restoreRes).toEqual({ error: reason });

    const editFileRes = await call(
      "edit_file",
      { path: "protected.md", old_string: "Original.", new_string: "Hacked." },
      blockedCtx
    );
    expect(editFileRes["success"]).toBe(false);
    expect(String(editFileRes["error"])).toContain(reason);

    await call("read_file", { file_path: "protected.md" }, blockedCtx);
    const writeFileRes = await call(
      "write_file",
      { file_path: "protected.md", content: "Hacked.\n" },
      blockedCtx
    );
    expect(String(writeFileRes)).toContain(reason);

    expect(await workspace.readText("protected.md")).toBe("# Protected\n\nOriginal.\n");
  });

  it("imports a Google Doc by its URL as a Markdown document", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/export")
        ? new Response("# Brief\n\n- one\n")
        : Response.json({ id: "doc123abcdef", name: "Brief", mimeType: "application/vnd.google-apps.document" })
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await call(
      "import_google_doc",
      { document_id: "https://docs.google.com/document/d/doc123abcdef/edit" },
      contextFor("turn-1", "thread-1", "token-1")
    );
    expect(result["path"]).toBe("Brief.md");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/files/doc123abcdef/export");
    const read = await call("read_document", { asset_id: result["asset_id"] });
    expect(read["content"]).toBe("# Brief\n\n- one\n");
  });

  it("exports a document to a new Google Doc", async () => {
    const created = await call("create_document", { name: "Out", content: "# Out\n" });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ id: "g1", name: "Out", webViewLink: "https://docs.google.com/document/d/g1" })
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await call(
      "export_google_doc",
      { asset_id: created["asset_id"] },
      contextFor("turn-1", "thread-1", "token-1")
    );
    expect(result).toEqual({ document_id: "g1", name: "Out", url: "https://docs.google.com/document/d/g1" });
    const body = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(body).toContain("application/vnd.google-apps.document");
    expect(body).toContain("# Out");
  });

  it("answers a Google Docs call with no sign-in with an error", async () => {
    const created = await call("create_document", { name: "N", content: "x\n" });
    const result = await call("export_google_doc", { asset_id: created["asset_id"] });
    expect(typeof result["error"]).toBe("string");
  });

  it("exposes Markdown document tools on the built-in belt and Google Doc transfer tools on the Google belt", () => {
    const builtin = [
      "create_document",
      "read_document",
      "edit_document",
      "list_document_versions",
      "create_document_version",
      "rename_document_version",
      "delete_document_version",
      "restore_document_version",
      "import_document",
      "export_document"
    ];
    expect(BUILTIN_TOOL_NAMES).toEqual(expect.arrayContaining(builtin));
    const hits = searchTools(getBuiltinTools(), "select:edit_document,read_document");
    expect(hits.map((hit) => hit.name)).toEqual(["edit_document", "read_document"]);
    expect(GOOGLE_WORKSPACE_TOOL_NAMES).toEqual(
      expect.arrayContaining(["import_google_doc", "export_google_doc"])
    );
  });
});
