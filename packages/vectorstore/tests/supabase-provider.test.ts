import { describe, it, expect, beforeEach } from "vitest";
import {
  CollectionNotFoundError,
  ProviderConfigError,
  SupabaseProvider,
  UnsupportedFilterError,
  type EmbeddingFunction,
  type PgClient
} from "../src/index.js";

/**
 * Stub PgClient that records every executed query and returns canned
 * results for selected SQL fragments. The matching is intentionally
 * loose — match-by-substring is enough to drive the provider through
 * its branches without rebuilding the SQL parser.
 */
class FakePg implements PgClient {
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  private readonly handlers: Array<{
    match: RegExp | string;
    rows: (params: readonly unknown[]) => Record<string, unknown>[];
  }> = [];
  ended = false;

  on(
    match: RegExp | string,
    rows:
      | Record<string, unknown>[]
      | ((params: readonly unknown[]) => Record<string, unknown>[])
  ): this {
    const fn = typeof rows === "function" ? rows : () => rows;
    this.handlers.push({ match, rows: fn });
    return this;
  }

  async query<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    this.calls.push({ sql, params });
    for (const h of this.handlers) {
      const ok =
        typeof h.match === "string" ? sql.includes(h.match) : h.match.test(sql);
      if (ok) return h.rows(params) as T[];
    }
    return [];
  }

  async end(): Promise<void> {
    this.ended = true;
  }

  /** Find the first call whose SQL includes a substring. */
  find(match: string | RegExp): { sql: string; params: readonly unknown[] } {
    const c = this.calls.find((x) =>
      typeof match === "string" ? x.sql.includes(match) : match.test(x.sql)
    );
    if (!c) throw new Error(`No call matched: ${match}`);
    return c;
  }
}

const fakeEf: EmbeddingFunction = {
  async generate(texts) {
    return texts.map((t) => [t.length, t.charCodeAt(0) || 0, 1]);
  }
};

let pg: FakePg;
let provider: SupabaseProvider;

beforeEach(() => {
  pg = new FakePg();
  provider = new SupabaseProvider({ client: pg });
});

describe("SupabaseProvider — config", () => {
  it("requires databaseUrl when no client is injected", () => {
    expect(() => new SupabaseProvider({})).toThrow(ProviderConfigError);
  });

  it("identifies as supabase", () => {
    expect(provider.name).toBe("supabase");
  });

  it("rejects malformed collection names", async () => {
    await expect(
      provider.createCollection({ name: "bad name!" })
    ).rejects.toBeInstanceOf(ProviderConfigError);
    await expect(
      provider.getCollection({ name: "1leading-digit" })
    ).rejects.toBeInstanceOf(ProviderConfigError);
  });
});

describe("SupabaseProvider — schema bootstrap", () => {
  it("creates the vector extension and registry on first use", async () => {
    pg.on(/CREATE TABLE IF NOT EXISTS .*nodetool_vec_collections/i, []);
    pg.on(/INSERT INTO/, []);
    pg.on(/CREATE TABLE IF NOT EXISTS .*nodetool_vec_docs/i, []);

    await provider.createCollection({ name: "docs", dimension: 3 });

    const sqls = pg.calls.map((c) => c.sql);
    expect(sqls.some((s) => /CREATE EXTENSION IF NOT EXISTS vector/i.test(s))).toBe(
      true
    );
    expect(
      sqls.some((s) =>
        /CREATE TABLE IF NOT EXISTS "public"\."nodetool_vec_collections"/i.test(s)
      )
    ).toBe(true);
  });

  it("only initialises once per provider instance", async () => {
    pg.on(/INSERT INTO/, []);
    pg.on(/CREATE TABLE IF NOT EXISTS/, []);

    await provider.createCollection({ name: "a", dimension: 3 });
    await provider.createCollection({ name: "b", dimension: 3 });

    const extCalls = pg.calls.filter((c) =>
      /CREATE EXTENSION/i.test(c.sql)
    );
    expect(extCalls).toHaveLength(1);
  });
});

