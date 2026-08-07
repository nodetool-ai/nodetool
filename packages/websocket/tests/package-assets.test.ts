/**
 * Listing the constant assets shipped inside installed packages, and the
 * injection that gives the agent's `list_assets` tool access to them.
 *
 * `GET /api/assets/packages` is a `{assets: [], next: null}` stub and stays
 * one; this walks the same two roots `GET /api/assets/packages/:pkg/*`
 * streams from, so a name this returns is a name that route can serve.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAllMcpTools } from "@nodetool-ai/agents";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { listPackageAssets } from "../src/lib/package-assets.js";
import { mcpToolHostDeps } from "../src/mcp-tool-deps.js";

let root: string;

/** A bundled-assets root laid out the way the packaged backend ships one. */
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pkg-assets-"));
  mkdirSync(join(root, "nodetool-base", "audio"), { recursive: true });
  writeFileSync(join(root, "nodetool-base", "logo.png"), "PNGDATA");
  writeFileSync(join(root, "nodetool-base", "audio", "loop.mp3"), "MP3");
  mkdirSync(join(root, "nodetool-extra"), { recursive: true });
  writeFileSync(join(root, "nodetool-extra", "notes.txt"), "hi");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("listPackageAssets", () => {
  it("names each file the way a workflow and the stream route do", () => {
    const assets = listPackageAssets({ packageAssetsRoots: [root] });
    const logo = assets.find((a) => a.name === "logo.png");
    expect(logo).toEqual({
      package_name: "nodetool-base",
      name: "logo.png",
      content_type: "image/png",
      size: 7,
      uri: "package://nodetool-base/logo.png",
      url: "/api/assets/packages/nodetool-base/logo.png"
    });
  });

  it("walks nested directories, keeping the sub-path in the name", () => {
    const assets = listPackageAssets({ packageAssetsRoots: [root] });
    const loop = assets.find((a) => a.name === "audio/loop.mp3");
    expect(loop?.uri).toBe("package://nodetool-base/audio/loop.mp3");
    expect(loop?.url).toBe("/api/assets/packages/nodetool-base/audio/loop.mp3");
    expect(loop?.content_type).toBe("audio/mpeg");
  });

  it("covers every package under the root", () => {
    const packages = new Set(
      listPackageAssets({ packageAssetsRoots: [root] }).map(
        (a) => a.package_name
      )
    );
    expect(packages).toEqual(new Set(["nodetool-base", "nodetool-extra"]));
  });

  it("caps the total at the limit", () => {
    expect(
      listPackageAssets({ packageAssetsRoots: [root] }, { limit: 2 })
    ).toHaveLength(2);
    expect(
      listPackageAssets({ packageAssetsRoots: [root] }, { limit: 0 })
    ).toEqual([]);
  });

  it("treats a configured root that is not there as empty, not an error", () => {
    expect(
      listPackageAssets({
        packageAssetsRoots: [join(root, "does-not-exist")],
        metadataRoots: [join(root, "no-packages-here")]
      })
    ).toEqual([]);
  });
});

describe("list_assets with source: package", () => {
  const ctx = { userId: "user-1" } as unknown as ProcessingContext;

  function listAssetsTool(deps: Parameters<typeof getAllMcpTools>[0]) {
    const tool = getAllMcpTools(deps).find((t) => t.name === "list_assets");
    if (!tool) throw new Error("list_assets is not in the toolbelt");
    return tool;
  }

  it("returns the route's {assets, next} envelope filled with real files", async () => {
    const tool = listAssetsTool(mcpToolHostDeps({ packageAssetsRoots: [root] }));
    const result = (await tool.process(ctx, { source: "package" })) as {
      assets: Array<Record<string, unknown>>;
      next: unknown;
    };
    expect(result.next).toBeNull();
    expect(result.assets.map((a) => a["uri"])).toContain(
      "package://nodetool-base/logo.png"
    );
  });

  it("honours the limit the caller asked for", async () => {
    const tool = listAssetsTool(mcpToolHostDeps({ packageAssetsRoots: [root] }));
    const result = (await tool.process(ctx, {
      source: "package",
      limit: 1
    })) as { assets: unknown[] };
    expect(result.assets).toHaveLength(1);
  });

  // A host with no server context (the CLI) injects nothing and must say so
  // rather than answer "no package assets exist".
  it("says so when no lister was injected", async () => {
    const result = (await listAssetsTool({}).process(ctx, {
      source: "package"
    })) as Record<string, unknown>;
    expect(String(result["error"])).toContain("not available in this process");
  });
});
