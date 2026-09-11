/**
 * Camera path for the tutorial compositions.
 *
 * Turns a tutorial's steps into an animated ReactFlow viewport: a wide
 * establishing shot, a smooth glide that zooms onto each step's focus node
 * (hold, then move), and a pull-back to wide to reveal the finished graph. The
 * DemoPlayer takes this viewport as a controlled prop, so the camera is driven
 * frame-by-frame by Remotion's clock.
 */
import { interpolate, Easing } from "remotion";
import type { TutorialStep } from "./components/StepIndicator";
import type { FocusTarget, TutorialShot } from "./types";

export const CAMERA_BASE_WIDTH = 1920;
export const CAMERA_BASE_HEIGHT = 1080;
const FRAME_W = CAMERA_BASE_WIDTH;
const FRAME_H = CAMERA_BASE_HEIGHT;
/** Where the focused node's top sits vertically (fraction of frame height). */
const TOP_ANCHOR = 0.22;
const DEFAULT_ZOOM = 2.3;
/** Hold the wide shot this long at the start of the replay before zooming in. */
const ESTABLISH_MS = 1100;
/** Glide time between two focuses. */
const MOVE_MS = 750;
/** Pull back to wide this long before the replay window ends. */
const OUTRO_PULLBACK_MS = 1200;

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface GraphNode {
  id: string;
  ui_properties?: { position?: { x: number; y: number }; width?: number };
}

export interface CameraCast {
  viewport?: Viewport;
  workflow?: { graph?: { nodes?: GraphNode[] } };
}

/**
 * Frame a single node: center it horizontally and anchor its top near the upper
 * quarter. Height-independent, so it frames cleanly regardless of how tall the
 * node renders.
 */
function frameNode(node: GraphNode, zoom: number): Viewport {
  const pos = node.ui_properties?.position ?? { x: 0, y: 0 };
  const width = node.ui_properties?.width ?? 240;
  const centerX = pos.x + width / 2;
  return {
    x: FRAME_W / 2 - centerX * zoom,
    y: FRAME_H * TOP_ANCHOR - pos.y * zoom,
    zoom,
  };
}

