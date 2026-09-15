import { describe, expect, it } from "vitest";
import { exportInterchange } from "../src/interchange.js";
import type { ClipEffect, TimelineClip, TimelineTrack } from "../src/types.js";

const tracks: TimelineTrack[] = [
  { id: "v1", name: "Picture", type: "video", index: 0, visible: true, locked: false },
  { id: "a1", name: "Dialogue", type: "audio", index: 1, visible: true, locked: false }
];

function clip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: "hero",
    trackId: "v1",
    name: "Hero & title",
    startMs: 1000,
    durationMs: 2000,
    inPointMs: 500,
    mediaType: "video",
    sourceType: "generated",
    currentAssetId: "active.mov",
    status: "generated",
    locked: false,
    versions: [
      { id: "old", createdAt: "2026-01-01", jobId: "old-job", assetId: "old.mov", workflowUpdatedAt: "2026-01-01", dependencyHash: "old", paramOverridesSnapshot: {}, status: "success" },
      { id: "active", createdAt: "2026-01-02", jobId: "active-job", assetId: "active.mov", workflowUpdatedAt: "2026-01-02", dependencyHash: "active", paramOverridesSnapshot: {}, status: "success" }
    ],
    ...overrides
  };
}

const resolveAsset = (assetId: string) => assetId === "missing.mov" ? undefined : ({
  id: assetId,
  uri: `file:///bundle/${assetId}`,
  durationMs: 5000,
  hasAudio: assetId === "active.mov"
});

describe("exportInterchange", () => {
  it("writes an FCPXML sequence from the active take with timeline timing and markers", () => {
    const result = exportInterchange({
      name: "Launch <cut>", width: 1920, height: 1080, fps: 25, tracks,
      clips: [clip(), clip({ id: "music", trackId: "a1", name: "Music", mediaType: "audio", currentAssetId: "music.wav", versions: [] })],
      markers: [{ id: "m1", timeMs: 2000, label: "Review & approve" }]
    }, { target: "fcpxml", resolveAsset });

    expect(result.xml).toContain('<sequence format="r1">');
    expect(result.xml).toContain('width="1920" height="1080"');
    expect(result.xml).toContain('<media-rep kind="original-media" src="file:///bundle/active.mov"/>');
    expect(result.xml).toContain('ref="r2" name="Hero &amp; title" offset="25/25s" duration="50/25s" start="13/25s"');
    expect(result.xml).toContain('ref="r3" name="Music"');
    expect(result.xml).toContain('value="Review &amp; approve"');
    expect(result.xml).not.toContain("old.mov");
    expect(result.report).toMatchObject({ clipsExported: 2, missingMedia: 0, warnings: [] });
  });

  it("writes separate Premiere-compatible audio and video tracks with markers", () => {
    const result = exportInterchange({
      name: "Launch", width: 1280, height: 720, fps: 30, tracks,
      clips: [clip(), clip({ id: "music", trackId: "a1", name: "Music", mediaType: "audio", currentAssetId: "music.wav", versions: [] })],
      markers: [{ id: "m1", timeMs: 2000, label: "Review" }]
    }, { target: "premiere_xml", resolveAsset });

    expect(result.xml).toContain('<xmeml version="5">');
    expect(result.xml).toContain('<video>');
    expect(result.xml).toContain('<audio>');
    expect(result.xml).toContain('<name>Picture</name>');
    expect(result.xml).toContain('<name>Dialogue</name>');
    expect(result.xml).toContain('<start>30</start><end>90</end><in>15</in><out>75</out>');
    expect(result.xml).toContain('<marker><name>Review</name><in>60</in><out>60</out></marker>');
  });

  it("reports absent active media and visual state that must be baked", () => {
    const result = exportInterchange({
      name: "Launch", width: 1280, height: 720, fps: 30, tracks,
      clips: [clip({ currentAssetId: "missing.mov", effects: [{ id: "blur", type: "blur", enabled: true } as ClipEffect] })]
    }, { target: "fcpxml", resolveAsset });

    expect(result.report).toMatchObject({ clipsExported: 0, missingMedia: 1 });
    expect(result.report.warnings.map((warning) => warning.message)).toEqual([
      "Hero & title: effects require baking.",
      "Hero & title: active media is missing."
    ]);
  });

  it("keeps currentAssetId authoritative when its active-take alias is stale", () => {
    const result = exportInterchange({
      name: "Launch", width: 1280, height: 720, fps: 30, tracks,
      clips: [clip({ currentAssetId: "regenerated.mov", activeTakeId: "old" })]
    }, { target: "fcpxml", resolveAsset });

    expect(result.xml).toContain("regenerated.mov");
    expect(result.xml).not.toContain("old.mov");

    const missing = exportInterchange({
      name: "Launch", width: 1280, height: 720, fps: 30, tracks,
      clips: [clip({ currentAssetId: "missing.mov", activeTakeId: "old" })]
    }, { target: "fcpxml", resolveAsset });
    expect(missing.report).toMatchObject({ clipsExported: 0, missingMedia: 1 });
  });

  it("uses NTSC rational timing without long-timeline frame-rate drift", () => {
    const result = exportInterchange({
      name: "Long cut", width: 1280, height: 720, fps: 29.97, tracks,
      clips: [clip({ startMs: 600_000, durationMs: 1_000, inPointMs: 600_000 })]
    }, { target: "fcpxml", resolveAsset });
    const premiere = exportInterchange({
      name: "Long cut", width: 1280, height: 720, fps: 29.97, tracks,
      clips: [clip({ startMs: 600_000, durationMs: 1_000, inPointMs: 600_000 })]
    }, { target: "premiere_xml", resolveAsset });

    expect(result.xml).toContain('frameDuration="1001/30000s"');
    expect(result.xml).toContain('offset="17999982/30000s"');
    expect(premiere.xml).toContain('<timebase>30</timebase><ntsc>TRUE</ntsc>');
    expect(premiere.xml).toContain('<start>17982</start>');

    for (const [fps, frameDuration] of [[23.976, "1001/24000s"], [59.94, "1001/60000s"]]) {
      const ntsc = exportInterchange({
        name: "NTSC", width: 1280, height: 720, fps, tracks,
        clips: [clip({ startMs: 600_000, durationMs: 1_000, inPointMs: 600_000 })]
      }, { target: "fcpxml", resolveAsset });
      expect(ntsc.xml).toContain(`frameDuration="${frameDuration}"`);
    }
  });

  it("reports non-media clips and unrepresentable playback state", () => {
    const result = exportInterchange({
      name: "Launch", width: 1280, height: 720, fps: 30, tracks,
      clips: [
        clip({ id: "title", mediaType: "text", speedMultiplier: 2, speedBaked: false }),
        clip({ id: "retimed", timeRemap: { keyframes: [{ t: 0, sourceMs: 1000 }, { t: 1, sourceMs: 0 }] } })
      ]
    }, { target: "fcpxml", resolveAsset });

    expect(result.report.warnings.map((warning) => warning.message)).toEqual([
      "Hero & title: text media requires baking.",
      "Hero & title: time remap requires baking."
    ]);
  });
});
