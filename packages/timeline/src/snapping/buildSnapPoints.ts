import type { TimelineClip, TimelineMarker } from "../types.js";

export interface SnapPointSource {
  clips?: ReadonlyArray<Pick<TimelineClip, "id" | "startMs" | "durationMs">>;
  markers?: ReadonlyArray<Pick<TimelineMarker, "timeMs">>;
  playheadMs?: number;
  tickIntervalMs?: number;
  maxTimeMs?: number;
  excludeClipIds?: ReadonlySet<string>;
}

/**
 * Build a sorted, deduplicated array of snap-point times (in milliseconds)
 * from multiple sources: clip boundaries, markers, playhead, and regular
 * interval ticks.
 */
export function buildSnapPoints(source: SnapPointSource): number[] {
  const set = new Set<number>();

  if (source.playheadMs !== undefined) {
    set.add(source.playheadMs);
  }

  if (source.tickIntervalMs && source.tickIntervalMs > 0) {
    const max = source.maxTimeMs ?? 0;
    for (let t = 0; t <= max; t += source.tickIntervalMs) {
      set.add(t);
    }
  }

  if (source.markers) {
    for (const m of source.markers) {
      set.add(m.timeMs);
    }
  }

  if (source.clips) {
    const exclude = source.excludeClipIds;
    for (const c of source.clips) {
      if (exclude?.has(c.id)) continue;
      set.add(c.startMs);
      set.add(c.startMs + c.durationMs);
    }
  }

  return Array.from(set).sort((a, b) => a - b);
}
