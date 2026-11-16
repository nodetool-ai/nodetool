/**
 * A listing that cannot be read must throw. A caller that decides whether a
 * directory is another project's folder from a listing reads an empty result
 * as "nothing there", so a swallowed error opens the folder to its outer
 * workspace.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A `readdir` that fails the way a file system fails it, when a test sets one. */
const fsFaults = vi.hoisted(() => ({
  readdir: null as null | (() => Promise<never>)
}));

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readdir: ((...args: Parameters<typeof actual.readdir>) =>
      fsFaults.readdir
        ? fsFaults.readdir()
        : actual.readdir(...args)) as typeof actual.readdir
  };
});

import { FileStorageAdapter } from "../src/file-storage-adapter.js";
import { SupabaseStorageAdapter } from "../src/supabase-storage-adapter.js";
import type {
  SupabaseBucketApi,
  SupabaseObjectEntry,
  SupabaseStorageApi
} from "../src/supabase-rest.js";

function supabaseWith(list: SupabaseBucketApi["list"]): SupabaseStorageAdapter {
  const bucket = { list } as unknown as SupabaseBucketApi;
  const client: SupabaseStorageApi = { storage: { from: () => bucket } };
  return new SupabaseStorageAdapter({
    url: "https://x.supabase.co",
    apiKey: "k",
    bucket: "uploads",
    client
  });
}

describe("SupabaseStorageAdapter.list fails closed", () => {
  it("throws when the list call reports an error", async () => {
    const adapter = supabaseWith(async () => ({
      data: null,
      error: { message: "boom", status: 500 }
    }));
    await expect(adapter.list("projects/a/", { delimiter: "/" })).rejects.toThrow(
      /boom/
    );
  });

  it("throws when the list call answers with neither data nor an error", async () => {
    const adapter = supabaseWith(async () => ({ data: null, error: null }));
    await expect(adapter.list("projects/a/")).rejects.toThrow();
  });

  it("reads every page, so an entry past the first 1000 is seen", async () => {
    const all: SupabaseObjectEntry[] = Array.from({ length: 1500 }, (_, i) => ({
      name: `f${String(i).padStart(4, "0")}`,
      id: String(i)
    }));
    all.push({ name: ".nodetool", id: null });
    const calls: Array<{ limit?: number; offset?: number }> = [];
    const adapter = supabaseWith((async (
      _dir: string,
      options: { limit?: number; offset?: number } = {}
    ) => {
      calls.push(options);
      const offset = options.offset ?? 0;
      return {
        data: all.slice(offset, offset + (options.limit ?? 100)),
        error: null
      };
    }) as SupabaseBucketApi["list"]);
    const result = await adapter.list("p", { delimiter: "/" });
    expect(result.entries).toHaveLength(1500);
    expect(result.commonPrefixes).toContain("p/.nodetool/");
    expect(calls.length).toBeGreaterThan(1);
  });

  it("fails when a later page fails", async () => {
    let page = 0;
    const adapter = supabaseWith((async () => {
      page += 1;
      if (page === 1) {
        return {
          data: Array.from({ length: 1000 }, (_, i) => ({
            name: `f${i}`,
            id: String(i)
          })),
          error: null
        };
      }
      return { data: null, error: { message: "page two failed" } };
    }) as SupabaseBucketApi["list"]);
    await expect(adapter.list("p")).rejects.toThrow(/page two failed/);
  });
});

describe("FileStorageAdapter.list fails closed", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "list-closed-"));
  });
  afterEach(async () => {
    fsFaults.readdir = null;
    await rm(root, { recursive: true, force: true });
  });

  it("lists a missing directory as empty", async () => {
    const adapter = new FileStorageAdapter(root);
    expect(await adapter.list("absent/", { delimiter: "/" })).toEqual({
      entries: [],
      commonPrefixes: []
    });
  });

  it("lists a file used as a directory as empty", async () => {
    await writeFile(join(root, "plain"), "x");
    const adapter = new FileStorageAdapter(root);
    expect(await adapter.list("plain/", { delimiter: "/" })).toEqual({
      entries: [],
      commonPrefixes: []
    });
  });

  it("throws when a directory cannot be read (hierarchical)", async () => {
    await mkdir(join(root, "dir"));
    const adapter = new FileStorageAdapter(root);
    fsFaults.readdir = () =>
      Promise.reject(Object.assign(new Error("denied"), { code: "EACCES" }));
    await expect(adapter.list("dir/", { delimiter: "/" })).rejects.toThrow(
      /denied/
    );
  });

  it("throws when a directory cannot be read (flat)", async () => {
    await mkdir(join(root, "dir"));
    const adapter = new FileStorageAdapter(root);
    fsFaults.readdir = () =>
      Promise.reject(Object.assign(new Error("io error"), { code: "EIO" }));
    await expect(adapter.list("dir/")).rejects.toThrow(/io error/);
  });
});
