/**
 * The hero flow's one clock. Every beat of the reel is a time in seconds
 * here, and every surface state is a function of the time `t`, so the
 * frames match the approved mockups whenever the clock stands still.
 */
import { BEATS, ENTITIES, TOTAL_SECONDS, shotLength, shotStart } from "./data";
import type { ShotState } from "./ui";
import type { TileState } from "./steps";

export const FPS = 30;

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
/** 0 at `a`, 1 at `b`, linear between. */
export const span = (t: number, a: number, b: number): number =>
  clamp01((t - a) / (b - a));
export const expoOut = (x: number): number =>
  x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
export const inOut = (x: number): number =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

// ─── Timing ─────────────────────────────────────────────────────────────────

/** How fast the timeline plays the opening shots before it slows for the reveal. */
const FAST_RATE = 2.5;
const FAST_UNTIL = shotStart(2);

export const T = {
  composerIn: [0, 0.5],
  type: [0.4, 2.5],
  press: [2.7, 3.0],
  /** Composer → beat sheet. */
  t1: [3.0, 3.8],
  rows: [3.7, 6.3],
  /** Beat sheet → entities: the mentions fly into the tiles. */
  t2: [7.3, 8.6],
  tiles: 8.55,
  tileGap: 0.2,
  tileRender: 0.75,
  develop: 0.4,
  /** Entities → storyboard: the tiles shrink into dot chips. */
  t3: [12.4, 13.5],
  stills: 13.5,
  shotGap: 0.45,
  stillRender: 1.2,
  clips: 16.9,
  clipRender: 1.1,
  /** Storyboard → timeline: the shots drop onto V1. */
  t4: [20.6, 22.0],
  play: 22.0,
  /** The monitor grows to full frame when the twist starts. */
  expand: 0.9,
  fadeOut: 0.6,
  tail: 0.3
} as const;

const playEnd = T.play + FAST_UNTIL / FAST_RATE + (TOTAL_SECONDS - FAST_UNTIL);

/** Film time under the playhead at reel time `t`. */
export const filmTime = (t: number): number => {
  const fastEnd = T.play + FAST_UNTIL / FAST_RATE;
  if (t <= T.play) {
    return 0;
  }
  if (t <= fastEnd) {
    return (t - T.play) * FAST_RATE;
  }
  return Math.min(TOTAL_SECONDS, FAST_UNTIL + (t - fastEnd));
};

export const PLAY = {
  start: T.play,
  fastFrames: Math.round((FAST_UNTIL / FAST_RATE) * FPS),
  fastRate: FAST_RATE,
  slowFrom: FAST_UNTIL,
  end: playEnd
};

export const EXPAND = (() => {
  const fastEnd = T.play + FAST_UNTIL / FAST_RATE;
  const start = fastEnd + (shotStart(3) - FAST_UNTIL);
  return [start, start + T.expand] as const;
})();

export const END = playEnd + T.tail;
export const DURATION_FRAMES = Math.round(END * FPS);

// ─── Step 1 · Prompt ────────────────────────────────────────────────────────

export const composerState = (
  t: number,
  briefLength: number
): { typed: number; caret: boolean; press: number; sent: boolean } => ({
  typed: Math.round(span(t, T.type[0], T.type[1]) * briefLength),
  caret: t < T.type[1] + 0.1 || Math.floor(t * 2.4) % 2 === 0,
  press: span(t, T.press[0], T.press[1]),
  sent: t >= T.press[1]
});

// ─── Step 2 · Beat sheet ────────────────────────────────────────────────────

export const beatRows = (t: number): number =>
  span(t, T.rows[0], T.rows[1]) * BEATS.length;

// ─── Step 3 · Entities ──────────────────────────────────────────────────────

/** The render order: the two leads, their sheets, then the world. */
export const TILE_ORDER: string[] = [
  ...ENTITIES.filter((e) => e.kind === "character").map((e) => e.image),
  ...ENTITIES.flatMap((e) => e.refs ?? []),
  ...ENTITIES.filter((e) => e.kind !== "character").map((e) => e.image)
];

const tileStart = (src: string): number =>
  T.tiles + TILE_ORDER.indexOf(src) * T.tileGap;

export const tileState = (t: number, src: string): TileState => {
  const start = tileStart(src);
  const rendered = start + T.tileRender;
  if (t < start) {
    return { state: "empty" };
  }
  if (t < rendered) {
    return { state: "rendering", progress: (t - start) / T.tileRender };
  }
  return {
    state: "done",
    reveal: expoOut(span(t, rendered, rendered + T.develop))
  };
};

export const entitiesDone = (t: number): number =>
  ENTITIES.filter((e) =>
    [e.image, ...(e.refs ?? [])].every(
      (src) => t >= tileStart(src) + T.tileRender + T.develop
    )
  ).length;

// ─── Step 4 · Storyboard ────────────────────────────────────────────────────

export type Board = {
  states: ShotState[];
  progress: number[];
  reveal: number[];
  /** Reel time each shot's clip lands, or Infinity. */
  clipAt: number[];
};

export const clipLanded = (i: number): number =>
  T.clips + i * T.shotGap + T.clipRender;

export const board = (t: number): Board => {
  const states: ShotState[] = [];
  const progress: number[] = [];
  const reveal: number[] = [];
  BEATS.forEach((_, i) => {
    const s0 = T.stills + i * T.shotGap;
    const s1 = s0 + T.stillRender;
    const c0 = T.clips + i * T.shotGap;
    const c1 = clipLanded(i);
    if (t < s0) {
      states.push("queued");
      progress.push(0);
    } else if (t < s1) {
      states.push("still-rendering");
      progress.push((t - s0) / T.stillRender);
    } else if (t < c0) {
      states.push("still");
      progress.push(0);
    } else if (t < c1) {
      states.push("clip-rendering");
      progress.push((t - c0) / T.clipRender);
    } else {
      states.push("clip");
      progress.push(1);
    }
    reveal.push(expoOut(span(t, s1, s1 + T.develop)));
  });
  return {
    states,
    progress,
    reveal,
    clipAt: BEATS.map((_, i) => clipLanded(i))
  };
};

export const clipFrames = (i: number): number =>
  Math.floor(shotLength(i) * FPS) - 1;

// ─── Camera ─────────────────────────────────────────────────────────────────

/**
 * A slow push while a step holds, eased back to 1 across each transition,
 * so the stage never stands still and the morphs start from a clean frame.
 */
const PUSH: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [T.t1[0], 1.02],
  [T.t1[1], 1],
  [T.t2[0], 1.025],
  [T.t2[1], 1],
  [T.t3[0], 1.025],
  [T.t3[1], 1],
  [T.t4[0], 1.025],
  [T.t4[1], 1],
  [EXPAND[0], 1.02],
  [EXPAND[1], 1]
];

export const camera = (t: number): number => {
  for (let k = 1; k < PUSH.length; k++) {
    const [t0, v0] = PUSH[k - 1];
    const [t1, v1] = PUSH[k];
    if (t <= t1) {
      return v0 + (v1 - v0) * inOut(span(t, t0, t1));
    }
  }
  return 1;
};
