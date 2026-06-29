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

const FRAME_W = 1920;
const FRAME_H = 1080;
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

  const keys: CameraKey[] = [
    { t: 0, vp: wide },
    { t: ESTABLISH_MS, vp: wide },
  ];

  let prev = wide;
  for (const step of steps) {
    const node = step.focus ? byId(step.focus) : undefined;
    const vp = node ? frameNode(node, step.zoom ?? DEFAULT_ZOOM) : wide;
    const start = Math.max(step.atMs, lastT(keys) + 1);
    keys.push({ t: start, vp: prev }); // hold previous shot until the step begins
    keys.push({ t: start + MOVE_MS, vp }); // glide to the focus
    prev = vp;
  }

  const pullStart = Math.max(replayWindowMs - OUTRO_PULLBACK_MS, lastT(keys) + 1);
  keys.push({ t: pullStart, vp: prev });
  keys.push({ t: replayWindowMs, vp: wide });
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
