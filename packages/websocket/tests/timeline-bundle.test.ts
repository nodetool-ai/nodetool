/**
 * Tests for the timeline bundle codec — packing a sequence plus the bytes of
 * every asset its clips name into a zip, and importing it back.
 *
 * Run with:
 *   npm run test --workspace=packages/websocket -- timeline-bundle
 */
import { describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  TIMELINE_BUNDLE_FORMAT,
  TIMELINE_BUNDLE_VERSION,
  collectTimelineAssetIds,
  importTimelineBundle,
  packTimelineBundle,
  rewriteTimelineAssetIds,
  unpackTimelineBundle,
  verifyTimelineBundleChecksums,
  type BundledTimeline,
  type FetchedTimelineAsset
} from "../src/lib/timeline-bundle.js";

type Clip = BundledTimeline["clips"][number];

function clip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: "c1",
    trackId: "t1",
    name: "Shot 1",
    startMs: 0,
    durationMs: 1000,
    mediaType: "video",
    sourceType: "generated",
    status: "generated",
    locked: false,
    versions: [],
    ...overrides
  } as Clip;
}

function sequence(overrides: Partial<BundledTimeline> = {}): BundledTimeline {
  return {
    name: "Cut",
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 1000,
    tracks: [
      {
        id: "t1",
        name: "V1",
        type: "video",
        index: 0,
        visible: true,
        locked: false
      }
    ],
    clips: [clip()],
    markers: [],
    transcript: [],
    ...overrides
  };
}

const VIDEO = new Uint8Array([1, 2, 3, 4]);
const POSTER = new Uint8Array([9, 9, 9]);

function assetTable(
  table: Record<string, FetchedTimelineAsset>
): (id: string) => Promise<FetchedTimelineAsset | null> {
  return async (id: string) => table[id] ?? null;
}

const videoAsset: FetchedTimelineAsset = {
  bytes: VIDEO,
  name: "shot.mp4",
  contentType: "video/mp4"
};
const posterAsset: FetchedTimelineAsset = {
  bytes: POSTER,
  name: "poster.jpg",
  contentType: "image/jpeg"
};

describe("collectTimelineAssetIds", () => {
  it("reads all four id fields once each, in document order", () => {
    const doc = sequence({
      clips: [
        clip({
          currentAssetId: "a1",
          thumbnailAssetId: "a2",
          waveformAssetId: "a3",
          versions: [
            {
              id: "v1",
              createdAt: "2026-01-01T00:00:00.000Z",
              jobId: "job-1",
              assetId: "a4",
              workflowUpdatedAt: "2026-01-01T00:00:00.000Z",
              dependencyHash: "h",
              paramOverridesSnapshot: {},
              status: "success"
            },
            {
              id: "v2",
              createdAt: "2026-01-01T00:00:01.000Z",
              jobId: "job-2",
              assetId: "a1",
              workflowUpdatedAt: "2026-01-01T00:00:00.000Z",
              dependencyHash: "h",
              paramOverridesSnapshot: {},
              status: "success"
            }
          ]
        })
      ]
    });

    expect(collectTimelineAssetIds(doc)).toEqual(["a1", "a2", "a3", "a4"]);
  });
});

describe("rewriteTimelineAssetIds", () => {
  it("rewrites every mapped id and leaves the rest alone", () => {
    const doc = sequence({
      clips: [
        clip({
          currentAssetId: "a1",
          thumbnailAssetId: "a2",
          waveformAssetId: "a3",
          versions: [
            {
              id: "v1",
              createdAt: "2026-01-01T00:00:00.000Z",
              jobId: "job-1",
              assetId: "a4",
              workflowUpdatedAt: "2026-01-01T00:00:00.000Z",
              dependencyHash: "h",
              paramOverridesSnapshot: {},
              status: "success"
            }
          ]
        })
      ]
    });
    const map = new Map([
      ["a1", "n1"],
      ["a2", "n2"],
      ["a3", "n3"],
      ["a4", "n4"]
    ]);

    const out = rewriteTimelineAssetIds(doc, map);

    expect(out.clips[0].currentAssetId).toBe("n1");
    expect(out.clips[0].thumbnailAssetId).toBe("n2");
    expect(out.clips[0].waveformAssetId).toBe("n3");
    expect(out.clips[0].versions[0].assetId).toBe("n4");
    // The input is untouched, and an unmapped id keeps its value.
    expect(doc.clips[0].currentAssetId).toBe("a1");
    expect(rewriteTimelineAssetIds(doc, new Map()).clips[0].currentAssetId).toBe(
      "a1"
    );
  });
});

