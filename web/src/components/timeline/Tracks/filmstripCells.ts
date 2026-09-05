import { sourceRate } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";

import type { ClipThumbnail } from "./clipThumbnails";

export interface FilmstripCell {
  url: string;
}

/** Source window a clip shows, in source milliseconds. Mirrors `trimClip`. */
export function clipSourceWindow(
  clip: Pick<
    TimelineClip,
    "inPointMs" | "outPointMs" | "durationMs" | "speedMultiplier" | "speedBaked"
  >
): { inPointMs: number; outPointMs: number } {
  const inPointMs = clip.inPointMs ?? 0;
  const outPointMs =
    clip.outPointMs ?? inPointMs + clip.durationMs * sourceRate(clip);
  return { inPointMs, outPointMs };
}

/**
 * Pick one thumbnail per filmstrip cell across the clip's source window.
 * Cell `i` sits at `inPointMs + i / (cellCount - 1) * (outPointMs - inPointMs)`
 * and takes the thumbnail whose `time` is nearest, so a trimmed in-point shows
 * later frames instead of always starting at the source's first frame.
 * `thumbnails` is assumed sorted by `time`, as the extractor emits them.
 */
export function selectFilmstripCells(
  thumbnails: readonly ClipThumbnail[],
  cellCount: number,
  inPointMs: number,
  outPointMs: number
): FilmstripCell[] {
  if (thumbnails.length === 0 || cellCount <= 0) return [];
  const spanMs = Math.max(0, outPointMs - inPointMs);
  const steps = Math.max(1, cellCount - 1);
  const cells: FilmstripCell[] = [];
  for (let i = 0; i < cellCount; i += 1) {
    const targetSec = (inPointMs + (i / steps) * spanMs) / 1000;
    cells.push({ url: nearestThumbnail(thumbnails, targetSec).dataUrl });
  }
  return cells;
}

function nearestThumbnail(
  thumbnails: readonly ClipThumbnail[],
  targetSec: number
): ClipThumbnail {
  let best = thumbnails[0];
  let bestDelta = Math.abs(best.time - targetSec);
  for (let i = 1; i < thumbnails.length; i += 1) {
    const delta = Math.abs(thumbnails[i].time - targetSec);
    if (delta < bestDelta) {
      best = thumbnails[i];
      bestDelta = delta;
    } else if (delta > bestDelta) {
      break;
    }
  }
  return best;
}

/**
 * Width of the region past the source's end, as a fraction of the clip
 * (0 when the clip ends inside the source). The source end is estimated from
 * the sampled thumbnails: the last sample's time plus one sample interval,
 * since the extractor spreads samples uniformly over the whole source.
 */
export function beyondSourceFraction(
  thumbnails: readonly ClipThumbnail[],
  inPointMs: number,
  outPointMs: number
): number {
  if (thumbnails.length < 2) return 0;
  const first = thumbnails[0].time;
  const last = thumbnails[thumbnails.length - 1].time;
  const intervalSec = (last - first) / (thumbnails.length - 1);
  const sourceEndMs = (last + intervalSec) * 1000;
  const spanMs = outPointMs - inPointMs;
  if (spanMs <= 0 || outPointMs <= sourceEndMs) return 0;
  return Math.min(1, (outPointMs - sourceEndMs) / spanMs);
}
