/**
 * Tests for the .nodetool workflow bundle codec — packing a workflow + its
 * referenced assets into a portable zip and importing it back.
 *
 * Run with:
 *   npm run test --workspace=packages/websocket -- workflow-bundle
 */
import { describe, it, expect, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  packWorkflowBundle,
  unpackWorkflowBundle,
  importWorkflowBundle,
  verifyBundleChecksums,
  WORKFLOW_BUNDLE_FORMAT,
  WORKFLOW_BUNDLE_SCHEME,
  WORKFLOW_BUNDLE_VERSION,
  type BundledWorkflow
} from "../src/lib/workflow-bundle.js";

/** Build a raw .nodetool zip from a workflow graph + named asset entries. */
function makeZip(
  graph: BundledWorkflow["graph"],
  assets: Record<string, Uint8Array>,
  manifestAssets: { file: string; bytes: number; sha256: string }[]
): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(
      JSON.stringify({
        format: WORKFLOW_BUNDLE_FORMAT,
        version: WORKFLOW_BUNDLE_VERSION,
        created_at: new Date().toISOString(),
        assets: manifestAssets,
        thumbnail: null
      })
    ),
    "workflow.json": strToU8(JSON.stringify({ name: "raw", graph }))
  };
  for (const [name, bytes] of Object.entries(assets)) {
    files[`assets/${name}`] = bytes;
  }
  return zipSync(files);
}

function audioWorkflow(): BundledWorkflow {
  return {
    name: "Audio To Image",
    description: "demo",
    tags: ["audio"],
    run_mode: "workflow",
    settings: null,
    graph: {
      nodes: [
        {
          id: "1",
          type: "nodetool.input.AudioInput",
          data: {
            name: "clip",
            value: {
              asset_id: "6cba4e9e",
              uri: "/api/storage/6cba4e9e.mp3",
              type: "audio"
            }
          }
        }
      ],
      edges: []
    }
  };
}

describe("packWorkflowBundle / unpackWorkflowBundle", () => {
  it("embeds referenced assets and rewrites refs to bundle://", async () => {
    const fetchAssetBytes = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const { bytes, manifest } = await packWorkflowBundle({
      workflow: audioWorkflow(),
      fetchAssetBytes,
      nodetoolVersion: "9.9.9"
    });

    expect(fetchAssetBytes).toHaveBeenCalledWith("/api/storage/6cba4e9e.mp3");
    expect(manifest.format).toBe(WORKFLOW_BUNDLE_FORMAT);
    expect(manifest.nodetool_version).toBe("9.9.9");
    expect(manifest.assets).toHaveLength(1);
    expect(manifest.assets[0].file).toMatch(/^assets\/[0-9a-f]{64}\.mp3$/);
    expect(manifest.assets[0].bytes).toBe(3);

    const unpacked = unpackWorkflowBundle(bytes);
    const ref = (unpacked.workflow.graph.nodes[0].data as Record<string, any>)
      .value;
    expect(ref.uri.startsWith(WORKFLOW_BUNDLE_SCHEME)).toBe(true);
    expect(ref.asset_id).toBeUndefined();
    expect(unpacked.assets.size).toBe(1);
    expect(verifyBundleChecksums(unpacked)).toEqual([]);
  });

  it("does not mutate the input workflow graph", async () => {
    const wf = audioWorkflow();
    await packWorkflowBundle({
      workflow: wf,
      fetchAssetBytes: vi.fn().mockResolvedValue(new Uint8Array([1]))
    });
    const ref = (wf.graph.nodes[0].data as Record<string, any>).value;
    expect(ref.uri).toBe("/api/storage/6cba4e9e.mp3");
  });

  it("dedupes identical asset bytes to a single archive entry", async () => {
    const wf: BundledWorkflow = {
      name: "two refs",
      graph: {
        nodes: [
          { id: "1", type: "x", data: { v: { uri: "/api/storage/a.png", type: "image" } } },
          { id: "2", type: "x", data: { v: { uri: "/api/storage/b.png", type: "image" } } }
        ],
        edges: []
      }
    };
    const fetchAssetBytes = vi.fn().mockResolvedValue(new Uint8Array([7, 7, 7]));
    const { manifest } = await packWorkflowBundle({ workflow: wf, fetchAssetBytes });
    // Two distinct sources, identical bytes → one content-addressed file.
    expect(fetchAssetBytes).toHaveBeenCalledTimes(2);
    expect(manifest.assets).toHaveLength(1);
  });

  it("rejects an unrecognized format on unpack", () => {
    // Pack a valid bundle, then feed unrelated bytes.
    expect(() => unpackWorkflowBundle(new Uint8Array([0, 1, 2]))).toThrow();
  });
});

