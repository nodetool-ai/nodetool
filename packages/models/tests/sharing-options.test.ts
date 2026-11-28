/**
 * Link and invitation options, disabled links and a grant per link
 * (docs/plans/native-cloud-sync/technical-design.md, WP1.4), and the
 * migration that brings existing links and grants to them.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import {
  DocumentCollaborator,
  DocumentShare,
  SHARED_DOCUMENT_TYPES,
  removeDocumentSharing
} from "../src/document-sharing.js";
import { ShareRoleLimit } from "../src/share-role-limit.js";
import { WorkflowCollaborator } from "../src/workflow-collaborator.js";
import { WorkflowShare } from "../src/workflow-share.js";
import { DocumentRefs } from "../src/document-refs.js";
import {
  migrations,
  SQLiteMigrationAdapter
} from "../src/migrations/index.js";

const DOC = "d".repeat(32);
const WF = "f".repeat(32);

describe("document grants with options", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("keeps an invitation and a grant per redeemed link for one person", async () => {
    const view = await DocumentShare.ensure({
      documentType: "timeline",
      documentId: DOC,
      role: "viewer",
      createdBy: "owner"
    });
    await DocumentCollaborator.invite({
      documentType: "timeline",
      documentId: DOC,
      userId: "bob",
      role: "viewer",
      invitedBy: "owner",
      options: { allow_download: true }
    });
    const first = await DocumentCollaborator.redeem(view, "bob");
    const again = await DocumentCollaborator.redeem(view, "bob");

    expect(again.id).toBe(first.id);
    const grants = await DocumentCollaborator.listFor("timeline", DOC, "bob");
    expect(grants.map((g) => g.share_id).sort()).toEqual([null, view.id].sort());
    const invitation = await DocumentCollaborator.findInvitation(
      "timeline",
      DOC,
      "bob"
    );
    expect(invitation?.allow_download).toBe(true);
    expect(invitation?.allow_history).toBe(false);
    expect(first.allow_download).toBe(false);
  });

  it("findFor returns the highest grant", async () => {
    const edit = await DocumentShare.ensure({
      documentType: "timeline",
      documentId: DOC,
      role: "editor",
      createdBy: "owner"
    });
    await DocumentCollaborator.invite({
      documentType: "timeline",
      documentId: DOC,
      userId: "bob",
      role: "viewer",
      invitedBy: "owner"
    });
    await DocumentCollaborator.redeem(edit, "bob");
    expect(
      (await DocumentCollaborator.findFor("timeline", DOC, "bob"))?.role
    ).toBe("editor");
  });

  it("setRole and remove act on every grant of the person", async () => {
    const view = await DocumentShare.ensure({
      documentType: "timeline",
      documentId: DOC,
      role: "viewer",
      createdBy: "owner"
    });
    await DocumentCollaborator.invite({
      documentType: "timeline",
      documentId: DOC,
      userId: "bob",
      role: "viewer",
      invitedBy: "owner"
    });
    await DocumentCollaborator.redeem(view, "bob");
    await DocumentCollaborator.setRole("timeline", DOC, "bob", "editor");
    const grants = await DocumentCollaborator.listFor("timeline", DOC, "bob");
    expect(grants.map((g) => g.role)).toEqual(["editor", "editor"]);

    expect(await DocumentCollaborator.remove("timeline", DOC, "bob")).toBe(true);
    expect(await DocumentCollaborator.listFor("timeline", DOC, "bob")).toEqual([]);
  });

  it("a disabled link keeps its options and a new link is minted for the role", async () => {
    const view = await DocumentShare.ensure({
      documentType: "timeline",
      documentId: DOC,
      role: "viewer",
      createdBy: "owner"
    });
    await view.revoke();
    await view.setOptions({ allow_duplicate: true });

    const reread = (await DocumentShare.findByToken(view.token))!;
    expect(reread.isRevoked).toBe(true);
    expect(reread.disabled_at).not.toBeNull();
    expect(reread.revoked_at).toBe(reread.disabled_at);
    expect(reread.allow_duplicate).toBe(true);

    const next = await DocumentShare.ensure({
      documentType: "timeline",
      documentId: DOC,
      role: "viewer",
      createdBy: "owner"
    });
    expect(next.id).not.toBe(view.id);
  });

  it("refuses a second active link for a role (P4)", async () => {
    await DocumentShare.ensure({
      documentType: "timeline",
      documentId: DOC,
      role: "viewer",
      createdBy: "owner"
    });
    await expect(
      DocumentShare.create({
        document_type: "timeline",
        document_id: DOC,
        role: "viewer",
        created_by: "owner"
      })
    ).rejects.toThrow();
  });
});

describe("workflow grants with options", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("redeems a link into its own grant and keeps the invitation", async () => {
    const view = await WorkflowShare.ensure({
      workflowId: WF,
      role: "viewer",
      createdBy: "owner"
    });
    await WorkflowCollaborator.invite({
      workflowId: WF,
      userId: "bob",
      role: "editor",
      invitedBy: "owner"
    });
    await WorkflowCollaborator.redeem(view, "bob");
    const grants = await WorkflowCollaborator.listFor(WF, "bob");
    expect(grants).toHaveLength(2);
    expect((await WorkflowCollaborator.findFor(WF, "bob"))?.role).toBe("editor");
  });

  it("never redeems a public link", async () => {
    const pub = await WorkflowShare.ensure({
      workflowId: WF,
      role: "public",
      createdBy: "owner"
    });
    await expect(WorkflowCollaborator.redeem(pub, "bob")).rejects.toThrow();
  });
});

describe("owner's role limit on link redemptions", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it.each(SHARED_DOCUMENT_TYPES)(
    "holds the owner's demotion and removal on a %s",
    async (kind) => {
      const edit = await DocumentShare.ensure({
        documentType: kind,
        documentId: DOC,
        role: "editor",
        createdBy: "owner"
      });
      await DocumentCollaborator.redeem(edit, "bob");
      await DocumentCollaborator.setRole(kind, DOC, "bob", "viewer", "owner");
      // Leaving on one's own keeps the owner's limit.
      await DocumentCollaborator.remove(kind, DOC, "bob", "bob");
      expect((await DocumentCollaborator.redeem(edit, "bob"))?.role).toBe(
        "viewer"
      );

      await DocumentCollaborator.remove(kind, DOC, "bob", "owner");
      expect(await DocumentCollaborator.redeem(edit, "bob")).toBeNull();
      expect(await DocumentCollaborator.listFor(kind, DOC, "bob")).toEqual([]);

      await DocumentCollaborator.invite({
        documentType: kind,
        documentId: DOC,
        userId: "bob",
        role: "viewer",
        invitedBy: "owner"
      });
      expect((await DocumentCollaborator.redeem(edit, "bob"))?.role).toBe(
        "editor"
      );
    }
  );

  it("sets no limit when a person leaves on their own", async () => {
    const edit = await DocumentShare.ensure({
      documentType: "timeline",
      documentId: DOC,
      role: "editor",
      createdBy: "owner"
    });
    await DocumentCollaborator.redeem(edit, "bob");
    await DocumentCollaborator.remove("timeline", DOC, "bob", "bob");
    expect(await ShareRoleLimit.find("timeline", DOC, "bob")).toBeNull();
    expect((await DocumentCollaborator.redeem(edit, "bob"))?.role).toBe(
      "editor"
    );
  });

  it("keeps the limit when only an invitation's options change", async () => {
    await DocumentCollaborator.invite({
      documentType: "timeline",
      documentId: DOC,
      userId: "bob",
      role: "editor",
      invitedBy: "owner"
    });
    await DocumentCollaborator.setRole("timeline", DOC, "bob", "viewer", "owner");
    await DocumentCollaborator.invite({
      documentType: "timeline",
      documentId: DOC,
      userId: "bob",
      role: "viewer",
      invitedBy: "owner",
      options: { allow_download: true },
      keepRoleLimit: true
    });
    expect((await ShareRoleLimit.find("timeline", DOC, "bob"))?.role).toBe(
      "viewer"
    );
  });

  it("deletes the limits with the document's sharing", async () => {
    await ShareRoleLimit.set({
      documentType: "script",
      documentId: DOC,
      userId: "bob",
      role: null,
      setBy: "owner"
    });
    await removeDocumentSharing("script", DOC);
    expect(await ShareRoleLimit.find("script", DOC, "bob")).toBeNull();
  });

  it("holds the owner's demotion and removal on a workflow", async () => {
    const edit = await WorkflowShare.ensure({
      workflowId: WF,
      role: "editor",
      createdBy: "owner"
    });
    await WorkflowCollaborator.redeem(edit, "bob");
    await WorkflowCollaborator.setRole(WF, "bob", "viewer", "owner");
    await WorkflowCollaborator.remove(WF, "bob", "bob");
    expect((await WorkflowCollaborator.redeem(edit, "bob"))?.role).toBe(
      "viewer"
    );

    await WorkflowCollaborator.remove(WF, "bob", "owner");
    expect(await WorkflowCollaborator.redeem(edit, "bob")).toBeNull();

    await WorkflowCollaborator.setRole(WF, "bob", "editor", "owner");
    // No grant was left to set a role on, so the limit stays.
    expect(await WorkflowCollaborator.redeem(edit, "bob")).toBeNull();

    await WorkflowCollaborator.invite({
      workflowId: WF,
      userId: "bob",
      role: "viewer",
      invitedBy: "owner"
    });
    expect((await WorkflowCollaborator.redeem(edit, "bob"))?.role).toBe(
      "editor"
    );

    await WorkflowCollaborator.remove(WF, "bob", "owner");
    await WorkflowCollaborator.removeAllForWorkflow(WF);
    expect(await ShareRoleLimit.find("workflow", WF, "bob")).toBeNull();
  });
});

describe("DocumentRefs", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("replaces a set and answers by scope", async () => {
    await DocumentRefs.writeSet("timeline", DOC, "", "h1", {
      viewer: ["a", "b"],
      editor: ["a", "b"]
    });
    await DocumentRefs.writeSet("timeline", DOC, "", "h2", {
      viewer: ["b"],
      editor: ["b"]
    });
    await DocumentRefs.writeSet("timeline", DOC, "v1", "h0", {
      version_viewer: ["a"],
      version_editor: ["a"]
    });

    expect(await DocumentRefs.filesOf("timeline", DOC, "viewer", "")).toEqual(["b"]);
    expect(await DocumentRefs.contains("timeline", DOC, "a", ["viewer"], "")).toBe(false);
    expect(
      await DocumentRefs.contains("timeline", DOC, "a", ["version_viewer"], "")
    ).toBe(true);
    expect(await DocumentRefs.listSets("timeline", DOC)).toEqual(
      expect.arrayContaining([
        { versionId: "", contentHash: "h2" },
        { versionId: "v1", contentHash: "h0" }
      ])
    );
    expect(await DocumentRefs.documentsWithFile("timeline", "a")).toEqual([DOC]);

    await DocumentRefs.removeSet("timeline", DOC, "v1");
    expect(await DocumentRefs.documentsWithFile("timeline", "a")).toEqual([]);

    await DocumentRefs.admit("timeline", DOC, ["x", "x"]);
    expect([...(await DocumentRefs.admitted("timeline", DOC))]).toEqual(["x"]);

    await DocumentRefs.removeForDocument("timeline", DOC);
    expect(await DocumentRefs.listSets("timeline", DOC)).toEqual([]);
    expect((await DocumentRefs.admitted("timeline", DOC)).size).toBe(0);
  });
});

describe("add_sharing_options_and_document_refs migration", () => {
  const migration = migrations.find(
    (m) => m.name === "add_sharing_options_and_document_refs"
  );

  async function legacyDatabase(): Promise<SQLiteMigrationAdapter> {
    const adapter = new SQLiteMigrationAdapter(new Database(":memory:"));
    await adapter.execute(`CREATE TABLE nodetool_document_collaborators (
      id TEXT PRIMARY KEY NOT NULL, document_type TEXT NOT NULL,
      document_id TEXT NOT NULL, user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer', invited_by TEXT NOT NULL,
      created_at TEXT NOT NULL)`);
    await adapter.execute(`CREATE UNIQUE INDEX idx_dcol_document_user
      ON nodetool_document_collaborators (document_type, document_id, user_id)`);
    await adapter.execute(`CREATE TABLE nodetool_document_shares (
      id TEXT PRIMARY KEY NOT NULL, document_type TEXT NOT NULL,
      document_id TEXT NOT NULL, token TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer', created_by TEXT NOT NULL,
      created_at TEXT NOT NULL, revoked_at TEXT)`);
    await adapter.execute(`CREATE TABLE nodetool_workflow_collaborators (
      id TEXT PRIMARY KEY NOT NULL, workflow_id TEXT NOT NULL,
      user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer',
      invited_by TEXT NOT NULL, created_at TEXT NOT NULL)`);
    await adapter.execute(`CREATE UNIQUE INDEX idx_wcol_workflow_user
      ON nodetool_workflow_collaborators (workflow_id, user_id)`);
    await adapter.execute(`CREATE TABLE nodetool_workflow_shares (
      id TEXT PRIMARY KEY NOT NULL, workflow_id TEXT NOT NULL,
      token TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer',
      created_by TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT)`);
    return adapter;
  }

  it("turns every option off, carries revocations over and keeps one active link per role", async () => {
    expect(migration).toBeDefined();
    const adapter = await legacyDatabase();
    const insertShare = `INSERT INTO nodetool_document_shares
      (id, document_type, document_id, token, role, created_by, created_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, 'owner', ?, ?)`;
    await adapter.execute(insertShare, ["old", "timeline", DOC, "t1", "viewer", "2026-01-01", null]);
    await adapter.execute(insertShare, ["new", "timeline", DOC, "t2", "viewer", "2026-02-01", null]);
    await adapter.execute(insertShare, ["gone", "timeline", DOC, "t3", "editor", "2026-01-01", "2026-03-01"]);
    await adapter.execute(insertShare, ["sketch", "sketch", DOC, "t4", "viewer", "2026-01-01", null]);
    await adapter.execute(
      `INSERT INTO nodetool_workflow_shares
        (id, workflow_id, token, role, created_by, created_at, revoked_at)
        VALUES ('w1', ?, 'tw', 'viewer', 'owner', '2026-01-01', NULL)`,
      [WF]
    );
    await adapter.execute(
      `INSERT INTO nodetool_document_collaborators
        (id, document_type, document_id, user_id, role, invited_by, created_at)
        VALUES ('g1', 'timeline', ?, 'bob', 'viewer', 'owner', '2026-01-01')`,
      [DOC]
    );

    await migration!.up(adapter);
    await migration!.up(adapter);

    const shares = await adapter.fetchall(
      `SELECT id, disabled_at, revoked_at, allow_history, allow_download,
              allow_duplicate, owner_notice
         FROM nodetool_document_shares ORDER BY id`
    );
    const byId = Object.fromEntries(shares.map((r) => [r.id, r]));
    // The older of two active view links is disabled, the newer stays.
    expect(byId.old.disabled_at).not.toBeNull();
    expect(byId.old.owner_notice).toBeNull();
    expect(byId.new.disabled_at).toBeNull();
    expect(byId.new.owner_notice).toBe("history_off");
    expect(byId.gone.disabled_at).toBe("2026-03-01");
    // Only timeline view links lose history, so only they carry the notice.
    expect(byId.sketch.owner_notice).toBeNull();
    for (const row of shares) {
      expect([row.allow_history, row.allow_download, row.allow_duplicate]).toEqual([0, 0, 0]);
    }

    const grant = await adapter.fetchone(
      `SELECT share_id, allow_history FROM nodetool_document_collaborators`
    );
    expect(grant).toEqual({ share_id: null, allow_history: 0 });

    // The new indexes hold: a second invitation for bob fails, a link grant
    // beside it does not, and a second active view link fails.
    await expect(
      adapter.execute(
        `INSERT INTO nodetool_document_collaborators
          (id, document_type, document_id, user_id, role, invited_by, created_at)
          VALUES ('g2', 'timeline', ?, 'bob', 'viewer', 'owner', '2026-01-02')`,
        [DOC]
      )
    ).rejects.toThrow();
    await adapter.execute(
      `INSERT INTO nodetool_document_collaborators
        (id, document_type, document_id, user_id, role, invited_by, created_at, share_id)
        VALUES ('g3', 'timeline', ?, 'bob', 'viewer', 'owner', '2026-01-02', 'new')`,
      [DOC]
    );
    await expect(adapter.execute(insertShare, ["dup", "timeline", DOC, "t5", "viewer", "2026-04-01", null])).rejects.toThrow();

    expect(await adapter.tableExists("nodetool_document_refs")).toBe(true);
    expect(await adapter.tableExists("nodetool_document_ref_sets")).toBe(true);
    expect(await adapter.tableExists("nodetool_document_admitted_files")).toBe(true);
  });
});
