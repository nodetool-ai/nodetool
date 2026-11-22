/**
 * Write a group's presentation into a child that leaves it. A child inherits
 * its group's transform and opacity at render time, so a copy that loses the
 * `parentId` must carry them, or it draws somewhere else.
 *
 * Only what a static transform can hold is written: translation, scale, anchor
 * and opacity of a group that does not rotate. A group with animation, effects,
 * a blend mode, a transition or a flex layout gives a picture that one
 * transform cannot hold, so the caller gets an error and picks the group's track.
 */

import { IDENTITY_TRANSFORM } from "../render/transform.js";
import type { ClipTransform, TimelineClip } from "../types.js";

const EPS = 1e-9;

/** Why `group` cannot be written into a child, or undefined when it can. */
export function groupBakeProblem(
  group: TimelineClip,
  child?: TimelineClip
): string | undefined {
  if ((group.animations?.length ?? 0) > 0) return "it has animations";
  if ((group.effects ?? []).some((e) => e.enabled)) return "it has effects";
  if (group.blendMode !== undefined && group.blendMode !== "normal") {
    return "it has a blend mode";
  }
  if ((group.transitionIn?.durationMs ?? 0) > 0) return "it has a transition";
  if (group.layout !== undefined) return "it has a flex layout";
  const t = group.transform;
  if (
    t !== undefined &&
    (Math.abs(t.rotation) > EPS ||
      Math.abs(t.rotationX ?? 0) > EPS ||
      Math.abs(t.rotationY ?? 0) > EPS ||
      (t.perspective ?? 0) > 0 ||
      Math.abs(t.depthPx ?? 0) > EPS)
  ) {
    return "it rotates or has depth";
  }
  // Scale acts on the canvas axes, after the child's own rotation. Uneven scale
  // on a rotated child shears it, and one scale vector cannot hold that.
  const c = child?.transform;
  if (
    t !== undefined &&
    c !== undefined &&
    Math.abs(t.scale.x - t.scale.y) > EPS &&
    (Math.abs(c.rotation) > EPS ||
      Math.abs(c.rotationX ?? 0) > EPS ||
      Math.abs(c.rotationY ?? 0) > EPS)
  ) {
    return "it scales unevenly and the clip is rotated";
  }
  return undefined;
}

/**
 * Fold `group`'s translation, scale and opacity into `child`. In clip space the
 * group maps `x` to `S_g (x - a_g) + a_g + t_g`. The child keeps its own anchor
 * and base scale, so its new scale is `S_g S_c` and its new translation is
 * `S_g (a_c + t_c - a_g) + a_g + t_g - a_c`.
 */
export function bakeGroupInto(
  child: TimelineClip,
  group: TimelineClip,
  canvas: { width: number; height: number }
): void {
  const g = group.transform;
  if (g !== undefined) {
    const c: ClipTransform = child.transform ?? structuredClone(IDENTITY_TRANSFORM);
    const { width, height } = canvas;
    const toClipX = (px: number): number => (width === 0 ? 0 : (px / width) * 2);
    const toClipY = (px: number): number => (height === 0 ? 0 : -(px / height) * 2);
    const fromClipX = (v: number): number => (v * width) / 2;
    const fromClipY = (v: number): number => (-v * height) / 2;
    const ga = { x: (g.anchor.x - 0.5) * 2, y: (g.anchor.y - 0.5) * 2 };
    const ca = { x: (c.anchor.x - 0.5) * 2, y: (c.anchor.y - 0.5) * 2 };
    const gt = { x: toClipX(g.position.x), y: toClipY(g.position.y) };
    const ct = { x: toClipX(c.position.x), y: toClipY(c.position.y) };
    const nt = {
      x: g.scale.x * (ca.x + ct.x - ga.x) + ga.x + gt.x - ca.x,
      y: g.scale.y * (ca.y + ct.y - ga.y) + ga.y + gt.y - ca.y
    };
    child.transform = {
      ...c,
      position: { x: fromClipX(nt.x), y: fromClipY(nt.y) },
      scale: { x: c.scale.x * g.scale.x, y: c.scale.y * g.scale.y }
    };
  }
  if (group.opacity !== undefined && group.opacity !== 1) {
    child.opacity = (child.opacity ?? 1) * group.opacity;
  }
}
