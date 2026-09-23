/**
 * "The redo" — the landing page's agents-section film.
 *
 * One board, silent and looping, shot with a moving camera:
 *
 *   Build     close on the stills as they land, then wide on the clips
 *   Note      into the dock: "Shot 3: night, headlights only."
 *   Redo      tight on shot 3 as its still and then its clip render again,
 *             a glance at the dock's tool calls, then wide to show the other
 *             five cards never moved
 *   Cut       a match cut from the night card into the timeline preview,
 *             the day frame turns to night, then down to the track
 *
 * The camera frames rectangles of the product UI, so every move is authored
 * as "look at this". Moves blur with their speed and tilt the window with
 * their direction, which keeps the take alive without cutting.
 */
import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  DocDemoPlayer,
  TimelineDemoPlayer,
  heroRedoCast,
  heroRedoTimelineCast,
} from "@web-demo";

import { useInterFont } from "../promo/fonts";
import { usePendingMediaDelay } from "../promo/usePendingMediaDelay";
import {
  PROMO_ACCENT_GRADIENT,
  PROMO_BG,
  PROMO_FONT,
  PROMO_TEXT,
} from "../promo/theme";

export const REDO_FPS = 30;

/** Board clock: composition frame → cast ms. The redo runs at real time. */
const BOARD_FRAMES = [0, 150, 342, 430];
const BOARD_MS = [0, 7000, 13400, 16000];
const BOARD_END = BOARD_FRAMES[BOARD_FRAMES.length - 1];

const CUT_FROM = BOARD_END;
const CUT_FRAMES = 190;
export const REDO_DURATION_FRAMES = CUT_FROM + CUT_FRAMES;

/** The UI is laid out at this width and scaled to 1920 content pixels. */
const LOGICAL_WIDTH = 1800;
const W = 1920;
const H = 1080;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const move = Easing.bezier(0.7, 0, 0.25, 1);

const resolveAsset = (file: string): string => staticFile(`casts/promo/${file}`);

// ─── Camera ─────────────────────────────────────────────────────────────────

/** A rectangle of the UI in content pixels: x0, y0, x1, y1. */
type Rect = readonly [number, number, number, number];
type CameraKey = { f: number; r: Rect };

/** Regions of the board surface, measured on a 1920×1080 frame. */
const BOARD = {
  all: [-150, -90, 2070, 1170] as Rect,
  rowLeft: [0, 80, 930, 460] as Rect,
  rowRight: [440, 80, 1370, 460] as Rect,
  card3: [880, 80, 1380, 460] as Rect,
  card3Tight: [900, 96, 1362, 444] as Rect,
  note: [1400, 110, 1920, 640] as Rect,
  tools: [1400, 360, 1920, 700] as Rect,
};

/** Regions of the timeline surface. */
const CUT = {
  preview: [300, 0, 1620, 700] as Rect,
  track: [120, 560, 1380, 960] as Rect,
  all: [-120, -70, 2040, 1150] as Rect,
};

const BOARD_CAMERA: CameraKey[] = [
  { f: 0, r: BOARD.rowLeft },
  { f: 18, r: BOARD.rowLeft },
  { f: 70, r: BOARD.rowRight },
  { f: 92, r: BOARD.rowRight },
  { f: 128, r: BOARD.all },
  { f: 146, r: BOARD.all },
  { f: 166, r: BOARD.note },
  { f: 200, r: BOARD.note },
  { f: 222, r: BOARD.card3 },
  { f: 262, r: BOARD.card3Tight },
  { f: 280, r: BOARD.tools },
  { f: 300, r: BOARD.tools },
  { f: 318, r: BOARD.card3Tight },
  { f: 352, r: BOARD.card3 },
  { f: 382, r: BOARD.all },
  { f: 404, r: BOARD.all },
  // Into the night card: the match cut to the timeline's preview.
  { f: 430, r: [1020, 190, 1240, 350] },
];

const CUT_CAMERA: CameraKey[] = [
  { f: 0, r: [520, 90, 1400, 585] },
  { f: 22, r: CUT.preview },
  { f: 70, r: CUT.preview },
  { f: 100, r: CUT.track },
  { f: 130, r: CUT.track },
  { f: 160, r: CUT.all },
  { f: 190, r: CUT.all },
];

type View = { cx: number; cy: number; z: number };

const viewOf = (r: Rect): View => {
  const w = r[2] - r[0];
  const h = r[3] - r[1];
  return { cx: (r[0] + r[2]) / 2, cy: (r[1] + r[3]) / 2, z: Math.min(W / w, H / h) };
};

