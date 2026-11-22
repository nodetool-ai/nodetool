/**
 * The `trash` capabilities — the caller's deleted documents inside their
 * restore period, through the same model functions the tRPC
 * `deletedDocuments` router calls.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  ModelObserver,
  Workflow,
  initTestDb,
  setDocumentRetentionDays
} from "@nodetool-ai/models";
import { shortResourceId } from "@nodetool-ai/protocol";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import type { Tool } from "../src/tools/base-tool.js";

const OWNER = "trash-owner";
const OTHER = "trash-other";

function toolFor(name: string, userId: string = OWNER): Tool {
  const ctx = { userId } as unknown as ProcessingContext;
  return toolForCapabilityName(name, () =>
    createCapabilityRun({ context: ctx, gate: UNGATED })
  );
}

async function call(
  name: string,
  args: Record<string, unknown>,
  userId: string = OWNER
): Promise<Record<string, unknown>> {
  const ctx = { userId } as unknown as ProcessingContext;
  return (await toolFor(name, userId).process(ctx, args)) as Record<string, unknown>;
}

async function deletedWorkflow(name: string): Promise<Workflow> {
  const wf = (await Workflow.create({
    user_id: OWNER,
    project_id: null,
    name,
    description: "",
    tags: [],
    access: "private",
    graph: { nodes: [], edges: [] },
    run_mode: "workflow"
  })) as Workflow;
  await Workflow.deleteOwned(OWNER, wf.id);
  return wf;
}

beforeEach(() => {
  initTestDb();
  setDocumentRetentionDays(30);
});

afterEach(() => {
  setDocumentRetentionDays(null);
  ModelObserver.clear();
});

describe("list_deleted_documents", () => {
  it("lists the caller's restorable documents and no one else's", async () => {
    const wf = await deletedWorkflow("kept");

    const listed = (await call("list_deleted_documents", {})) as {
      documents: Array<Record<string, unknown>>;
    };
    expect(listed.documents).toHaveLength(1);
    expect(listed.documents[0]).toMatchObject({
      kind: "workflow",
      document_id: wf.id,
      name: "kept"
    });
    expect(Date.parse(String(listed.documents[0]["purge_at"]))).toBeGreaterThan(Date.now());

    const other = (await call("list_deleted_documents", {}, OTHER)) as {
      documents: unknown[];
    };
    expect(other.documents).toEqual([]);
  });
});

describe("restore_deleted_document", () => {
  it("restores the document under its old id from a short id", async () => {
    const wf = await deletedWorkflow("back");
    expect(await Workflow.get<Workflow>(wf.id)).toBeNull();

    const result = await call("restore_deleted_document", {
      kind: "workflow",
      document_id: shortResourceId(wf.id)
    });
    expect(result).toEqual({ restored: true, kind: "workflow", document_id: wf.id });
    expect((await Workflow.get<Workflow>(wf.id))?.name).toBe("back");

    const listed = (await call("list_deleted_documents", {})) as { documents: unknown[] };
    expect(listed.documents).toEqual([]);
  });

  it("reports another user's deleted document as not found", async () => {
    const wf = await deletedWorkflow("mine");
    const result = await call(
      "restore_deleted_document",
      { kind: "workflow", document_id: wf.id },
      OTHER
    );
    expect(String(result["error"])).toMatch(/no restorable deleted workflow/i);
    expect(await Workflow.get<Workflow>(wf.id)).toBeNull();
  });

  it("refuses an unknown kind before touching the store", async () => {
    const result = await call("restore_deleted_document", {
      kind: "sketch",
      document_id: "abc"
    });
    expect(result).toEqual({
      error: "kind must be one of workflow, timeline, project."
    });
  });
});
