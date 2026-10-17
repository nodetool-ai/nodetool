import { makeTrack } from "@nodetool-ai/timeline";

import {
  DAW_AUDIO_TRACK_HEIGHT_PX,
  DAW_COLLAPSED_TRACK_HEIGHT_PX,
  DEFAULT_TRACK_HEIGHT_PX,
  trackRowHeightPx
} from "../trackHeight";
import { layoutTrackRows } from "../trackWindow";

describe("trackRowHeightPx", () => {
  it("keeps the authored height outside DAW mode", () => {
    expect(trackRowHeightPx(makeTrack({ type: "video" }))).toBe(DEFAULT_TRACK_HEIGHT_PX);
    expect(trackRowHeightPx(makeTrack({ type: "midi", heightPx: 80 }))).toBe(80);
  });

  it("gives sound tracks a taller default and collapses picture tracks in DAW mode", () => {
    expect(trackRowHeightPx(makeTrack({ type: "midi" }), true)).toBe(DAW_AUDIO_TRACK_HEIGHT_PX);
    expect(trackRowHeightPx(makeTrack({ type: "audio" }), true)).toBe(DAW_AUDIO_TRACK_HEIGHT_PX);
    expect(trackRowHeightPx(makeTrack({ type: "audio", heightPx: 150 }), true)).toBe(150);
    for (const type of ["video", "overlay", "subtitle"] as const) {
      expect(trackRowHeightPx(makeTrack({ type, heightPx: 200 }), true)).toBe(
        DAW_COLLAPSED_TRACK_HEIGHT_PX
      );
    }
  });

  it("lays rows out with the DAW heights", () => {
    const tracks = [makeTrack({ id: "v", type: "video" }), makeTrack({ id: "m", type: "midi" })];
    const { rows, height } = layoutTrackRows(tracks, false, null, 1, [], new Set(), true);
    expect(rows.map((r) => r.height)).toEqual([DAW_COLLAPSED_TRACK_HEIGHT_PX, DAW_AUDIO_TRACK_HEIGHT_PX]);
    expect(height).toBe(DAW_COLLAPSED_TRACK_HEIGHT_PX + DAW_AUDIO_TRACK_HEIGHT_PX);
  });
});