/** The camera at `frame`: eased between keys, zoom interpolated in log space. */
const cameraAt = (keys: CameraKey[], frame: number): View => {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].f <= frame) {
    i++;
  }
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const t = b.f === a.f ? 1 : interpolate(frame, [a.f, b.f], [0, 1], { ...clamp, easing: move });
  const va = viewOf(a.r);
  const vb = viewOf(b.r);
  return {
    cx: va.cx + (vb.cx - va.cx) * t,
    cy: va.cy + (vb.cy - va.cy) * t,
    z: Math.exp(Math.log(va.z) + (Math.log(vb.z) - Math.log(va.z)) * t),
  };
};

/**
 * Moves the UI under the camera. The UI sits in a floating window over a
 * glow; when the camera is wide the window's edges show, when it is tight the
 * UI fills the frame. Speed adds blur, horizontal travel adds tilt.
 */
const Camera: React.FC<{
  keys: CameraKey[];
  frame: number;
  children: React.ReactNode;
}> = ({ keys, frame, children }) => {
  const { width } = useVideoConfig();
  const out = width / W;
  const v = cameraAt(keys, frame);
  const prev = cameraAt(keys, frame - 1);
  const dx = (v.cx - prev.cx) * v.z;
  const dy = (v.cy - prev.cy) * v.z;
  const dz = Math.abs(Math.log(v.z) - Math.log(prev.z)) * 900;
  const speed = Math.hypot(dx, dy) + dz;
  const blur = Math.min(5, speed * 0.05);
  const tilt = Math.max(-6, Math.min(6, dx * 0.12));
  const tx = W / 2 - v.cx * v.z;
  const ty = H / 2 - v.cy * v.z;
  return (
    <AbsoluteFill style={{ perspective: 2600 * out }}>
      <div
        style={{
          position: "absolute",
          width: W,
          height: H,
          transformOrigin: "0 0",
          transform: `scale(${out}) translate(${tx}px, ${ty}px) scale(${v.z}) rotateY(${tilt}deg)`,
          filter: blur > 0.3 ? `blur(${blur / v.z}px)` : undefined,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 26,
            overflow: "hidden",
            background: PROMO_BG,
            border: "1px solid rgba(148,163,184,0.22)",
            boxShadow: "0 60px 180px rgba(0,0,0,0.75), 0 0 160px rgba(232,121,249,0.14)",
          }}
        >
          {children}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Slow colour under the floating window. */
const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const a = frame / 80;
  return (
    <AbsoluteFill style={{ background: "#03050b" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(45% 55% at ${28 + Math.sin(a) * 10}% ${30 + Math.cos(a * 0.7) * 10}%, rgba(232,121,249,0.22), transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(45% 50% at ${74 + Math.cos(a * 0.8) * 8}% ${72 + Math.sin(a * 0.6) * 8}%, rgba(251,113,133,0.18), transparent 70%)`,
        }}
      />
    </AbsoluteFill>
  );
};

// ─── Overlays in content space ──────────────────────────────────────────────

/** A ring that draws around shot 3 when its new media lands. */
const ChangeRing: React.FC<{ frame: number; at: number }> = ({ frame, at }) => {
  const t = frame - at;
  if (t < 0 || t > 40) {
    return null;
  }
  const grow = interpolate(t, [0, 16], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const fade = interpolate(t, [18, 40], [1, 0], clamp);
  const [x0, y0, x1, y1] = BOARD.card3Tight;
  const pad = 4 + 18 * grow;
  return (
    <div
      style={{
        position: "absolute",
        left: x0 - pad,
        top: y0 - pad,
        width: x1 - x0 + pad * 2,
        height: y1 - y0 + pad * 2,
        borderRadius: 16 + pad,
        border: `${3 - grow * 1.5}px solid rgba(232,121,249,${0.9 * fade})`,
        boxShadow: `0 0 ${40 * grow}px rgba(232,121,249,${0.45 * fade})`,
        pointerEvents: "none",
      }}
    />
  );
};

/**
 * The shot inspector below the grid shows the first shot's fields rather than
 * the selected one's, so a scrim covers it. It sits in content space so it
 * moves with the camera.
 */
const InspectorScrim: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      width: W * 0.725,
      height: H,
      background: `linear-gradient(to bottom, transparent 67.2%, ${PROMO_BG} 69%)`,
    }}
  />
);

// ─── Captions ───────────────────────────────────────────────────────────────

/** Composition frame at which the board cast reaches `ms`. */
const frameAt = (ms: number): number => interpolate(ms, BOARD_MS, BOARD_FRAMES, clamp);

type Beat = { from: number; to: number; lead: string; accent: string };

const BEATS: Beat[] = [
  { from: 10, to: 140, lead: "The agent", accent: "builds the board." },
  { from: 158, to: 206, lead: "Send one shot", accent: "back with a note." },
  { from: 214, to: 372, lead: "Only that shot", accent: "renders again." },
  { from: 380, to: BOARD_END, lead: "Nothing else", accent: "moves." },
  { from: CUT_FROM + 16, to: REDO_DURATION_FRAMES - 12, lead: "The cut", accent: "picks it up." },
];

/** Words rise in one by one; the second half carries the accent gradient. */
const Caption: React.FC = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const s = width / W;
  const beat = BEATS.find((b) => frame >= b.from && frame < b.to + 10);
  if (!beat) {
    return null;
  }
  const out = interpolate(frame, [beat.to, beat.to + 10], [1, 0], clamp);
  const words = [
    ...beat.lead.split(" ").map((w) => ({ w, accent: false })),
    ...beat.accent.split(" ").map((w) => ({ w, accent: true })),
  ];
  return (
    <div
      style={{
        position: "absolute",
        left: 64 * s,
        bottom: 56 * s,
        padding: `${18 * s}px ${30 * s}px`,
        borderRadius: 20 * s,
        background: "rgba(3,5,11,0.72)",
        backdropFilter: "blur(14px)",
        border: "1px solid rgba(148,163,184,0.2)",
        fontFamily: PROMO_FONT,
        fontSize: 52 * s,
        fontWeight: 800,
        letterSpacing: -1.8 * s,
        lineHeight: 1.1,
        color: PROMO_TEXT,
        opacity: out,
        transform: `translateY(${(1 - out) * 12 * s}px)`,
        display: "flex",
        gap: `0 ${14 * s}px`,
        flexWrap: "wrap",
        maxWidth: 1100 * s,
      }}
    >
      {words.map(({ w, accent }, i) => {
        const at = beat.from + i * 3;
        const t = interpolate(frame, [at, at + 9], [0, 1], {
          ...clamp,
          easing: Easing.out(Easing.exp),
        });
        return (
          <span
            key={`${w}-${i}`}
            style={{
              display: "inline-block",
              opacity: t,
              transform: `translateY(${(1 - t) * 26 * s}px)`,
              filter: `blur(${(1 - t) * 6 * s}px)`,
              ...(accent
                ? {
                    backgroundImage: PROMO_ACCENT_GRADIENT,
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }
                : {}),
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

// ─── Surfaces ───────────────────────────────────────────────────────────────

/** The UI laid out at `LOGICAL_WIDTH` and scaled to content pixels. */
const Surface: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const fit = W / LOGICAL_WIDTH;
  return (
    <div
      style={{
        width: LOGICAL_WIDTH,
        height: H / fit,
        transform: `scale(${fit})`,
        transformOrigin: "top left",
      }}
    >
      {children}
    </div>
  );
};

const Board: React.FC = () => {
  const frame = useCurrentFrame();
  const onPendingMedia = usePendingMediaDelay("redo-board");
  const castMs = interpolate(frame, BOARD_FRAMES, BOARD_MS, clamp);
  // The last frames push into the card fast; fade to the cut's first frame.
  const out = interpolate(frame, [BOARD_END - 8, BOARD_END], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Camera keys={BOARD_CAMERA} frame={frame}>
        <Surface>
          <DocDemoPlayer
            cast={heroRedoCast}
            timeMs={castMs}
            resolveAssetUrl={resolveAsset}
            mediaTimeMs={(frame / REDO_FPS) * 1000}
            onPendingMedia={onPendingMedia}
          />
        </Surface>
        <InspectorScrim />
        <ChangeRing frame={frame} at={frameAt(10400)} />
        <ChangeRing frame={frame} at={frameAt(12800)} />
      </Camera>
    </AbsoluteFill>
  );
};

const Cut: React.FC = () => {
  const frame = useCurrentFrame() - CUT_FROM;
  const onPendingMedia = usePendingMediaDelay("redo-cut");
  if (frame < -8) {
    return null;
  }
  const castMs = interpolate(frame, [0, CUT_FRAMES], [0, heroRedoTimelineCast.durationMs], clamp);
  const opacity = interpolate(frame, [-8, 2], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ opacity }}>
      <Camera keys={CUT_CAMERA} frame={Math.max(0, frame)}>
        <Surface>
          <TimelineDemoPlayer
            cast={heroRedoTimelineCast}
            timeMs={castMs}
            resolveAssetUrl={resolveAsset}
            tracksHeightPx={Math.round((H / (W / LOGICAL_WIDTH)) * 0.34)}
            onPendingMedia={onPendingMedia}
            chrome={false}
          />
        </Surface>
      </Camera>
    </AbsoluteFill>
  );
};

/** Black at both ends so the loop point does not read as a cut. */
const LoopFade: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = Math.max(
    interpolate(frame, [0, 10], [1, 0], clamp),
    interpolate(frame, [REDO_DURATION_FRAMES - 14, REDO_DURATION_FRAMES], [0, 1], clamp)
  );
  if (opacity <= 0) {
    return null;
  }
  return <AbsoluteFill style={{ background: "#000", opacity }} />;
};

export const Redo: React.FC = () => {
  useInterFont();
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Backdrop />
      {frame < BOARD_END ? <Board /> : null}
      <Cut />
      <Caption />
      <LoopFade />
    </AbsoluteFill>
  );
};
