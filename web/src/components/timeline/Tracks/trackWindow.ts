import type {
  TimelineClip,
  TimelineTrack,
  TimelineTrackFolder
} from "@nodetool-ai/timeline";

import { SCRIPT_LANE_HEIGHT_PX } from "./ScriptLane";
import { automationSectionHeightPx } from "./automation/automationLayout";
import { FX_PANEL_HEIGHT_PX, trackRowHeightPx } from "./trackHeight";

export type TrackRow =
  | { kind: "track"; track: TimelineTrack; top: number; height: number }
  | { kind: "folder"; folder: TimelineTrackFolder; count: number; top: number; height: number }
  | { kind: "script"; top: number; height: number };

export const TRACK_FOLDER_HEIGHT_PX = 32;

/** The track holding a script's voiceover clips, or null when none does. */
export const scriptVoiceoverTrackId = (
  clips: readonly TimelineClip[]
): string | null =>
  clips.find((clip) => clip.scriptId && clip.scriptLineId)?.trackId ?? null;

export function layoutTrackRows(
  tracks: readonly TimelineTrack[],
  hasScript: boolean,
  expandedFxTrackId: string | null,
  verticalZoom = 1,
  folders: readonly TimelineTrackFolder[] = [],
  collapsedFolderIds: ReadonlySet<string> = new Set(),
  dawMode = false,
  shownAutomationTrackIds: readonly string[] = [],
  /** The script lane sits directly above this track when it is shown. */
  scriptTrackId: string | null = null
): { rows: TrackRow[]; height: number } {
  const rows: TrackRow[] = [];
  const validFolders = new Map(folders.map((folder) => [folder.id, folder]));
  const members = new Map<string, TimelineTrack[]>();
  for (const track of tracks) {
    if (track.folderId && validFolders.has(track.folderId)) {
      const group = members.get(track.folderId) ?? [];
      group.push(track);
      members.set(track.folderId, group);
    }
  }
  const ordered: Array<{ kind: "track"; track: TimelineTrack } | { kind: "folder"; folder: TimelineTrackFolder; count: number }> = [];
  const seen = new Set<string>();
  for (const track of tracks) {
    const folder = track.folderId ? validFolders.get(track.folderId) : undefined;
    if (!folder) {
      ordered.push({ kind: "track", track });
      continue;
    }
    if (seen.has(folder.id)) {
      continue;
    }
    seen.add(folder.id);
    const group = members.get(folder.id) ?? [];
    ordered.push({ kind: "folder", folder, count: group.length });
    if (!collapsedFolderIds.has(folder.id)) {
      ordered.push(...group.map((member) => ({ kind: "track" as const, track: member })));
    }
  }
  for (const folder of folders) {
    if (!seen.has(folder.id)) {
      ordered.push({ kind: "folder", folder, count: 0 });
    }
  }
  // Above the script's voiceover track, so the words sit on their audio;
  // without one (or with it in a collapsed folder), above the first audio
  // track.
  const voiceoverRow = scriptTrackId
    ? ordered.findIndex((row) => row.kind === "track" && row.track.id === scriptTrackId)
    : -1;
  const scriptBefore = !hasScript
    ? -1
    : voiceoverRow !== -1
      ? voiceoverRow
      : ordered.findIndex((row) => row.kind === "track" && row.track.type === "audio");
  let top = 0;

  ordered.forEach((item, index) => {
    if (index === scriptBefore) {
      rows.push({ kind: "script", top, height: SCRIPT_LANE_HEIGHT_PX });
      top += SCRIPT_LANE_HEIGHT_PX;
    }
    if (item.kind === "folder") {
      rows.push({ ...item, top, height: TRACK_FOLDER_HEIGHT_PX });
      top += TRACK_FOLDER_HEIGHT_PX;
      return;
    }
    const track = item.track;
    const height =
      trackRowHeightPx(track, dawMode) * verticalZoom +
      (track.id === expandedFxTrackId ? FX_PANEL_HEIGHT_PX : 0) +
      automationSectionHeightPx(track, shownAutomationTrackIds);
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
