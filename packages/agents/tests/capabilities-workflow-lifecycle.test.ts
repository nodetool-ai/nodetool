/**
 * The workflow lifecycle capabilities, and the boundary they enforce.
 *
 * `Workflow.find` answers for a public workflow and for one shared with the
 * caller, so a mutation written on top of it would let a run rewrite, publish
 * or delete a workflow it can only read. Every case below that names another
 * user is there to keep that from coming back.
 */

import { describe, expect, it, beforeEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Workflow, initTestDb } from "@nodetool-ai/models";
import {
  updateWorkflow,
  deleteWorkflow,
  setWorkflowAccess
} from "../src/capabilities/workflows.js";
import {
  UNGATED,
  createCapabilityRun,
  toolFromCapability
} from "../src/capabilities/index.js";
import type { CapabilityExport } from "../src/capabilities/types.js";
import type { Tool } from "../src/tools/base-tool.js";

const USER = "user-wf";
const OTHER = "someone-else";

const ctx = { userId: USER } as unknown as ProcessingContext;

function asTool(entry: CapabilityExport): Tool {
  return toolFromCapability(entry.spec, entry.impl, () =>
    createCapabilityRun({ context: ctx, gate: UNGATED })
  );
}

const EMPTY_GRAPH = { nodes: [], edges: [] };

async function makeWorkflow(
  userId: string,
  access: "private" | "public" = "private"
): Promise<Workflow> {
  return (await Workflow.create({
    user_id: userId,
    name: "wf",
    description: "",
    tags: [],
    access,
    graph: EMPTY_GRAPH,
    run_mode: "workflow"
  })) as Workflow;
}

beforeEach(() => {
  initTestDb();
});

describe("update_workflow", () => {
  it("updates the fields it was given and leaves the rest alone", async () => {
    const wf = await makeWorkflow(USER);
    const result = (await asTool(updateWorkflow).process(ctx, {
      workflow_id: wf.id,
      name: "renamed",
      tags: ["a"]
    })) as Record<string, unknown>;
    expect(result.error).toBeUndefined();

    const stored = await Workflow.get<Workflow>(wf.id);
    expect(stored?.name).toBe("renamed");
    expect(stored?.tags).toEqual(["a"]);
    expect(stored?.graph).toEqual(EMPTY_GRAPH);
  });

  it("refuses a workflow the caller does not own, public or not", async () => {
    for (const access of ["private", "public"] as const) {
      const theirs = await makeWorkflow(OTHER, access);
      const answer = (await asTool(updateWorkflow).process(ctx, {
        workflow_id: theirs.id,
        name: "mine now"
      })) as Record<string, unknown>;
      expect(String(answer.error)).toContain("not yours");
      expect((await Workflow.get<Workflow>(theirs.id))?.name).toBe("wf");
    }
  });

  it("refuses a stale write instead of clobbering it", async () => {
    const wf = await makeWorkflow(USER);
    const answer = (await asTool(updateWorkflow).process(ctx, {
      workflow_id: wf.id,
      name: "renamed",
      expected_updated_at: "1999-01-01T00:00:00.000Z"
    })) as Record<string, unknown>;
    expect(String(answer.error)).toContain("changed since");
    expect((await Workflow.get<Workflow>(wf.id))?.name).toBe("wf");
  });

  it("cannot change access — that is set_workflow_access's job", async () => {
    const wf = await makeWorkflow(USER);
    await asTool(updateWorkflow).process(ctx, {
      workflow_id: wf.id,
      name: "renamed",
      access: "public"
    });
    expect((await Workflow.get<Workflow>(wf.id))?.access).toBe("private");
  });
});

describe("delete_workflow", () => {
  it("deletes the caller's own workflow", async () => {
    const wf = await makeWorkflow(USER);
    const answer = (await asTool(deleteWorkflow).process(ctx, {
      workflow_id: wf.id
    })) as Record<string, unknown>;
    expect(answer.deleted).toBe(true);
    expect(await Workflow.get<Workflow>(wf.id)).toBeNull();
  });

  it("refuses another user's public workflow", async () => {
    const theirs = await makeWorkflow(OTHER, "public");
    const answer = (await asTool(deleteWorkflow).process(ctx, {
      workflow_id: theirs.id
    })) as Record<string, unknown>;
    expect(String(answer.error)).toContain("not yours");
    expect(await Workflow.get<Workflow>(theirs.id)).not.toBeNull();
  });
});

describe("set_workflow_access", () => {
  it("publishes and withdraws a workflow the caller owns", async () => {
    const wf = await makeWorkflow(USER);
    await asTool(setWorkflowAccess).process(ctx, {
      workflow_id: wf.id,
      access: "public"
    });
    expect((await Workflow.get<Workflow>(wf.id))?.access).toBe("public");

    await asTool(setWorkflowAccess).process(ctx, {
      workflow_id: wf.id,
      access: "private"
    });
    expect((await Workflow.get<Workflow>(wf.id))?.access).toBe("private");
  });

  it("cannot publish someone else's workflow", async () => {
    const theirs = await makeWorkflow(OTHER);
    const answer = (await asTool(setWorkflowAccess).process(ctx, {
      workflow_id: theirs.id,
      access: "public"
    })) as Record<string, unknown>;
    expect(String(answer.error)).toContain("not yours");
    expect((await Workflow.get<Workflow>(theirs.id))?.access).toBe("private");
  });

  it("is classified external, so the gate asks before it discloses", () => {
    expect(setWorkflowAccess.spec.category).toBe("external");
  });
});