describe("SupabaseProvider — collection lifecycle", () => {
  it("createCollection writes to the registry and creates a per-collection table", async () => {
    pg.on(/INSERT INTO/, []);
    pg.on(/CREATE TABLE/, []);

    await provider.createCollection({
      name: "docs",
      dimension: 3,
      metadata: { embedding_model: "fake" },
      metric: "cosine"
    });

    const insert = pg.find("INSERT INTO");
    expect(insert.params[0]).toBe("docs");
    expect(insert.params[1]).toBe("nodetool_vec_docs");
    expect(JSON.parse(insert.params[2] as string).embedding_model).toBe("fake");
    expect(insert.params[3]).toBe(3);
    expect(insert.params[4]).toBe("cosine");

    const ddl = pg.find(/nodetool_vec_docs.*\(\s*\n?\s*id\s+text PRIMARY KEY/s);
    expect(ddl.sql).toContain("vector(3)");
  });

  it("getCollection throws CollectionNotFoundError when missing", async () => {
    pg.on(/SELECT name, table_name/, []);
    await expect(
      provider.getCollection({ name: "missing" })
    ).rejects.toBeInstanceOf(CollectionNotFoundError);
  });

  it("listCollections decodes registry rows", async () => {
    pg.on(/SELECT name, table_name/, [
      {
        name: "a",
        table_name: "nodetool_vec_a",
        metadata: { kind: "x" },
        dimension: 3,
        metric: "cosine"
      },
      {
        name: "b",
        table_name: "nodetool_vec_b",
        metadata: '{"kind":"y"}',
        dimension: null,
        metric: "l2"
      }
    ]);
    const cols = await provider.listCollections();
    expect(cols.map((c) => c.name)).toEqual(["a", "b"]);
    expect(cols[0].metadata.kind).toBe("x");
    expect(cols[0].dimension).toBe(3);
    expect(cols[1].metadata.kind).toBe("y");
    expect(cols[1].dimension).toBeUndefined();
  });

  it("deleteCollection drops the table and removes the registry row", async () => {
    pg.on(/SELECT name, table_name/, [
      {
        name: "docs",
        table_name: "nodetool_vec_docs",
        metadata: {},
        dimension: 3,
        metric: "cosine"
      }
    ]);
    pg.on(/DROP TABLE/, []);
    pg.on(/DELETE FROM/, []);

    await provider.deleteCollection("docs");

    expect(pg.calls.some((c) => /DROP TABLE.*nodetool_vec_docs/.test(c.sql))).toBe(
      true
    );
    expect(
      pg.calls.some((c) => /DELETE FROM.*nodetool_vec_collections/.test(c.sql))
    ).toBe(true);
  });
});

describe("SupabaseProvider — record operations", () => {
  function registryHandlerFor(state: {
    name: string;
    table_name: string;
    metadata?: Record<string, unknown>;
    dimension?: number | null;
    metric?: string;
  }) {
    return [
      {
        name: state.name,
        table_name: state.table_name,
        metadata: state.metadata ?? {},
        dimension: state.dimension ?? null,
        metric: state.metric ?? "cosine"
      }
    ];
  }

  it("upsert encodes embeddings as pgvector literals", async () => {
    pg.on(/SELECT name, table_name/, registryHandlerFor({
      name: "docs",
      table_name: "nodetool_vec_docs",
      dimension: 3
    }));
    pg.on(/INSERT INTO/, []);

    const col = await provider.getCollection({ name: "docs" });
    await col.upsert([
      { id: "1", document: "hi", embedding: [0.1, 0.2, 0.3], metadata: { k: "v" } }
    ]);

    const insert = pg.find("INSERT INTO \"public\".\"nodetool_vec_docs\"");
    // Params: id, document, embedding-literal, uri, metadata-json
    expect(insert.params[0]).toBe("1");
    expect(insert.params[1]).toBe("hi");
    expect(insert.params[2]).toBe("[0.1,0.2,0.3]");
    expect(insert.params[3]).toBeNull();
    expect(JSON.parse(insert.params[4] as string).k).toBe("v");
    expect(insert.sql).toContain("::vector");
    expect(insert.sql).toContain("ON CONFLICT (id) DO UPDATE");
  });

  it("upsert auto-generates embeddings via the embedding function", async () => {
    pg.on(/SELECT name, table_name/, registryHandlerFor({
      name: "docs",
      table_name: "nodetool_vec_docs",
      dimension: 3
    }));
    pg.on(/INSERT INTO/, []);

    const col = await provider.getCollection({
      name: "docs",
      embeddingFunction: fakeEf
    });
    await col.upsert([
      { id: "a", document: "alpha" },
      { id: "b", document: "beta" }
    ]);

    const insert = pg.find("INSERT INTO \"public\".\"nodetool_vec_docs\"");
    // 5 params per row × 2 rows = 10 params
    expect(insert.params).toHaveLength(10);
    // Param 2 is the first row's embedding literal.
    expect(insert.params[2]).toMatch(/^\[\d+,\d+,1\]$/);
  });

  it("upsert pins dimension on first embedding when registry says null", async () => {
    pg.on(/SELECT name, table_name/, registryHandlerFor({
      name: "docs",
      table_name: "nodetool_vec_docs",
      dimension: null
    }));
    pg.on(/UPDATE/, []);
    pg.on(/ALTER TABLE/, []);
    pg.on(/INSERT INTO/, []);

    const col = await provider.getCollection({ name: "docs" });
    await col.upsert([
      { id: "1", embedding: [1, 2, 3, 4] }
    ]);

    const update = pg.calls.find((c) =>
      /UPDATE[\s\S]*nodetool_vec_collections[\s\S]*SET dimension/.test(c.sql)
    );
    expect(update?.params[0]).toBe(4);

    const alter = pg.calls.find((c) => /ALTER TABLE/.test(c.sql));
    expect(alter?.sql).toContain("vector(4)");
  });

  it("query by embedding builds a pgvector ORDER BY", async () => {
    pg.on(/SELECT name, table_name/, registryHandlerFor({
      name: "docs",
      table_name: "nodetool_vec_docs",
      dimension: 3,
      metric: "cosine"
    }));
    pg.on(/SELECT id, document, uri, metadata,\s+embedding/, [
      {
        id: "a",
        document: "alpha",
        uri: "u",
        metadata: { k: "v" },
        distance: 0.123
      }
    ]);

    const col = await provider.getCollection({ name: "docs" });
    const matches = await col.query({ embedding: [0.1, 0.2, 0.3], topK: 5 });

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("a");
    expect(matches[0].uri).toBe("u");
    expect(matches[0].distance).toBe(0.123);

    const sel = pg.find(/embedding <=> \$1::vector AS distance/);
    expect(sel.sql).toContain("ORDER BY embedding <=> $1::vector");
    expect(sel.params[0]).toBe("[0.1,0.2,0.3]");
  });

  it("query supports L2 metric via <-> operator", async () => {
    pg.on(/SELECT name, table_name/, registryHandlerFor({
      name: "docs",
      table_name: "nodetool_vec_docs",
      dimension: 3,
      metric: "l2"
    }));
    pg.on(/SELECT id, document, uri, metadata/, []);

    const col = await provider.getCollection({ name: "docs" });
    await col.query({ embedding: [1, 2, 3], topK: 5 });

    const sel = pg.find(/embedding <-> \$1::vector AS distance/);
    expect(sel.sql).toContain("embedding <-> $1::vector");
  });

  it("query translates metadata equality filters", async () => {
    pg.on(/SELECT name, table_name/, registryHandlerFor({
      name: "docs",
      table_name: "nodetool_vec_docs",
      dimension: 3
    }));
    pg.on(/SELECT id, document, uri, metadata,\s+embedding/, []);

    const col = await provider.getCollection({ name: "docs" });
    await col.query({
      embedding: [1, 2, 3],
      filter: { kind: "greeting" }
    });

    const sel = pg.find(/embedding <=> \$1::vector AS distance/);
    expect(sel.sql).toMatch(/WHERE metadata->>\$2 = \$3/);
    // Param positions: $1 = vector literal, $2 = field name, $3 = value, $4 = limit
    expect(sel.params[1]).toBe("kind");
    expect(sel.params[2]).toBe("greeting");
  });

  it("query translates $in / $and / $document.$contains", async () => {
    pg.on(/SELECT name, table_name/, registryHandlerFor({
      name: "docs",
      table_name: "nodetool_vec_docs",
      dimension: 3
    }));
    pg.on(/SELECT id, document, uri, metadata,\s+embedding/, []);

    const col = await provider.getCollection({ name: "docs" });
    await col.query({
      embedding: [1, 2, 3],
      filter: {
        $and: [
          { kind: { $in: ["a", "b"] } },
          { $document: { $contains: "fox" } }
        ]
      }
    });

    const sel = pg.find(/embedding <=> \$1::vector AS distance/);
    expect(sel.sql).toMatch(/= ANY\(/);
    expect(sel.sql).toMatch(/document ILIKE/);
  });

  it("query rejects unknown operators loudly", async () => {
    pg.on(/SELECT name, table_name/, registryHandlerFor({
      name: "docs",
      table_name: "nodetool_vec_docs",
      dimension: 3
    }));

    const col = await provider.getCollection({ name: "docs" });
    await expect(
      col.query({
        embedding: [1, 2, 3],
        filter: { kind: { $weird: "x" } }
      })
    ).rejects.toBeInstanceOf(UnsupportedFilterError);
  });

  it("get fetches by ids and decodes metadata", async () => {
    pg.on(/SELECT name, table_name/, registryHandlerFor({
      name: "docs",
      table_name: "nodetool_vec_docs",
      dimension: 3
    }));
    pg.on(/SELECT id, document, uri, metadata FROM/, [
      {
        id: "1",
        document: "hi",
        uri: "u",
        metadata: { k: "v" }
      }
    ]);

    const col = await provider.getCollection({ name: "docs" });
    const recs = await col.get({ ids: ["1"] });
    expect(recs).toHaveLength(1);
    expect(recs[0].uri).toBe("u");
    expect(recs[0].metadata.k).toBe("v");

    const sel = pg.find(/SELECT id, document, uri, metadata FROM/);
    expect(sel.sql).toContain("id = ANY($1)");
  });

  it("count returns the integer count", async () => {
    pg.on(/SELECT name, table_name/, registryHandlerFor({
      name: "docs",
      table_name: "nodetool_vec_docs",
      dimension: 3
    }));
    pg.on(/count\(\*\)/, [{ count: 7 }]);

    const col = await provider.getCollection({ name: "docs" });
    expect(await col.count()).toBe(7);
  });

  it("delete issues DELETE WHERE id = ANY($1)", async () => {
    pg.on(/SELECT name, table_name/, registryHandlerFor({
      name: "docs",
      table_name: "nodetool_vec_docs",
      dimension: 3
    }));
    pg.on(/DELETE FROM/, []);

    const col = await provider.getCollection({ name: "docs" });
    await col.delete(["a", "b"]);

    const del = pg.find("DELETE FROM");
    expect(del.sql).toContain("id = ANY($1)");
    expect(del.params[0]).toEqual(["a", "b"]);
  });

  it("modify renames the table and refreshes the handle state", async () => {
    pg.on(/SELECT name, table_name/, registryHandlerFor({
      name: "before",
      table_name: "nodetool_vec_before",
      dimension: 3
    }));
    pg.on(/ALTER TABLE/, []);
    pg.on(/UPDATE/, []);

    const col = await provider.getCollection({ name: "before" });
    await col.modify({ name: "after", metadata: { v: 2 } });

    expect(col.name).toBe("after");
    expect(col.metadata.v).toBe(2);

    const alter = pg.find(/ALTER TABLE/);
    expect(alter.sql).toContain("RENAME TO");

    const updates = pg.calls.filter((c) => /UPDATE/.test(c.sql));
    // 1 for name+table_name change, 1 for metadata
    expect(updates.length).toBeGreaterThanOrEqual(2);
  });
});

describe("SupabaseProvider — close()", () => {
  it("does not end injected clients", async () => {
    await provider.close();
    expect(pg.ended).toBe(false);
  });
});
