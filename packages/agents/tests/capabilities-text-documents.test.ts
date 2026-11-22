/**
 * The `text-documents` capabilities — Markdown documents created, read,
 * edited and versioned with no editor open (PRD R16), and the pre-turn
 * version a `write_file` or `edit_file` on a document records (R8, R11).
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createLocalWorkspace,
  setProjectFolderResolver,
  type ProcessingContext,
  type Workspace
} from "@nodetool-ai/runtime";
import { ModelObserver, TextDocumentVersion, initTestDb } from "@nodetool-ai/models";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";

const USER = "doc-owner";
const PROJECT = "doc-project";

let root: string;
let workspace: Workspace;

function contextFor(jobId: string, threadId: string | null = "thread-1"): ProcessingContext {
  const values = new Map<string, unknown>();
  return {
    userId: USER,
    projectId: PROJECT,
    jobId,
    threadId,
    workspace,
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

  it("saves a named version and restores it", async () => {
    const created = await call("create_document", { name: "r.md", content: "keep\n" });
    const id = created["asset_id"];
    const saved = await call("create_document_version", { asset_id: id, name: "Before" });
    await call("edit_document", { asset_id: id, content: "changed\n" });
    const restored = await call("restore_document_version", {
      asset_id: id,
      version: saved["version"]
    });
    expect(restored["restored_version"]).toBe(saved["version"]);
    const read = await call("read_document", { asset_id: id });
    expect(read["content"]).toBe("keep\n");
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
});
