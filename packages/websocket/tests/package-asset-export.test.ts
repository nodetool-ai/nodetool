/**
 * Tests for materializeWorkflowConstantAssets — converting a workflow's
 * per-install asset refs into shipped constant `package://` assets.
 *
 * Run with:
 *   npm run test --workspace=packages/websocket -- package-asset-export
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  materializeWorkflowConstantAssets,
  type WorkflowGraphLike
} from "../src/lib/package-asset-export.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "nodetool-export-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function audioInputGraph(): WorkflowGraphLike {
  return {
    nodes: [
      {
        id: "1",
        type: "nodetool.input.AudioInput",
        data: {
          name: "description",
          value: {
            asset_id: "6cba4e9efc884854a3939f62007fd9bf",
            uri: "/api/storage/6cba4e9efc884854a3939f62007fd9bf.bin",
            type: "audio"
          }
        }
      }
    ],
    edges: []
  };
}

describe("materializeWorkflowConstantAssets", () => {
  it("rewrites a /api/storage ref to package:// and writes the bytes", async () => {
    const fetchAssetBytes = vi.fn().mockResolvedValue(new Uint8Array([9, 8, 7]));
    const result = await materializeWorkflowConstantAssets(audioInputGraph(), {
      packageName: "nodetool-base",
      assetsRoot: root,
      fetchAssetBytes
    });

    expect(fetchAssetBytes).toHaveBeenCalledWith(
      "/api/storage/6cba4e9efc884854a3939f62007fd9bf.bin"
    );
    expect(result.exported).toHaveLength(1);
    const ex = result.exported[0];
    expect(ex.fileName).toBe("6cba4e9efc884854a3939f62007fd9bf.bin");
    expect(ex.packageUri).toBe(
      "package://nodetool-base/6cba4e9efc884854a3939f62007fd9bf.bin"
    );

    const ref = (result.graph.nodes[0].data as Record<string, any>).value;
    expect(ref.uri).toBe(
      "package://nodetool-base/6cba4e9efc884854a3939f62007fd9bf.bin"
    );
    expect(ref.asset_id).toBeUndefined();
    expect(ref.type).toBe("audio");

    const written = await readFile(
      join(root, "nodetool-base", "6cba4e9efc884854a3939f62007fd9bf.bin")
    );
    expect(Array.from(written)).toEqual([9, 8, 7]);
  });

  it("does not mutate the input graph", async () => {
    const input = audioInputGraph();
    const fetchAssetBytes = vi.fn().mockResolvedValue(new Uint8Array([1]));
    await materializeWorkflowConstantAssets(input, {
      packageName: "nodetool-base",
      assetsRoot: root,
      fetchAssetBytes
    });
    const ref = (input.nodes[0].data as Record<string, any>).value;
    expect(ref.uri).toBe(
      "/api/storage/6cba4e9efc884854a3939f62007fd9bf.bin"
    );
    expect(ref.asset_id).toBe("6cba4e9efc884854a3939f62007fd9bf");
  });

  it("resolves asset:// refs via a synthesized id and adds an extension by type", async () => {
    const graph: WorkflowGraphLike = {
      nodes: [
        {
          id: "1",
          type: "nodetool.constant.Image",
          data: { value: { asset_id: "abc123", type: "image" } }
        }
      ],
      edges: []
    };
    const fetchAssetBytes = vi.fn().mockResolvedValue(new Uint8Array([2, 2]));
    const result = await materializeWorkflowConstantAssets(graph, {
      packageName: "nodetool-base",
      assetsRoot: root,
      fetchAssetBytes
    });
    expect(fetchAssetBytes).toHaveBeenCalledWith("asset://abc123");
    expect(result.exported[0].fileName).toBe("abc123.png");
  });

  it("leaves remote and package refs untouched by default", async () => {
    const graph: WorkflowGraphLike = {
      nodes: [
        {
          id: "1",
          type: "x",
          data: {
            a: { uri: "https://example.com/i.png", type: "image" },
            b: { uri: "package://nodetool-base/already.png", type: "image" }
          }
        }
      ],
      edges: []
    };
    const fetchAssetBytes = vi.fn();
    const result = await materializeWorkflowConstantAssets(graph, {
      packageName: "nodetool-base",
      assetsRoot: root,
      fetchAssetBytes
    });
    expect(fetchAssetBytes).not.toHaveBeenCalled();
    expect(result.exported).toHaveLength(0);
    const data = result.graph.nodes[0].data as Record<string, any>;
    expect(data.a.uri).toBe("https://example.com/i.png");
    expect(data.b.uri).toBe("package://nodetool-base/already.png");
  });

  it("dedupes identical sources to a single file", async () => {
    const graph: WorkflowGraphLike = {
      nodes: [
        { id: "1", type: "x", data: { v: { uri: "/api/storage/dup.png", type: "image" } } },
        { id: "2", type: "x", data: { v: { uri: "/api/storage/dup.png", type: "image" } } }
      ],
      edges: []
    };
    const fetchAssetBytes = vi.fn().mockResolvedValue(new Uint8Array([5]));
    const result = await materializeWorkflowConstantAssets(graph, {
      packageName: "nodetool-base",
      assetsRoot: root,
      fetchAssetBytes
    });
    expect(fetchAssetBytes).toHaveBeenCalledTimes(1);
    expect(result.exported).toHaveLength(1);
  });

  it("records refs that fail to resolve in skipped and leaves them unchanged", async () => {
    const fetchAssetBytes = vi.fn().mockResolvedValue(null);
    const result = await materializeWorkflowConstantAssets(audioInputGraph(), {
      packageName: "nodetool-base",
      assetsRoot: root,
      fetchAssetBytes
    });
    expect(result.skipped).toEqual([
      "/api/storage/6cba4e9efc884854a3939f62007fd9bf.bin"
    ]);
    expect(result.exported).toHaveLength(0);
    const ref = (result.graph.nodes[0].data as Record<string, any>).value;
    expect(ref.uri).toBe(
      "/api/storage/6cba4e9efc884854a3939f62007fd9bf.bin"
    );
  });
});
