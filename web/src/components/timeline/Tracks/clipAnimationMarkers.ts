import type { AnimationRole, ClipAnimation } from "@nodetool-ai/timeline";

const MIN_MARKER_WIDTH_PX = 6;

export interface AnimationZoneMarker {
  offsetPx: number;
  widthPx: number;
}

export interface ClipAnimationMarkers {
  inZone?: AnimationZoneMarker;
  outZone?: AnimationZoneMarker;
  hasLoopOrEmphasis: boolean;
}

function zoneForRole(
  animations: ClipAnimation[],
  role: Extract<AnimationRole, "in" | "out">,
  msPerPx: number,
  clipWidthPx: number
): AnimationZoneMarker | undefined {
  const matching = animations.filter(
    (animation) => animation.enabled !== false && animation.role === role
  );
  if (matching.length === 0) return undefined;

  const startMs = Math.min(
    ...matching.map((animation) => animation.delayMs ?? 0)
  );
  const endMs = Math.max(
    ...matching.map(
      (animation) => (animation.delayMs ?? 0) + animation.durationMs
    )
  );
  const offsetPx = Math.max(0, startMs / msPerPx);
  const widthPx = Math.min(
    Math.max(0, clipWidthPx - offsetPx),
    (endMs - startMs) / msPerPx
  );
  if (widthPx < MIN_MARKER_WIDTH_PX) return undefined;
  return { offsetPx, widthPx };
}

export function deriveClipAnimationMarkers(
  animations: ClipAnimation[] | undefined,
  msPerPx: number,
  clipWidthPx: number
): ClipAnimationMarkers {
  const enabled = (animations ?? []).filter(
    (animation) => animation.enabled !== false
  );
  return {
    inZone: zoneForRole(enabled, "in", msPerPx, clipWidthPx),
    outZone: zoneForRole(enabled, "out", msPerPx, clipWidthPx),
    hasLoopOrEmphasis: enabled.some(
      (animation) => animation.role === "loop" || animation.role === "emphasis"
    )
  };
}