describe("packTimelineBundle", () => {
  it("round-trips a sequence and its assets", async () => {
    const seq = sequence({
      clips: [clip({ currentAssetId: "a1", thumbnailAssetId: "a2" })]
    });

    const { bytes, manifest } = await packTimelineBundle({
      sequence: seq,
      fetchAsset: assetTable({ a1: videoAsset, a2: posterAsset })
    });

    expect(manifest.format).toBe(TIMELINE_BUNDLE_FORMAT);
    expect(manifest.version).toBe(TIMELINE_BUNDLE_VERSION);
    expect(manifest.timeline).toEqual({ file: "timeline.json", name: "Cut" });
    expect(manifest.assets.map((a) => a.asset_id)).toEqual(["a1", "a2"]);
    expect(manifest.assets[0].file).toMatch(/^assets\/[0-9a-f]{64}\.mp4$/);
    expect(manifest.assets[1].file).toMatch(/^assets\/[0-9a-f]{64}\.jpg$/);
    expect(manifest.assets[0].bytes).toBe(VIDEO.byteLength);

    const unpacked = unpackTimelineBundle(bytes);
    expect(unpacked.timeline).toEqual(seq);
    expect(unpacked.assets.size).toBe(2);
    expect(verifyTimelineBundleChecksums(unpacked)).toEqual([]);
  });

  it("packs identical bytes once and maps both ids to that file", async () => {
    const seq = sequence({
      clips: [clip({ currentAssetId: "a1", thumbnailAssetId: "a2" })]
    });

    const { bytes, manifest } = await packTimelineBundle({
      sequence: seq,
      fetchAsset: assetTable({
        a1: videoAsset,
        a2: { ...videoAsset, name: "copy.mp4" }
      })
    });

    expect(manifest.assets).toHaveLength(2);
    expect(manifest.assets[0].file).toBe(manifest.assets[1].file);
    expect(unpackTimelineBundle(bytes).assets.size).toBe(1);
  });

  it("records an unresolvable asset instead of failing", async () => {
    const seq = sequence({ clips: [clip({ currentAssetId: "gone" })] });

    const { manifest } = await packTimelineBundle({
      sequence: seq,
      fetchAsset: assetTable({})
    });

    expect(manifest.assets).toEqual([]);
    expect(manifest.missing_assets).toEqual(["gone"]);
  });

  it("lists the font families and the foreign ids the document names", async () => {
    const seq = sequence({
      workflowId: "wf-seq",
      clips: [
        clip({
          workflowId: "wf-clip",
          storyboardBoardId: "sb-1",
          scriptId: "script-1",
          textStyle: {
            text: "Title",
            fontFamily: "Inter",
            fontSizePx: 64,
            color: "#fff"
          },
          caption: { words: [], style: { fontFamily: "Roboto" } },
          versions: [
            {
              id: "v1",
              createdAt: "2026-01-01T00:00:00.000Z",
              jobId: "job-1",
              assetId: "a1",
              workflowUpdatedAt: "2026-01-01T00:00:00.000Z",
              dependencyHash: "h",
              paramOverridesSnapshot: {},
              status: "success"
            }
          ]
        })
      ]
    });

    const { manifest } = await packTimelineBundle({
      sequence: seq,
      fetchAsset: assetTable({ a1: videoAsset })
    });

    expect(manifest.fonts).toEqual(["Inter", "Roboto"]);
    expect(manifest.foreign_refs).toEqual({
      workflow_ids: ["wf-seq", "wf-clip"],
      storyboard_ids: ["sb-1"],
      script_ids: ["script-1"],
      job_ids: ["job-1"]
    });
  });
});

describe("unpackTimelineBundle", () => {
  it("rejects an archive with no manifest", () => {
    const zip = zipSync({ "timeline.json": strToU8("{}") });
    expect(() => unpackTimelineBundle(zip)).toThrow(/missing manifest\.json/);
  });

  it("rejects another format", () => {
    const zip = zipSync({
      "manifest.json": strToU8(JSON.stringify({ format: "something-else" }))
    });
    expect(() => unpackTimelineBundle(zip)).toThrow(/Unrecognized bundle format/);
  });

  it("rejects a newer version", () => {
    const zip = zipSync({
      "manifest.json": strToU8(
        JSON.stringify({
          format: TIMELINE_BUNDLE_FORMAT,
          version: TIMELINE_BUNDLE_VERSION + 1
        })
      )
    });
    expect(() => unpackTimelineBundle(zip)).toThrow(/newer than supported/);
  });

  it("rejects an archive with too many entries", () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 10_001; i += 1) {
      files[`assets/f${i}.bin`] = new Uint8Array([0]);
    }
    expect(() => unpackTimelineBundle(zipSync(files))).toThrow(
      /too many entries/
    );
  });
});

