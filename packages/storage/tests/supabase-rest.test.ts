import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseStorageClient } from "../src/supabase-rest.js";
import { createAssetUrlBuilder } from "../src/url-builder.js";
import { SIGNED_URL_TTL } from "@nodetool-ai/config";

// Fetch-layer tests for the in-house Supabase Storage REST client: exact
// request URLs/headers/bodies for list, createSignedUrl, upsert uploads, and
// error mapping. Upload/download/remove basics are covered through
// SupabaseStorageAdapter in supabase-storage-adapter-coverage.test.ts.

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

describe("createSignedUploadUrl", () => {
  it("POSTs to the upload-sign endpoint and returns an absolute URL + token", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        url: "/object/upload/sign/assets/user-1/abc.png?token=tok-123"
      })
    );
    const { data, error } = await client()
      .storage.from("assets")
      .createSignedUploadUrl("user-1/abc.png");

    expect(error).toBeNull();
    expect(data).toEqual({
      signedUrl:
        "https://xyz.supabase.co/storage/v1/object/upload/sign/assets/user-1/abc.png?token=tok-123",
      token: "tok-123"
    });
    const { url, init } = lastRequest();
    expect(url).toBe(
      "https://xyz.supabase.co/storage/v1/object/upload/sign/assets/user-1/abc.png"
    );
    expect(init.method).toBe("POST");
  });

  it("percent-encodes each key segment but keeps slashes", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ url: "/object/upload/sign/assets/u/a%20b.png?token=t" })
    );
    await client().storage.from("assets").createSignedUploadUrl("u/a b.png");
    expect(lastRequest().url).toBe(
      "https://xyz.supabase.co/storage/v1/object/upload/sign/assets/u/a%20b.png"
    );
  });

  it("surfaces an API error instead of a URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "denied" }, 403));
    const { data, error } = await client()
      .storage.from("assets")
      .createSignedUploadUrl("user-1/abc.png");
    expect(data).toBeNull();
    expect(error?.message).toBe("denied");
  });

  it("errors when the response carries no url", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const { data, error } = await client()
      .storage.from("assets")
      .createSignedUploadUrl("user-1/abc.png");
    expect(data).toBeNull();
    expect(error?.message).toMatch(/missing url/);
  });

  it("errors when the signed url carries no token", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ url: "/object/upload/sign/assets/user-1/abc.png" })
    );
    const { data, error } = await client()
      .storage.from("assets")
      .createSignedUploadUrl("user-1/abc.png");
    expect(data).toBeNull();
    expect(error?.message).toMatch(/missing token/);
  });
});

describe("info", () => {
  it("HEADs the object key and reads size, type, and modification time", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: {
          "content-length": "298578",
          "content-type": "image/jpeg",
          "last-modified": "Mon, 05 Oct 2026 21:49:27 GMT"
        }
      })
    );
    const { data, error } = await client()
      .storage.from("assets")
      .info("user-1/abc.jpg");

    expect(error).toBeNull();
    expect(data).toEqual({
      size: 298578,
      contentType: "image/jpeg",
      modifiedAt: Date.parse("Mon, 05 Oct 2026 21:49:27 GMT")
    });
    const { url, init } = lastRequest();
    expect(url).toBe(
      "https://xyz.supabase.co/storage/v1/object/assets/user-1/abc.jpg"
    );
    expect(init.method).toBe("HEAD");
    expect(init.headers).toMatchObject({ Authorization: "Bearer service-key" });
  });

  it("returns no data when the object is missing", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 400 }));
    const { data, error } = await client()
      .storage.from("assets")
      .info("user-1/missing.jpg");
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});

describe("transient failures", () => {
  const tooManyConnections = () =>
    jsonResponse(
      {
        statusCode: "500",
        error: "internal",
        message: "Too many connections issued to the database"
      },
      500
    );
  const retrying = (maxAttempts?: number) =>
    createSupabaseStorageClient("https://xyz.supabase.co", "service-key", {
      maxAttempts,
      sleep: async () => {}
    });

  it("retries an upload the Storage service refused for an exhausted pool", async () => {
    fetchMock
      .mockResolvedValueOnce(tooManyConnections())
      .mockResolvedValueOnce(tooManyConnections())
      .mockResolvedValueOnce(jsonResponse({}));
    const { error } = await retrying()
      .storage.from("assets")
      .upload("assets/a.bin", new Uint8Array([1, 2]), { upsert: true });
    expect(error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a thrown network error on the upload-sign call", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        jsonResponse({ url: "/object/upload/sign/assets/a.bin?token=tok" })
      );
    const { data, error } = await retrying()
      .storage.from("assets")
      .createSignedUploadUrl("a.bin");
    expect(error).toBeNull();
    expect(data?.token).toBe("tok");
  });

  it("reports the last error once the attempts run out", async () => {
    fetchMock.mockImplementation(async () => tooManyConnections());
    const { error } = await retrying(3)
      .storage.from("assets")
      .upload("assets/a.bin", new Uint8Array([1]), { upsert: true });
    expect(error?.message).toBe("Too many connections issued to the database");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a client error", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "denied" }, 403));
    const { error } = await retrying()
      .storage.from("assets")
      .upload("assets/a.bin", new Uint8Array([1]), { upsert: true });
    expect(error?.message).toBe("denied");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
