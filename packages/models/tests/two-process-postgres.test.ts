/**
 * The two-process rig (WP2.6): two server processes on one real PostgreSQL
 * instance. A process killed while it holds a row lock in a transaction
 * keeps the other one waiting until the kill, and the database then rolls
 * its work back. PGlite cannot show this, since it runs in one process.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPausableProcess } from "@nodetool-ai/config/testing/pause-harness";
import { startPostgresServer, type PostgresServer } from "./helpers/postgres-server.js";

const here = dirname(fileURLToPath(import.meta.url));
const CHILD = join(here, "fixtures", "row-lock-child.ts");
const REPO = resolve(here, "../../..");

function child(url: string, options: { pauseAt?: string; waitMs?: number } = {}) {
  return startPausableProcess({
    command: process.execPath,
    args: [
      "--conditions=nodetool-dev",
      "--import",
      "tsx",
      CHILD,
      url,
      ...(options.waitMs === undefined ? [] : ["--wait-ms", String(options.waitMs)])
    ],
    cwd: REPO,
    pauseAt: options.pauseAt
  });
}

describe("two server processes on one PostgreSQL instance", () => {
  let server: PostgresServer;
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    server = await startPostgresServer();
    sql = postgres(server.url, { max: 1, onnotice: () => {} });
    await sql`CREATE TABLE lock_target (id INTEGER PRIMARY KEY, writer INTEGER)`;
    await sql`INSERT INTO lock_target (id, writer) VALUES (1, NULL)`;
  }, 60_000);

  afterAll(async () => {
    await sql?.end({ timeout: 1 });
    await server?.stop();
  });

  it("holds a second process at a row lock until the first is killed, and rolls the first back", async () => {
    const holder = child(server.url, { pauseAt: "holding-row-lock" });
    expect(await holder.paused).toBe("holding-row-lock");
    expect(holder.output()).toContain("LOCKED");

    // While the holder is paused inside its transaction, the lock is taken.
    const blocked = child(server.url, { waitMs: 300 });
    await blocked.exited;
    expect(blocked.output()).toContain("LOCK_TIMEOUT");

    await holder.kill();
    // The killed transaction never committed its write.
    expect((await sql`SELECT writer FROM lock_target WHERE id = 1`)[0]?.writer).toBeNull();

    const next = child(server.url, { waitMs: 5000 });
    expect((await next.exited).code).toBe(0);
    expect(next.output()).toContain("COMMITTED");
    expect((await sql`SELECT writer FROM lock_target WHERE id = 1`)[0]?.writer).toBe(next.child.pid);
  }, 60_000);
});
