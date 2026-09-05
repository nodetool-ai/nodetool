/**
 * Three-point editing from the source viewer: take the marked range of the
 * asset selected in the explorer and append, insert or overwrite it into the
 * sequence. Shared by the Source panel's buttons and the keyboard actions in
 * TracksRegion, so both do exactly the same thing.
 */

import type { Asset } from "../../stores/ApiTypes";
import type { TimelineStoreState } from "../../stores/timeline/TimelineStore";
import type { TimelineUIState } from "../../stores/timeline/TimelineUIStore";
import { assetMediaType, isCompatibleWithTrack } from "./dnd/assetToClipAdapter";

export type SourceEditKind = "append" | "insert" | "overwrite";

export interface SourceEditContext {
  doc: TimelineStoreState;
  ui: TimelineUIState;
  playheadMs: number;
  asset: Asset | undefined;
}

/** The asset's marked range, or its whole length when nothing is marked. */
export function sourceRangeFor(
  asset: Asset,
  range: TimelineUIState["sourceRange"]
): { inMs: number; outMs: number } {
  const fullMs =
    asset.duration !== null && asset.duration !== undefined
      ? Math.round(asset.duration * 1000)
      : 0;
  const inMs = Math.min(
    fullMs || Number.POSITIVE_INFINITY,
    Math.max(0, range?.inMs ?? 0)
  );
  const outMs = range?.outMs ?? (fullMs > 0 ? fullMs : inMs);
  return {
    inMs,
    outMs: Math.min(fullMs || Number.POSITIVE_INFINITY, Math.max(inMs, outMs))
  };
}

/** First unlocked track the asset can sit on, else null. */
export function sourceTargetTrackId(
  doc: TimelineStoreState,
  asset: Asset
): string | null {
  const mediaType = assetMediaType(asset.content_type);
  if (!mediaType) return null;
  const track = [...doc.tracks]
    .sort((a, b) => a.index - b.index)
    .find((t) => !t.locked && isCompatibleWithTrack(mediaType, t.type));
  return track?.id ?? null;
}

/**
 * Perform the edit. Returns the new clip's id, or null when there is no
 * asset, no usable range, or no track to put it on.
 */
export function performSourceEdit(
  kind: SourceEditKind,
  { doc, ui, playheadMs, asset }: SourceEditContext
): string | null {
  if (!asset) return null;
  const { inMs, outMs } = sourceRangeFor(asset, ui.sourceRange);
  const mediaType = assetMediaType(asset.content_type);
  if (!mediaType) return null;
  // An image has no length; the range is the clip length on the timeline.
  if (mediaType !== "image" && outMs <= inMs) return null;

  const trackId = sourceTargetTrackId(doc, asset);
  if (!trackId) return null;

  let startMs = playheadMs;
  if (kind === "append") {
    startMs = doc.clips
      .filter((c) => c.trackId === trackId)
      .reduce((end, c) => Math.max(end, c.startMs + c.durationMs), 0);
  }
  const id = doc.addSourceRange(asset, trackId, startMs, inMs, outMs);
  if (kind === "insert") doc.resolveDrop(new Set([id]), "insert");
  if (kind === "overwrite") doc.resolveDrop(new Set([id]), "overwrite");
  return id;
}
