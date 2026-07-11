/**
 * Tests for the WorkflowCollaborator and WorkflowShare models, and the
 * collaborator-aware Workflow.find read gate.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Workflow } from "../src/workflow.js";
import {
  WorkflowCollaborator,
  isCollaboratorRole
} from "../src/workflow-collaborator.js";
import { WorkflowShare } from "../src/workflow-share.js";

function setup() {
  initTestDb();
}

describe("WorkflowCollaborator model", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("creates with defaults", async () => {
    const grant = await WorkflowCollaborator.create<WorkflowCollaborator>({
      workflow_id: "wf1",
      user_id: "u2",
      invited_by: "u1"
    });
    expect(grant.id).toBeTruthy();
    expect(grant.role).toBe("viewer");
    expect(grant.created_at).toBeTruthy();
  });

  it("findFor returns the grant for (workflow, user)", async () => {
    await WorkflowCollaborator.create({
      workflow_id: "wf1",
      user_id: "u2",
      role: "editor",
      invited_by: "u1"
    });
    const found = await WorkflowCollaborator.findFor("wf1", "u2");
    expect(found?.role).toBe("editor");
    expect(await WorkflowCollaborator.findFor("wf1", "u3")).toBeNull();
    expect(await WorkflowCollaborator.findFor("wf2", "u2")).toBeNull();
  });

  it("upsert inserts once and updates the role in place", async () => {
    const first = await WorkflowCollaborator.upsert({
      workflowId: "wf1",
      userId: "u2",
      role: "viewer",
      invitedBy: "u1"
    });
    const second = await WorkflowCollaborator.upsert({
      workflowId: "wf1",
      userId: "u2",
      role: "editor",
      invitedBy: "u1"
    });
    expect(second.id).toBe(first.id);
    expect(second.role).toBe("editor");
    expect(await WorkflowCollaborator.listForWorkflow("wf1")).toHaveLength(1);
  });

  it("listForUser returns all grants for a user", async () => {
    await WorkflowCollaborator.create({
      workflow_id: "wf1",
      user_id: "u2",
      invited_by: "u1"
    });
    await WorkflowCollaborator.create({
      workflow_id: "wf2",
      user_id: "u2",
      role: "editor",
      invited_by: "u1"
    });
    await WorkflowCollaborator.create({
      workflow_id: "wf1",
      user_id: "u3",
      invited_by: "u1"
    });
    const grants = await WorkflowCollaborator.listForUser("u2");
    expect(grants.map((g) => g.workflow_id).sort()).toEqual(["wf1", "wf2"]);
  });

  it("remove deletes the grant and reports whether one existed", async () => {
    await WorkflowCollaborator.create({
      workflow_id: "wf1",
      user_id: "u2",
      invited_by: "u1"
    });
    expect(await WorkflowCollaborator.remove("wf1", "u2")).toBe(true);
    expect(await WorkflowCollaborator.remove("wf1", "u2")).toBe(false);
    expect(await WorkflowCollaborator.findFor("wf1", "u2")).toBeNull();
  });

  it("removeAllForWorkflow clears every grant on a workflow", async () => {
    await WorkflowCollaborator.create({
      workflow_id: "wf1",
      user_id: "u2",
      invited_by: "u1"
    });
    await WorkflowCollaborator.create({
      workflow_id: "wf1",
      user_id: "u3",
      invited_by: "u1"
    });
    await WorkflowCollaborator.removeAllForWorkflow("wf1");
    expect(await WorkflowCollaborator.listForWorkflow("wf1")).toHaveLength(0);
  });

  it("grantedWorkflowIds filters to granted ids", async () => {
    await WorkflowCollaborator.create({
      workflow_id: "wf1",
      user_id: "u2",
      invited_by: "u1"
    });
    const granted = await WorkflowCollaborator.grantedWorkflowIds("u2", [
      "wf1",
      "wf2"
    ]);
    expect(granted).toEqual(new Set(["wf1"]));
    expect(await WorkflowCollaborator.grantedWorkflowIds("u2", [])).toEqual(
      new Set()
    );
  });

  it("isCollaboratorRole narrows valid roles", () => {
    expect(isCollaboratorRole("viewer")).toBe(true);
    expect(isCollaboratorRole("editor")).toBe(true);
    expect(isCollaboratorRole("owner")).toBe(false);
    expect(isCollaboratorRole(null)).toBe(false);
  });
});

describe("WorkflowShare model", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("creates with a generated url-safe token", async () => {
    const share = await WorkflowShare.create<WorkflowShare>({
      workflow_id: "wf1",
      created_by: "u1"
    });
    expect(share.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(share.role).toBe("viewer");
    expect(share.isRevoked).toBe(false);
  });

  it("findByToken resolves the share", async () => {
    const share = await WorkflowShare.create<WorkflowShare>({
      workflow_id: "wf1",
      created_by: "u1"
    });
    const found = await WorkflowShare.findByToken(share.token);
    expect(found?.id).toBe(share.id);
    expect(await WorkflowShare.findByToken("missing")).toBeNull();
  });

  it("ensure reuses the active link per role and mints after revoke", async () => {
    const first = await WorkflowShare.ensure({
      workflowId: "wf1",
      role: "viewer",
      createdBy: "u1"
    });
    const again = await WorkflowShare.ensure({
      workflowId: "wf1",
      role: "viewer",
      createdBy: "u1"
    });
    expect(again.id).toBe(first.id);

    const editorLink = await WorkflowShare.ensure({
      workflowId: "wf1",
      role: "editor",
      createdBy: "u1"
    });
    expect(editorLink.id).not.toBe(first.id);

    await first.revoke();
    expect(first.isRevoked).toBe(true);
    const minted = await WorkflowShare.ensure({
      workflowId: "wf1",
      role: "viewer",
      createdBy: "u1"
    });
    expect(minted.id).not.toBe(first.id);
    // The revoked token no longer resolves as active but still exists.
    const stale = await WorkflowShare.findByToken(first.token);
    expect(stale?.isRevoked).toBe(true);
  });

  it("listForWorkflow returns active and revoked shares", async () => {
    const a = await WorkflowShare.create<WorkflowShare>({
      workflow_id: "wf1",
      created_by: "u1"
    });
    await a.revoke();
    await WorkflowShare.create({
      workflow_id: "wf1",
      role: "editor",
      created_by: "u1"
    });
    const shares = await WorkflowShare.listForWorkflow("wf1");
    expect(shares).toHaveLength(2);
  });

  it("removeAllForWorkflow deletes every share", async () => {
    await WorkflowShare.create({ workflow_id: "wf1", created_by: "u1" });
    await WorkflowShare.create({
      workflow_id: "wf1",
      role: "editor",
      created_by: "u1"
    });
    await WorkflowShare.removeAllForWorkflow("wf1");
    expect(await WorkflowShare.listForWorkflow("wf1")).toHaveLength(0);
  });
});

describe("Workflow.find with collaborator grants", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("grants read access to collaborators on private workflows", async () => {
    const wf = await Workflow.create<Workflow>({
      user_id: "owner",
      name: "Private WF",
      access: "private",
      graph: { nodes: [], edges: [] }
    });

    expect(await Workflow.find("stranger", wf.id)).toBeNull();

    await WorkflowCollaborator.upsert({
      workflowId: wf.id,
      userId: "stranger",
      role: "viewer",
      invitedBy: "owner"
    });
    const found = await Workflow.find("stranger", wf.id);
    expect(found?.id).toBe(wf.id);
  });
});