describe("importWorkflowBundle", () => {
  it("round-trips: export then import rewrites refs via storeAsset", async () => {
    const { bytes } = await packWorkflowBundle({
      workflow: audioWorkflow(),
      fetchAssetBytes: vi.fn().mockResolvedValue(new Uint8Array([4, 5, 6]))
    });

    const stored: Array<{ fileName: string; contentType: string }> = [];
    const result = await importWorkflowBundle(bytes, {
      storeAsset: async ({ fileName, contentType }) => {
        stored.push({ fileName, contentType });
        return { uri: `asset://imported-${stored.length}.mp3`, assetId: `imported-${stored.length}` };
      }
    });

    expect(stored).toHaveLength(1);
    expect(stored[0].contentType).toBe("audio/mpeg");
    expect(result.missing).toEqual([]);
    expect(result.imported).toHaveLength(1);

    const ref = (result.workflow.graph.nodes[0].data as Record<string, any>)
      .value;
    expect(ref.uri).toBe("asset://imported-1.mp3");
    expect(ref.asset_id).toBe("imported-1");
    expect(result.workflow.name).toBe("Audio To Image");
  });

  it("reports bundle:// refs whose bytes are missing from the archive", async () => {
    const zip = makeZip(
      {
        nodes: [
          { id: "1", type: "x", data: { v: { uri: `${WORKFLOW_BUNDLE_SCHEME}ghost.png`, type: "image" } } }
        ],
        edges: []
      },
      {},
      []
    );
    const storeAsset = vi.fn();
    const result = await importWorkflowBundle(zip, { storeAsset });
    expect(storeAsset).not.toHaveBeenCalled();
    expect(result.missing).toEqual(["ghost.png"]);
  });

  it("throws on checksum mismatch when verifyChecksums is set", async () => {
    const zip = makeZip(
      {
        nodes: [
          { id: "1", type: "x", data: { v: { uri: `${WORKFLOW_BUNDLE_SCHEME}real.png`, type: "image" } } }
        ],
        edges: []
      },
      { "real.png": new Uint8Array([1, 2, 3]) },
      [{ file: "assets/real.png", bytes: 3, sha256: "deadbeef" }]
    );
    await expect(
      importWorkflowBundle(zip, {
        storeAsset: async () => ({ uri: "asset://x", assetId: "x" }),
        verifyChecksums: true
      })
    ).rejects.toThrow(/checksum/i);
  });

  it("imports despite a checksum mismatch when verification is off", async () => {
    const zip = makeZip(
      {
        nodes: [
          { id: "1", type: "x", data: { v: { uri: `${WORKFLOW_BUNDLE_SCHEME}real.png`, type: "image" } } }
        ],
        edges: []
      },
      { "real.png": new Uint8Array([1, 2, 3]) },
      [{ file: "assets/real.png", bytes: 3, sha256: "deadbeef" }]
    );
    const result = await importWorkflowBundle(zip, {
      storeAsset: async () => ({ uri: "asset://x", assetId: "x" })
    });
    expect(result.checksumMismatches).toEqual(["assets/real.png (checksum)"]);
    expect(result.imported).toHaveLength(1);
  });
});

describe("verifyBundleChecksums", () => {
  it("flags missing and mismatched assets", () => {
    const mismatches = verifyBundleChecksums({
      manifest: {
        format: WORKFLOW_BUNDLE_FORMAT,
        version: WORKFLOW_BUNDLE_VERSION,
        created_at: "",
        assets: [
          { file: "assets/a.png", bytes: 1, sha256: "wrong" },
          { file: "assets/b.png", bytes: 1, sha256: "x" }
        ],
        thumbnail: null
      },
      workflow: { name: "w", graph: { nodes: [], edges: [] } },
      assets: new Map([["a.png", new Uint8Array([1])]]),
      thumbnail: null
    });
    expect(mismatches).toEqual([
      "assets/a.png (checksum)",
      "assets/b.png (missing)"
    ]);
  });
});
