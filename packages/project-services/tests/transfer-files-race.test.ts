/**
 * Two transfers into one project that put the same path on the same base
 * (review F19). On a real PostgreSQL server, since PGlite runs one
 * transaction at a time and cannot show the race. The first commit is held
 * after it planned its files, while the second one starts.
 */
import { createHash, randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { closeDb, initPostgresDb, MigrationRunner, PostgresJsMigrationAdapter } from "@nodetool-ai/models";
import { createWorkspace, setProjectFolderResolver, type Workspace } from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { PauseGate } from "@nodetool-ai/config/testing/pause-harness";
import type { CommitTransferInput, TransferAttemptResult, TransferFileOperation } from "@nodetool-ai/protocol/api-schemas/transfer.js";
import { commitTransfer, openTransfer, stageTransferFile, type TransferHost } from "../src/cloud-transfer.js";
import { startPostgresServer, type PostgresServer } from "../../models/tests/helpers/postgres-server.js";

const OWNER = "user-owner";
const PLANNED = "transfer.commit.files-planned";
const encoder = new TextEncoder();

function id(): string {
  return randomBytes(16).toString("hex");
}

function sha(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("concurrent file transfers on PostgreSQL", { timeout: 120_000 }, () => {
  let pg: PostgresServer;
  const folders = new Map<string, Workspace>();
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
    setProjectFolderResolver(async (projectId) => {
      if (!projectId) return { ok: false, reason: "No project" };
      let workspace = folders.get(projectId);
      if (!workspace) {
        workspace = createWorkspace(new InMemoryStorageAdapter(), { prefix: `workspaces/${projectId}` });
        folders.set(projectId, workspace);
      }
      return { ok: true, projectId, workspace };
    });
  }, 120_000);

  afterEach(() => {
    gate?.uninstall();
    gate = null;
  });

  afterAll(async () => {
    setProjectFolderResolver(null);
    await closeDb();
    await pg?.stop();
  });

  async function send(
    projectId: string,
    firstPublication: boolean,
    operations: TransferFileOperation[],
    files: Uint8Array[]
  ): Promise<TransferAttemptResult> {
    const transferId = id();
    const manifest: CommitTransferInput["manifest"] = {
      project_name: "Files",
      operations: [],
      required_files: [],
      file_operations: operations,
      device_name: "Studio Mac"
    };
    const opened = await openTransfer(server, OWNER, {
      transfer_id: transferId,
      project_id: projectId,
      first_publication: firstPublication,
      manifest
    });
    for (const bytes of files) {
      if (!opened.needed_hashes.includes(sha(bytes))) continue;
      await stageTransferFile(server, OWNER, { transfer_id: transferId, hash: sha(bytes), size: bytes.byteLength, bytes });
    }
    return commitTransfer(server, OWNER, {
      transfer_id: transferId,
      attempt_id: id(),
      manifest,
      decisions: [],
      missing_files: [],
      payloads: []
    });
  }

  function put(path: string, bytes: Uint8Array, base: Uint8Array | null): TransferFileOperation {
    return { op: "put_workspace_file", path, hash: sha(bytes), size: bytes.byteLength, base_hash: base ? sha(base) : null };
  }

  it("keeps both files when a second transfer replaces the same base (review F19)", async () => {
    const projectId = id();
    const notes = encoder.encode("cloud notes");
    expect((await send(projectId, true, [put("notes.txt", notes, null)], [notes])).outcome).toBe("committed");

    const first = encoder.encode("first device");
    const second = encoder.encode("second device");
    gate = new PauseGate([PLANNED]).install();
    const one = send(projectId, false, [put("notes.txt", first, notes)], [first]);
    await gate.waitFor(PLANNED, 1);
    const two = send(projectId, false, [put("notes.txt", second, notes)], [second]);
    // Give the second commit time to reach its own plan, if nothing stops it.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    gate.release(PLANNED);
    await gate.waitFor(PLANNED, 2);
    gate.release(PLANNED);
    const results = await Promise.all([one, two]);

    expect(results.map((result) => result.outcome)).toEqual(["committed", "committed"]);
    const kept = results.map((result) => (result.outcome === "committed" ? (result.kept_beside ?? []) : []));
    expect(kept[0]).toEqual([]);
    expect(kept[1]).toHaveLength(1);
    expect(kept[1]?.[0]?.path).toBe("notes.txt");
  });
});
