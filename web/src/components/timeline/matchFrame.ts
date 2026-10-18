/**
 * Premiere's Match Frame (F) and Reveal in Project (Shift+F).
 *
 * Both find the clip under the playhead on the topmost targeted track that
 * has media, and select its asset in the Assets explorer, opening its
 * folder. Match frame also opens the source monitor on that asset, parked
 * on the source frame the sequence shows at the playhead.
 */

import { clipSourceMsAt, type TimelineClip } from "@nodetool-ai/timeline";

import { revealAssetInExplorer } from "../../stores/AssetGridStore";
import { useAssetStore } from "../../stores/AssetStore";
import { usePanelStore } from "../../stores/PanelStore";
import {
  targetedTrackIds,
  type TimelineStoreState
} from "../../stores/timeline/TimelineStore";
import type { TimelineUIState } from "../../stores/timeline/TimelineUIStore";
import { topClipAtTime } from "./Tracks/editPoints";

/** The clip match frame reads at `atMs`, and the source time it shows. */
export function matchFrameTarget(
  doc: Pick<
    TimelineStoreState,
    "clips" | "tracks" | "untargetedTrackIds"
  >,
  atMs: number
): { clip: TimelineClip; assetId: string; sourceMs: number } | null {
  const withMedia = doc.clips.filter((c) => c.currentAssetId !== undefined);
  const clip = topClipAtTime(withMedia, doc.tracks, targetedTrackIds(doc), atMs);
  if (!clip?.currentAssetId) return null;
  return {
    clip,
    assetId: clip.currentAssetId,
    sourceMs: Math.round(clipSourceMsAt(clip, atMs))
  };
}

/**
 * Select the asset of the clip under the playhead in the Assets explorer
 * and, for match frame, cue it in the source monitor. Resolves false when
 * there is no clip with media there or the asset cannot be loaded.
 */
export async function revealClipMedia(
  doc: Pick<
    TimelineStoreState,
    "clips" | "tracks" | "untargetedTrackIds"
  >,
  ui: Pick<TimelineUIState, "setSourceCue" | "setPanelTab">,
  atMs: number,
  mode: "match" | "reveal"
): Promise<boolean> {
  const target = matchFrameTarget(doc, atMs);
  if (!target) return false;
  let asset;
  try {
    asset = await useAssetStore.getState().get(target.assetId);
  } catch {
    // A deleted or unreachable asset has nothing to reveal.
    return false;
  }
  const panel = usePanelStore.getState();
  panel.setActiveView("assets");
  panel.setVisibility(true);
  revealAssetInExplorer(asset, "assets");
  if (mode === "match") {
    ui.setSourceCue({ assetId: target.assetId, timeMs: target.sourceMs });
    ui.setPanelTab("source");
  }
  return true;
}
