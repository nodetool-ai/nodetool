import type { TimelineTrack } from "@nodetool-ai/timeline";

import { SCRIPT_LANE_HEIGHT_PX } from "./ScriptLane";
import { DEFAULT_TRACK_HEIGHT_PX, FX_PANEL_HEIGHT_PX } from "./trackHeight";

export type TrackRow =
  | { kind: "track"; track: TimelineTrack; top: number; height: number }
  | { kind: "script"; top: number; height: number };

export function layoutTrackRows(
  tracks: readonly TimelineTrack[],
  hasScript: boolean,
  expandedFxTrackId: string | null,
  verticalZoom = 1
): { rows: TrackRow[]; height: number } {
  const rows: TrackRow[] = [];
  const scriptBefore = hasScript ? tracks.findIndex((track) => track.type === "audio") : -1;
  let top = 0;

  tracks.forEach((track, index) => {
    if (index === scriptBefore) {
      rows.push({ kind: "script", top, height: SCRIPT_LANE_HEIGHT_PX });
      top += SCRIPT_LANE_HEIGHT_PX;
    }
    const height =
      (track.heightPx ?? DEFAULT_TRACK_HEIGHT_PX) * verticalZoom +
      (track.id === expandedFxTrackId ? FX_PANEL_HEIGHT_PX : 0);
    rows.push({ kind: "track", track, top, height });
    top += height;
  });

  if (hasScript && scriptBefore === -1) {
    rows.push({ kind: "script", top, height: SCRIPT_LANE_HEIGHT_PX });
    top += SCRIPT_LANE_HEIGHT_PX;
  }
  return { rows, height: top };
}

export function visibleTrackWindow(
  rows: readonly TrackRow[],
  scrollTop: number,
  viewportHeight: number,
  overscan = 3
): { start: number; end: number; top: number; bottom: number } {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (rows[middle].top + rows[middle].height <= scrollTop) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const start = Math.max(0, low - overscan);
  low = start;
  high = rows.length;
  const viewportEnd = scrollTop + viewportHeight;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (rows[middle].top < viewportEnd) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const end = Math.min(rows.length, low + overscan);
  const totalHeight = rows.length ? rows[rows.length - 1].top + rows[rows.length - 1].height : 0;
  return {
    start,
    end,
    top: rows[start]?.top ?? totalHeight,
    bottom: totalHeight - (rows[end]?.top ?? totalHeight)
  };
}
