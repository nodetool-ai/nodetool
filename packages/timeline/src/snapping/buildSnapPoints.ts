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
    // Compute each tick as `i * interval` rather than accumulating `t += interval`
    // so fractional intervals (e.g. 1000/30 ms frame ticks) don't drift over many
    // steps and stay dedupable against integer clip/marker boundaries.
    for (let i = 0; ; i++) {
      const t = i * source.tickIntervalMs;
      if (t > max) break;
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
