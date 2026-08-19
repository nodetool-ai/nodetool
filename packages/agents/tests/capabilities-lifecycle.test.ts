/**
 * The lifecycle capabilities — workflows, assets, threads, documents — and
 * the ownership boundary each one enforces.
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
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import type { Tool } from "../src/tools/base-tool.js";

const USER = "user-wf";
const OTHER = "someone-else";

const ctx = { userId: USER } as unknown as ProcessingContext;

function asTool(entry: CapabilityExport): Tool {
  return toolFromCapability(entry.spec, entry.impl, () =>
    createCapabilityRun({ context: ctx, gate: UNGATED })
  );
}

/** The belt's own `Tool` for a capability, resolved by wire name. */
function toolFor(name: string): Tool {
  return toolForCapabilityName(name, () =>
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

describe("update_asset", () => {
  it("renames an asset and refuses a move that would detach a subtree", async () => {
    const { Asset } = await import("@nodetool-ai/models");
    const { updateAsset } = await import("../src/capabilities/assets.js");

    const outer = (await Asset.create({
      user_id: USER,
      name: "outer",
      content_type: "folder",
      parent_id: USER
    })) as InstanceType<typeof Asset>;
    const inner = (await Asset.create({
      user_id: USER,
      name: "inner",
      content_type: "folder",
      parent_id: outer.id
    })) as InstanceType<typeof Asset>;

    const renamed = (await asTool(updateAsset).process(ctx, {
      asset_id: outer.id,
      name: "renamed"
    })) as Record<string, unknown>;
    expect(renamed.name).toBe("renamed");

    // Moving `outer` under its own child would orphan both from Home.
    const cycled = (await asTool(updateAsset).process(ctx, {
      asset_id: outer.id,
      parent_id: inner.id
    })) as Record<string, unknown>;
    expect(String(cycled.error)).toContain("descendants");
    expect((await Asset.find(USER, outer.id))?.parent_id).toBe(USER);
  });

  it("reports another user's asset as missing", async () => {
    const { Asset } = await import("@nodetool-ai/models");
    const { updateAsset } = await import("../src/capabilities/assets.js");
    const theirs = (await Asset.create({
      user_id: OTHER,
      name: "theirs",
      content_type: "folder",
      parent_id: OTHER
    })) as InstanceType<typeof Asset>;

    const answer = (await asTool(updateAsset).process(ctx, {
      asset_id: theirs.id,
      name: "mine"
    })) as Record<string, unknown>;
    expect(String(answer.error)).toContain("was not found");
  });
});

/**
 * The five document deletes, checked together because they are one shape:
 * `Model.deleteOwned(userId, id)` plus its version cascade. Enumerated rather
 * than sampled — each model resolves its own row and carries its own
 * `user_id`, so "the template is right" is not evidence that all five are.
 */
describe("document deletes", () => {
  interface Case {
    readonly wire: string;
    readonly idParam: string;
    make(userId: string): Promise<{ id: string }>;
    exists(id: string): Promise<boolean>;
  }

  async function cases(): Promise<Case[]> {
    const {
      TimelineSequence,
      ImageDocument,
      Script,
      Storyboard,
      JsScript
    } = await import("@nodetool-ai/models");

    return [
      {
        wire: "delete_timeline",
        idParam: "timeline_id",
        make: (user) =>
          TimelineSequence.create<InstanceType<typeof TimelineSequence>>({
            user_id: user,
            project_id: "default",
            name: "cut",
            fps: 30,
            width: 1920,
            height: 1080,
            duration_ms: 1000,
            document: JSON.stringify({ tracks: [], clips: [], markers: [] })
          }),
        exists: async (id) => (await TimelineSequence.findById(id)) !== null
      },
      {
        wire: "delete_sketch",
        idParam: "image_document_id",
        make: (user) =>
          ImageDocument.create<InstanceType<typeof ImageDocument>>({
            user_id: user,
            project_id: "default",
            name: "poster",
            width: 64,
            height: 64,
            background_color: "#ffffff",
            document: JSON.stringify({
              sketch: { layers: [], activeLayerId: null, maskLayerId: null },
              layerBindings: []
            })
          }),
        exists: async (id) => (await ImageDocument.findById(id)) !== null
      },
      {
        wire: "delete_script",
        idParam: "script_id",
        make: (user) =>
          Script.create<InstanceType<typeof Script>>({
            user_id: user,
            project_id: "default",
            name: "script",
            document: JSON.stringify({ cast: [], sections: [] })
          }),
        exists: async (id) => (await Script.findById(id)) !== null
      },
      {
        wire: "delete_storyboard",
        idParam: "storyboard_id",
        make: (user) =>
          Storyboard.create<InstanceType<typeof Storyboard>>({
            user_id: user,
            project_id: "default",
            name: "board",
            document: JSON.stringify({ shots: [] })
          }),
        exists: async (id) => (await Storyboard.findById(id)) !== null
      },
      {
        wire: "delete_js_script",
        idParam: "script_id",
        make: async (user) => {
          const { emptyJsScriptDocument } = await import(
            "@nodetool-ai/protocol/api-schemas/js-scripts.js"
          );
          const script = new JsScript({
            user_id: user,
            name: "js",
            document: JSON.stringify(emptyJsScriptDocument())
          });
          await script.save();
          return script;
        },
        exists: async (id) => (await JsScript.findById(id)) !== null
      }
    ];
  }

  it("deletes the caller's own document", async () => {
    for (const c of await cases()) {
      const doc = await c.make(USER);
      const answer = (await toolFor(c.wire).process(ctx, {
        [c.idParam]: doc.id
      })) as Record<string, unknown>;
      expect(answer.deleted, c.wire).toBe(true);
      expect(await c.exists(doc.id), c.wire).toBe(false);
    }
  });

  it("refuses another user's document, and leaves it in place", async () => {
    for (const c of await cases()) {
      const doc = await c.make(OTHER);
      const answer = (await toolFor(c.wire).process(ctx, {
        [c.idParam]: doc.id
      })) as Record<string, unknown>;
      expect(String(answer.error), c.wire).toContain("not yours");
      expect(await c.exists(doc.id), c.wire).toBe(true);
    }
  });
});
