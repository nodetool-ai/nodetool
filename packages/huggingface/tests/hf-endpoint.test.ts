/**
 * HF_ENDPOINT: downloads and Hub metadata requests go to the configured host.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { asyncHfDownload } from "../src/hf-downloader.js";
import { getHuggingfaceFileInfos } from "../src/hf-file-info.js";
import { searchHfHub } from "../src/hf-hub-search.js";
import { resolveStoredHfEndpoint } from "../src/hf-auth.js";

const MIRROR = "https://hf-mirror.com";
const OID = "a".repeat(40);
const BODY = new TextEncoder().encode('{"hidden_size": 8}');

interface Seen {
  url: string;
  method: string;
  authorization: string | null;
}

/** A Hub that answers paths-info, file resolve and model search on any host. */
function stubHub(): Seen[] {
  const seen: Seen[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = input instanceof Request ? input.url : String(input);
      const headers = new Headers(init.headers);
      seen.push({
        url,
        method: init.method ?? "GET",
        authorization: headers.get("authorization")
      });
      if (url.includes("/paths-info/")) {
        return Response.json([
          { type: "file", path: "config.json", size: BODY.byteLength, oid: OID }
        ]);
      }
      if (url.includes("/api/models")) {
        return Response.json([{ _id: "1", id: "org/model", modelId: "org/model", likes: 1, downloads: 2 }]);
      }
      if (headers.get("range") === "bytes=0-0") {
        return new Response(BODY.slice(0, 1), {
          status: 206,
          headers: {
            etag: `"${OID}"`,
            "content-range": `bytes 0-0/${BODY.byteLength}`
          }
        });
      }
      return new Response(BODY, {
        headers: {
          etag: `"${OID}"`,
          "x-repo-commit": "b".repeat(40),
          "content-length": String(BODY.byteLength)
        }
      });
    })
  );
  return seen;
}

describe("HF_ENDPOINT", () => {
  let cacheDir: string;
  const savedEndpoint = process.env["HF_ENDPOINT"];

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "hf-endpoint-"));
    delete process.env["HF_ENDPOINT"];
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (savedEndpoint === undefined) delete process.env["HF_ENDPOINT"];
    else process.env["HF_ENDPOINT"] = savedEndpoint;
    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  const hosts = (seen: Seen[]) => [...new Set(seen.map((s) => new URL(s.url).origin))];

  it("downloads a file and its metadata from the configured mirror with the token", async () => {
    const seen = stubHub();
    const file = await asyncHfDownload("org/model", "config.json", {
      cacheDir,
      token: "hf_test",
      endpoint: MIRROR
    });

    expect(new Uint8Array(await fs.readFile(file))).toEqual(BODY);
    expect(hosts(seen)).toEqual([MIRROR]);
    expect(seen.some((s) => s.url.includes("/paths-info/"))).toBe(true);
    expect(seen.some((s) => s.url.includes("/org/model/resolve/"))).toBe(true);
    expect(seen.every((s) => s.authorization === "Bearer hf_test")).toBe(true);
  });

  it("uses HF_ENDPOINT from the environment when no endpoint is passed", async () => {
    process.env["HF_ENDPOINT"] = `${MIRROR}/`;
    const seen = stubHub();
    await asyncHfDownload("org/model", "config.json", { cacheDir, token: false });
    expect(hosts(seen)).toEqual([MIRROR]);
  });

  it("keeps the public Hub when nothing is configured", async () => {
    const seen = stubHub();
    await asyncHfDownload("org/model", "config.json", { cacheDir, token: false });
    expect(hosts(seen)).toEqual(["https://huggingface.co"]);
  });

  it("sends file-size lookups and Hub searches to the mirror", async () => {
    const seen = stubHub();
    await getHuggingfaceFileInfos([{ repo_id: "org/model", path: "config.json" }], undefined, MIRROR);
    await searchHfHub({ modelType: "hf.flux", limit: 1, token: null, endpoint: MIRROR });
    expect(hosts(seen)).toEqual([MIRROR]);
    expect(seen.some((s) => s.url.startsWith(`${MIRROR}/api/models?`))).toBe(true);
  });

  it("reads the stored setting before the environment", async () => {
    process.env["HF_ENDPOINT"] = "https://env.example.com";
    expect(await resolveStoredHfEndpoint(async () => `${MIRROR}/`)).toBe(MIRROR);
    expect(await resolveStoredHfEndpoint(async () => "")).toBe("https://env.example.com");
    expect(
      await resolveStoredHfEndpoint(async () => {
        throw new Error("locked");
      })
    ).toBe("https://env.example.com");
    delete process.env["HF_ENDPOINT"];
    expect(await resolveStoredHfEndpoint()).toBe("https://huggingface.co");
  });
});
