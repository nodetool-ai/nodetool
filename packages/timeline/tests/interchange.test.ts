import { describe, expect, it } from "vitest";
import { exportInterchange, interchangeAssetIds } from "../src/interchange.js";
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

    expect(result.xml).toContain('<xmeml version="4">');
    expect(result.xml).toContain("<width>1280</width><height>720</height>");
    expect(result.xml).toContain('<clipitem id="clipitem-1"><name>Hero &amp; title</name><enabled>TRUE</enabled><duration>150</duration>');
    expect(result.xml).toContain("<start>30</start><end>90</end><in>15</in><out>75</out>");
    expect(result.xml).toContain('<file id="file-1"><name>active.mov</name><pathurl>file:///bundle/active.mov</pathurl>');
    expect(result.xml).toContain('<marker><comment></comment><name>Review</name><in>60</in><out>-1</out></marker>');
    expect(result.xml).toContain("<duration>90</duration>");
    expect(result.report.warnings).toEqual([]);
  });

  it("places a video's own sound on a linked Premiere audio track", () => {
    const { xml } = exportInterchange({
      name: "Launch", width: 1280, height: 720, fps: 30, tracks,
      clips: [clip(), clip({ id: "music", trackId: "a1", name: "Music", mediaType: "audio", currentAssetId: "music.wav", versions: [] })]
    }, { target: "premiere_xml", resolveAsset });

    const audio = xml.slice(xml.indexOf("<audio><numOutputChannels>"));
    // The embedded sound is A1 and reuses the video's file by id.
    expect(audio.indexOf('<clipitem id="clipitem-2"><name>Hero &amp; title</name>')).toBeLessThan(audio.indexOf("<name>Music</name>"));
    expect(audio).toContain('<file id="file-1"/><sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>');
    const link = '<link><linkclipref>clipitem-1</linkclipref><mediatype>video</mediatype><trackindex>1</trackindex><clipindex>1</clipindex></link><link><linkclipref>clipitem-2</linkclipref><mediatype>audio</mediatype><trackindex>1</trackindex><clipindex>1</clipindex><groupindex>1</groupindex></link>';
    expect(xml.split(link)).toHaveLength(3);
  });

  it("leaves a video's sound to its extracted audio clip and links the pair", () => {
    const { xml } = exportInterchange({
      name: "Launch", width: 1280, height: 720, fps: 30, tracks,
      clips: [
        clip({ linkId: "pair" }),
        clip({ id: "voice", trackId: "a1", name: "Voice", mediaType: "audio", currentAssetId: "voice.wav", versions: [], linkId: "pair" })
      ]
    }, { target: "premiere_xml", resolveAsset });

    expect(xml.match(/<clipitem /g)).toHaveLength(2);
    expect(xml).toContain('<link><linkclipref>clipitem-2</linkclipref><mediatype>audio</mediatype><trackindex>1</trackindex><clipindex>1</clipindex><groupindex>1</groupindex></link>');
  });

  it("orders Premiere video tracks bottom-up and stacks overlapping clips", () => {
    const layered: TimelineTrack[] = [
      { id: "top", name: "Titles", type: "overlay", index: 0, visible: false, locked: true },
      { id: "base", name: "Picture", type: "video", index: 1, visible: true, locked: false }
    ];
    const silent = (assetId: string) => ({ id: assetId, uri: `media/${assetId}`, durationMs: 10_000, hasAudio: false });
    const { xml } = exportInterchange({
      name: "Layers", width: 1920, height: 1080, fps: 25, tracks: layered,
      clips: [
        clip({ id: "logo", trackId: "top", name: "Logo", mediaType: "image", currentAssetId: "logo.png", startMs: 0, durationMs: 4000, inPointMs: 0 }),
        clip({ id: "a", trackId: "base", name: "Shot A", currentAssetId: "a.mp4", startMs: 0, durationMs: 3000, inPointMs: 0 }),
        clip({ id: "b", trackId: "base", name: "Shot B", currentAssetId: "b.mp4", startMs: 2000, durationMs: 3000, inPointMs: 0 })
      ]
    }, { target: "premiere_xml", resolveAsset: silent });

    const order = ["Shot A", "Shot B", "Logo"].map((name) => xml.indexOf(`<name>${name}</name>`));
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(xml.match(/<track>/g)).toHaveLength(3);
    expect(xml).toContain("<track><enabled>FALSE</enabled><locked>TRUE</locked>");
    expect(xml).toContain("<start>0</start><end>100</end><in>0</in><out>100</out>");
    expect(xml).not.toContain("<audio><samplecharacteristics>");
  });

  it("carries enable flags, opacity, speed and volume into Premiere filters", () => {
    const result = exportInterchange({
      name: "Launch", width: 1280, height: 720, fps: 30, tracks,
      clips: [
        clip({ hidden: true, opacity: 0.5, speedMultiplier: 2, inPointMs: 0 }),
        clip({ id: "music", trackId: "a1", name: "Music", mediaType: "audio", currentAssetId: "music.wav", versions: [], muted: true, volumeDb: -6 })
      ]
    }, { target: "premiere_xml", resolveAsset });

    expect(result.report.warnings).toEqual([]);
    expect(result.xml).toContain('<clipitem id="clipitem-1"><name>Hero &amp; title</name><enabled>FALSE</enabled>');
    expect(result.xml).toContain("<start>30</start><end>90</end><in>0</in><out>120</out>");
    expect(result.xml).toContain("<parameterid>opacity</parameterid><name>opacity</name><valuemin>0</valuemin><valuemax>100</valuemax><value>50</value>");
    expect(result.xml).toContain("<parameterid>speed</parameterid><name>speed</name><valuemin>-100000</valuemin><valuemax>100000</valuemax><value>200</value>");
    expect(result.xml).toContain("<parameterid>level</parameterid><name>level</name><valuemin>0</valuemin><valuemax>3.98109</valuemax><value>0.5012</value>");
    expect(result.xml).toMatch(/<clipitem id="clipitem-3"><name>Music<\/name><enabled>FALSE<\/enabled>/);
  });

  it("reports a video whose embedded audio could not be checked", () => {
    const result = exportInterchange({
      name: "Launch", width: 1280, height: 720, fps: 30, tracks,
      clips: [clip()]
    }, { target: "premiere_xml", resolveAsset: (assetId) => ({ id: assetId, uri: `media/${assetId}` }) });

    expect(result.report.warnings.map((warning) => warning.message)).toEqual([
      "Hero & title: embedded audio could not be checked and was left out."
    ]);
    expect(result.xml.match(/<clipitem /g)).toHaveLength(1);
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

  it("lists the active assets each target exports", () => {
    const sequence = {
      tracks,
      clips: [
        clip(),
        clip({ id: "still", mediaType: "image", currentAssetId: "still.png", versions: [] }),
        clip({ id: "again", currentAssetId: "active.mov" }),
        clip({ id: "orphan", trackId: "gone", currentAssetId: "orphan.mov", versions: [] })
      ]
    };
    expect(interchangeAssetIds(sequence, "premiere_xml")).toEqual(["active.mov", "still.png"]);
    expect(interchangeAssetIds(sequence, "fcpxml")).toEqual(["active.mov"]);
  });
});
