import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PostgrestClient } from "../src/index.js";

// Fetch-layer tests for the in-house PostgREST client: exact URLs,
// query-string operators, headers, bodies, response decoding, and error
// mapping for every operation SupabaseProvider uses.

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) }
  });
}

function lastRequest(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: String(url), init: init ?? {} };
}

let client: PostgrestClient;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  client = new PostgrestClient({
    url: "https://xyz.supabase.co",
    apiKey: "service-key"
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PostgrestClient — select", () => {
  it("GETs with select, eq filter, order, and auth headers", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: "1" }]));

    const { data, error } = await client
      .from("records")
      .select("id, document")
      .eq("collection", "docs")
      .order("id");

    expect(error).toBeNull();
    expect(data).toEqual([{ id: "1" }]);

    const { url, init } = lastRequest();
    expect(url).toBe(
      "https://xyz.supabase.co/rest/v1/records?select=id%2Cdocument&collection=eq.docs&order=id.asc"
    );
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({
      apikey: "service-key",
      Authorization: "Bearer service-key"
    });
  });

  it("encodes in.(...) lists with quoted elements", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    await client
      .from("records")
      .select("id")
      .in("id", ["a", 'b"quote', "c,comma"]);

    const { url } = lastRequest();
    const params = new URL(url).searchParams;
    expect(params.get("id")).toBe('in.("a","b\\"quote","c,comma")');
  });

  it("encodes ilike, contains (cs) and limit", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    await client
      .from("records")
      .select("id")
      .ilike("document", "%fox%")
      .contains("metadata", { kind: "x" })
      .limit(5);

    const params = new URL(lastRequest().url).searchParams;
    expect(params.get("document")).toBe("ilike.%fox%");
    expect(params.get("metadata")).toBe('cs.{"kind":"x"}');
    expect(params.get("limit")).toBe("5");
  });

  it("maps range() to offset+limit", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    await client.from("records").select("id").range(10, 19);

    const params = new URL(lastRequest().url).searchParams;
    expect(params.get("offset")).toBe("10");
    expect(params.get("limit")).toBe("10");
  });

  it("order desc via ascending: false", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    await client.from("records").select("id").order("id", { ascending: false });

    expect(new URL(lastRequest().url).searchParams.get("order")).toBe(
      "id.desc"
    );
  });

  it("head+count issues HEAD with Prefer count=exact and parses Content-Range", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(null, { status: 200, headers: { "content-range": "0-24/57" } })
    );

    const result = await client
      .from("records")
      .select("*", { count: "exact", head: true })
      .eq("collection", "docs");

    expect(result.count).toBe(57);
    expect(result.data).toBeNull();
    expect(result.error).toBeNull();

    const { init } = lastRequest();
    expect(init.method).toBe("HEAD");
    expect((init.headers as Record<string, string>).Prefer).toBe(
      "count=exact"
    );
  });

  it("maybeSingle returns the first row or null and applies limit=1", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ name: "docs" }]));

    const one = await client
      .from("collections")
      .select("name")
      .eq("name", "docs")
      .maybeSingle();
    expect(one.data).toEqual({ name: "docs" });
    expect(new URL(lastRequest().url).searchParams.get("limit")).toBe("1");

    fetchMock.mockResolvedValue(jsonResponse([]));
    const none = await client
      .from("collections")
      .select("name")
      .eq("name", "missing")
      .maybeSingle();
    expect(none.data).toBeNull();
    expect(none.error).toBeNull();
  });
});

describe("PostgrestClient — mutations", () => {
  it("insert POSTs JSON with Prefer return=minimal", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));

    const { error } = await client
      .from("collections")
      .insert({ name: "docs", dimension: 3 });

    expect(error).toBeNull();
    const { url, init } = lastRequest();
    expect(url).toBe("https://xyz.supabase.co/rest/v1/collections");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Prefer).toBe("return=minimal");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "docs",
      dimension: 3
    });
  });

  it("upsert POSTs with on_conflict and merge-duplicates resolution", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));

    await client
      .from("records")
      .upsert([{ id: "1" }], { onConflict: "collection,id" });

    const { url, init } = lastRequest();
    expect(new URL(url).searchParams.get("on_conflict")).toBe("collection,id");
    expect((init.headers as Record<string, string>).Prefer).toBe(
      "resolution=merge-duplicates,return=minimal"
    );
    expect(JSON.parse(init.body as string)).toEqual([{ id: "1" }]);
  });

  it("update PATCHes with filters including is.null", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await client
      .from("collections")
      .update({ dimension: 4 })
      .eq("name", "docs")
      .is("dimension", null);

    const { url, init } = lastRequest();
    expect(init.method).toBe("PATCH");
    const params = new URL(url).searchParams;
    expect(params.get("name")).toBe("eq.docs");
    expect(params.get("dimension")).toBe("is.null");
    expect(JSON.parse(init.body as string)).toEqual({ dimension: 4 });
  });

  it("delete issues DELETE with filters and no body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await client
      .from("records")
      .delete()
      .eq("collection", "docs")
      .in("id", ["a", "b"]);

    const { url, init } = lastRequest();
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
    const params = new URL(url).searchParams;
    expect(params.get("collection")).toBe("eq.docs");
    expect(params.get("id")).toBe('in.("a","b")');
  });
});

describe("PostgrestClient — rpc", () => {
  it("POSTs args to /rest/v1/rpc/<fn> and decodes the result", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: "a", distance: 0.1 }]));

    const { data, error } = await client.rpc("nodetool_vec_match", {
      p_collection: "docs",
      p_match_count: 5
    });

    expect(error).toBeNull();
    expect(data).toEqual([{ id: "a", distance: 0.1 }]);

    const { url, init } = lastRequest();
    expect(url).toBe(
      "https://xyz.supabase.co/rest/v1/rpc/nodetool_vec_match"
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      p_collection: "docs",
      p_match_count: 5
    });
  });
});

describe("PostgrestClient — error mapping", () => {
  it("maps PostgREST error bodies to { message, code, details, hint }", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          message: "duplicate key value",
          code: "23505",
          details: "Key (name) already exists.",
          hint: "rename it"
        },
        { status: 409 }
      )
    );

    const { data, error } = await client
      .from("collections")
      .insert({ name: "docs" });

    expect(data).toBeNull();
    expect(error).toEqual({
      message: "duplicate key value",
      code: "23505",
      details: "Key (name) already exists.",
      hint: "rename it"
    });
  });

  it("falls back to a status message for non-JSON error bodies", async () => {
    fetchMock.mockResolvedValue(new Response("bad gateway", { status: 502 }));

    const { error } = await client.from("records").select("id");
    expect(error?.message).toBe("PostgREST request failed with status 502");
  });

  it("sends Accept-Profile / Content-Profile for a non-public schema", async () => {
    const scoped = new PostgrestClient({
      url: "https://xyz.supabase.co",
      apiKey: "k",
      schema: "vectors"
    });
    fetchMock.mockResolvedValue(jsonResponse([]));
    await scoped.from("records").select("id");
    expect(
      (lastRequest().init.headers as Record<string, string>)["Accept-Profile"]
    ).toBe("vectors");

    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
    await scoped.from("records").insert({ id: "1" });
    expect(
      (lastRequest().init.headers as Record<string, string>)["Content-Profile"]
    ).toBe("vectors");
  });
});
