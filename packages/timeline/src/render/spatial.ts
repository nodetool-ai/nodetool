import type { ClipEffect, ClipTransform, TimelineCamera2D } from "../types.js";

export interface SpatialPlacement {
  transform: ClipTransform;
  effects?: ClipEffect[];
}

export function sampleCamera2D(camera: TimelineCamera2D, timeMs: number): TimelineCamera2D {
  const frames = camera.keyframes;
  if (!frames?.length) return camera;
  const ordered = [...frames].sort((a, b) => a.timeMs - b.timeMs);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (!first || !last) return camera;
  if (timeMs <= first.timeMs) return { ...camera, ...first };
  if (timeMs >= last.timeMs) return { ...camera, ...last };
  for (let index = 1; index < ordered.length; index++) {
    const end = ordered[index];
    if (timeMs > end.timeMs) continue;
    const start = ordered[index - 1];
    const t = (timeMs - start.timeMs) / (end.timeMs - start.timeMs);
    const mix = (a: number, b: number): number => a + (b - a) * t;
    return {
      ...camera,
      position: { x: mix(start.position.x, end.position.x), y: mix(start.position.y, end.position.y) },
      depthPx: mix(start.depthPx, end.depthPx),
      focusDepthPx: mix(start.focusDepthPx ?? camera.focusDepthPx ?? 0, end.focusDepthPx ?? camera.focusDepthPx ?? 0),
      aperturePx: mix(start.aperturePx ?? camera.aperturePx ?? 0, end.aperturePx ?? camera.aperturePx ?? 0)
    };
  }
  return camera;
}

/** Apply a moving camera to a flat layer. The perspective divide creates parallax. */
export function resolveCamera2D(
  transform: ClipTransform,
  camera: TimelineCamera2D,
  effects?: ClipEffect[]
): SpatialPlacement {
  const depth = transform.depthPx ?? 0;
  const distance = Math.max(1, camera.focalLengthPx - camera.depthPx - depth);
  const perspectiveScale = camera.focalLengthPx / distance;
  const position = {
    x: (transform.position.x - camera.position.x) * perspectiveScale,
    y: (transform.position.y - camera.position.y) * perspectiveScale
  };
  const placed: ClipTransform = {
    ...transform,
    position,
    scale: {
      x: transform.scale.x * perspectiveScale,
      y: transform.scale.y * perspectiveScale
    }
  };
  const aperture = camera.aperturePx ?? 0;
  const focusDistance = Math.max(1, camera.focalLengthPx - camera.depthPx - (camera.focusDepthPx ?? 0));
  const radius = Math.min(64, aperture * Math.abs(distance - focusDistance) / distance);
  if (radius < 0.5) return { transform: placed, effects };
  return {
    transform: placed,
    effects: [...(effects ?? []), { id: "camera-dof", type: "blur", enabled: true, radius }]
  };
}
