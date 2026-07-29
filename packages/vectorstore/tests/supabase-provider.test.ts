import { describe, it, expect, beforeEach } from "vitest";
import {
  CollectionNotFoundError,
  ProviderConfigError,
  SupabaseProvider,
  UnsupportedFilterError,
  type EmbeddingFunction,
  type PostgrestClientApi
} from "../src/index.js";

// ---------------------------------------------------------------------------
// FakeSupabase — a record-and-replay stand-in for @supabase/supabase-js.
//
// Real supabase-js exposes a fluent query builder where every chainable
// call returns the same builder, and the builder is itself a thenable
// whose `then` resolves to `{data, error, count?}`. We fake just enough
// of that shape to drive SupabaseProvider through every branch we use.
// ---------------------------------------------------------------------------

interface Call {
  table?: string;
  rpc?: string;
  op:
    | "select"
    | "insert"
    | "upsert"
    | "update"
    | "delete"
    | "rpc";
  args: unknown;
  filters: Array<[string, string, unknown]>;
  options: Record<string, unknown>;
  result?: { data: unknown; error: unknown; count?: number };
}

type Resolver = (call: Call) => {
  data: unknown;
  error?: { message: string } | null;
  count?: number;
};

class FakeSupabase {
  readonly calls: Call[] = [];
  private resolvers: Array<{
    match: (c: Call) => boolean;
    resolve: Resolver;
  }> = [];

  on(match: (c: Call) => boolean, resolve: Resolver | { data: unknown; error?: unknown; count?: number }): this {
    const fn: Resolver =
      typeof resolve === "function"
        ? resolve
        : () => ({
            data: resolve.data,
            error: (resolve.error ?? null) as { message: string } | null,
            count: resolve.count
          });
    this.resolvers.push({ match, resolve: fn });
    return this;
  }

  from(table: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this, table);
  }

  rpc(name: string, args: unknown): Thenable {
    const call: Call = {
      rpc: name,
      op: "rpc",
      args,
      filters: [],
      options: {}
    };
    this.calls.push(call);
    return makeThenable(call, this.resolvers);
  }

  // No-op pieces of the real client.
  schema(): FakeSupabase {
    return this;
  }

  find(filter: (c: Call) => boolean): Call {
    const c = this.calls.find(filter);
    if (!c) throw new Error("No call matched");
    return c;
  }

  asSupabase(): PostgrestClientApi {
    return this as unknown as PostgrestClientApi;
  }
}

interface Thenable {
  then<T>(
    onFulfilled?: (v: { data: unknown; error: unknown; count?: number }) => T
  ): Promise<T>;
}

function makeThenable(
  call: Call,
  resolvers: Array<{ match: (c: Call) => boolean; resolve: Resolver }>
): Thenable {
  return {
    then(onFulfilled) {
      for (const r of resolvers) {
        if (r.match(call)) {
          const res = r.resolve(call);
          const out = {
            data: res.data,
            error: res.error ?? null,
            count: res.count
          };
          call.result = out;
          return Promise.resolve(out).then(onFulfilled);
        }
      }
      const out = { data: null, error: null, count: 0 };
      call.result = out;
      return Promise.resolve(out).then(onFulfilled);
    }
  };
}

class FakeQueryBuilder {
  private call: Call;
  constructor(
    private readonly fake: FakeSupabase,
    table: string
  ) {
    this.call = {
      table,
      op: "select",
      args: undefined,
      filters: [],
      options: {}
    };
    this.fake.calls.push(this.call);
  }

  select(cols: string, opts?: Record<string, unknown>): this {
    this.call.op = "select";
    this.call.args = cols;
    if (opts) Object.assign(this.call.options, opts);
    return this;
  }

  insert(values: unknown): this {
    this.call.op = "insert";
    this.call.args = values;
    return this;
  }

  upsert(values: unknown, opts?: Record<string, unknown>): this {
    this.call.op = "upsert";
    this.call.args = values;
    if (opts) Object.assign(this.call.options, opts);
    return this;
  }

  update(values: unknown): this {
    this.call.op = "update";
    this.call.args = values;
    return this;
  }

  delete(): this {
    this.call.op = "delete";
    return this;
  }

  eq(field: string, value: unknown): this {
    this.call.filters.push(["eq", field, value]);
    return this;
  }

  in(field: string, values: unknown): this {
    this.call.filters.push(["in", field, values]);
    return this;
  }

  is(field: string, value: unknown): this {
    this.call.filters.push(["is", field, value]);
    return this;
  }

  ilike(field: string, value: unknown): this {
    this.call.filters.push(["ilike", field, value]);
    return this;
  }

  contains(field: string, value: unknown): this {
    this.call.filters.push(["contains", field, value]);
    return this;
  }

