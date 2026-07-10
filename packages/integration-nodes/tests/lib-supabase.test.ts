/**
 * Fetch-layer tests for the Supabase (PostgREST) nodes: exact request URLs,
 * query-string operators, headers, bodies, response decoding, and error
 * mapping.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SelectLibNode,
  InsertLibNode,
  UpdateLibNode,
  DeleteLibNode,
  UpsertLibNode,
  RPCLibNode
} from "@nodetool-ai/integration-nodes";

const fetchMock = vi.fn<typeof fetch>();

const SECRETS = {
  SUPABASE_URL: "https://xyz.supabase.co",
  SUPABASE_KEY: "service-key"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function lastRequest(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: String(url), init: init ?? {} };
}

function makeNode<T extends { assign(p: Record<string, unknown>): void; setDynamic(k: string, v: unknown): void }>(
  NodeCls: new () => T,
  props: Record<string, unknown>
): T {
  const node = new NodeCls();
  node.assign(props);
  node.setDynamic("_secrets", SECRETS);
  return node;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SelectLibNode", () => {
  it("GETs the table with select, filters, order and limit", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: 1, name: "a" }]));

    const node = makeNode(SelectLibNode, {
      table_name: "items",
      columns: { type: "record_type", columns: [{ name: "id" }, { name: "name" }] },
      filters: [
        ["status", "eq", "active"],
        ["score", "gte", 10],
        ["kind", "in", ["a", "b"]],
        ["name", "like", "%foo%"],
        ["meta", "contains", { k: "v" }],
        ["age", "ne", 3]
      ],
      order_by: "name",
      descending: true,
      limit: 25
    });

    const result = await node.process();
    expect(result.output).toEqual([{ id: 1, name: "a" }]);

    const { url, init } = lastRequest();
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({
      apikey: "service-key",
      Authorization: "Bearer service-key"
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://xyz.supabase.co/rest/v1/items"
    );
    const params = parsed.searchParams;
    expect(params.get("select")).toBe("id,name");
    expect(params.get("status")).toBe("eq.active");
    expect(params.get("score")).toBe("gte.10");
    expect(params.get("kind")).toBe('in.("a","b")');
    expect(params.get("name")).toBe("like.%foo%");
    expect(params.get("meta")).toBe('cs.{"k":"v"}');
    expect(params.get("age")).toBe("neq.3");
    expect(params.get("order")).toBe("name.desc");
    expect(params.get("limit")).toBe("25");
  });

  it("defaults to select=* and no order/limit", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    const node = makeNode(SelectLibNode, { table_name: "items" });
    await node.process();

    const params = new URL(lastRequest().url).searchParams;
    expect(params.get("select")).toBe("*");
    expect(params.get("order")).toBeNull();
    expect(params.get("limit")).toBeNull();
  });

  it("maps PostgREST error bodies into the thrown message", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          message: "relation does not exist",
          code: "42P01",
          hint: "check the table name"
        },
        404
      )
    );

    const node = makeNode(SelectLibNode, { table_name: "nope" });
    await expect(node.process()).rejects.toThrow(
      "Supabase select error: relation does not exist (42P01; check the table name)"
    );
  });
});

describe("InsertLibNode", () => {
  it("POSTs rows with return=representation and returns them", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: 1 }], 201));

    const node = makeNode(InsertLibNode, {
      table_name: "items",
      records: { name: "one" },
      return_rows: true
    });
    const result = await node.process();
    expect(result.output).toEqual([{ id: 1 }]);

    const { url, init } = lastRequest();
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Prefer).toBe("return=representation");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual([{ name: "one" }]);
    expect(new URL(url).searchParams.get("select")).toBe("*");
  });

  it("uses return=minimal and reports counts when return_rows is false", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));

    const node = makeNode(InsertLibNode, {
      table_name: "items",
      records: [{ a: 1 }, { a: 2 }],
      return_rows: false
    });
    const result = await node.process();
    expect(result.output).toEqual({ inserted: 2 });

    const { init } = lastRequest();
    expect((init.headers as Record<string, string>).Prefer).toBe(
      "return=minimal"
    );
  });
});

describe("UpdateLibNode", () => {
  it("PATCHes values with filters", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: 1, status: "done" }]));

    const node = makeNode(UpdateLibNode, {
      table_name: "items",
      values: { status: "done" },
      filters: [["id", "eq", 1]],
      return_rows: true
    });
    const result = await node.process();
    expect(result.output).toEqual([{ id: 1, status: "done" }]);

    const { url, init } = lastRequest();
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ status: "done" });
    expect(new URL(url).searchParams.get("id")).toBe("eq.1");
  });
});

describe("DeleteLibNode", () => {
  it("refuses to run without filters", async () => {
    const node = makeNode(DeleteLibNode, { table_name: "items", filters: [] });
    await expect(node.process()).rejects.toThrow(/At least one filter/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DELETEs with filters and return=minimal", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const node = makeNode(DeleteLibNode, {
      table_name: "items",
      filters: [["id", "eq", 7]]
    });
    const result = await node.process();
    expect(result.output).toEqual({ deleted: true });

    const { url, init } = lastRequest();
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>).Prefer).toBe(
      "return=minimal"
    );
    expect(new URL(url).searchParams.get("id")).toBe("eq.7");
  });
});

describe("UpsertLibNode", () => {
  it("POSTs with merge-duplicates resolution", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: 1 }], 201));

    const node = makeNode(UpsertLibNode, {
      table_name: "items",
      records: [{ id: 1, name: "one" }],
      return_rows: true
    });
    const result = await node.process();
    expect(result.output).toEqual([{ id: 1 }]);

    const { init } = lastRequest();
    expect((init.headers as Record<string, string>).Prefer).toBe(
      "resolution=merge-duplicates,return=representation"
    );
  });
});

describe("RPCLibNode", () => {
  it("POSTs params to /rest/v1/rpc/<fn>", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    const node = makeNode(RPCLibNode, {
      function: "my_fn",
      params: { x: 1 }
    });
    const result = await node.process();
    expect(result.output).toEqual({ ok: true });

    const { url, init } = lastRequest();
    expect(url).toBe("https://xyz.supabase.co/rest/v1/rpc/my_fn");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ x: 1 });
  });

  it("wraps PostgREST errors", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ message: "function my_fn does not exist" }, 404)
    );

    const node = makeNode(RPCLibNode, { function: "my_fn", params: {} });
    await expect(node.process()).rejects.toThrow(
      "Supabase RPC error: function my_fn does not exist"
    );
  });
});
