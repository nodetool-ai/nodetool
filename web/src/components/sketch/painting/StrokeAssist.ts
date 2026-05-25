/**
 * StrokeAssist — shared point filtering for paint input.
 *
 * Supports the legacy moving-average stabilizer and a lazy-brush leash, with an
 * optional angle snap layer on top. This keeps stroke guidance independent from
 * how each engine stamps paint.
 */

import type { Point, StrokeAssistSettings } from "../types";
import { StabilizerBuffer } from "./StabilizerBuffer";

const LAZY_BRUSH_RADIUS_MIN = 2;
const LAZY_BRUSH_RADIUS_MAX = 36;
const ANGLE_SNAP_MIN_DISTANCE = 8;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class StrokeAssist {
  private stabilizer = new StabilizerBuffer();

  private outputPoint: Point | null = null;

  private anchorPoint: Point | null = null;

  reset(): void {
    this.stabilizer.reset();
    this.outputPoint = null;
    this.anchorPoint = null;
  }

  apply(raw: Point, settings: StrokeAssistSettings): Point {
    if (!this.outputPoint) {
      this.stabilizer.apply(raw, settings.strength);
      this.outputPoint = raw;
      this.anchorPoint = raw;
      return raw;
    }

    let assisted =
      settings.mode === "lazy"
        ? this.applyLazyBrush(raw, settings.strength)
        : this.stabilizer.apply(raw, settings.strength);

    if (settings.snapMode === "angle") {
      assisted = this.applyAngleSnap(assisted, settings);
    }

    this.outputPoint = assisted;
    return assisted;
  }

  private applyLazyBrush(raw: Point, strength: number): Point {
    const current = this.outputPoint ?? raw;
    const dx = raw.x - current.x;
    const dy = raw.y - current.y;
    const distance = Math.hypot(dx, dy);
    const radius = lerp(LAZY_BRUSH_RADIUS_MIN, LAZY_BRUSH_RADIUS_MAX, strength);

    if (distance <= radius || distance === 0) {
      return current;
    }

    const travel = distance - radius;
    return {
      x: current.x + (dx / distance) * travel,
      y: current.y + (dy / distance) * travel
    };
  }

  private applyAngleSnap(
    candidate: Point,
    settings: StrokeAssistSettings
  ): Point {
    const anchor = this.anchorPoint;
    if (!anchor) {
      return candidate;
    }

    const dx = candidate.x - anchor.x;
    const dy = candidate.y - anchor.y;
    const distance = Math.hypot(dx, dy);
    if (distance < ANGLE_SNAP_MIN_DISTANCE) {
      return candidate;
    }

    const incrementRadians = (settings.angleIncrement * Math.PI) / 180;
    const rawAngle = Math.atan2(dy, dx);
    const snappedAngle =
      Math.round(rawAngle / incrementRadians) * incrementRadians;
    const snapped = {
      x: anchor.x + Math.cos(snappedAngle) * distance,
      y: anchor.y + Math.sin(snappedAngle) * distance
    };

    return {
      x: lerp(candidate.x, snapped.x, settings.snapStrength),
      y: lerp(candidate.y, snapped.y, settings.snapStrength)
    };
  }
}