  match(value: unknown): this {
    this.call.filters.push(["match", "*", value]);
    return this;
  }

  order(col: string): this {
    this.call.options.order = col;
    return this;
  }

  limit(n: number): this {
    this.call.options.limit = n;
    return this;
  }

  range(from: number, to: number): this {
    this.call.options.range = [from, to];
    return this;
  }

  single(): Thenable {
    this.call.options.single = true;
    return this.thenable();
  }

  maybeSingle(): Thenable {
    this.call.options.maybeSingle = true;
    return this.thenable();
  }

  private thenable(): Thenable {
    return makeThenable(this.call, this.fake["resolvers"]);
  }

  then<T>(
    onFulfilled?: (v: { data: unknown; error: unknown; count?: number }) => T
  ): Promise<T> {
    return this.thenable().then(onFulfilled);
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function registryRow(over: Partial<{
  name: string;
  metadata: unknown;
  dimension: number | null;
  metric: string;
}> = {}) {
  return {
    name: over.name ?? "docs",
    metadata: over.metadata ?? {},
    dimension: over.dimension === undefined ? 3 : over.dimension,
    metric: over.metric ?? "cosine"
  };
}

function isSelectFromRegistry(c: Call): boolean {
  return (
    c.table === "nodetool_vec_collections" &&
    c.op === "select"
  );
}

function isMaybeSingleRegistry(c: Call): boolean {
  return isSelectFromRegistry(c) && c.options.maybeSingle === true;
}

const fakeEf: EmbeddingFunction = {
  async generate(texts) {
    return texts.map((t) => [t.length, t.charCodeAt(0) || 0, 1]);
  }
};

let fake: FakeSupabase;
let provider: SupabaseProvider;

beforeEach(() => {
  fake = new FakeSupabase();
  provider = new SupabaseProvider({ client: fake.asSupabase() });
});

// ---------------------------------------------------------------------------

describe("SupabaseProvider — config", () => {
  it("requires url+apiKey or a pre-built client", () => {
    expect(() => new SupabaseProvider({})).toThrow(ProviderConfigError);
    expect(() => new SupabaseProvider({ url: "https://x" })).toThrow(
      ProviderConfigError
    );
  });

  it("identifies as supabase", () => {
    expect(provider.name).toBe("supabase");
  });
});

describe("SupabaseProvider — collection lifecycle", () => {
  it("createCollection inserts into the registry table", async () => {
    fake.on(
      (c) => c.table === "nodetool_vec_collections" && c.op === "insert",
      { data: null, error: null }
    );

    await provider.createCollection({
      name: "docs",
      dimension: 3,
      metadata: { embedding_model: "fake" },
      metric: "cosine"
    });

    const insert = fake.find(
      (c) => c.table === "nodetool_vec_collections" && c.op === "insert"
    );
    expect(insert.args).toMatchObject({
      name: "docs",
      dimension: 3,
      metric: "cosine",
      metadata: { embedding_model: "fake" }
    });
  });

  it("getCollection throws CollectionNotFoundError when missing", async () => {
    fake.on(isMaybeSingleRegistry, { data: null, error: null });
    await expect(
      provider.getCollection({ name: "missing" })
    ).rejects.toBeInstanceOf(CollectionNotFoundError);
  });

  it("listCollections decodes registry rows", async () => {
    fake.on(
      (c) => isSelectFromRegistry(c) && c.options.order === "name",
      {
        data: [
          {
            name: "a",
            metadata: { kind: "x" },
            dimension: 3
          },
          {
            name: "b",
            metadata: '{"kind":"y"}',
            dimension: null
          }
        ],
        error: null
      }
    );

    const cols = await provider.listCollections();
    expect(cols.map((c) => c.name)).toEqual(["a", "b"]);
    expect(cols[0].metadata.kind).toBe("x");
    expect(cols[0].dimension).toBe(3);
    expect(cols[1].metadata.kind).toBe("y");
    expect(cols[1].dimension).toBeUndefined();
  });

  it("deleteCollection removes the registry row (FK cascades records)", async () => {
    fake.on(isMaybeSingleRegistry, {
      data: registryRow({ name: "docs" }),
      error: null
    });
    fake.on(
      (c) => c.table === "nodetool_vec_collections" && c.op === "delete",
      { data: null, error: null }
    );

    await provider.deleteCollection("docs");

    const del = fake.find(
      (c) => c.table === "nodetool_vec_collections" && c.op === "delete"
    );
    expect(del.filters).toContainEqual(["eq", "name", "docs"]);
  });
});

describe("SupabaseProvider — record operations", () => {
  beforeEach(() => {
    fake.on(isMaybeSingleRegistry, { data: registryRow(), error: null });
  });

  it("upsert encodes embeddings as pgvector text literals", async () => {
    fake.on(
      (c) => c.table === "nodetool_vec_records" && c.op === "upsert",
      { data: null, error: null }
    );

    const col = await provider.getCollection({ name: "docs" });
    await col.upsert([
      {
        id: "1",
        document: "hi",
        embedding: [0.1, 0.2, 0.3],
        metadata: { k: "v" }
      }
    ]);

    const upsert = fake.find(
      (c) => c.table === "nodetool_vec_records" && c.op === "upsert"
    );
    const rows = upsert.args as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      collection: "docs",
      id: "1",
      document: "hi",
      embedding: "[0.1,0.2,0.3]",
      metadata: { k: "v" }
    });
    expect(upsert.options.onConflict).toBe("collection,id");
  });

  it("upsert auto-generates embeddings via the embedding function", async () => {
    fake.on(
      (c) => c.table === "nodetool_vec_records" && c.op === "upsert",
      { data: null, error: null }
    );

    const col = await provider.getCollection({
      name: "docs",
      embeddingFunction: fakeEf
    });
    await col.upsert([
      { id: "a", document: "alpha" },
      { id: "b", document: "beta" }
    ]);

    const upsert = fake.find(
      (c) => c.table === "nodetool_vec_records" && c.op === "upsert"
    );
    const rows = upsert.args as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0].embedding).toMatch(/^\[\d+,\d+,1\]$/);
  });

  it("upsert pins dimension on first embedding when registry says null", async () => {
    fake = new FakeSupabase();
    provider = new SupabaseProvider({ client: fake.asSupabase() });
    fake.on(isMaybeSingleRegistry, {
      data: registryRow({ dimension: null }),
      error: null
    });
    fake.on(
      (c) => c.table === "nodetool_vec_collections" && c.op === "update",
      { data: null, error: null }
    );
    fake.on(
      (c) => c.table === "nodetool_vec_records" && c.op === "upsert",
      { data: null, error: null }
    );

    const col = await provider.getCollection({ name: "docs" });
    await col.upsert([{ id: "1", embedding: [1, 2, 3, 4] }]);

    const update = fake.find(
      (c) => c.table === "nodetool_vec_collections" && c.op === "update"
    );
    expect((update.args as { dimension: number }).dimension).toBe(4);
    expect(update.filters).toContainEqual(["is", "dimension", null]);
  });

  it("query by embedding invokes the match RPC", async () => {
    fake.on((c) => c.rpc === "nodetool_vec_match", {
      data: [
        {
          id: "a",
          document: "alpha",
          uri: "u",
          metadata: { k: "v" },
          distance: 0.123
        }
      ],
      error: null
    });

    const col = await provider.getCollection({ name: "docs" });
    const matches = await col.query({ embedding: [0.1, 0.2, 0.3], topK: 5 });

    expect(matches).toEqual([
      {
        id: "a",
        document: "alpha",
        uri: "u",
        metadata: { k: "v" },
        distance: 0.123
      }
    ]);

    const rpc = fake.find((c) => c.rpc === "nodetool_vec_match");
    expect(rpc.args).toEqual({
      p_collection: "docs",
      p_query_embedding: "[0.1,0.2,0.3]",
      p_match_count: 5,
      p_metadata_filter: {},
      p_document_match: null
    });
  });

  it("query auto-embeds text via the embedding function", async () => {
    fake.on((c) => c.rpc === "nodetool_vec_match", { data: [], error: null });

    const col = await provider.getCollection({
      name: "docs",
      embeddingFunction: fakeEf
    });
    await col.query({ text: "hello", topK: 3 });

    const rpc = fake.find((c) => c.rpc === "nodetool_vec_match");
    expect((rpc.args as { p_query_embedding: string }).p_query_embedding).toMatch(
      /^\[\d+,\d+,1\]$/
    );
  });

  it("query splits filters into metadata + document_match", async () => {
    fake.on((c) => c.rpc === "nodetool_vec_match", { data: [], error: null });

    const col = await provider.getCollection({ name: "docs" });
    await col.query({
      embedding: [1, 2, 3],
      filter: {
        $and: [
          { kind: "greeting" },
          { lang: { $eq: "en" } },
          { $document: { $contains: "fox" } }
        ]
      }
    });

    const rpc = fake.find((c) => c.rpc === "nodetool_vec_match");
    expect((rpc.args as { p_metadata_filter: unknown }).p_metadata_filter).toEqual({
      kind: "greeting",
      lang: "en"
    });
    expect((rpc.args as { p_document_match: string }).p_document_match).toBe(
      "fox"
    );
  });

  it("query rejects $or and rich operators loudly", async () => {
    fake.on((c) => c.rpc === "nodetool_vec_match", { data: [], error: null });
    const col = await provider.getCollection({ name: "docs" });

    await expect(
      col.query({
        embedding: [1, 2, 3],
        filter: { $or: [{ kind: "a" }, { kind: "b" }] }
      })
    ).rejects.toBeInstanceOf(UnsupportedFilterError);

    await expect(
      col.query({
        embedding: [1, 2, 3],
        filter: { score: { $gt: 5 } }
      })
    ).rejects.toBeInstanceOf(UnsupportedFilterError);
  });

  it("query falls back to keyword search without an embedding function", async () => {
    fake.on(
      (c) => c.table === "nodetool_vec_records" && c.op === "select",
      {
        data: [
          { id: "a", document: "alpha", uri: null, metadata: {} }
        ],
        error: null
      }
    );

    const col = await provider.getCollection({ name: "docs" });
    const matches = await col.query({ text: "alpha", topK: 5 });

    expect(matches).toHaveLength(1);
    expect(matches[0].distance).toBe(0);

    const select = fake.find(
      (c) => c.table === "nodetool_vec_records" && c.op === "select"
    );
    expect(select.filters).toContainEqual(["eq", "collection", "docs"]);
    expect(select.filters).toContainEqual(["ilike", "document", "%alpha%"]);
    expect(select.options.limit).toBe(5);
  });

  it("query by uri uses ilike on uri column", async () => {
    fake.on(
      (c) =>
        c.table === "nodetool_vec_records" &&
        c.op === "select" &&
        c.filters.some(([op, field]) => op === "ilike" && field === "uri"),
      {
        data: [{ id: "a", document: "x", uri: "file:///a", metadata: {} }],
        error: null
      }
    );

    const col = await provider.getCollection({ name: "docs" });
    const matches = await col.query({ uri: "/a", topK: 5 });

    expect(matches).toHaveLength(1);
    expect(matches[0].uri).toBe("file:///a");
  });

  it("get fetches by ids with proper PostgREST filters", async () => {
    fake.on(
      (c) =>
        c.table === "nodetool_vec_records" &&
        c.op === "select" &&
        c.filters.some(([op]) => op === "in"),
      {
        data: [
          { id: "1", document: "hi", uri: "u", metadata: { k: "v" } }
        ],
        error: null
      }
    );

    const col = await provider.getCollection({ name: "docs" });
    const recs = await col.get({ ids: ["1"] });

    expect(recs).toHaveLength(1);
    expect(recs[0].uri).toBe("u");
    expect(recs[0].metadata.k).toBe("v");

    const sel = fake.find(
      (c) =>
        c.table === "nodetool_vec_records" &&
        c.op === "select" &&
        c.filters.some(([op]) => op === "in")
    );
    expect(sel.filters).toContainEqual(["eq", "collection", "docs"]);
    expect(sel.filters).toContainEqual(["in", "id", ["1"]]);
  });

  it("count uses a head-only select with exact count", async () => {
    fake.on(
      (c) =>
        c.table === "nodetool_vec_records" &&
        c.op === "select" &&
        c.options.head === true,
      { data: null, error: null, count: 7 }
    );

    const col = await provider.getCollection({ name: "docs" });
    expect(await col.count()).toBe(7);

    const sel = fake.find(
      (c) =>
        c.table === "nodetool_vec_records" &&
        c.op === "select" &&
        c.options.head === true
    );
    expect(sel.options.count).toBe("exact");
  });

  it("delete removes records by id within the collection", async () => {
    fake.on(
      (c) => c.table === "nodetool_vec_records" && c.op === "delete",
      { data: null, error: null }
    );

    const col = await provider.getCollection({ name: "docs" });
    await col.delete(["a", "b"]);

    const del = fake.find(
      (c) => c.table === "nodetool_vec_records" && c.op === "delete"
    );
    expect(del.filters).toContainEqual(["eq", "collection", "docs"]);
    expect(del.filters).toContainEqual(["in", "id", ["a", "b"]]);
  });

  it("modify renames the collection in the registry and refreshes the handle", async () => {
    fake.on(
      (c) => c.table === "nodetool_vec_collections" && c.op === "update",
      { data: null, error: null }
    );

    const col = await provider.getCollection({ name: "docs" });
    await col.modify({ name: "after", metadata: { v: 2 } });

    expect(col.name).toBe("after");
    expect(col.metadata.v).toBe(2);

    const updates = fake.calls.filter(
      (c) => c.table === "nodetool_vec_collections" && c.op === "update"
    );
    expect(updates).toHaveLength(2);
    expect(updates[0].args).toEqual({ name: "after" });
    expect(updates[0].filters).toContainEqual(["eq", "name", "docs"]);
    expect(updates[1].args).toEqual({ metadata: { v: 2 } });
    expect(updates[1].filters).toContainEqual(["eq", "name", "after"]);
  });
});