describe("importTimelineBundle", () => {
  it("stores each asset once and rewrites the ids that point at it", async () => {
    const seq = sequence({
      clips: [
        clip({
          currentAssetId: "a1",
          thumbnailAssetId: "a2",
          versions: [
            {
              id: "v1",
              createdAt: "2026-01-01T00:00:00.000Z",
              jobId: "job-1",
              assetId: "a1",
              workflowUpdatedAt: "2026-01-01T00:00:00.000Z",
              dependencyHash: "h",
              paramOverridesSnapshot: {},
              status: "success"
            }
          ]
        })
      ]
    });
    const { bytes } = await packTimelineBundle({
      sequence: seq,
      fetchAsset: assetTable({ a1: videoAsset, a2: posterAsset })
    });

    let n = 0;
    const storeAsset = vi.fn(async () => ({ assetId: `new-${++n}` }));
    const result = await importTimelineBundle(bytes, { storeAsset });

    expect(storeAsset).toHaveBeenCalledTimes(2);
    expect(storeAsset.mock.calls[0][0]).toMatchObject({
      name: "shot.mp4",
      contentType: "video/mp4",
      sourceAssetId: "a1"
    });
    expect(result.imported).toHaveLength(2);
    expect(result.missing).toEqual([]);
    expect(result.checksumMismatches).toEqual([]);
    expect(result.timeline.clips[0].currentAssetId).toBe("new-1");
    expect(result.timeline.clips[0].thumbnailAssetId).toBe("new-2");
    expect(result.timeline.clips[0].versions[0].assetId).toBe("new-1");
  });

  it("keeps an id whose bytes the bundle never carried and reports it", async () => {
    const seq = sequence({
      clips: [clip({ currentAssetId: "here", thumbnailAssetId: "gone" })]
    });
    const { bytes } = await packTimelineBundle({
      sequence: seq,
      fetchAsset: assetTable({ here: videoAsset })
    });

    const result = await importTimelineBundle(bytes, {
      storeAsset: async () => ({ assetId: "new-1" })
    });

    expect(result.missing).toEqual(["gone"]);
    expect(result.timeline.clips[0].currentAssetId).toBe("new-1");
    expect(result.timeline.clips[0].thumbnailAssetId).toBe("gone");
  });

  it("strips a clip field the schema does not know", async () => {
    const seq = sequence();
    const withExtra = {
      ...seq,
      clips: [{ ...seq.clips[0], sneaky: "payload" }]
    };
    const zip = zipSync({
      "manifest.json": strToU8(
        JSON.stringify({
          format: TIMELINE_BUNDLE_FORMAT,
          version: TIMELINE_BUNDLE_VERSION,
          created_at: "2026-01-01T00:00:00.000Z",
          timeline: { file: "timeline.json", name: "Cut" },
          assets: [],
          missing_assets: [],
          fonts: [],
          foreign_refs: {
            workflow_ids: [],
            storyboard_ids: [],
            script_ids: [],
            job_ids: []
          }
        })
      ),
      "timeline.json": strToU8(JSON.stringify(withExtra))
    });

    const result = await importTimelineBundle(zip, {
      storeAsset: async () => ({ assetId: "unused" })
    });

    expect(result.timeline.clips[0]).not.toHaveProperty("sneaky");
    expect(result.timeline.clips[0].id).toBe("c1");
  });

  it("reports bytes that do not hash to what the manifest recorded", async () => {
    const seq = sequence({ clips: [clip({ currentAssetId: "a1" })] });
    const { bytes } = await packTimelineBundle({
      sequence: seq,
      fetchAsset: assetTable({ a1: videoAsset })
    });
    const unpacked = unpackTimelineBundle(bytes);
    const [file] = [...unpacked.assets.keys()];
    const tampered = zipSync({
      "manifest.json": strToU8(JSON.stringify(unpacked.manifest)),
      "timeline.json": strToU8(JSON.stringify(unpacked.timeline)),
      [`assets/${file}`]: new Uint8Array([7, 7, 7, 7])
    });

    const result = await importTimelineBundle(tampered, {
      storeAsset: async () => ({ assetId: "new-1" })
    });

    expect(result.checksumMismatches).toEqual([
      `assets/${file} (checksum)`
    ]);
  });
});
