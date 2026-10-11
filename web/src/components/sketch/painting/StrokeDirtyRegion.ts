/**
 * StrokeDirtyRegion — the pixels a paint engine touched, tracked twice: over
 * the whole stroke (for the commit) and since the display last asked (for the
 * per-move composite).
 *
 * The cumulative box of a long stroke grows to most of the canvas, so
 * repainting it on every pointer move costs nearly a full composite. The
 * frame box covers only the segments drawn since the previous frame.
 */

import type { DirtyRectBox, DirtyRectTracker } from "../rendering/canvasUtils";

function union(a: DirtyRectBox | null, b: DirtyRectBox): DirtyRectBox {
  if (!a) {
    return { ...b };
  }
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY)
  };
}

export class StrokeDirtyRegion {
  private stroke: DirtyRectBox | null = null;
  private frame: DirtyRectBox | null = null;

  /** Run a draw call with a fresh tracker and record what it touched. */
  track(draw: (tracker: DirtyRectTracker) => void): void {
    const segment: DirtyRectTracker = { current: null };
    draw(segment);
    if (segment.current) {
      this.stroke = union(this.stroke, segment.current);
      this.frame = union(this.frame, segment.current);
    }
  }

  /** Everything touched since the stroke began. */
  get strokeRect(): DirtyRectBox | null {
    return this.stroke;
  }

  /** Everything touched since the previous call; resets the frame box. */
  takeFrameRect(): DirtyRectBox | null {
    const rect = this.frame;
    this.frame = null;
    return rect;
  }

  reset(): void {
    this.stroke = null;
    this.frame = null;
  }
}
