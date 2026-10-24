import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeDb,
  initPostgresDb,
  getPostgresClient,
  migrations,
  PostgresJsMigrationAdapter,
  openResourceChangeChannel,
  resolveResourceChangeListenerUrl
} from "@nodetool-ai/models";
import {
  ResourceChangeBus,
  type ResourceChange
} from "../src/lib/resource-change-bus.js";

it("rejects transaction pooling before opening a listener", async () => {
  await expect(
    openResourceChangeChannel(
      "postgres://u:p@localhost:6543/db",
      vi.fn(),
      vi.fn()
    )
  ).rejects.toThrow(/DIRECT_URL/);
  expect(() =>
    resolveResourceChangeListenerUrl("postgres://u:p@localhost:6543/db")
  ).toThrow(/DIRECT_URL/);
  expect(() =>
    resolveResourceChangeListenerUrl(
      "postgres://localhost/db",
      "postgres://localhost:6543/db"
    )
  ).toThrow(/6543/);
  expect(
    resolveResourceChangeListenerUrl(
      "postgres://localhost:6543/db",
      "postgres://localhost:5432/db"
    )
  ).toBe("postgres://localhost:5432/db");
});

const url = process.env["NODETOOL_TEST_POSTGRES_URL"];
describe.skipIf(!url)("resource changes on real PostgreSQL", () => {
  const buses: ResourceChangeBus[] = [];
  let databaseName: string | undefined;
  afterEach(async () => {
    await Promise.all(buses.splice(0).map((bus) => bus.close()));
    await closeDb();
    if (url && databaseName) {
      await initPostgresDb(url);
      await getPostgresClient().unsafe(`DROP DATABASE ${databaseName}`);
      await closeDb();
      databaseName = undefined;
    }
  });

  it("delivers identical small and oversize events once across origins, then resyncs after reconnect", async () => {
    if (!url) {
      throw new Error("NODETOOL_TEST_POSTGRES_URL required");
    }
    await initPostgresDb(url);
    databaseName = `resource_changes_${randomBytes(6).toString("hex")}`;
    await getPostgresClient().unsafe(`CREATE DATABASE ${databaseName}`);
    await closeDb();
    const databaseUrl = new URL(url);
    databaseUrl.pathname = `/${databaseName}`;
    await initPostgresDb(databaseUrl.toString());
    const pool = getPostgresClient();
    const migration = migrations.find(
      (entry) => entry.name === "resource_change_outbox"
    );
    if (!migration) {
      throw new Error("Outbox migration missing");
    }
    const adapter = new PostgresJsMigrationAdapter(pool);
    await migration.up(adapter);
    await adapter.commit();
    await adapter.release();
    const one = new ResourceChangeBus("one");
    const two = new ResourceChangeBus("two");
    buses.push(one, two);
    const channelOne = await openResourceChangeChannel(
      databaseUrl.toString(),
      (message) => one.receive(message),
      () => one.resync()
    );
    const channelTwo = await openResourceChangeChannel(
      databaseUrl.toString(),
      (message) => two.receive(message),
      () => two.resync()
    );
    one.setTransport(channelOne);
    two.setTransport(channelTwo);
    const local = vi.fn();
    const remote = vi.fn();
    one.subscribe(local);
    two.subscribe(remote);
    const payload: ResourceChange = {
      event: "updated",
      resource_type: "timelinesequence",
      resource: { id: "a".repeat(32), etag: "etag" },
      owner_user_id: "A",
      ops: [
        { tool: "ui_update_clip", input: { clip_id: "clip", name: "small" } }
      ]
    };
    one.publish(payload);
    expect(local).toHaveBeenCalledExactlyOnceWith(payload);
    await vi.waitFor(() =>
      expect(remote).toHaveBeenCalledExactlyOnceWith(payload)
    );
    const large = {
      ...payload,
      ops: [
        {
          tool: "ui_update_clip",
          input: { clip_id: "clip", name: "🎬".repeat(4000) }
        }
      ]
    };
    one.publish(large);
    await vi.waitFor(() => expect(remote).toHaveBeenLastCalledWith(large));
    expect(local).toHaveBeenCalledTimes(2);
    expect(remote).toHaveBeenCalledTimes(2);
    const rows = await pool`SELECT payload FROM resource_change_outbox`;
    expect(
      rows.some(
        (row) =>
          JSON.parse(String(row.payload)).payload.ops[0].input.name ===
          large.ops[0]?.input.name
      )
    ).toBe(true);
    await pool`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND application_name = 'nodetool_resource_change' AND pid <> pg_backend_pid()`;
    await vi.waitFor(
      () => expect(remote).toHaveBeenCalledWith({ type: "resource_resync" }),
      { timeout: 10_000 }
    );
    remote.mockClear();
    local.mockClear();
    one.publish(payload);
    await vi.waitFor(() =>
      expect(remote).toHaveBeenCalledExactlyOnceWith(payload)
    );
    expect(local).toHaveBeenCalledExactlyOnceWith(payload);
    await channelOne.stopListening();
    remote.mockClear();
    one.publish(payload);
    await vi.waitFor(() =>
      expect(remote).toHaveBeenCalledExactlyOnceWith(payload)
    );
  });
});
