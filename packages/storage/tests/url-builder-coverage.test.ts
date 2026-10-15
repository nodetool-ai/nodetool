/**
 * Coverage tests for createAssetUrlBuilder (src/url-builder.ts).
 *
 * The supabase happy/error paths are exercised against the real REST client in
 * supabase-rest.test.ts. Here the S3 client and the Supabase client factory are
 * mocked so the file and s3 branches, the S3 endpoint/region wiring, and the
 * supabase "no data" guard can be checked in isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SIGNED_URL_TTL } from "@nodetool-ai/config";

const presignGetObject = vi.fn(async (input: unknown) => "https://signed/url");
const s3Ctor = vi.fn();
vi.mock("../src/s3/client.js", () => ({
  S3Client: class {
    constructor(opts: unknown) {
      s3Ctor(opts);
    }
    presignGetObject(input: unknown) {
      return presignGetObject(input);
    }
  }
}));

const createSignedUrls = vi.fn();
vi.mock("../src/supabase-rest.js", () => ({
  createSupabaseStorageClient: vi.fn(() => ({
    storage: {
      from: () => ({ createSignedUrls })
    }
  }))
}));

/** Sign every key as `https://x/signed/<key>`, except those in `missing`. */
function signKeys(missing: string[] = []) {
  return async (keys: string[]) => ({
    data: keys.map((key) =>
      missing.includes(key)
        ? { key, signedUrl: null, error: "Object not found" }
        : { key, signedUrl: `https://x/signed/${key}`, error: null }
    ),
    error: null
  });
}

function supabaseBuilder() {
  return createAssetUrlBuilder({
    kind: "supabase",
    url: "https://x.supabase.co",
    apiKey: "k",
    bucket: "assets"
  });
}

import { createAssetUrlBuilder } from "../src/url-builder.js";

beforeEach(() => {
  presignGetObject.mockClear();
  s3Ctor.mockClear();
  createSignedUrls.mockReset();
});

describe("createAssetUrlBuilder (file)", () => {
  it("returns a local /api/storage path", async () => {
    const build = createAssetUrlBuilder({ kind: "file", rootDir: "/data" });
    expect(await build("images/x.png")).toBe("/api/storage/images/x.png");
  });

  it("strips any leading slashes from the key", async () => {
    const build = createAssetUrlBuilder({ kind: "file", rootDir: "/data" });
    expect(await build("///a/b.txt")).toBe("/api/storage/a/b.txt");
  });
});

describe("createAssetUrlBuilder (s3)", () => {
  it("presigns a GET with bucket/key and the configured TTL", async () => {
    const build = createAssetUrlBuilder({ kind: "s3", bucket: "my-bucket" });
    const url = await build("k.bin");
    expect(url).toBe("https://signed/url");
    expect(presignGetObject).toHaveBeenCalledWith({
      bucket: "my-bucket",
      key: "k.bin",
      expiresIn: SIGNED_URL_TTL
    });
  });

  it("defaults the region to us-east-1 without an endpoint", async () => {
    createAssetUrlBuilder({ kind: "s3", bucket: "b" });
    expect(s3Ctor).toHaveBeenCalledWith({ region: "us-east-1" });
  });

  it("passes region through when provided", async () => {
    createAssetUrlBuilder({ kind: "s3", bucket: "b", region: "eu-west-1" });
    expect(s3Ctor).toHaveBeenCalledWith({ region: "eu-west-1" });
  });

  it("enables path-style addressing for a custom endpoint", async () => {
    createAssetUrlBuilder({
      kind: "s3",
      bucket: "b",
      endpoint: "http://localhost:9000"
    });
    expect(s3Ctor).toHaveBeenCalledWith({
      region: "us-east-1",
      endpoint: "http://localhost:9000",
      forcePathStyle: true
    });
  });
});

