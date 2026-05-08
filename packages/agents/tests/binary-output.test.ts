import { describe, it, expect, beforeEach } from "vitest";
import {
  persistBinaryOutput,
  type PersistedBinary
} from "../src/tools/binary-output.js";
import {
  InMemoryStorageAdapter,
  type StorageAdapter,
  type StorageListResult,
  type StorageStat
} from "@nodetool-ai/storage";
import type { ProcessingContext } from "@nodetool-ai/runtime";

function makeContext(opts: {
  workspaceStorage?: StorageAdapter | null;
  storage?: StorageAdapter | null;
  resolveTempUrl?: (uri: string) => Promise<string> | string;
}): ProcessingContext {
  const tempResolver =
    opts.resolveTempUrl ??
    ((uri: string) =>
      uri.replace(/^memory:\/\//, "/api/storage/").replace(/^file:\/\//, ""));
  return {
    workspaceStorage: opts.workspaceStorage ?? null,
    storage: opts.storage ?? null,
    resolveTempUrl: async (uri: string) => tempResolver(uri)
  } as unknown as ProcessingContext;
}

class ThrowingStorage implements StorageAdapter {
  constructor(private readonly err: Error) {}
  async store(): Promise<string> {
    throw this.err;
  }
  async retrieve(): Promise<Uint8Array | null> {
    return null;
  }
  async exists(): Promise<boolean> {
    return false;
  }
  uriForKey(key: string): string {
    return `mock://${key}`;
  }
  async list(): Promise<StorageListResult> {
    return { entries: [], commonPrefixes: [] };
  }
  async delete(): Promise<boolean> {
    return false;
  }
  async stat(): Promise<StorageStat | null> {
    return null;
  }
}

describe("persistBinaryOutput", () => {
  let workspace: InMemoryStorageAdapter;
  let temp: InMemoryStorageAdapter;

  beforeEach(() => {
    workspace = new InMemoryStorageAdapter();
    temp = new InMemoryStorageAdapter();
  });

  it("populates output_file, asset_url, kind, and display_markdown on the happy path", async () => {
    const ctx = makeContext({ workspaceStorage: workspace, storage: temp });
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const result: PersistedBinary = await persistBinaryOutput(ctx, bytes, {
      outputFile: "images/foo.png",
      contentType: "image/png",
      uiPrefix: "images"
    });

    expect(result.output_file).toBe("images/foo.png");
    expect(result.asset_url).toBeTruthy();
    expect(result.asset_url).toMatch(/\.png$/);
    expect(result.kind).toBe("image");
    expect(result.display_markdown).toMatch(/^!\[.+\]\(.+\.png\)$/);

    const stored = await workspace.retrieve(workspace.uriForKey("images/foo.png"));
    expect(stored).toEqual(bytes);
  });

  it("synthesizes <audio>/<video> markdown for audio and video MIME types", async () => {
    const ctx = makeContext({ workspaceStorage: workspace, storage: temp });

    const audio = await persistBinaryOutput(ctx, new Uint8Array([0]), {
      contentType: "audio/mpeg",
      uiPrefix: "audio"
    });
    expect(audio.kind).toBe("audio");
    expect(audio.display_markdown).toMatch(/^<audio controls src="[^"]+"><\/audio>$/);

    const video = await persistBinaryOutput(ctx, new Uint8Array([0]), {
      contentType: "video/mp4",
      uiPrefix: "video"
    });
    expect(video.kind).toBe("video");
    expect(video.display_markdown).toMatch(/^<video controls src="[^"]+"><\/video>$/);
  });

  it("surfaces a workspace error when workspace storage throws but asset side succeeds", async () => {
    const ctx = makeContext({
      workspaceStorage: new ThrowingStorage(new Error("disk full")),
      storage: temp
    });

    const result = await persistBinaryOutput(ctx, new Uint8Array([1]), {
      outputFile: "out.png",
      contentType: "image/png"
    });

    expect(result.output_file).toBeUndefined();
    expect(result.asset_url).toBeTruthy();
    expect(result.errors).toBeDefined();
    expect(result.errors?.workspace).toContain("disk full");
    expect(result.errors?.asset).toBeUndefined();
  });

  it("surfaces an asset error when temp storage throws but workspace succeeds", async () => {
    const ctx = makeContext({
      workspaceStorage: workspace,
      storage: new ThrowingStorage(new Error("S3 unreachable"))
    });

    const result = await persistBinaryOutput(ctx, new Uint8Array([1]), {
      outputFile: "out.png",
      contentType: "image/png"
    });

    expect(result.output_file).toBe("out.png");
    expect(result.asset_url).toBeUndefined();
    expect(result.display_markdown).toBeUndefined();
    expect(result.errors).toBeDefined();
    expect(result.errors?.asset).toContain("S3 unreachable");
    expect(result.errors?.workspace).toBeUndefined();
  });

  it("surfaces an asset error when resolveTempUrl throws", async () => {
    const ctx = makeContext({
      workspaceStorage: workspace,
      storage: temp,
      resolveTempUrl: () => {
        throw new Error("resolver dead");
      }
    });

    const result = await persistBinaryOutput(ctx, new Uint8Array([1]), {
      outputFile: "out.png",
      contentType: "image/png"
    });

    expect(result.output_file).toBe("out.png");
    expect(result.asset_url).toBeUndefined();
    expect(result.errors?.asset).toContain("resolver dead");
  });

  it("HTML-escapes the asset_url when interpolated into <audio>/<video> attributes", async () => {
    // A resolver that returns an attacker-shaped URL — even if today's
    // server-built URLs are safe, the markdown synth should not depend on
    // that and must defend at the boundary.
    const ctx = makeContext({
      workspaceStorage: workspace,
      storage: temp,
      resolveTempUrl: () => `/api/storage/x.mp3"><script>alert(1)</script>`
    });

    const result = await persistBinaryOutput(ctx, new Uint8Array([0]), {
      contentType: "audio/mpeg"
    });

    expect(result.display_markdown).toBeTruthy();
    // Raw closing of the src attribute must not appear unescaped.
    expect(result.display_markdown).not.toContain('"><script>');
    // The < > " characters in the URL should be entity-escaped.
    expect(result.display_markdown).toMatch(/&quot;|&#34;/);
    expect(result.display_markdown).toMatch(/&lt;/);
    expect(result.display_markdown).toMatch(/&gt;/);
  });

  it("escapes parens and brackets in the URL for the image markdown form", async () => {
    // Markdown image syntax `![label](url)` breaks if the URL contains an
    // unescaped `)`. Even if today's URLs don't, defend at the boundary.
    const ctx = makeContext({
      workspaceStorage: workspace,
      storage: temp,
      resolveTempUrl: () => `/api/storage/foo(bar).png`
    });

    const result = await persistBinaryOutput(ctx, new Uint8Array([0]), {
      contentType: "image/png"
    });

    expect(result.display_markdown).toBeTruthy();
    // Either the parens are URL-escaped (%28/%29) or backslash-escaped — but
    // a raw `)` inside the URL portion would prematurely terminate the link.
    const md = result.display_markdown!;
    const urlPart = md.match(/\((.*)\)$/)?.[1] ?? "";
    expect(urlPart.includes(")")).toBe(false);
  });
});
