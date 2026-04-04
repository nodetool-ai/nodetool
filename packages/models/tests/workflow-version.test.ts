/**
 * Tests for the WorkflowVersion model.
 *
 * Covers: defaults, listForWorkflow, findByVersion,
 * nextVersion, pruneOldVersions, and delete behaviour.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { WorkflowVersion } from "../src/workflow-version.js";

// ── Setup ────────────────────────────────────────────────────────────

function setup() {
  initTestDb();
}

// ── Helpers ─────────────────────────────────────────────────────────

async function createVersion(
  workflowId: string,
  userId: string,
  version: number,
  saveType = "manual"
): Promise<WorkflowVersion> {
  return WorkflowVersion.create<WorkflowVersion>({
    workflow_id: workflowId,
    user_id: userId,
    version,
    save_type: saveType
  });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("WorkflowVersion model", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("creates with defaults", async () => {
    const wv = await createVersion("wf1", "u1", 1);
    expect(wv.id).toBeTruthy();
    expect(wv.workflow_id).toBe("wf1");
    expect(wv.user_id).toBe("u1");
    expect(wv.version).toBe(1);
    expect(wv.save_type).toBe("manual");
    expect(wv.name).toBeNull();
    expect(wv.description).toBeNull();
    expect(wv.autosave_metadata).toBeNull();
    expect(wv.graph).toEqual({ nodes: [], edges: [] });
    expect(wv.created_at).toBeTruthy();
  });

  it("creates with explicit fields", async () => {
    const graph = { nodes: [{ id: "n1" }], edges: [] };
    const meta = { auto: true };
    const wv = await WorkflowVersion.create<WorkflowVersion>({
      workflow_id: "wf2",
      user_id: "u2",
      version: 3,
      save_type: "autosave",
      name: "v3 snapshot",
      description: "autosaved",
      graph,
      autosave_metadata: meta
    });
    expect(wv.name).toBe("v3 snapshot");
    expect(wv.description).toBe("autosaved");
    expect(wv.save_type).toBe("autosave");
    expect(wv.graph).toEqual(graph);
    expect(wv.autosave_metadata).toEqual(meta);
  });

  it("listForWorkflow returns versions newest-first", async () => {
    await createVersion("wf1", "u1", 1);
    await createVersion("wf1", "u1", 2);
    await createVersion("wf1", "u1", 3);

    const versions = await WorkflowVersion.listForWorkflow("wf1");
    expect(versions).toHaveLength(3);
    expect(versions[0].version).toBe(3);
    expect(versions[1].version).toBe(2);
    expect(versions[2].version).toBe(1);
  });

  it("listForWorkflow returns empty array for unknown workflow", async () => {
    const versions = await WorkflowVersion.listForWorkflow("unknown-wf");
    expect(versions).toHaveLength(0);
  });

  it("listForWorkflow respects limit option", async () => {
    await createVersion("wf1", "u1", 1);
    await createVersion("wf1", "u1", 2);
    await createVersion("wf1", "u1", 3);

    const versions = await WorkflowVersion.listForWorkflow("wf1", { limit: 2 });
    expect(versions).toHaveLength(2);
    // newest-first so v3, v2
    expect(versions[0].version).toBe(3);
    expect(versions[1].version).toBe(2);
  });

  it("listForWorkflow isolates by workflowId", async () => {
    await createVersion("wf1", "u1", 1);
    await createVersion("wf2", "u1", 1);

    const v1 = await WorkflowVersion.listForWorkflow("wf1");
    expect(v1).toHaveLength(1);
    const v2 = await WorkflowVersion.listForWorkflow("wf2");
    expect(v2).toHaveLength(1);
  });

  it("findByVersion returns matching version", async () => {
    await createVersion("wf1", "u1", 1);
    await createVersion("wf1", "u1", 2);

    const found = await WorkflowVersion.findByVersion("wf1", 1);
    expect(found).not.toBeNull();
    expect(found!.version).toBe(1);
    expect(found!.workflow_id).toBe("wf1");
  });

  it("findByVersion returns null for nonexistent version", async () => {
    await createVersion("wf1", "u1", 1);
    const found = await WorkflowVersion.findByVersion("wf1", 99);
    expect(found).toBeNull();
  });

  it("findByVersion returns null for unknown workflow", async () => {
    const found = await WorkflowVersion.findByVersion("nonexistent", 1);
    expect(found).toBeNull();
  });

  it("nextVersion returns 1 when no versions exist", async () => {
    const next = await WorkflowVersion.nextVersion("wf-new");
    expect(next).toBe(1);
  });

  it("nextVersion returns max+1 when versions exist", async () => {
    await createVersion("wf1", "u1", 1);
    await createVersion("wf1", "u1", 2);
    await createVersion("wf1", "u1", 5); // non-contiguous

    const next = await WorkflowVersion.nextVersion("wf1");
    expect(next).toBe(6);
  });

  it("pruneOldVersions does nothing when within limit", async () => {
    await createVersion("wf1", "u1", 1);
    await createVersion("wf1", "u1", 2);

    await WorkflowVersion.pruneOldVersions("wf1", 5);

    const versions = await WorkflowVersion.listForWorkflow("wf1");
    expect(versions).toHaveLength(2);
  });

  it("pruneOldVersions deletes oldest versions beyond maxVersions", async () => {
    await createVersion("wf1", "u1", 1);
    await createVersion("wf1", "u1", 2);
    await createVersion("wf1", "u1", 3);
    await createVersion("wf1", "u1", 4);
    await createVersion("wf1", "u1", 5);

    await WorkflowVersion.pruneOldVersions("wf1", 3);

    const remaining = await WorkflowVersion.listForWorkflow("wf1");
    expect(remaining).toHaveLength(3);
    // Only the 3 newest should remain
    const versionNumbers = remaining
      .map((v) => v.version)
      .sort((a, b) => b - a);
    expect(versionNumbers).toEqual([5, 4, 3]);
  });

  it("pruneOldVersions with maxVersions=0 deletes all", async () => {
    await createVersion("wf1", "u1", 1);
    await createVersion("wf1", "u1", 2);

    await WorkflowVersion.pruneOldVersions("wf1", 0);

    const remaining = await WorkflowVersion.listForWorkflow("wf1");
    expect(remaining).toHaveLength(0);
  });

  it("delete removes a version", async () => {
    const wv = await createVersion("wf1", "u1", 1);
    await wv.delete();

    const versions = await WorkflowVersion.listForWorkflow("wf1");
    expect(versions).toHaveLength(0);
  });
});
