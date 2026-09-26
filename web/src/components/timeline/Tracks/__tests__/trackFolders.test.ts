import { describe, expect, it } from "@jest/globals";
import { makeTrack } from "@nodetool-ai/timeline";

import { layoutTrackRows } from "../trackWindow";

describe("track folder layout", () => {
  it("groups rows and collapses their lanes without changing track indices", () => {
    const tracks = [
      makeTrack({ id: "v1", type: "video", index: 0, folderId: "folder" }),
      makeTrack({ id: "a1", type: "audio", index: 1 }),
      makeTrack({ id: "v2", type: "video", index: 2, folderId: "folder" })
    ];
    const folders = [{ id: "folder", name: "Scene" }];
    const expanded = layoutTrackRows(tracks, false, null, 1, folders);
    expect(expanded.rows.map((row) => row.kind === "track" ? row.track.id : row.kind)).toEqual([
      "folder", "v1", "v2", "a1"
    ]);
    const collapsed = layoutTrackRows(tracks, false, null, 1, folders, new Set(["folder"]));
    expect(collapsed.rows.map((row) => row.kind === "track" ? row.track.id : row.kind)).toEqual([
      "folder", "a1"
    ]);
    expect(tracks.map((track) => track.index)).toEqual([0, 1, 2]);
  });
});
