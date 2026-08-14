/**
 * The `media.*` bridge, driven from real guest code in the QuickJS sandbox.
 *
 * Every case is hermetic: refs resolve from a `data:` URI, inline data, a file
 * on disk, or an in-memory storage adapter. Nothing reaches the network.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runInSandbox } from "../src/js-sandbox.js";
import {
  looksLikeMediaRef,
  MAX_DATA_URI_BYTES,
  MAX_MEDIA_REF_BYTES,
  mediaLocatorFrom,
  remapMediaRef
} from "../src/sandbox-media-ref.js";

type Ctx = import("@nodetool-ai/runtime").ProcessingContext;

describe("generation-result locators", () => {
  const generated = {
    type: "image",
    asset_id: "img1",
    asset_uri: "asset://img1.png",
    url: "asset://img1",
    uri: "file:///var/assets/img1.png"
  };

  it("prefers asset_uri over the host filesystem path", () => {
    expect(mediaLocatorFrom(generated)).toBe("asset://img1.png");
    expect(remapMediaRef(generated)).toMatchObject({
      uri: "asset://img1.png",
      asset_id: "img1"
    });
    expect(mediaLocatorFrom(remapMediaRef(generated))).toBe("asset://img1.png");
  });

  it("treats a generation result as a ref and an option string as not", () => {
    expect(looksLikeMediaRef(generated)).toBe(true);
    expect(looksLikeMediaRef("png")).toBe(false);
    expect(looksLikeMediaRef("asset://img1.png")).toBe(true);
  });
});

/** A storage adapter backed by a Map, with only the methods the bridge uses. */
function createStorage(): {
  adapter: Record<string, unknown>;
  entries: Map<string, Uint8Array>;
} {
  const entries = new Map<string, Uint8Array>();
  const adapter = {
    store: async (key: string, data: Uint8Array): Promise<string> => {
      entries.set(key, data);
      return `/api/storage/${key}`;
    },
    retrieve: async (uri: string): Promise<Uint8Array | null> =>
      entries.get(uri.replace(/^\/api\/storage\//, "")) ?? null,
    uriForKey: (key: string): string => `/api/storage/${key}`
  };
  return { adapter, entries };
}

function contextWith(storage?: Record<string, unknown>): Ctx {
  return {
    storage,
    resolveAssetBytes: async () => ({ bytes: null, attempts: [] })
  } as unknown as Ctx;
}

let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "media-ref-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("media.bytes / media.text", () => {
  it("reads a data: URI ref", async () => {
    const result = await runInSandbox({
      code: `
        const ref = { type: "document", uri: "data:text/plain;base64,aGVsbG8=" };
        const bytes = await media.bytes(ref);
        return { isBytes: bytes instanceof Uint8Array, values: Array.from(bytes) };
      `,
      context: contextWith()
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      isBytes: true,
      values: [104, 101, 108, 108, 111]
    });
  });

  it("reads a ref carrying inline base64 data", async () => {
    const result = await runInSandbox({
      code: `
        return await media.text({ type: "document", data: "aGVsbG8=" });
      `,
      context: contextWith()
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("hello");
  });

  it("reads an absolute file path under host filesystem access", async () => {
    // Host mode is the scope where an absolute path means what it says. Under
    // the default workspace scope it is resolved workspace-relative instead —
    // see the "filesystem containment" cases below.
    const path = join(dir, "note.txt");
    await writeFile(path, "from disk");
    const result = await runInSandbox({
      code: `return await media.text({ type: "document", uri: ${JSON.stringify(path)} });`,
      context: contextWith(),
      limits: { filesystemAccess: "host" }
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("from disk");
  });

  it("expands a `~`-prefixed path under host filesystem access", async () => {
    // `loadMediaRefBytes` never touches a `~` path; `resolveGuestPath` expands
    // it, but only in host mode. The home directory is not writable in every
    // test environment, so the check is that expansion ran and the read then
    // missed — not that the tilde was passed to `fs` verbatim.
    const result = await runInSandbox({
      code: `
        try {
          await media.bytes({ type: "document", uri: "~/no-such-nodetool-file.bin" });
          return "resolved";
        } catch (e) {
          return e.message;
        }
      `,
      context: contextWith(),
      limits: { filesystemAccess: "host" }
    });
    expect(result.success).toBe(true);
    expect(result.result).toContain("could not read");
  });

  it("reads through a storage adapter", async () => {
    const { adapter, entries } = createStorage();
    entries.set("blob.bin", new Uint8Array([1, 2, 3]));
    const result = await runInSandbox({
      code: `
        const bytes = await media.bytes({
          type: "document",
          uri: "/api/storage/blob.bin"
        });
        return Array.from(bytes);
      `,
      context: contextWith(adapter)
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual([1, 2, 3]);
  });

  it("decodes with a named encoding", async () => {
    const result = await runInSandbox({
      code: `
        const ref = { type: "document", data: "/w==" };
        return await media.text(ref, { encoding: "latin1" });
      `,
      context: contextWith()
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("ÿ");
  });

  it("names an unsupported encoding", async () => {
    const result = await runInSandbox({
      code: `
        try {
          await media.text({ type: "document", data: "aGk=" }, { encoding: "klingon" });
          return "decoded";
        } catch (e) {
          return e.message;
        }
      `,
      context: contextWith()
    });
    expect(result.result).toContain('unsupported encoding "klingon"');
  });

  it("throws naming the ref when nothing resolves", async () => {
    const result = await runInSandbox({
      code: `
        try {
          await media.bytes({ type: "image", uri: "asset://missing-one" });
          return "resolved";
        } catch (e) {
          return e.message;
        }
      `,
      context: contextWith()
    });
    expect(result.success).toBe(true);
    expect(result.result).toContain("media.bytes");
    expect(result.result).toContain("asset://missing-one");
  });

  it("rejects a non-object ref", async () => {
    const result = await runInSandbox({
      code: `
        try {
          await media.bytes("asset://x");
          return "resolved";
        } catch (e) {
          return e.message;
        }
      `,
      context: contextWith()
    });
    expect(result.result).toContain("expected a media ref object");
  });

  it("refuses a ref over the size ceiling", async () => {
    const { adapter, entries } = createStorage();
    entries.set("huge.bin", new Uint8Array(MAX_MEDIA_REF_BYTES + 1));
    const result = await runInSandbox({
      code: `
        try {
          await media.bytes({ type: "video", uri: "/api/storage/huge.bin" });
          return "resolved";
        } catch (e) {
          return e.message;
        }
      `,
      context: contextWith(adapter),
      timeoutMs: 60_000
    });
    expect(result.result).toContain(`over the ${MAX_MEDIA_REF_BYTES} byte limit`);
  });
});

describe("media.info", () => {
  it("reports type, mime, uri and size", async () => {
    const result = await runInSandbox({
      code: `
        return await media.info({
          type: "image",
          uri: "data:image/png;base64,aGVsbG8="
        });
      `,
      context: contextWith()
    });
    expect(result.result).toEqual({
      type: "image",
      mimeType: "image/png",
      uri: "data:image/png;base64,aGVsbG8=",
      size: 5
    });
  });

  it("derives the mime type from the uri extension", async () => {
    const path = join(dir, "report.pdf");
    await writeFile(path, "%PDF-1.4");
    const result = await runInSandbox({
      code: `
        const info = await media.info({ type: "document", uri: ${JSON.stringify(path)} });
        return { mimeType: info.mimeType, size: info.size };
      `,
      context: contextWith(),
      limits: { filesystemAccess: "host" }
    });
    expect(result.result).toEqual({ mimeType: "application/pdf", size: 8 });
  });
});

describe("media output builders", () => {
  it("persists through createAsset as asset:// plus asset_id", async () => {
    const created: { id: string; name: string; contentType: string }[] = [];
    const context = {
      hasModelInterface: (name: string) => name === "createAsset",
      createAsset: async (args: {
        name: string;
        contentType: string;
        content: Uint8Array;
      }) => {
        const id = "out-1";
        created.push({
          id,
          name: args.name,
          contentType: args.contentType
        });
        return { id };
      },
      resolveAssetBytes: async () => ({ bytes: null, attempts: [] })
    } as unknown as Ctx;
    const result = await runInSandbox({
      code: `
        const ref = await image.toAsset(new Uint8Array([1, 2, 3]), {
          mimeType: "image/png",
          filename: "frame.png"
        });
        return ref;
      `,
      context
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      type: "image",
      uri: "asset://out-1",
      asset_id: "out-1",
      mimeType: "image/png",
      metadata: { filename: "frame.png" }
    });
    expect(created).toEqual([
      { id: "out-1", name: "frame.png", contentType: "image/png" }
    ]);
  });

  it("does not emit the file:// path a local store() returns", async () => {
    const entries = new Map<string, Uint8Array>();
    const fileStore = {
      store: async (key: string, data: Uint8Array) => {
        entries.set(key, data);
        return `file:///var/assets/${key}`;
      },
      retrieve: async (uri: string) =>
        entries.get(uri.replace(/^\/api\/storage\//, "")) ?? null,
      uriForKey: (key: string) => `file:///var/assets/${key}`
    };
    const result = await runInSandbox({
      code: `
        return await media.toImage(new Uint8Array([1, 2, 3]), {
          mimeType: "image/png"
        });
      `,
      context: contextWith(fileStore)
    });
    expect(result.success).toBe(true);
    const ref = result.result as Record<string, unknown>;
    expect(String(ref.uri)).toMatch(/^\/api\/storage\/sandbox\/[\w-]+\.png$/);
    expect(String(ref.uri)).not.toContain("file://");
    expect(ref.asset_id).toBeNull();
  });

  it("writes through storage when the context has it", async () => {
    const { adapter, entries } = createStorage();
    const result = await runInSandbox({
      code: `
        const ref = await media.toImage(new Uint8Array([1, 2, 3]), {
          mimeType: "image/webp"
        });
        return ref;
      `,
      context: contextWith(adapter)
    });
    expect(result.success).toBe(true);
    const ref = result.result as Record<string, unknown>;
    expect(ref.type).toBe("image");
    expect(ref.mimeType).toBe("image/webp");
    expect(String(ref.uri)).toMatch(/^\/api\/storage\/sandbox\/[\w-]+\.webp$/);
    expect(entries.size).toBe(1);
  });

  it("round-trips bytes out and back in", async () => {
    const { adapter } = createStorage();
    const result = await runInSandbox({
      code: `
        const ref = await media.toDocument(new Uint8Array([7, 8, 9]), {
          filename: "out.pdf"
        });
        const back = await media.bytes(ref);
        return { uri: ref.uri, metadata: ref.metadata, values: Array.from(back) };
      `,
      context: contextWith(adapter)
    });
    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({
      metadata: { filename: "out.pdf" },
      values: [7, 8, 9]
    });
  });

  it("falls back to a data URI without storage", async () => {
    const result = await runInSandbox({
      code: `
        const audio = await media.toAudio(new Uint8Array([104, 105]));
        const video = await media.toVideo(new Uint8Array([104, 105]));
        return { audio, video };
      `,
      context: contextWith()
    });
    expect(result.result).toEqual({
      audio: {
        type: "audio",
        uri: "data:audio/mpeg;base64,aGk=",
        asset_id: null,
        mimeType: "audio/mpeg"
      },
      video: {
        type: "video",
        uri: "data:video/mp4;base64,aGk=",
        asset_id: null,
        mimeType: "video/mp4"
      }
    });
  });

  it("derives the mime type from a filename", async () => {
    const result = await runInSandbox({
      code: `
        const ref = await media.toDocument(new Uint8Array([1]), { filename: "a.md" });
        return ref.uri;
      `,
      context: contextWith()
    });
    expect(result.result).toBe("data:text/markdown;base64,AQ==");
  });

  it("refuses a large payload when no storage can hold it", async () => {
    const result = await runInSandbox({
      code: `
        try {
          await media.toVideo(new Uint8Array(${MAX_DATA_URI_BYTES + 1}));
          return "built";
        } catch (e) {
          return e.message;
        }
      `,
      context: contextWith(),
      timeoutMs: 60_000
    });
    expect(result.result).toContain("needs storage");
  });

  it("refuses a payload over the size ceiling", async () => {
    const { adapter } = createStorage();
    const result = await runInSandbox({
      code: `
        try {
          await media.toVideo(new Uint8Array(${MAX_MEDIA_REF_BYTES + 1}));
          return "built";
        } catch (e) {
          return e.message;
        }
      `,
      context: contextWith(adapter),
      timeoutMs: 60_000
    });
    expect(result.result).toContain(`over the ${MAX_MEDIA_REF_BYTES} byte limit`);
  });

  it("rejects a non-Uint8Array payload", async () => {
    const result = await runInSandbox({
      code: `
        try {
          await media.toImage("not bytes");
          return "built";
        } catch (e) {
          return e.message;
        }
      `,
      context: contextWith()
    });
    expect(result.result).toContain("bytes must be a Uint8Array");
  });
});

describe("media without a context", () => {
  it("fails every member with a named error", async () => {
    const result = await runInSandbox({
      code: `
        const names = ["bytes", "text", "info", "toDocument", "toImage", "toAudio", "toVideo"];
        const out = {};
        for (const name of names) {
          try {
            await media[name]({ type: "document", data: "aGk=" });
            out[name] = "ok";
          } catch (e) {
            out[name] = e.message;
          }
        }
        return out;
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      bytes: "media.bytes is not available without a context",
      text: "media.text is not available without a context",
      info: "media.info is not available without a context",
      toDocument: "media.toDocument is not available without a context",
      toImage: "media.toImage is not available without a context",
      toAudio: "media.toAudio is not available without a context",
      toVideo: "media.toVideo is not available without a context"
    });
  });
});

/**
 * `media.*` reaches the filesystem, so it answers to the same containment
 * `workspace.*` does: a run resolves paths under its workspace root unless the
 * host opted into `filesystemAccess: "host"`. Guest code cannot ask for host
 * mode, so a model-written body cannot read a credential file by naming it.
 */
describe("filesystem containment", () => {
  let workspace = "";
  let outside = "";
  let outsideFile = "";

  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), "media-ws-"));
    outside = await mkdtemp(join(tmpdir(), "media-outside-"));
    outsideFile = join(outside, "secret.txt");
    await writeFile(outsideFile, "TOP SECRET");
  });

  afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  const workspaceContext = (): Ctx =>
    ({
      resolveAssetBytes: async () => ({ bytes: null, attempts: [] }),
      resolveWorkspacePath: (p: string) =>
        resolve(workspace, p.replace(/^[/\\]+/, ""))
    }) as unknown as Ctx;

  it("reads a file inside the workspace", async () => {
    await writeFile(join(workspace, "note.txt"), "from the workspace");
    const result = await runInSandbox({
      code: `return await media.text({ type: "document", uri: "note.txt" });`,
      context: workspaceContext()
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("from the workspace");
  });

  it("refuses a path outside the workspace", async () => {
    const result = await runInSandbox({
      code: `
        try {
          return await media.text({ type: "document", uri: ${JSON.stringify(outsideFile)} });
        } catch (e) {
          return e.message;
        }
      `,
      context: workspaceContext()
    });
    expect(result.success).toBe(true);
    expect(result.result).not.toContain("TOP SECRET");
  });

  it("refuses a `file://` URI pointing outside the workspace", async () => {
    const result = await runInSandbox({
      code: `
        try {
          return await media.text({
            type: "document",
            uri: ${JSON.stringify(`file://${outsideFile}`)}
          });
        } catch (e) {
          return e.message;
        }
      `,
      context: workspaceContext()
    });
    expect(result.success).toBe(true);
    expect(result.result).not.toContain("TOP SECRET");
  });

  it("reads outside the workspace when the host opted into host mode", async () => {
    const result = await runInSandbox({
      code: `return await media.text({ type: "document", uri: ${JSON.stringify(outsideFile)} });`,
      context: workspaceContext(),
      limits: { filesystemAccess: "host" }
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("TOP SECRET");
  });
});
