/**
 * Mutation-hardening tests for the shared media-ref byte resolver.
 *
 * Pins the *resolution order* and each inline guard: inline bytes win over a
 * uri, an empty inline payload must fall through (not short-circuit to empty),
 * and each uri scheme (data:/file://, absolute path, asset://, storage,
 * http(s)) resolves or returns null exactly. See MUTATION_TESTING.md.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  loadMediaRefBytes,
  isAbsoluteFilePath
} from "../src/media-ref-bytes.js";
import { RAW_RGBA_MIME } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "../src/context.js";
import type { MediaRefValue } from "../src/media-ref-bytes.js";

const tmp = mkdtempSync(join(tmpdir(), "mediaref-"));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isAbsoluteFilePath", () => {
  it("recognizes a Windows drive path", () => {
    expect(isAbsoluteFilePath("C:\\x\\y.png")).toBe(true);
    expect(isAbsoluteFilePath("C:/x/y.png")).toBe(true);
  });

  it("recognizes a UNC path", () => {
    expect(isAbsoluteFilePath("\\\\server\\share\\f")).toBe(true);
  });

  it("recognizes a POSIX absolute path", () => {
    expect(isAbsoluteFilePath("/etc/hosts")).toBe(true);
  });

  it("rejects relative paths and non-drive prefixes", () => {
    expect(isAbsoluteFilePath("foo/bar.png")).toBe(false);
    expect(isAbsoluteFilePath("1:\\x")).toBe(false);
    expect(isAbsoluteFilePath("C:x")).toBe(false);
  });

  it("anchors the drive pattern to the start (no mid-string match)", () => {
    // Pins the `^` anchor in the regex: a drive-like token later in the string
    // must NOT count as absolute.
    expect(isAbsoluteFilePath("foo/C:/bar")).toBe(false);
  });
});

describe("raw-RGBA refs encode to PNG before any uri handling", () => {
  it("encodes inline raw RGBA pixels", async () => {
    const value = {
      type: "image",
      data: new Uint8Array([255, 0, 0, 255]),
      width: 1,
      height: 1,
      mimeType: RAW_RGBA_MIME
    } as unknown as MediaRefValue;
    const bytes = await loadMediaRefBytes(value);
    expect(Array.from(bytes!.slice(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    ]);
  });
});

describe("inline data takes priority and is decoded exactly", () => {
  it("decodes a bare base64 string", async () => {
    const data = Buffer.from([10, 20, 30]).toString("base64");
    expect(await loadMediaRefBytes({ type: "image", data })).toEqual(
      new Uint8Array([10, 20, 30])
    );
  });

  it("strips a data: prefix before base64-decoding", async () => {
    const b64 = Buffer.from([1, 2, 3]).toString("base64");
    expect(
      await loadMediaRefBytes({ type: "image", data: `data:image/png;base64,${b64}` })
    ).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("returns a Uint8Array payload as-is", async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    expect(await loadMediaRefBytes({ type: "image", data: bytes })).toBe(bytes);
  });

  it("inline data wins over a resolvable uri", async () => {
    const data = Buffer.from([5]).toString("base64");
    const ctx = {
      storage: { retrieve: vi.fn(async () => new Uint8Array([99])) }
    } as unknown as ProcessingContext;
    const bytes = await loadMediaRefBytes(
      { type: "image", uri: "asset://x.png", data },
      ctx
    );
    expect(bytes).toEqual(new Uint8Array([5]));
  });
});

describe("empty inline payloads fall through to uri resolution", () => {
  it("empty string does not short-circuit to empty bytes", async () => {
    const file = join(tmp, "fallthrough.bin");
    writeFileSync(file, Buffer.from([42]));
    const bytes = await loadMediaRefBytes({
      type: "image",
      uri: pathToFileURL(file).href,
      data: ""
    });
    expect(Array.from(bytes!)).toEqual([42]);
  });

  it("empty Uint8Array does not short-circuit to empty bytes", async () => {
    const file = join(tmp, "fallthrough2.bin");
    writeFileSync(file, Buffer.from([43]));
    const bytes = await loadMediaRefBytes({
      type: "image",
      uri: pathToFileURL(file).href,
      data: new Uint8Array([])
    });
    expect(Array.from(bytes!)).toEqual([43]);
  });
});

describe("no resolvable source", () => {
  it("returns null when there is no uri and no inline data", async () => {
    expect(await loadMediaRefBytes({ type: "image" })).toBeNull();
  });
});

describe("readUriBytes — data: URIs", () => {
  it("base64 data: uri", async () => {
    const b64 = Buffer.from([1, 2, 3]).toString("base64");
    expect(
      await loadMediaRefBytes({ type: "image", uri: `data:image/png;base64,${b64}` })
    ).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("url-encoded (non-base64) data: uri decodes as utf-8", async () => {
    const bytes = await loadMediaRefBytes({
      type: "text",
      uri: "data:text/plain,hello%20world"
    });
    expect(Buffer.from(bytes!).toString("utf-8")).toBe("hello world");
  });

  it("malformed data: uri with no comma returns null", async () => {
    expect(
      await loadMediaRefBytes({ type: "text", uri: "data:no-comma-here" })
    ).toBeNull();
  });
});

describe("readUriBytes — filesystem", () => {
  it("reads a file:// uri", async () => {
    const file = join(tmp, "f.bin");
    writeFileSync(file, Buffer.from([1, 1, 2, 3, 5]));
    const bytes = await loadMediaRefBytes({
      type: "image",
      uri: pathToFileURL(file).href
    });
    expect(Array.from(bytes!)).toEqual([1, 1, 2, 3, 5]);
  });

  it("reads an absolute file path", async () => {
    const file = join(tmp, "abs.bin");
    writeFileSync(file, Buffer.from([7, 7]));
    const bytes = await loadMediaRefBytes({ type: "image", uri: file });
    expect(Array.from(bytes!)).toEqual([7, 7]);
  });

  it("returns null for a missing absolute path with no other source", async () => {
    expect(
      await loadMediaRefBytes({ type: "image", uri: "/no/such/file-xyz.bin" })
    ).toBeNull();
  });
});

describe("context-backed resolution", () => {
  it("resolves asset:// via resolveAssetBytes", async () => {
    const ctx = {
      resolveAssetBytes: vi.fn(async () => ({
        bytes: new Uint8Array([7, 8, 9]),
        attempts: []
      }))
    } as unknown as ProcessingContext;
    const bytes = await loadMediaRefBytes(
      { type: "image", uri: "asset://abc.png" },
      ctx
    );
    expect(bytes).toEqual(new Uint8Array([7, 8, 9]));
    expect(ctx.resolveAssetBytes).toHaveBeenCalledWith("asset://abc.png");
  });

  it("tries the raw uri before asset_id extension candidates", async () => {
    const retrieve = vi.fn(async (uri: string) =>
      uri === "stale://thing" ? new Uint8Array([1]) : null
    );
    const ctx = {
      storage: { retrieve }
    } as unknown as ProcessingContext;
    const bytes = await loadMediaRefBytes(
      { type: "image", uri: "stale://thing", asset_id: "a1" },
      ctx
    );
    expect(bytes).toEqual(new Uint8Array([1]));
    // raw uri is the first candidate
    expect(retrieve.mock.calls[0][0]).toBe("stale://thing");
  });

  it("builds asset_id candidates using the ref type's extensions", async () => {
    const retrieve = vi.fn(async (uri: string) =>
      uri === "/api/storage/a2.mp3" ? new Uint8Array([2]) : null
    );
    const ctx = {
      storage: { retrieve }
    } as unknown as ProcessingContext;
    const bytes = await loadMediaRefBytes(
      { type: "audio", uri: "missing://x", asset_id: "a2" },
      ctx
    );
    expect(bytes).toEqual(new Uint8Array([2]));
  });

  // Hardcoded (NOT derived from the source map) so a mutated extension string or
  // emptied array makes the expected candidate URL never get requested.
  const EXPECTED_EXTS: Record<string, string[]> = {
    image: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"],
    audio: ["wav", "mp3", "ogg", "m4a", "aac", "flac"],
    video: ["mp4", "webm", "mov", "avi", "mpeg", "mkv"],
    model3d: ["glb", "gltf", "obj", "fbx"]
  };
  for (const [type, exts] of Object.entries(EXPECTED_EXTS)) {
    it(`tries every ${type} extension candidate (in order, after the raw uri)`, async () => {
      const tried: string[] = [];
      const retrieve = vi.fn(async (uri: string) => {
        tried.push(uri);
        return null;
      });
      const ctx = {
        storage: { retrieve }
      } as unknown as ProcessingContext;
      await loadMediaRefBytes(
        { type, uri: "missing://x", asset_id: "ID" },
        ctx
      );
      expect(tried[0]).toBe("missing://x");
      for (const ext of exts) {
        expect(tried).toContain(`/api/storage/ID.${ext}`);
      }
    });
  }

  it("does not add asset_id candidates when asset_id is absent", async () => {
    const tried: string[] = [];
    const retrieve = vi.fn(async (uri: string) => {
      tried.push(uri);
      return null;
    });
    const ctx = {
      storage: { retrieve }
    } as unknown as ProcessingContext;
    await loadMediaRefBytes({ type: "image", uri: "only://this" }, ctx);
    expect(tried).toEqual(["only://this"]);
  });

  it("falls through when resolveAssetBytes yields no bytes", async () => {
    const ctx = {
      resolveAssetBytes: vi.fn(async () => ({ bytes: null, attempts: [] })),
      storage: {
        retrieve: vi.fn(async (uri: string) =>
          uri === "asset://x.png" ? new Uint8Array([55]) : null
        )
      }
    } as unknown as ProcessingContext;
    const bytes = await loadMediaRefBytes(
      { type: "image", uri: "asset://x.png" },
      ctx
    );
    // resolveAssetBytes returned nothing, so the storage candidate wins.
    expect(bytes).toEqual(new Uint8Array([55]));
  });

  it("falls back to a .bin candidate for an unknown ref type", async () => {
    const retrieve = vi.fn(async (uri: string) =>
      uri === "/api/storage/a3.bin" ? new Uint8Array([3]) : null
    );
    const ctx = {
      storage: { retrieve }
    } as unknown as ProcessingContext;
    const bytes = await loadMediaRefBytes(
      { type: "weird", uri: "missing://x", asset_id: "a3" },
      ctx
    );
    expect(bytes).toEqual(new Uint8Array([3]));
  });
});

describe("readUriBytes — http(s) fallback", () => {
  it("fetches https bytes when nothing else resolves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer
      }))
    );
    const bytes = await loadMediaRefBytes({
      type: "image",
      uri: "https://example.com/x.png"
    });
    expect(bytes).toEqual(new Uint8Array([4, 5, 6]));
  });

  it("fetches plain http bytes too (pins the http:// scheme clause)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([7]).buffer
      }))
    );
    const bytes = await loadMediaRefBytes({
      type: "image",
      uri: "http://example.com/x.png"
    });
    expect(bytes).toEqual(new Uint8Array([7]));
  });

  it("returns null when the http response is not ok", async () => {
    // arrayBuffer provided so a forced-true `response.ok` would return bytes —
    // the test still demands null, pinning the ok guard.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        arrayBuffer: async () => new Uint8Array([1]).buffer
      }))
    );
    expect(
      await loadMediaRefBytes({ type: "image", uri: "https://example.com/missing" })
    ).toBeNull();
  });

  it("does not fetch a non-http(s) uri", async () => {
    // A uri that no earlier branch resolves must NOT be fetched; the scheme
    // guard (and its startsWith/strings) pins this.
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([9, 9]).buffer
    }));
    vi.stubGlobal("fetch", fetchSpy);
    expect(
      await loadMediaRefBytes({ type: "image", uri: "ftp://example.com/x" })
    ).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      })
    );
    expect(
      await loadMediaRefBytes({ type: "image", uri: "http://example.com/x" })
    ).toBeNull();
  });
});
