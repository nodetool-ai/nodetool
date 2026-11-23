/**
 * The `text-documents` capabilities — Markdown documents created, read,
 * edited and versioned with no editor open (PRD R16), and the pre-turn
 * version a `write_file` or `edit_file` on a document records (R8, R11).
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function contextFor(
  jobId: string,
  threadId: string | null = "thread-1",
  googleToken: string | null = null
): ProcessingContext {
  const values = new Map<string, unknown>();
  return {
    getSecret: async (key: string) => (key === "GOOGLE_ACCESS_TOKEN" ? googleToken : null),
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

  it("exports a document as an HTML file next to it", async () => {
    const created = await call("create_document", {
      name: "Notes",
      content: "# Notes\n\nOne *two*.\n",
      directory: "docs"
    });
    const exported = await call("export_document", { asset_id: created["asset_id"], format: "html" });
    expect(exported["path"]).toBe("docs/Notes.html");
    const html = await workspace.read("docs/Notes.html");
    const text = new TextDecoder().decode(html);
    expect(text).toContain("<h1");
    expect(text).toContain("<em>two</em>");
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
});
