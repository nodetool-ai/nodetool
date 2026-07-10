import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseStorageClient } from "../src/supabase-rest.js";
import { createAssetUrlBuilder } from "../src/url-builder.js";
import { SIGNED_URL_TTL } from "@nodetool-ai/config";

// Fetch-layer tests for the in-house Supabase Storage REST client: exact
// request URLs/headers/bodies for list, createSignedUrl, upsert uploads, and
// error mapping. Upload/download/remove basics are covered through
// SupabaseStorage in supabase-storage.test.ts.

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function lastRequest(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: String(url), init: init ?? {} };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const client = () =>
  createSupabaseStorageClient("https://xyz.supabase.co", "service-key");

describe("createSupabaseStorageClient", () => {
  it("upload with upsert sets the x-upsert header", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await client()
      .storage.from("uploads")
      .upload("a/b.png", new Uint8Array([1]), {
        contentType: "image/png",
        upsert: true
      });

    const { url, init } = lastRequest();
    expect(url).toBe(
      "https://xyz.supabase.co/storage/v1/object/uploads/a/b.png"
    );
    expect(init.headers).toEqual({
      apikey: "service-key",
      Authorization: "Bearer service-key",
      "Content-Type": "image/png",
      "x-upsert": "true"
    });
  });

  it("list POSTs prefix/limit/search with name-asc sorting", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        {
          name: "b.png",
          id: "1",
          updated_at: "2026-01-01T00:00:00Z",
          metadata: { size: 5, mimetype: "image/png" }
        }
      ])
    );

    const { data, error } = await client()
      .storage.from("uploads")
      .list("dir", { search: "b.png", limit: 1 });

    expect(error).toBeNull();
    expect(data).toEqual([
      {
        name: "b.png",
        id: "1",
        updated_at: "2026-01-01T00:00:00Z",
        metadata: { size: 5, mimetype: "image/png" }
      }
    ]);

    const { url, init } = lastRequest();
    expect(url).toBe(
      "https://xyz.supabase.co/storage/v1/object/list/uploads"
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      prefix: "dir",
      limit: 1,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
      search: "b.png"
    });
  });

  it("createSignedUrl POSTs expiresIn and resolves the absolute URL", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ signedURL: "/object/sign/uploads/a.png?token=tkn" })
    );

    const { data, error } = await client()
      .storage.from("uploads")
      .createSignedUrl("a.png", 900);

    expect(error).toBeNull();
    expect(data?.signedUrl).toBe(
      "https://xyz.supabase.co/storage/v1/object/sign/uploads/a.png?token=tkn"
    );

    const { url, init } = lastRequest();
    expect(url).toBe(
      "https://xyz.supabase.co/storage/v1/object/sign/uploads/a.png"
    );
    expect(JSON.parse(init.body as string)).toEqual({ expiresIn: 900 });
  });

  it("maps Storage error bodies on list and sign", async () => {
    // A fresh Response per call — bodies are single-use.
    fetchMock.mockImplementation(async () =>
      jsonResponse(
        { statusCode: 404, error: "Not found", message: "Bucket not found" },
        404
      )
    );

    const listResult = await client().storage.from("nope").list("");
    expect(listResult.data).toBeNull();
    expect(listResult.error?.message).toBe("Bucket not found");

    const signResult = await client()
      .storage.from("nope")
      .createSignedUrl("a.png", 60);
    expect(signResult.data).toBeNull();
    expect(signResult.error?.message).toBe("Bucket not found");
  });

  it("getPublicUrl builds the public object URL without fetching", () => {
    const { data } = client().storage.from("uploads").getPublicUrl("a/b.png");
    expect(data.publicUrl).toBe(
      "https://xyz.supabase.co/storage/v1/object/public/uploads/a/b.png"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createAssetUrlBuilder (supabase)", () => {
  it("returns the signed URL for a key", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ signedURL: "/object/sign/assets/k.png?token=t" })
    );

    const build = createAssetUrlBuilder({
      kind: "supabase",
      url: "https://xyz.supabase.co",
      apiKey: "service-key",
      bucket: "assets"
    });
    const signed = await build("k.png");
    expect(signed).toBe(
      "https://xyz.supabase.co/storage/v1/object/sign/assets/k.png?token=t"
    );

    const { init } = lastRequest();
    expect(JSON.parse(init.body as string)).toEqual({
      expiresIn: SIGNED_URL_TTL
    });
  });

  it("throws a mapped error when signing fails", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ statusCode: 400, message: "Object not found" }, 400)
    );

    const build = createAssetUrlBuilder({
      kind: "supabase",
      url: "https://xyz.supabase.co",
      apiKey: "service-key",
      bucket: "assets"
    });
    await expect(build("missing.png")).rejects.toThrow(
      'Failed to create signed URL for "missing.png": Object not found'
    );
  });
});