describe("createAssetUrlBuilder (supabase)", () => {
  it("returns the signed url from the client", async () => {
    createSignedUrls.mockImplementation(signKeys());
    expect(await supabaseBuilder()("k.png")).toBe("https://x/signed/k.png");
    expect(createSignedUrls).toHaveBeenCalledWith(["k.png"], SIGNED_URL_TTL);
  });

  it("signs keys requested in the same turn with one request", async () => {
    createSignedUrls.mockImplementation(signKeys());
    const build = supabaseBuilder();
    const urls = await Promise.all(
      ["a.png", "b.png", "a.png", "c.png"].map((key) => build(key))
    );
    expect(urls).toEqual([
      "https://x/signed/a.png",
      "https://x/signed/b.png",
      "https://x/signed/a.png",
      "https://x/signed/c.png"
    ]);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls).toHaveBeenCalledWith(
      ["a.png", "b.png", "c.png"],
      SIGNED_URL_TTL
    );
  });

  it("splits a large batch into requests of at most 500 keys", async () => {
    createSignedUrls.mockImplementation(signKeys());
    const build = supabaseBuilder();
    const keys = Array.from({ length: 1201 }, (_, i) => `k${i}.png`);
    await Promise.all(keys.map((key) => build(key)));
    expect(
      createSignedUrls.mock.calls.map(([batch]) => (batch as string[]).length)
    ).toEqual([500, 500, 201]);
  });

  it("rejects only the keys that could not be signed", async () => {
    createSignedUrls.mockImplementation(signKeys(["missing.png"]));
    const build = supabaseBuilder();
    const [ok, missing] = await Promise.allSettled([
      build("ok.png"),
      build("missing.png")
    ]);
    expect(ok).toEqual({ status: "fulfilled", value: "https://x/signed/ok.png" });
    expect(missing.status).toBe("rejected");
    expect((missing as PromiseRejectedResult).reason.message).toBe(
      'Failed to create signed URL for "missing.png": Object not found'
    );
  });

  it("rejects every key when the request fails", async () => {
    createSignedUrls.mockResolvedValue({
      data: null,
      error: { message: "boom" }
    });
    await expect(supabaseBuilder()("m.png")).rejects.toThrow(
      'Failed to create signed URL for "m.png": boom'
    );
  });

  it("rejects every key when the client throws", async () => {
    createSignedUrls.mockRejectedValue(new Error("socket hang up"));
    await expect(supabaseBuilder()("m.png")).rejects.toThrow(
      'Failed to create signed URL for "m.png": socket hang up'
    );
  });

  it("throws when the client returns no data and no error", async () => {
    createSignedUrls.mockResolvedValue({ data: null, error: null });
    await expect(supabaseBuilder()("m.png")).rejects.toThrow(
      'Failed to create signed URL for "m.png": no data'
    );
  });
});

describe("createAssetUrlBuilder URL reuse", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the same URL for an unchanged version without signing again", async () => {
    let n = 0;
    createSignedUrls.mockImplementation(async (keys: string[]) => ({
      data: keys.map((key) => ({
        key,
        signedUrl: `https://x/${key}?token=${++n}`,
        error: null
      })),
      error: null
    }));
    const build = supabaseBuilder();
    const first = await build("a.png", "2026-10-01T00:00:00Z");
    const second = await build("a.png", "2026-10-01T00:00:00Z");
    expect(second).toBe(first);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);

    const changed = await build("a.png", "2026-10-02T00:00:00Z");
    expect(changed).not.toBe(first);
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
  });

  it("signs every call that passes no version", async () => {
    createSignedUrls.mockImplementation(signKeys());
    const build = supabaseBuilder();
    await build("a.png");
    await build("a.png");
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
  });

  it("re-signs once half of the URL lifetime has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    createSignedUrls.mockImplementation(signKeys());
    const build = supabaseBuilder();
    await build("a.png", "v1");
    vi.setSystemTime(Date.now() + (SIGNED_URL_TTL * 1000) / 2 - 1000);
    await build("a.png", "v1");
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 2000);
    await build("a.png", "v1");
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
  });

  it("does not remember a failed signing", async () => {
    createSignedUrls.mockImplementationOnce(signKeys(["t.jpg"]));
    const build = supabaseBuilder();
    await expect(build("t.jpg", "v1")).rejects.toThrow();
    createSignedUrls.mockImplementation(signKeys());
    expect(await build("t.jpg", "v1")).toBe("https://x/signed/t.jpg");
  });

  it("reuses presigned S3 URLs for a versioned key", async () => {
    const build = createAssetUrlBuilder({ kind: "s3", bucket: "b" });
    await build("k.bin", "v1");
    await build("k.bin", "v1");
    expect(presignGetObject).toHaveBeenCalledTimes(1);
  });
});