interface CameraKey {
  t: number;
  vp: Viewport;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface SafeArea {
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
  readonly exclusions?: readonly Rect[];
}

export interface ResolvedTarget {
  readonly target: FocusTarget;
  readonly bounds: Rect;
}

export type TargetResolver = (target: FocusTarget, anchorMs: number) => Rect | undefined;

export const DEFAULT_SHOT_MOVE_MS = 650;
export const DEFAULT_SHOT_PADDING = 48;
export const DEFAULT_SHOT_MAX_ZOOM = 2.5;

export function shotAnchorMs(shot: TutorialShot): number {
  return shot.anchorMs ?? Math.min(shot.toMs, shot.fromMs + (shot.moveMs ?? DEFAULT_SHOT_MOVE_MS));
}

function unionRects(rects: readonly Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function resolveTargetBounds(
  target: FocusTarget,
  anchorMs: number,
  resolver: TargetResolver,
  overviewBounds: Rect
): Rect | undefined {
  if (target.kind === "overview") return overviewBounds;
  if (target.kind === "group") {
    const resolved = target.targets
      .map((member) => resolveTargetBounds(member, anchorMs, resolver, overviewBounds))
      .filter((rect): rect is Rect => rect !== undefined);
    return resolved.length === target.targets.length ? unionRects(resolved) : undefined;
  }
  return resolver(target, anchorMs);
}

function availablePictureRect(frame: Size, safeArea: SafeArea): Rect {
  const base: Rect = {
    x: safeArea.left ?? 0,
    y: safeArea.top ?? 0,
    width: frame.width - (safeArea.left ?? 0) - (safeArea.right ?? 0),
    height: frame.height - (safeArea.top ?? 0) - (safeArea.bottom ?? 0),
  };
  const candidates = [base];
  for (const exclusion of safeArea.exclusions ?? []) {
    const next: Rect[] = [];
    for (const candidate of candidates) {
      const intersects =
        exclusion.x < candidate.x + candidate.width &&
        exclusion.x + exclusion.width > candidate.x &&
        exclusion.y < candidate.y + candidate.height &&
        exclusion.y + exclusion.height > candidate.y;
      if (!intersects) {
        next.push(candidate);
        continue;
      }
      const top = exclusion.y - candidate.y;
      const bottom = candidate.y + candidate.height - (exclusion.y + exclusion.height);
      const left = exclusion.x - candidate.x;
      const right = candidate.x + candidate.width - (exclusion.x + exclusion.width);
      if (top > 0) next.push({ ...candidate, height: top });
      if (bottom > 0) next.push({ ...candidate, y: exclusion.y + exclusion.height, height: bottom });
      if (left > 0) next.push({ ...candidate, width: left });
      if (right > 0) next.push({ ...candidate, x: exclusion.x + exclusion.width, width: right });
    }
    candidates.splice(0, candidates.length, ...next);
  }
  const available = candidates.reduce((best, candidate) =>
    candidate.width * candidate.height > best.width * best.height ? candidate : best
  , candidates[0] ?? { x: 0, y: 0, width: 0, height: 0 });
  if (available.width <= 0 || available.height <= 0) {
    throw new Error("Safe-area exclusions leave no available picture area");
  }
  return available;
}

export function fitBoundsToViewport(
  bounds: Rect,
  frame: Size,
  options: { readonly padding?: number; readonly maxZoom?: number; readonly safeArea?: SafeArea } = {}
): Viewport {
  if (bounds.width <= 0 || bounds.height <= 0) throw new Error("Focus bounds must have positive dimensions");
  const picture = availablePictureRect(frame, options.safeArea ?? {});
  const padding = options.padding ?? DEFAULT_SHOT_PADDING;
  const usableWidth = Math.max(1, picture.width - padding * 2);
  const usableHeight = Math.max(1, picture.height - padding * 2);
  const zoom = Math.min(
    options.maxZoom ?? DEFAULT_SHOT_MAX_ZOOM,
    usableWidth / bounds.width,
    usableHeight / bounds.height
  );
  const targetCenterX = bounds.x + bounds.width / 2;
  const targetCenterY = bounds.y + bounds.height / 2;
  return {
    x: picture.x + picture.width / 2 - targetCenterX * zoom,
    y: picture.y + picture.height / 2 - targetCenterY * zoom,
    zoom,
  };
}

export function shotAt(shots: readonly TutorialShot[], timeMs: number): TutorialShot | undefined {
  return shots.find((shot) => timeMs >= shot.fromMs && timeMs < shot.toMs) ??
    (timeMs === shots[shots.length - 1]?.toMs ? shots[shots.length - 1] : undefined);
}

export function validateShots(shots: readonly TutorialShot[]): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  shots.forEach((shot, index) => {
    if (!shot.id || ids.has(shot.id)) errors.push(`shot[${index}] has a missing or duplicate id`);
    ids.add(shot.id);
    if (shot.fromMs < 0 || shot.toMs <= shot.fromMs) errors.push(`${shot.id} has an invalid interval`);
    const numericFields = [shot.fromMs, shot.toMs, shot.moveMs, shot.padding, shot.maxZoom, shot.actionAtMs, shot.anchorMs]
      .filter((value): value is number => value !== undefined);
    if (numericFields.some((value) => !Number.isFinite(value))) errors.push(`${shot.id} has a non-finite numeric field`);
    if (shot.moveMs !== undefined && shot.moveMs < 0) errors.push(`${shot.id} has a negative move duration`);
    if (shot.padding !== undefined && shot.padding < 0) errors.push(`${shot.id} has negative padding`);
    if (shot.maxZoom !== undefined && shot.maxZoom <= 0) errors.push(`${shot.id} has an invalid max zoom`);
    if (index > 0 && shot.fromMs < shots[index - 1].toMs) errors.push(`${shot.id} overlaps or is unordered`);
    const anchor = shotAnchorMs(shot);
    if (anchor < shot.fromMs || anchor > shot.toMs) errors.push(`${shot.id} anchor is outside its interval`);
    if (shot.actionAtMs !== undefined && (shot.actionAtMs < shot.fromMs || shot.actionAtMs > shot.toMs)) {
      errors.push(`${shot.id} action is outside its interval`);
    }
    if (shot.target.kind === "group" && shot.target.targets.length === 0) errors.push(`${shot.id} has an empty group`);
  });
  return errors;
}

export interface ShotCameraKey extends CameraKey {
  readonly shotId: string;
  readonly bounds: Rect;
}

export function buildShotCameraKeys(
  shots: readonly TutorialShot[],
  resolvedBounds: ReadonlyMap<string, Rect>,
  frame: Size,
  safeArea: SafeArea = {}
): readonly ShotCameraKey[] {
  const errors = validateShots(shots);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const keys: ShotCameraKey[] = [];
  shots.forEach((shot, index) => {
    const bounds = resolvedBounds.get(shot.id);
    if (!bounds) throw new Error(`Missing bounds for shot ${shot.id}`);
    const viewport = fitBoundsToViewport(bounds, frame, {
      padding: shot.padding,
      maxZoom: shot.maxZoom,
      safeArea,
    });
    const previous = keys[keys.length - 1]?.vp ?? viewport;
    const moveEnd = Math.min(shot.toMs, shot.fromMs + (shot.moveMs ?? DEFAULT_SHOT_MOVE_MS));
    const append = (key: ShotCameraKey): void => {
      const prior = keys[keys.length - 1];
      if (prior?.t === key.t) keys[keys.length - 1] = key;
      else keys.push(key);
    };
    append({ t: shot.fromMs, vp: index === 0 ? viewport : previous, shotId: shot.id, bounds });
    if (moveEnd > shot.fromMs) append({ t: moveEnd, vp: viewport, shotId: shot.id, bounds });
    append({ t: shot.toMs, vp: viewport, shotId: shot.id, bounds });
  });
  return keys;
}

const lastT = (keys: CameraKey[]): number => keys[keys.length - 1].t;

/** Build the camera keyframes for a tutorial. */
export function buildCameraKeys(
  cast: CameraCast,
  steps: TutorialStep[],
  replayWindowMs: number
): CameraKey[] {
  const wide: Viewport = cast.viewport ?? { x: 0, y: 0, zoom: 1 };
  const nodes = cast.workflow?.graph?.nodes ?? [];
  const byId = (id: string) => nodes.find((n) => n.id === id);

  const keys: CameraKey[] = [{ t: 0, vp: wide }];
  const append = (key: CameraKey): void => {
    const previous = keys[keys.length - 1];
    if (previous.t === key.t) keys[keys.length - 1] = key;
    else if (key.t > previous.t) keys.push(key);
  };
  append({ t: Math.min(ESTABLISH_MS, replayWindowMs), vp: wide });

  let prev = wide;
  for (const step of steps) {
    const node = step.focus ? byId(step.focus) : undefined;
    const vp = node ? frameNode(node, step.zoom ?? DEFAULT_ZOOM) : wide;
    const start = Math.min(replayWindowMs, Math.max(step.atMs, lastT(keys) + 1));
    append({ t: start, vp: prev }); // hold previous shot until the step begins
    append({ t: Math.min(replayWindowMs, start + MOVE_MS), vp }); // glide to the focus
    prev = vp;
  }

  const pullStart = Math.min(
    replayWindowMs,
    Math.max(replayWindowMs - OUTRO_PULLBACK_MS, lastT(keys) + 1)
  );
  append({ t: pullStart, vp: prev });
  append({ t: replayWindowMs, vp: wide });
  return keys;
}

/** Sample the camera at a replay time, easing within each segment. */
export function cameraAt(keys: CameraKey[], timeMs: number): Viewport {
  const ts = keys.map((k) => k.t);
  const opts = {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: "clamp" as const,
    extrapolateRight: "clamp" as const,
  };
  return {
    x: interpolate(timeMs, ts, keys.map((k) => k.vp.x), opts),
    y: interpolate(timeMs, ts, keys.map((k) => k.vp.y), opts),
    zoom: interpolate(timeMs, ts, keys.map((k) => k.vp.zoom), opts),
  };
}

export function shotCameraAt(keys: readonly ShotCameraKey[], timeMs: number): Viewport {
  return cameraAt([...keys], timeMs);
}
