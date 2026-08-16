/**
 * The `temp_url` resolver decides which URL a client gets for a stored temp
 * asset. Prod shipped a public Supabase URL for a private bucket, which the
 * client saw as `{"error":"Bucket not found","code":"NoSuchBucket"}` — the
 * public route resolves only buckets marked public. A signed URL has to win.
 */

import { describe, it, expect, vi } from "vitest";
import { pathToFileURL } from "node:url";
import type { StorageAdapter } from "@nodetool-ai/storage";

import { createTempUrlResolver } from "../src/lib/temp-url-resolver.js";

/** Minimal adapter — the resolver only ever calls the two URL methods. */
function adapter(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    store: async () => "",
    retrieve: async () => null,
    exists: async () => false,
    uriForKey: (key: string) => key,
    list: async () => ({ entries: [], commonPrefixes: [] }),
    delete: async () => false,
    stat: async () => null,
    ...overrides
  } as StorageAdapter;
}

describe("createTempUrlResolver", () => {
  it("prefers a signed URL over a public one for a cloud object", async () => {
    const createDownloadUrl = vi.fn(
      async () => "https://x.supabase.co/storage/v1/object/sign/t/a.png?token=t"
    );
    const getPublicUrl = vi.fn(
      () => "https://x.supabase.co/storage/v1/object/public/t/a.png"
    );
    const resolve = createTempUrlResolver(
      adapter({ createDownloadUrl, getPublicUrl } as Partial<StorageAdapter>),
      "/tmp/assets"
    );
    expect(await resolve("supabase://t/temp/a.png")).toBe(
      "https://x.supabase.co/storage/v1/object/sign/t/a.png?token=t"
    );
    expect(createDownloadUrl).toHaveBeenCalledWith("supabase://t/temp/a.png");
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it("falls back to the public URL when signing declines", async () => {
    const resolve = createTempUrlResolver(
      adapter({
        createDownloadUrl: async () => null,
        getPublicUrl: () => "https://x.supabase.co/public/t/a.png"
      } as Partial<StorageAdapter>),
      "/tmp/assets"
    );
    expect(await resolve("supabase://t/temp/a.png")).toBe(
      "https://x.supabase.co/public/t/a.png"
    );
  });

  it("falls back to the public URL when signing throws", async () => {
    const resolve = createTempUrlResolver(
      adapter({
        createDownloadUrl: async () => {
          throw new Error("network down");
        },
        getPublicUrl: () => "https://x.supabase.co/public/t/a.png"
      } as Partial<StorageAdapter>),
      "/tmp/assets"
    );
    expect(await resolve("supabase://t/temp/a.png")).toBe(
      "https://x.supabase.co/public/t/a.png"
    );
  });

  it("falls back to /api/storage/<key> when the adapter offers neither", async () => {
    const resolve = createTempUrlResolver(adapter(), "/tmp/assets");
    expect(await resolve("s3://bucket/temp/a.png")).toContain(
      "/api/storage/temp/a.png"
    );
  });

  it("maps a local file URI onto the /api/storage route", async () => {
    const resolve = createTempUrlResolver(adapter(), "/tmp/assets");
    const uri = `${pathToFileURL("/tmp/assets").toString()}/temp/a.png`;
    expect(await resolve(uri)).toContain("/api/storage/temp/a.png");
  });

  it("passes an unrecognized URI through unchanged", async () => {
    const resolve = createTempUrlResolver(adapter(), "/tmp/assets");
    expect(await resolve("https://example.com/a.png")).toBe(
      "https://example.com/a.png"
    );
  });
});
