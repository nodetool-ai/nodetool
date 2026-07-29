/**
 * Coverage tests for createAssetUrlBuilder (src/url-builder.ts).
 *
 * The supabase happy/error paths are exercised against the real REST client in
 * supabase-rest.test.ts. Here the S3 client and the Supabase client factory are
 * mocked so the file and s3 branches, the S3 endpoint/region wiring, and the
 * supabase "no data" guard can be checked in isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
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

const createSignedUrl = vi.fn();
vi.mock("../src/supabase-rest.js", () => ({
  createSupabaseStorageClient: vi.fn(() => ({
    storage: {
      from: () => ({ createSignedUrl })
    }
  }))
}));

import { createAssetUrlBuilder } from "../src/url-builder.js";

beforeEach(() => {
  presignGetObject.mockClear();
  s3Ctor.mockClear();
  createSignedUrl.mockReset();
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
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://x/signed" },
      error: null
    });
    const build = createAssetUrlBuilder({
      kind: "supabase",
      url: "https://x.supabase.co",
      apiKey: "k",
      bucket: "assets"
    });
    expect(await build("k.png")).toBe("https://x/signed");
    expect(createSignedUrl).toHaveBeenCalledWith("k.png", SIGNED_URL_TTL);
  });

  it("throws when the client returns an error", async () => {
    createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "boom" }
    });
    const build = createAssetUrlBuilder({
      kind: "supabase",
      url: "https://x.supabase.co",
      apiKey: "k",
      bucket: "assets"
    });
    await expect(build("m.png")).rejects.toThrow(
      'Failed to create signed URL for "m.png": boom'
    );
  });

  it("throws when the client returns no data and no error", async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: null });
    const build = createAssetUrlBuilder({
      kind: "supabase",
      url: "https://x.supabase.co",
      apiKey: "k",
      bucket: "assets"
    });
    await expect(build("m.png")).rejects.toThrow(
      'Failed to create signed URL for "m.png": no data'
    );
  });
});
