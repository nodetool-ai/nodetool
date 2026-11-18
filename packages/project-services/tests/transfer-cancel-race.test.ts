/**
 * A cancel that meets a commit of the same transfer (review F28). On a real
 * PostgreSQL server, since PGlite runs one transaction at a time and cannot
 * show the race. The commit is held after it locked the transfer, while the
 * cancel starts.
 */
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { closeDb, getCloudTransfer, initPostgresDb, MigrationRunner, PostgresJsMigrationAdapter } from "@nodetool-ai/models";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { PauseGate } from "@nodetool-ai/config/testing/pause-harness";
import type { CommitTransferInput } from "@nodetool-ai/protocol/api-schemas/transfer.js";
import { cancelTransfer, commitTransfer, openTransfer, type TransferHost } from "../src/cloud-transfer.js";
import { identityHash } from "../src/transfer-documents.js";
import { startPostgresServer, type PostgresServer } from "../../models/tests/helpers/postgres-server.js";

const OWNER = "user-owner";
const LOCKED = "transfer.commit.locked";

function id(): string {
  return randomBytes(16).toString("hex");
}

describe("a cancel racing a commit on PostgreSQL", { timeout: 120_000 }, () => {
  let pg: PostgresServer;
  const server: TransferHost = {
    storage: new InMemoryStorageAdapter(),
    async documentRole() {
      return "owner";
    },
    async checkAttach() {
      return { unreadable: null, toAdmit: [] };
    },
    async published() {}
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

  it("answers with the commit's result and leaves the transfer committed (review F28)", async () => {
    const transferId = id();
    const workflowId = id();
    const document = { name: "Edit", description: "", tags: [], graph: { nodes: [], edges: [] }, settings: null, run_mode: "workflow" };
    const manifest: CommitTransferInput["manifest"] = {
      project_name: "Race",
      operations: [{ op: "create_document", kind: "workflow", document_id: workflowId, captured_hash: identityHash(document) }],
      required_files: []
    };
    await openTransfer(server, OWNER, { transfer_id: transferId, project_id: id(), first_publication: true, manifest });

    gate = new PauseGate([LOCKED]).install();
    const committed = commitTransfer(server, OWNER, {
      transfer_id: transferId,
      attempt_id: id(),
      manifest,
      decisions: [],
      missing_files: [],
      payloads: [{ kind: "workflow", document_id: workflowId, document }]
    });
    await gate.waitFor(LOCKED);
    const cancelled = cancelTransfer(OWNER, transferId);
    // Give the cancel time to write, if nothing stops it.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    gate.release(LOCKED);

    const result = await committed;
    expect(result.outcome).toBe("committed");
    expect(await cancelled).toEqual({ state: "committed", result });
    expect((await getCloudTransfer(transferId))?.state).toBe("committed");
  });
});
