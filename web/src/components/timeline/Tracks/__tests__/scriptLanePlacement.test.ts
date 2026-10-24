import { describe, expect, it } from "@jest/globals";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";

import { layoutTrackRows, scriptVoiceoverTrackId } from "../trackWindow";

const rowIds = (rows: ReturnType<typeof layoutTrackRows>["rows"]) =>
  rows.map((row) => (row.kind === "track" ? row.track.id : row.kind));

describe("script lane placement", () => {
  const tracks = [
    makeTrack({ id: "v1", type: "video", index: 0 }),
    makeTrack({ id: "music", type: "audio", index: 1 }),
    makeTrack({ id: "vo", type: "audio", index: 2 })
  ];

  it("sits directly above the script's voiceover track", () => {
    const { rows } = layoutTrackRows(tracks, true, null, 1, [], new Set(), false, [], "vo");
    expect(rowIds(rows)).toEqual(["v1", "music", "script", "vo"]);
  });

  it("sits above the first audio track without a voiceover track", () => {
    const { rows } = layoutTrackRows(tracks, true, null, 1);
    expect(rowIds(rows)).toEqual(["v1", "script", "music", "vo"]);
  });

  it("falls back when the voiceover track is in a collapsed folder", () => {
    const folded = tracks.map((track) =>
      track.id === "vo" ? { ...track, folderId: "f" } : track
    );
    const { rows } = layoutTrackRows(
      folded,
      true,
      null,
      1,
      [{ id: "f", name: "Voice" }],
      new Set(["f"]),
      false,
      [],
      "vo"
    );
    expect(rowIds(rows)).toEqual(["v1", "script", "music", "folder"]);
  });

  it("finds the voiceover track from the script's line clips", () => {
    const clips = [
      makeClip({ trackId: "music", mediaType: "audio" }),
      makeClip({ trackId: "vo", mediaType: "audio", scriptId: "s", scriptLineId: "l" })
    ];
    expect(scriptVoiceoverTrackId(clips)).toBe("vo");
    expect(scriptVoiceoverTrackId(clips.slice(0, 1))).toBeNull();
  });
});
