import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelChangeEvent, ModelObserver } from "../src/base-model.js";
import { Asset } from "../src/asset.js";
import { ExternalIdentity } from "../src/external-identity.js";
import { Workflow } from "../src/workflow.js";
import { Storyboard, emptyStoryboardDocument } from "../src/storyboard.js";
import { closeDb, getDatabase, initPostgresDb, initTestDb } from "../src/db.js";

// Run real Drizzle Pg builders and transaction handles against a recording
// driver. No PostgreSQL server is available in this package's test harness.
const driver = vi.hoisted(() => {
  const state = {
    queries: [] as Array<{ sql: string; params: unknown[] }>,
    rows: [] as unknown[][]
  };
  const client = {
    options: { parsers: {}, serializers: {} },
    unsafe(sql: string, params: unknown[] = []) {
      state.queries.push({ sql, params });
      return Object.assign(Promise.resolve(state.rows), {
        values: async () => state.rows
      });
    },
    async begin<T>(callback: (transaction: typeof client) => Promise<T>): Promise<T> {
      return callback(client);
    },
    async end() {}
  };
  return { client, state };
});
vi.mock("postgres", () => ({ default: () => driver.client }));

beforeEach(async () => {
  await closeDb();
  driver.state.queries = [];
  driver.state.rows = [];
  ModelObserver.clear();
});
afterEach(async () => {
  await closeDb();
  ModelObserver.clear();
});

describe("explicit database dialect", () => {
  it("pairs the SQLite connection with SQLite schema declarations", () => {
    const db = initTestDb();
    const connection = getDatabase();
    expect(connection.dialect).toBe("sqlite");
    expect(connection.db).toBe(db);
  });

  it("guards project writes with an actual PostgreSQL transaction and FOR UPDATE", async () => {
    await initPostgresDb("postgres://unused/recording-driver");
    driver.state.rows = [[null]];
    const asset = await Asset.create<Asset>({ user_id: "owner", project_id: "project" });
    const [guard, insert] = driver.state.queries;
    expect(guard.sql).toMatch(/from "projects".*for update/);
    expect(guard.params).toContain("owner");
    expect(guard.params).toContain("project");
    expect(insert.sql).toMatch(/insert into "nodetool_assets"/);
    expect(asset.project_id).toBe("project");
  });

  it("rejects missing, foreign, and deleted projects before inserting or notifying", async () => {
    await initPostgresDb("postgres://unused/recording-driver");
    const events: ModelChangeEvent[] = [];
    ModelObserver.subscribe((_, event) => events.push(event));
    for (const rows of [[], [["2026-01-01T00:00:00.000Z"]]]) {
      driver.state.queries = [];
      driver.state.rows = rows;
      await expect(Asset.create<Asset>({ user_id: "owner", project_id: "foreign" }))
        .rejects.toThrow(rows.length ? "Project has been deleted" : "Project not found");
      expect(driver.state.queries).toHaveLength(1);
      expect(driver.state.queries[0].params).toContain("owner");
    }
    expect(events).toEqual([]);
  });

  it("preserves integer boolean encodings and JSON text on PostgreSQL writes", async () => {
    await initPostgresDb("postgres://unused/recording-driver");
    await Workflow.create<Workflow>({
      user_id: "owner", receive_clipboard: true,
      graph: { nodes: [], edges: [] }
    });
    const [insert] = driver.state.queries;
    expect(insert.params).toContain(1);
    expect(insert.params.some((value) => typeof value === "boolean")).toBe(false);
    expect(insert.params).toContain(JSON.stringify({ nodes: [], edges: [] }));
  });

  it("writes a model's serialized JSON text verbatim on PostgreSQL", async () => {
    await initPostgresDb("postgres://unused/recording-driver");
    const document = JSON.stringify(emptyStoryboardDocument());
    const board = await Storyboard.create<Storyboard>({ user_id: "owner", document });
    const [insert] = driver.state.queries;
    expect(insert.params).toContain(document);
    expect(insert.params).not.toContain(JSON.stringify(document));
    expect(board.toDocument().entityIds).toEqual([]);
  });

  it("preserves create, update, and delete observer sequences on PostgreSQL", async () => {
    await initPostgresDb("postgres://unused/recording-driver");
    const events: ModelChangeEvent[] = [];
    ModelObserver.subscribe((_, event) => events.push(event), "Asset");
    const asset = await Asset.create<Asset>({ user_id: "owner" });
    await asset.update({ name: "updated.png" });
    await asset.delete();
    expect(events).toEqual([
      ModelChangeEvent.CREATED, ModelChangeEvent.UPDATED, ModelChangeEvent.DELETED
    ]);
    expect(driver.state.queries.map(({ sql }) => sql.split(" ")[0]))
      .toEqual(["insert", "insert", "delete"]);
  });

  it("keeps metadata CAS owner-scoped and emits only after a successful write", async () => {
    await initPostgresDb("postgres://unused/recording-driver");
    const events: ModelChangeEvent[] = [];
    ModelObserver.subscribe((_, event) => events.push(event), "Asset");
    const asset = new Asset({ user_id: "owner", metadata: { label: "new" } });
    expect(await asset.saveIfMetadataMatches(null)).toBe(false);
    expect(events).toEqual([]);
    driver.state.rows = [[asset.id]];
    expect(await asset.saveIfMetadataMatches({ label: "old" })).toBe(true);
    expect(events).toEqual([ModelChangeEvent.UPDATED]);
    const [missing, matched] = driver.state.queries;
    expect(missing.sql).toContain('"nodetool_assets"."metadata" is null');
    expect(matched.params).toContain("owner");
    expect(matched.params).toContain(JSON.stringify({ label: "old" }));
    expect(matched.params).toContain(JSON.stringify({ label: "new" }));
  });

  it("uses owner guards and actual Pg schema in the selected model queries", async () => {
    await initPostgresDb("postgres://unused/recording-driver");
    expect(await Asset.find("owner", "missing")).toBeNull();
    expect(await ExternalIdentity.listForUser("owner")).toEqual([]);
    expect(await ExternalIdentity.findByExternal("telegram", "account")).toBeNull();
    expect(driver.state.queries[0].params).toEqual(["owner", "missing", 1]);
    expect(driver.state.queries[1].params).toEqual(["owner"]);
    expect(driver.state.queries[2].params).toEqual(["telegram", "account", 1]);
  });
});
