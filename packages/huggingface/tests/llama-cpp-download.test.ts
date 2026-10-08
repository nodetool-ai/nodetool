/**
 * The llama.cpp flat-cache download: a file in a repo subdirectory lands flat
 * in the cache, an abort during a pending read removes the partial file, and
 * concurrent downloads of one file do not share a temp file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  downloadLlamaCppModel,
  getLlamaCppCacheDir,
  getLlamaCppModelFilename
} from "../src/llama-cpp-download.js";

let home: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "llama-dl-"));
  for (const key of ["HOME", "USERPROFILE", "LOCALAPPDATA"]) {
    saved[key] = process.env[key];
  }
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.LOCALAPPDATA = home;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(home, { recursive: true, force: true });
});

function headResponse(size: number): Response {
  return new Response(null, {
    status: 200,
    headers: { "content-length": String(size), etag: '"abc"' }
  });
}

describe("getLlamaCppModelFilename", () => {
  it("flattens a subdirectory in the file name", () => {
    expect(
      getLlamaCppModelFilename(
        "org/repo-GGUF",
        "Q4_K_M/model-00001-of-00002.gguf"
      )
    ).toBe("org_repo-GGUF_Q4_K_M_model-00001-of-00002.gguf");
  });
});

describe("downloadLlamaCppModel", () => {
  it("writes a sharded file from a subdirectory into the flat cache", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "HEAD"
          ? headResponse(4)
          : new Response("gguf", { status: 200 })
      )
    );
    const out = await downloadLlamaCppModel(
      "org/repo",
      "Q4_K_M/model-00001-of-00002.gguf"
    );
    expect(out).toBe(
      join(getLlamaCppCacheDir(), "org_repo_Q4_K_M_model-00001-of-00002.gguf")
    );
    expect(await readFile(out, "utf-8")).toBe("gguf");
  });

  it("removes the partial file when aborted during a pending read", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "HEAD") return headResponse(100);
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new Uint8Array(10));
            // Never closes: the next read stays pending until the abort.
            init?.signal?.addEventListener("abort", () =>
              c.error(new DOMException("aborted", "AbortError"))
            );
          }
        });
        return new Response(body, { status: 200 });
      })
    );
    const pending = downloadLlamaCppModel("org/repo", "m.gguf", {
      cancelSignal: controller.signal,
      progressCallback: () => {
        setTimeout(() => controller.abort(), 5);
      }
    });
    await expect(pending).rejects.toThrow(/abort/i);
    expect(await readdir(getLlamaCppCacheDir())).toEqual([]);
  });

  it("lets two concurrent downloads of one file both complete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "HEAD") return headResponse(8);
        const body = new ReadableStream<Uint8Array>({
          async start(c) {
            for (const part of ["abcd", "efgh"]) {
              await new Promise((resolve) => setTimeout(resolve, 5));
              c.enqueue(new TextEncoder().encode(part));
            }
            c.close();
          }
        });
        return new Response(body, { status: 200 });
      })
    );
    const [a, b] = await Promise.all([
      downloadLlamaCppModel("org/repo", "m.gguf"),
      downloadLlamaCppModel("org/repo", "m.gguf")
    ]);
    expect(a).toBe(b);
    expect(await readFile(a, "utf-8")).toBe("abcdefgh");
    const leftovers = (await readdir(getLlamaCppCacheDir())).filter((f) =>
      f.endsWith(".tmp")
    );
    expect(leftovers).toEqual([]);
  });
});
