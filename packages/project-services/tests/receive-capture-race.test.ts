/**
 * A project capture that meets a save of two of its documents (Y2, review
 * F29). On a real PostgreSQL server, since PGlite runs one transaction at a
 * time and cannot show the race. The capture is held after its first
 * document, while one transaction saves both.
 */
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import {
  closeDb,
  initPostgresDb,
  MigrationRunner,
  PostgresJsMigrationAdapter,
  Project,
  Workflow,
  withTransaction
} from "@nodetool-ai/models";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { PauseGate } from "@nodetool-ai/config/testing/pause-harness";
import { captureRevisionSet, type ReceiveHost } from "../src/cloud-receive.js";
import { identityHash, transferPayloadOf } from "../src/transfer-documents.js";
import { startPostgresServer, type PostgresServer } from "../../models/tests/helpers/postgres-server.js";

const OWNER = "user-owner";
const HELD = "receive.capture.document-held";
const LISTED = "receive.capture.members-listed";

function id(): string {
  return randomBytes(16).toString("hex");
}

describe("a project capture racing a save on PostgreSQL", { timeout: 120_000 }, () => {
  let pg: PostgresServer;
  const host: ReceiveHost = {
    storage: new InMemoryStorageAdapter(),
    async documentRole() {
      return "owner";
    },
    async readableFiles() {
      return [];
    }
  };
  let gate: PauseGate | null = null;

  beforeAll(async () => {
    pg = await startPostgresServer();
    const sql = postgres(pg.url, { max: 1, onnotice: () => {} });
    const adapter = new PostgresJsMigrationAdapter(sql);
    try {
      await new MigrationRunner(adapter).migrate();
    } finally {
      await adapter.release();
      await sql.end();
    }
    await initPostgresDb(pg.url);
  }, 120_000);

  afterEach(() => {
    gate?.uninstall();
    gate = null;
  });

  afterAll(async () => {
    await closeDb();
    await pg?.stop();
  });

  async function workflowIn(projectId: string, name: string): Promise<Workflow> {
    return Workflow.create<Workflow>({
      id: id(),
      user_id: OWNER,
      project_id: projectId,
      name,
      access: "private",
      description: "",
      tags: [],
      graph: { nodes: [], edges: [] },
      settings: null,
      run_mode: "workflow"
    });
  }

  it("captures both documents from before a save of both, or both from after (review F29)", async () => {
    const projectId = id();
    await Project.create<Project>({ id: projectId, user_id: OWNER, name: "Race", kind: "project" });
    const one = await workflowIn(projectId, "One");
    const two = await workflowIn(projectId, "Two");
    const before = new Map([
      [one.id, identityHash(await transferPayloadOf("workflow", one.id))],
      [two.id, identityHash(await transferPayloadOf("workflow", two.id))]
    ]);

    gate = new PauseGate([HELD]).install();
    const captured = captureRevisionSet(host, OWNER, { project_id: projectId });
    await gate.waitFor(HELD);
    // One save of both documents, as a transfer commit makes.
    const saved = withTransaction(async () => {
      for (const workflowId of [one.id, two.id]) {
        const workflow = await Workflow.get<Workflow>(workflowId);
        workflow!.graph = { nodes: [{ id: "n1", type: "nodetool.constant.String", data: { value: "after" } }], edges: [] };
        await workflow!.save();
      }
    });
    // Give the save time to commit, if nothing stops it.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    gate.release(HELD);
    await gate.waitFor(HELD, 2);
    gate.release(HELD);
    const set = await captured;
    await saved;

    const hashes = new Map(set.documents.map((document) => [document.document_id, document.content_hash]));
    expect(hashes).toEqual(before);
  });

  it("captures a document a commit adds together with the commit's other changes (review F47)", async () => {
    const projectId = id();
    await Project.create<Project>({ id: projectId, user_id: OWNER, name: "Members", kind: "project" });
    const one = await workflowIn(projectId, "One");
    const after = { nodes: [{ id: "n1", type: "nodetool.constant.String", data: { value: "after" } }], edges: [] };

    gate = new PauseGate([LISTED]).install();
    const captured = captureRevisionSet(host, OWNER, { project_id: projectId });
    await gate.waitFor(LISTED);
    // One commit changes the listed document and adds another, and stays
    // open until the capture waits on the changed document's row.
    let finish!: () => void;
    const held = new Promise<void>((resolve) => (finish = resolve));
    let changed!: () => void;
    const changedOne = new Promise<void>((resolve) => (changed = resolve));
    let added = "";
    const saved = withTransaction(async () => {
      const workflow = await Workflow.get<Workflow>(one.id);
      workflow!.graph = after;
      await workflow!.save();
      added = (await workflowIn(projectId, "Added")).id;
      changed();
      await held;
    });
    await changedOne;
    gate.release(LISTED);
    gate.uninstall();
    gate = null;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    finish();
    await saved;
    const set = await captured;

    const afterHash = identityHash(await transferPayloadOf("workflow", one.id));
    const hashes = new Map(set.documents.map((document) => [document.document_id, document.content_hash]));
    expect(hashes.get(one.id)).toBe(afterHash);
    expect(hashes.has(added)).toBe(true);
  });
});
