import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchPackageMedia,
  findPackageMedia,
  readMissingPackageMedia,
  resetPackageMediaManifests
} from "../src/package-media.js";

const BYTES = new TextEncoder().encode("example sprite bytes");
const SHA256 = createHash("sha256").update(BYTES).digest("hex");

let root: string;
let cache: string;

function writeManifest(files: Record<string, { sha256: string; size: number }>): void {
  writeFileSync(
    join(root, "nodetool-base.media.json"),
    JSON.stringify({ version: 1, base: "https://media.nodetool.ai/package-media", files })
  );
}

function serve(bytes: Uint8Array): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => new Response(bytes, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "package-media-root-"));
  cache = mkdtempSync(join(tmpdir(), "package-media-cache-"));
  resetPackageMediaManifests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(root, { recursive: true, force: true });
  rmSync(cache, { recursive: true, force: true });
});

describe("package media", () => {
  it("downloads a listed file by content hash once and serves the cache after", async () => {
    writeManifest({ "games/a/sprite.png": { sha256: SHA256, size: BYTES.byteLength } });
    const fetchMock = serve(BYTES);

    const first = await fetchPackageMedia([root], "nodetool-base", "games/a/sprite.png", cache);
    const second = await fetchPackageMedia([root], "nodetool-base", "games/a/sprite.png", cache);

    expect(first).toBe(join(cache, `${SHA256}.png`));
    expect(second).toBe(first);
    expect(new Uint8Array(readFileSync(first ?? ""))).toEqual(BYTES);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`https://media.nodetool.ai/package-media/${SHA256}.png`);
  });

  it("returns null for a path no manifest lists, without a request", async () => {
    writeManifest({});
    const fetchMock = serve(BYTES);

    expect(await fetchPackageMedia([root], "nodetool-base", "games/a/missing.png", cache)).toBeNull();
    expect(await fetchPackageMedia([root], "other-package", "games/a/sprite.png", cache)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects bytes that do not match the manifest and caches nothing", async () => {
    writeManifest({ "games/a/sprite.png": { sha256: SHA256, size: BYTES.byteLength } });
    serve(new TextEncoder().encode("exampl3 sprite bytes"));

    await expect(fetchPackageMedia([root], "nodetool-base", "games/a/sprite.png", cache)).rejects.toThrow(
      /does not match/
    );
    serve(BYTES);
    expect(await fetchPackageMedia([root], "nodetool-base", "games/a/sprite.png", cache)).toBe(
      join(cache, `${SHA256}.png`)
    );
  });

  it("ignores entries with a malformed hash and manifests on another host", () => {
    writeManifest({ "games/a/bad.png": { sha256: "../../etc/passwd", size: 1 } });
    expect(findPackageMedia([root], "nodetool-base", "games/a/bad.png")).toBeNull();

    resetPackageMediaManifests();
    writeFileSync(
      join(root, "nodetool-base.media.json"),
      JSON.stringify({
        version: 1,
        base: "https://media.example.test/",
        files: { "games/a/bad.png": { sha256: SHA256, size: 1 } }
      })
    );
    expect(findPackageMedia([root], "nodetool-base", "games/a/bad.png")).toBeNull();
  });

  it("reads only the package:// URIs the caller did not already have", async () => {
    writeManifest({ "games/a/sprite.png": { sha256: SHA256, size: BYTES.byteLength } });
    vi.stubEnv("NODETOOL_PACKAGE_MEDIA_CACHE", cache);
    const fetchMock = serve(BYTES);
    const uri = "package://nodetool-base/games/a/sprite.png";

    expect(await readMissingPackageMedia([uri], new Set([uri]), [root])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await readMissingPackageMedia([uri, "asset://abc"], new Set(), [root])).toEqual([{ uri, bytes: BYTES }]);
    vi.unstubAllEnvs();
  });
});
