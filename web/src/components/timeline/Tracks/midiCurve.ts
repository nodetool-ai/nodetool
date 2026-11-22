/**
 * The controller curve a midi clip draws over its note lines.
 *
 * The first lane of the clip that has a point is drawn. x is the same
 * tick-to-position map the note lines use (trim window respected), y is the
 * lane value mapped over the clip body through `controllerValueRange`. A step
 * lane draws horizontal then vertical segments, a linear lane straight ones.
 * The lane is empty before its first point and holds its last value after it,
 * as `controllerValueAt` reads it.
 */

import {
  controllerValueAt,
  controllerValueRange,
  msToTicks,
  ticksToMs
} from "@nodetool-ai/timeline";
import type { MidiControllerLane } from "@nodetool-ai/timeline";

export interface CurveVertex {
  x: number;
  y: number;
}

export interface CurveSpec {
  inPointMs: number;
  durationMs: number;
  bpm: number;
  widthPx: number;
  heightPx: number;
}

/** Space kept above and below the curve inside the clip body. */
const CURVE_INSET_PX = 1;

/** The lane a clip shows: the first in list order with at least one point. */
export function curveLane(
  controllers: ReadonlyArray<MidiControllerLane> | undefined
): MidiControllerLane | undefined {
  return controllers?.find((lane) => lane.points.length > 0);
}

/** The polyline of the lane over the clip body, or null when nothing shows. */
export function controllerCurveVertices(
  lane: MidiControllerLane | undefined,
  spec: CurveSpec
): CurveVertex[] | null {
  if (!lane || lane.points.length === 0) return null;
  if (!(spec.durationMs > 0) || !(spec.widthPx > 0) || !(spec.heightPx > 0)) {
    return null;
  }
  const { min, max } = controllerValueRange(lane.kind);
  const range = Math.max(1, max - min);
  const pxPerMs = spec.widthPx / spec.durationMs;
  const startTick = msToTicks(spec.inPointMs, spec.bpm);
  const endTick = msToTicks(spec.inPointMs + spec.durationMs, spec.bpm);
  const xOf = (tick: number) =>
    (ticksToMs(tick, spec.bpm) - spec.inPointMs) * pxPerMs;
  const yOf = (value: number) =>
    CURVE_INSET_PX +
    (1 - (value - min) / range) * Math.max(0, spec.heightPx - 2 * CURVE_INSET_PX);

  const first = lane.points[0]!;
  if (first.tick > endTick) return null;
  const events: Array<{ x: number; value: number }> = [];
  const startValue = controllerValueAt(lane, startTick);
  if (startValue !== undefined) events.push({ x: 0, value: startValue });
  for (const point of lane.points) {
    if (point.tick <= startTick || point.tick >= endTick) continue;
    events.push({ x: xOf(point.tick), value: point.value });
  }
  const endValue = controllerValueAt(lane, endTick);
  if (endValue !== undefined) events.push({ x: spec.widthPx, value: endValue });
  if (events.length === 0) return null;

  const step = lane.interpolation === "step";
  const out: CurveVertex[] = [];
  const push = (vertex: CurveVertex): void => {
    const prev = out[out.length - 1];
    if (!prev || prev.x !== vertex.x || prev.y !== vertex.y) out.push(vertex);
  };
  events.forEach((event, i) => {
    if (step && i > 0) push({ x: event.x, y: yOf(events[i - 1]!.value) });
    push({ x: event.x, y: yOf(event.value) });
  });
  return out;
}
