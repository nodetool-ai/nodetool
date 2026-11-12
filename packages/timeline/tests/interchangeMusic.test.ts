import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exportInterchange } from "../src/interchange.js";
import { premiereToTimeline, readPremiereXml } from "../src/interchangeImport.js";
import type { ClipVersion, TimelineClip, TimelineDocument } from "../src/types.js";

// MM7 exit 3 / PS-3: a Premiere export of a music project with takes imports
// again with the active takes in place.
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/music-document.json", import.meta.url), "utf8")
) as TimelineDocument;

function take(id: string, assetId: string, label: string): ClipVersion {
  const base = fixture.clips[0]!.versions[0]!;
  return { ...base, id, assetId, label, musicGeneration: base.musicGeneration };
}

function musicProject(): { tracks: TimelineDocument["tracks"]; clips: TimelineClip[] } {
  const bass = fixture.clips.find((clip) => clip.id === "bass-1")!;
  // Three takes, the second active. currentAssetId follows the active take.
  const threeTakes: TimelineClip = {
    ...bass,
    versions: [take("take-1", "asset-bass-1", "Take 1"), take("take-2", "asset-bass-2", "Take 2"), take("take-3", "asset-bass-3", "Take 3")],
    activeTakeId: "take-2",
    currentAssetId: "asset-bass-2"
  };
  const other = (id: string, trackId: string, assetId: string, startMs: number): TimelineClip => ({
    ...fixture.clips.find((clip) => clip.id === "drums-1")!,
    id, trackId, name: id, startMs, durationMs: 8000, currentAssetId: assetId
  });
  return {
    tracks: fixture.tracks,
    clips: [
      other("drums-1", "drums", "asset-drums", 0),
      threeTakes,
      other("keys-1", "keys", "asset-keys", 4000),
      other("gtr-1", "gtr", "asset-gtr", 8000)
    ]
  };
}

describe("Premiere interchange of a music project", () => {
  const { tracks, clips } = musicProject();
  const requested: string[] = [];
  const exported = exportInterchange(
    { name: "Music project", width: fixture.width, height: fixture.height, fps: fixture.fps, tracks, clips },
    {
      target: "premiere_xml",
      resolveAsset: (id) => {
        requested.push(id);
        return { id, uri: `media/${id}.wav`, durationMs: 16000, hasAudio: true };
      }
    }
  );

  it("exports only the active take of a clip with takes", () => {
    expect(exported.report.clipsExported).toBe(4);
    expect(exported.report.missingMedia).toBe(0);
    expect(new Set(requested)).toEqual(new Set(["asset-drums", "asset-bass-2", "asset-keys", "asset-gtr"]));
    expect(exported.xml).not.toContain("asset-bass-1");
    expect(exported.xml).not.toContain("asset-bass-3");
  });

  it("imports again with the active takes in place", () => {
    const result = premiereToTimeline(readPremiereXml(exported.xml), {
      resolveFile: (file) => file.name.replace(/\.wav$/, "")
    });
    expect(result.warnings).toEqual([]);
    expect(result.missingClips).toBe(0);
    expect(result.tracks.map((track) => track.type)).toEqual(["audio", "audio", "audio", "audio"]);
    // One clip per role track, in track order, at its start and length.
    const byTrack = result.tracks.map((track) => result.clips.filter((clip) => clip.trackId === track.id));
    expect(byTrack.map((list) => list.length)).toEqual([1, 1, 1, 1]);
    expect(byTrack.map((list) => list[0]!.currentAssetId)).toEqual(["asset-drums", "asset-bass-2", "asset-keys", "asset-gtr"]);
    expect(byTrack.map((list) => list[0]!.startMs)).toEqual([0, 0, 4000, 8000].map((ms) => expect.closeTo(ms, -2)));
    expect(byTrack[1]![0]).toMatchObject({ mediaType: "audio", durationMs: expect.closeTo(16000, -2) });
  });

  it("follows activeTakeId when the clip has no current asset", () => {
    const bare = musicProject().clips.map((clip) => (clip.id === "bass-1" ? { ...clip, currentAssetId: undefined } : clip));
    const wanted: string[] = [];
    exportInterchange(
      { name: "Music project", width: fixture.width, height: fixture.height, fps: fixture.fps, tracks, clips: bare },
      { target: "premiere_xml", resolveAsset: (id) => { wanted.push(id); return { id, uri: `media/${id}.wav`, hasAudio: true }; } }
    );
    expect(wanted).toContain("asset-bass-2");
    expect(wanted).not.toContain("asset-bass-1");
  });
});
