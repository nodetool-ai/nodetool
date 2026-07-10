import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SupabaseStorage } from "../src/supabase-storage.js";

// SupabaseStorage sits on the in-house fetch-backed Storage REST client, so
// the tests mock global fetch and assert the exact requests it issues.

const fetchMock = vi.fn<typeof fetch>();

function okResponse(body: BodyInit | null = "{}", status = 200): Response {
  return new Response(body, { status });
}

function errorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ statusCode: status, message }), {
    status,
    headers: { "content-type": "application/json" }
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SupabaseStorage", () => {
  let storage: SupabaseStorage;

  beforeEach(() => {
    storage = new SupabaseStorage(
      "https://project.supabase.co",
      "service-key",
      "assets"
    );
  });

  describe("upload", () => {
    it("POSTs bytes with auth headers and content type", async () => {
      fetchMock.mockResolvedValue(okResponse());
      await storage.upload("file.txt", Buffer.from("hello"), "text/plain");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        "https://project.supabase.co/storage/v1/object/assets/file.txt"
      );
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({
        apikey: "service-key",
        Authorization: "Bearer service-key",
        "Content-Type": "text/plain"
      });
      expect(Buffer.from(init?.body as Uint8Array).toString()).toBe("hello");
    });

    it("uploads without content type", async () => {
      fetchMock.mockResolvedValue(okResponse());
      await storage.upload("file.txt", Buffer.from("hello"));

      const [, init] = fetchMock.mock.calls[0];
      expect(init?.headers).toEqual({
        apikey: "service-key",
        Authorization: "Bearer service-key"
      });
    });

    it("URL-encodes key segments but keeps slashes", async () => {
      fetchMock.mockResolvedValue(okResponse());
      await storage.upload("dir name/file #1.txt", Buffer.from("x"));

      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://project.supabase.co/storage/v1/object/assets/dir%20name/file%20%231.txt"
      );
    });

    it("throws with the mapped error message on failure", async () => {
      fetchMock.mockResolvedValue(errorResponse("Bucket full", 507));
      await expect(
        storage.upload("file.txt", Buffer.from("hello"))
      ).rejects.toThrow('Supabase upload failed for key "file.txt": Bucket full');
    });

    it("falls back to a status message for non-JSON error bodies", async () => {
      fetchMock.mockResolvedValue(new Response("boom", { status: 502 }));
      await expect(
        storage.upload("file.txt", Buffer.from("hello"))
      ).rejects.toThrow("Supabase Storage request failed with status 502");
    });
  });

  describe("download", () => {
    it("GETs the object and returns a Buffer", async () => {
      fetchMock.mockResolvedValue(okResponse("hello world"));
      const result = await storage.download("file.txt");

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        "https://project.supabase.co/storage/v1/object/assets/file.txt"
      );
      expect(init?.method).toBe("GET");
      expect(init?.headers).toEqual({
        apikey: "service-key",
        Authorization: "Bearer service-key"
      });
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe("hello world");
    });

    it("round-trips binary data", async () => {
      const binary = new Uint8Array([0, 1, 127, 128, 255, 0, 42]);
      fetchMock.mockResolvedValue(okResponse(binary));
      const result = await storage.download("binary.bin");
      expect([...result]).toEqual([0, 1, 127, 128, 255, 0, 42]);
    });

    it("throws on download error with the key in the message", async () => {
      fetchMock.mockResolvedValue(errorResponse("Object not found", 404));
      await expect(storage.download("missing/file.txt")).rejects.toThrow(
        'Supabase download failed for key "missing/file.txt": Object not found'
      );
    });
  });

  describe("delete", () => {
    it("DELETEs the bucket path with a prefixes body", async () => {
      fetchMock.mockResolvedValue(okResponse());
      await storage.delete("file.txt");

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        "https://project.supabase.co/storage/v1/object/assets"
      );
      expect(init?.method).toBe("DELETE");
      expect(JSON.parse(init?.body as string)).toEqual({
        prefixes: ["file.txt"]
      });
    });

    it("throws on delete error", async () => {
      fetchMock.mockResolvedValue(errorResponse("Permission denied", 403));
      await expect(storage.delete("secret/key.txt")).rejects.toThrow(
        'Supabase delete failed for key "secret/key.txt": Permission denied'
      );
    });
  });

  describe("exists", () => {
    it("returns true when the download succeeds", async () => {
      fetchMock.mockResolvedValue(okResponse(""));
      expect(await storage.exists("file.txt")).toBe(true);
    });

    it("returns false when the download errors", async () => {
      fetchMock.mockResolvedValue(errorResponse("Object not found", 404));
      expect(await storage.exists("missing.txt")).toBe(false);
    });
  });

  describe("getUrl", () => {
    it("returns the public URL after client initialisation", async () => {
      fetchMock.mockResolvedValue(okResponse(""));
      await storage.exists("init");

      expect(storage.getUrl("file.txt")).toBe(
        "https://project.supabase.co/storage/v1/object/public/assets/file.txt"
      );
    });

    it("constructs the URL manually before client initialisation", () => {
      expect(storage.getUrl("path/file.txt")).toBe(
        "https://project.supabase.co/storage/v1/object/public/assets/path/file.txt"
      );
    });

    it("handles a trailing slash in the Supabase URL", () => {
      const fresh = new SupabaseStorage(
        "https://project.supabase.co/",
        "key",
        "assets"
      );
      expect(fresh.getUrl("file.txt")).toBe(
        "https://project.supabase.co/storage/v1/object/public/assets/file.txt"
      );
    });
  });
});
