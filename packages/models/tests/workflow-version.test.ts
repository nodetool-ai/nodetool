import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setGlobalAdapterResolver, ModelObserver } from "../src/base-model.js";
import { MemoryAdapterFactory } from "../src/memory-adapter.js";
import { WorkflowVersion } from "../src/workflow-version.js";
import type { ModelClass } from "../src/base-model.js";

const factory = new MemoryAdapterFactory();

async function setup() {
  factory.clear();
  setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
  await (WorkflowVersion as unknown as ModelClass).createTable();
}

describe("WorkflowVersion model", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("creates with defaults", async () => {
    const ver = await (
      WorkflowVersion as unknown as ModelClass<WorkflowVersion>
    ).create({
      workflow_id: "wf1",
      user_id: "u1",
    });
    expect(ver.id).toBeTruthy();
    expect(ver.workflow_id).toBe("wf1");
    expect(ver.user_id).toBe("u1");
    expect(ver.name).toBeNull();
    expect(ver.description).toBeNull();
    expect(ver.graph).toEqual({ nodes: [], edges: [] });
    expect(ver.version).toBe(1);
    expect(ver.save_type).toBe("manual");
    expect(ver.autosave_metadata).toBeNull();
    expect(ver.created_at).toBeTruthy();
  });

  it("creates with explicit values", async () => {
    const graph = { nodes: [{ id: "n1" }], edges: [{ id: "e1" }] };
    const ver = await (
      WorkflowVersion as unknown as ModelClass<WorkflowVersion>
    ).create({
      workflow_id: "wf1",
      user_id: "u1",
      name: "v1 snapshot",
      description: "Initial version",
      graph,
      version: 5,
      save_type: "autosave",
      autosave_metadata: { trigger: "timer" },
    });

    expect(ver.name).toBe("v1 snapshot");
    expect(ver.description).toBe("Initial version");
    expect(ver.graph).toEqual(graph);
    expect(ver.version).toBe(5);
    expect(ver.save_type).toBe("autosave");
    expect(ver.autosave_metadata).toEqual({ trigger: "timer" });
  });

  // ── listForWorkflow ───────────────────────────────────────────────

  it("listForWorkflow returns versions newest first", async () => {
    for (let i = 1; i <= 5; i++) {
      await (
        WorkflowVersion as unknown as ModelClass<WorkflowVersion>
      ).create({
        workflow_id: "wf1",
        user_id: "u1",
        version: i,
      });
    }

    const versions = await WorkflowVersion.listForWorkflow("wf1");
    expect(versions).toHaveLength(5);
    expect(versions[0].version).toBe(5);
    expect(versions[4].version).toBe(1);
  });

  it("listForWorkflow respects limit", async () => {
    for (let i = 1; i <= 5; i++) {
      await (
        WorkflowVersion as unknown as ModelClass<WorkflowVersion>
      ).create({
        workflow_id: "wf1",
        user_id: "u1",
        version: i,
      });
    }

    const versions = await WorkflowVersion.listForWorkflow("wf1", {
      limit: 3,
    });
    expect(versions).toHaveLength(3);
    // Should return newest 3 versions
    expect(versions[0].version).toBe(5);
  });

  it("listForWorkflow scopes to workflow_id", async () => {
    await (
      WorkflowVersion as unknown as ModelClass<WorkflowVersion>
    ).create({
      workflow_id: "wf1",
      user_id: "u1",
      version: 1,
    });
    await (
      WorkflowVersion as unknown as ModelClass<WorkflowVersion>
    ).create({
      workflow_id: "wf2",
      user_id: "u1",
      version: 1,
    });

    const versions = await WorkflowVersion.listForWorkflow("wf1");
    expect(versions).toHaveLength(1);
    expect(versions[0].workflow_id).toBe("wf1");
  });

  it("listForWorkflow returns empty for nonexistent workflow", async () => {
    const versions = await WorkflowVersion.listForWorkflow("nonexistent");
    expect(versions).toHaveLength(0);
  });

  // ── findByVersion ─────────────────────────────────────────────────

  it("findByVersion returns specific version", async () => {
    for (let i = 1; i <= 3; i++) {
      await (
        WorkflowVersion as unknown as ModelClass<WorkflowVersion>
      ).create({
        workflow_id: "wf1",
        user_id: "u1",
        version: i,
        name: `Version ${i}`,
      });
    }

    const v2 = await WorkflowVersion.findByVersion("wf1", 2);
    expect(v2).not.toBeNull();
    expect(v2!.version).toBe(2);
    expect(v2!.name).toBe("Version 2");
  });

  it("findByVersion returns null for nonexistent version", async () => {
    await (
      WorkflowVersion as unknown as ModelClass<WorkflowVersion>
    ).create({
      workflow_id: "wf1",
      user_id: "u1",
      version: 1,
    });

    const result = await WorkflowVersion.findByVersion("wf1", 99);
    expect(result).toBeNull();
  });

  it("findByVersion returns null for wrong workflow", async () => {
    await (
      WorkflowVersion as unknown as ModelClass<WorkflowVersion>
    ).create({
      workflow_id: "wf1",
      user_id: "u1",
      version: 1,
    });

    const result = await WorkflowVersion.findByVersion("wf2", 1);
    expect(result).toBeNull();
  });

  // ── nextVersion ───────────────────────────────────────────────────

  it("nextVersion returns 1 when no versions exist", async () => {
    const next = await WorkflowVersion.nextVersion("wf-new");
    expect(next).toBe(1);
  });

  it("nextVersion returns max+1", async () => {
    for (let i = 1; i <= 3; i++) {
      await (
        WorkflowVersion as unknown as ModelClass<WorkflowVersion>
      ).create({
        workflow_id: "wf1",
        user_id: "u1",
        version: i,
      });
    }

    const next = await WorkflowVersion.nextVersion("wf1");
    expect(next).toBe(4);
  });

  // ── pruneOldVersions ─────────────────────────────────────────────

  it("pruneOldVersions deletes oldest versions beyond max", async () => {
    for (let i = 1; i <= 5; i++) {
      await (
        WorkflowVersion as unknown as ModelClass<WorkflowVersion>
      ).create({
        workflow_id: "wf1",
        user_id: "u1",
        version: i,
      });
    }

    await WorkflowVersion.pruneOldVersions("wf1", 3);

    const remaining = await WorkflowVersion.listForWorkflow("wf1");
    expect(remaining).toHaveLength(3);
    // Should keep newest 3: versions 5, 4, 3
    expect(remaining.map((v) => v.version)).toEqual([5, 4, 3]);
  });

  it("pruneOldVersions does nothing when under limit", async () => {
    for (let i = 1; i <= 2; i++) {
      await (
        WorkflowVersion as unknown as ModelClass<WorkflowVersion>
      ).create({
        workflow_id: "wf1",
        user_id: "u1",
        version: i,
      });
    }

    await WorkflowVersion.pruneOldVersions("wf1", 5);

    const remaining = await WorkflowVersion.listForWorkflow("wf1");
    expect(remaining).toHaveLength(2);
  });

  it("pruneOldVersions does nothing for empty workflow", async () => {
    // Should not throw
    await WorkflowVersion.pruneOldVersions("wf-nonexistent", 3);
    const remaining = await WorkflowVersion.listForWorkflow("wf-nonexistent");
    expect(remaining).toHaveLength(0);
  });

  // ── Graph round-trip ──────────────────────────────────────────────

  it("preserves complex graph through save/reload", async () => {
    const graph = {
      nodes: [
        { id: "n1", type: "text", data: { value: "hello" } },
        { id: "n2", type: "image", data: { url: "https://example.com/img.png" } },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2", sourceHandle: "output", targetHandle: "input" },
      ],
    };

    const ver = await (
      WorkflowVersion as unknown as ModelClass<WorkflowVersion>
    ).create({
      workflow_id: "wf1",
      user_id: "u1",
      graph,
      version: 1,
    });

    await ver.reload();
    expect(ver.graph).toEqual(graph);
  });
});
