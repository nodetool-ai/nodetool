import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  ModelObserver,
  Workflow,
  WorkflowVersion,
  initTestDb
} from "@nodetool-ai/models";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { capabilityCategoryFor } from "../src/capabilities/registry.js";
import { getAllMcpTools } from "../src/tools/mcp-tools.js";

const ctx = (userId = "u1") => ({ userId }) as unknown as ProcessingContext;

const EMPTY_GRAPH = { nodes: [], edges: [] };

const graphWith = (id: string) => ({
  nodes: [{ id, type: "nodetool.constant.Text", properties: { value: id } }],
  edges: []
});

async function makeWorkflow(
  overrides: Record<string, unknown> = {}
): Promise<Workflow> {
  return (await Workflow.create({
    user_id: "u1",
    name: "Greeting",
    description: "",
    tags: [],
    access: "private",
    graph: EMPTY_GRAPH,
    run_mode: "workflow",
    ...overrides
  })) as Workflow;
}

describe("workflow version tools", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("registers on the MCP belt with sane permissions", () => {
    const names = getAllMcpTools().map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "list_workflow_versions",
        "get_workflow_version",
        "create_workflow_version",
        "restore_workflow_version",
        "delete_workflow_version"
      ])
    );
    expect(capabilityCategoryFor("list_workflow_versions")).toBe("read");
    expect(capabilityCategoryFor("get_workflow_version")).toBe("read");
    expect(capabilityCategoryFor("create_workflow_version")).toBe("write");
    expect(capabilityCategoryFor("restore_workflow_version")).toBe("write");
    expect(capabilityCategoryFor("delete_workflow_version")).toBe("write");
  });

  it("creates a manual snapshot and lists it", async () => {
    const wf = await makeWorkflow();

    const created = (await toolForCapabilityName("create_workflow_version").process(
      ctx(),
      { workflow_id: wf.id, name: "before the rewrite" }
    )) as { ok: boolean; version: number; save_type: string; name: string };
    expect(created).toMatchObject({
      ok: true,
      version: 1,
      save_type: "manual",
      name: "before the rewrite"
    });

    const listed = (await toolForCapabilityName("list_workflow_versions").process(
      ctx(),
      { workflow_id: wf.id }
    )) as { versions: Array<{ version: number; save_type: string }> };
    expect(listed.versions.map((v) => [v.version, v.save_type])).toEqual([
      [1, "manual"]
    ]);
  });

  it("reads one version's graph without restoring it", async () => {
    const wf = await makeWorkflow({ graph: graphWith("n1") });
    await toolForCapabilityName("create_workflow_version").process(ctx(), {
      workflow_id: wf.id,
      name: "the good one"
    });

    const result = (await toolForCapabilityName("get_workflow_version").process(
      ctx(),
      { workflow_id: wf.id, version: 1 }
    )) as {
      version: number;
      save_type: string;
      name: string;
      graph: { nodes: Array<{ id: string }> };
    };
    expect(result).toMatchObject({
      version: 1,
      save_type: "manual",
      name: "the good one"
    });
    expect(result.graph.nodes.map((n) => n.id)).toEqual(["n1"]);

    const after = (await Workflow.get(wf.id)) as Workflow;
    expect(after.updated_at).toBe(wf.updated_at);

    const missing = (await toolForCapabilityName("get_workflow_version").process(
      ctx(),
      { workflow_id: wf.id, version: 7 }
    )) as { error: string };
    expect(missing.error).toContain("no version 7");

    const otherUser = (await toolForCapabilityName("get_workflow_version").process(
      ctx("other"),
      { workflow_id: wf.id, version: 1 }
    )) as { error: string };
    expect(otherUser.error).toContain("was not found");
  });

  it("restores a version and snapshots the overwritten graph", async () => {
    const wf = await makeWorkflow({ graph: graphWith("n1") });
    await toolForCapabilityName("create_workflow_version").process(ctx(), {
      workflow_id: wf.id,
      name: "the good one"
    });

    const edited = (await Workflow.get(wf.id)) as Workflow;
    await Workflow.updateFieldsIfUnchanged(wf.id, edited.updated_at, {
      graph: graphWith("n2")
    });

    const result = (await toolForCapabilityName("restore_workflow_version").process(
      ctx(),
      { workflow_id: wf.id, version: 1 }
    )) as {
      ok: boolean;
      restored_version: number;
      undo_version: number;
      graph: { nodes: Array<{ id: string }> };
    };
    expect(result).toMatchObject({
      ok: true,
      restored_version: 1,
      undo_version: 2
    });
    expect(result.graph.nodes.map((n) => n.id)).toEqual(["n1"]);

    const restored = (await Workflow.get(wf.id)) as Workflow;
    expect(
      (restored.graph as { nodes: Array<{ id: string }> }).nodes.map((n) => n.id)
    ).toEqual(["n1"]);

    const undo = (await WorkflowVersion.findByVersion(wf.id, 2))!;
    expect(undo.save_type).toBe("restore");
    expect(undo.name).toBe("Before restore to v1");
    expect(
      (undo.graph as { nodes: Array<{ id: string }> }).nodes.map((n) => n.id)
    ).toEqual(["n2"]);
  });

  it("deletes a snapshot without changing the live graph", async () => {
    const wf = await makeWorkflow({ graph: graphWith("n1") });
    await toolForCapabilityName("create_workflow_version").process(ctx(), {
      workflow_id: wf.id
    });

    const result = (await toolForCapabilityName("delete_workflow_version").process(
      ctx(),
      { workflow_id: wf.id, version: 1 }
    )) as { ok: boolean; deleted_version: number };
    expect(result).toEqual({
      ok: true,
      workflow_id: wf.id,
      deleted_version: 1
    });

    const listed = (await toolForCapabilityName("list_workflow_versions").process(
      ctx(),
      { workflow_id: wf.id }
    )) as { versions: unknown[] };
    expect(listed.versions).toEqual([]);

    const live = (await Workflow.get(wf.id)) as Workflow;
    expect(
      (live.graph as { nodes: Array<{ id: string }> }).nodes.map((n) => n.id)
    ).toEqual(["n1"]);
  });

  it("refuses to restore a version the workflow does not have", async () => {
    const wf = await makeWorkflow();
    const result = (await toolForCapabilityName("restore_workflow_version").process(
      ctx(),
      { workflow_id: wf.id, version: 7 }
    )) as { error: string };
    expect(result.error).toContain("no version 7");
    expect(result.error).toContain("list_workflow_versions");
  });

  it("refuses to restore another user's workflow", async () => {
    const wf = await makeWorkflow();
    await toolForCapabilityName("create_workflow_version").process(ctx(), {
      workflow_id: wf.id
    });

    const result = (await toolForCapabilityName("restore_workflow_version").process(
      ctx("other"),
      { workflow_id: wf.id, version: 1 }
    )) as { error: string };
    expect(result.error).toContain("was not found");
  });
});
