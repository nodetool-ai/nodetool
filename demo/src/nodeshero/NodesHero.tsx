/**
 * The /node-based-workflows hero: a 22-second muted loop that builds,
 * checks and runs one real NodeTool workflow, then pulls back to the rest
 * of the node library.
 *
 *   0.0  "Every step is a node." slams in over the grid.
 *   2.0  Seven nodes land and their typed wires draw left to right.
 *   6.3  A video output is dragged onto a text input and refused.
 *   8.6  Run: five shots stream through For Each, the stills and clips
 *        render in their nodes, Collect fills, and the cut plays.
 *  14.8  The image model is swapped across three providers.
 *  17.0  The graph gives way to a wall of real node titles and the end card.
 *
 * Every state is a function of the frame clock (`t` in seconds), so any
 * frame renders the same way twice and the loop closes on the empty grid.
 */
import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  useCurrentFrame
} from "remotion";

import { FILM } from "../heroflow/data";
import { ACCENT_GRADIENT, C, FONT, MONO, R, heroAsset } from "../heroflow/theme";
import { Icon, MagicFill, ProgressBar } from "../heroflow/ui";
import {
  B,
  CONCAT,
  EDGES,
  FILM_AT,
  FPS,
  HEADER,
  IMAGE_RENDER,
  MODELS,
  NODES,
  NODE_LIST,
  SECONDS,
  PORT_COLOR,
  ROW,
  SHOTS,
  SHOT_COUNT,
  VIDEO_MODEL,
  VIDEO_RENDER,
  WALL,
  WIRE_DRAW,
  backOut,
  bezierAt,
  bezierPath,
  clamp01,
  collectedAt,
  currentItem,
  edgePoints,
  expoOut,
  imageAt,
  inAt,
  itemAt,
  kf,
  modelIndex,
  nodeState,
  outAt,
  packets,
  span,
  videoAt,
  type NodeSpec,
  type RunState
} from "./graph";

const REJECT_RED = "#FF5C7A";

// ─── Camera ─────────────────────────────────────────────────────────────────

/**
 * Where the camera looks and how close, per beat. `CAM_Y` is the canvas row
 * that sits at `EYE_Y` on screen, above the caption band.
 */
const EYE_Y = 410;
const CAM_X: ReadonlyArray<readonly [number, number]> = [
  [0, 560],
  [2.0, 560],
  [4.4, 1150],
  [5.8, 1590],
  [6.5, 1290],
  [8.3, 1290],
  [9.0, 900],
  [10.6, 1150],
  [11.8, 2250],
  [12.7, 2850],
  [14.5, 2850],
  [14.9, 1020],
  [16.8, 1020],
  [17.8, 1590]
];
const CAM_Y: ReadonlyArray<readonly [number, number]> = [
  [0, 475],
  [5.8, 475],
  [6.5, 380],
  [8.3, 380],
  [9.0, 475],
  [11.8, 475],
  [12.7, 450],
  [14.5, 450],
  [14.9, 471],
  [16.8, 471],
  [17.8, 475]
];
const CAM_S: ReadonlyArray<readonly [number, number]> = [
  [0, 1.3],
  [2.0, 1.25],
  [4.4, 1.0],
  [5.8, 0.6],
  [6.5, 1.05],
  [8.3, 1.05],
  [9.0, 0.92],
  [10.6, 0.85],
  [11.8, 0.8],
  [12.7, 1.2],
  [14.5, 1.26],
  [14.9, 1.45],
  [16.8, 1.5],
  [17.8, 0.36],
  [18.8, 0.3]
];

// ─── Pieces ─────────────────────────────────────────────────────────────────

const Grid: React.FC<{ t: number }> = ({ t }) => (
  <AbsoluteFill style={{ background: C.stage }}>
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(55% 55% at 50% 45%, rgba(91,134,196,0.10), transparent 70%), radial-gradient(40% 45% at 85% 85%, rgba(232,121,249,0.08), transparent 70%)"
      }}
    />
    <AbsoluteFill
      style={{
        backgroundImage:
          "radial-gradient(rgba(148,163,184,0.16) 1.2px, transparent 1.2px)",
        backgroundSize: "32px 32px",
        backgroundPosition: `${-t * 6}px ${-t * 3}px`,
        maskImage: "radial-gradient(70% 70% at 50% 50%, black, transparent)"
      }}
    />
  </AbsoluteFill>
);

const StatusMark: React.FC<{ state: RunState }> = ({ state }) =>
  state === "done" ? (
    <Icon name="check" size={20} color={C.success} stroke={2.6} />
  ) : state === "running" ? (
    <Icon name="sparkle" size={19} color={C.fuchsia} fill />
  ) : null;

const GraphNode: React.FC<{
  n: NodeSpec;
  t: number;
  state: RunState;
  progress?: number;
  rejectPort?: number;
  children?: React.ReactNode;
  chip?: React.ReactNode;
}> = ({ n, t, state, progress, rejectPort = 0, children, chip }) => {
  const enter = span(t, n.enter, n.enter + 0.55);
  if (enter <= 0) {
    return null;
  }
  const pop = backOut(enter);
  const running = state === "running";
  const rows = Math.max(n.inputs.length, n.outputs.length);
  const pulse = running ? 0.5 + 0.5 * Math.sin(t * 9) : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: n.x,
        top: n.y,
        width: n.w,
        opacity: clamp01(enter * 2),
        transform: `translateY(${(1 - pop) * 60}px) scale(${0.86 + pop * 0.14})`,
        transformOrigin: "50% 60%",
        borderRadius: R.lg,
        background: C.paper,
        border: `${running ? 2 : 1}px solid ${
          running ? C.fuchsia : state === "done" ? `${C.success}88` : C.lineStrong
        }`,
        boxShadow: running
          ? `0 0 ${40 + pulse * 30}px ${C.fuchsia}55, 0 30px 70px rgba(0,0,0,0.6)`
          : "0 30px 70px rgba(0,0,0,0.6)"
      }}
    >
      <div
        style={{
          height: HEADER,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 16px",
          background: C.bg,
          borderBottom: `1px solid ${C.line}`,
          borderRadius: `${R.lg}px ${R.lg}px 0 0`
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontSize: 21, fontWeight: 600, lineHeight: 1.1 }}>
            {n.title}
          </span>
          <span
            style={{
              fontSize: 11,
              fontFamily: MONO,
              color: C.dim,
              marginTop: 3,
              whiteSpace: "nowrap"
            }}
          >
            {n.type}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <StatusMark state={state} />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          style={{
            height: ROW,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 18px",
            fontSize: 15,
            fontFamily: MONO,
            color: C.dim
          }}
        >
          <span
            style={{
              color:
                rejectPort > 0 && i === 0 && n.inputs[i]
                  ? REJECT_RED
                  : n.inputs[i]
                    ? PORT_COLOR[n.inputs[i].type]
                    : C.dim
            }}
          >
            {n.inputs[i]?.name ?? ""}
          </span>
          <span
            style={{ color: n.outputs[i] ? PORT_COLOR[n.outputs[i].type] : C.dim }}
          >
            {n.outputs[i]?.name ?? ""}
          </span>
        </div>
      ))}
      {chip ? <div style={{ padding: "2px 12px 8px" }}>{chip}</div> : null}
      <div
        style={{
          position: "relative",
          height: n.bodyH,
          margin: "4px 12px 12px",
          borderRadius: R.md,
          overflow: "hidden",
          background: C.bg
        }}
      >
        {children}
        {running && progress !== undefined ? (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
            <ProgressBar value={progress} color={C.fuchsia} height={5} />
          </div>
        ) : null}
      </div>
      {[
        ...n.inputs.map((p, i) => ({ p, i, left: true })),
        ...n.outputs.map((p, i) => ({ p, i, left: false }))
      ].map(({ p, i, left }) => {
        const bad = left && i === 0 && rejectPort > 0;
        const color = bad ? REJECT_RED : PORT_COLOR[p.type];
        return (
          <div
            key={`${left}-${p.name}`}
            style={{
              position: "absolute",
              [left ? "left" : "right"]: -10,
              top: HEADER + i * ROW + ROW / 2 - 10,
              width: 20,
              height: 20,
              borderRadius: 10,
              background: color,
              border: `4px solid ${C.paper}`,
              boxShadow: bad
                ? `0 0 ${18 + rejectPort * 22}px ${REJECT_RED}`
                : `0 0 10px ${color}66`,
              transform: bad
                ? `translateX(${Math.sin(t * 70) * 5 * rejectPort}px) scale(${1 + rejectPort * 0.35})`
                : undefined
            }}
          />
        );
      })}
    </div>
  );
};

const ModelChip: React.FC<{ name: string; detail?: string; flip?: number }> = ({
  name,
  detail,
  flip = 0
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      height: 38,
      padding: "0 12px",
      borderRadius: R.md,
      background: C.raised,
      border: `1px solid ${flip > 0 ? C.fuchsia : C.lineStrong}`,
      boxShadow: flip > 0 ? `0 0 ${24 * flip}px ${C.fuchsia}66` : undefined,
      overflow: "hidden"
    }}
  >
    <Icon name="sparkle" size={15} color={C.fuchsia} fill />
    <span
      style={{
        fontSize: 16,
        fontWeight: 600,
        whiteSpace: "nowrap",
        transform: `translateY(${flip * -6}px)`,
        opacity: 1 - flip * 0.4
      }}
    >
      {name}
    </span>
    <div style={{ flex: 1 }} />
    {detail ? (
      <span style={{ fontSize: 13, fontFamily: MONO, color: C.dim, whiteSpace: "nowrap" }}>
        {detail}
      </span>
    ) : null}
  </div>
);

/** A stack of five slots that fill as items arrive. */
const Slots: React.FC<{
  filled: number;
  src: (i: number) => string;
  height: number;
}> = ({ filled, src, height }) => (
  <div style={{ display: "flex", gap: 6, height }}>
    {SHOTS.map((s, i) => (
      <div
        key={s.name}
        style={{
          position: "relative",
          flex: 1,
          borderRadius: 5,
          overflow: "hidden",
          background: C.raised,
          border: `1px solid ${i < filled ? C.lineStrong : C.line}`
        }}
      >
        {i < filled ? (
          <Img
            src={heroAsset(src(i))}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : null}
      </div>
    ))}
  </div>
);

const Develop: React.FC<{ src: string; reveal: number }> = ({ src, reveal }) => (
  <Img
    src={heroAsset(src)}
    style={{
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover",
      opacity: Math.min(1, reveal * 1.6),
      filter:
        reveal >= 1
          ? undefined
          : `blur(${(1 - reveal) * 18}px) brightness(${1 + (1 - reveal) * 0.7})`,
      transform: `scale(${1 + (1 - reveal) * 0.08})`
    }}
  />
);

// ─── Node bodies ────────────────────────────────────────────────────────────

const ShotsBody: React.FC<{ t: number }> = ({ t }) => {
  const lit = currentItem(t, itemAt);
  return (
    <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
      {SHOTS.map((s, i) => {
        const shown = span(t, NODES.shots.enter + 0.2 + i * 0.09, NODES.shots.enter + 0.45 + i * 0.09);
        const active = t >= B.run && lit === i && t < itemAt(i) + B.itemGap;
        return (
          <div
            key={s.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: 36,
              padding: "0 10px",
              borderRadius: 6,
              fontSize: 17,
              opacity: shown,
              transform: `translateX(${(1 - expoOut(shown)) * -16}px)`,
              background: active ? `${C.textual}22` : "transparent",
              border: `1px solid ${active ? `${C.textual}88` : "transparent"}`,
              color: active ? C.text : "rgba(247,248,248,0.82)"
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: 13, color: C.textual }}>
              {i + 1}
            </span>
            {s.name}
          </div>
        );
      })}
    </div>
  );
};

const ForEachBody: React.FC<{ t: number }> = ({ t }) => {
  const k = currentItem(t, itemAt);
  const shown = t >= B.run && k >= 0;
  const bump = shown ? 1 - span(t, itemAt(k), itemAt(k) + 0.2) : 0;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 4 }}>
      <div
        style={{
          fontSize: 44,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          transform: `scale(${1 + bump * 0.25})`,
          color: shown ? C.text : C.faint
        }}
      >
        {shown ? `${k + 1} / ${SHOT_COUNT}` : `– / ${SHOT_COUNT}`}
      </div>
      <div style={{ fontSize: 13, fontFamily: MONO, color: C.dim }}>index</div>
    </AbsoluteFill>
  );
};

const ImageBody: React.FC<{ t: number }> = ({ t }) => {
  const k = currentItem(t, imageAt);
  if (k < 0) {
    return <MagicFill />;
  }
  const progress = span(t, imageAt(k), imageAt(k) + IMAGE_RENDER);
  const done = (i: number): boolean => t >= imageAt(i) + IMAGE_RENDER;
  const filled = SHOTS.filter((_, i) => done(i)).length;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: "0 0 58px 0", overflow: "hidden", borderRadius: 8 }}>
        <MagicFill phase={progress < 1 ? progress : undefined} color={C.image} />
        {progress > 0 ? <Develop src={SHOTS[k].still} reveal={expoOut(progress)} /> : null}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 6 }}>
        <Slots filled={filled} src={(i) => SHOTS[i].still} height={46} />
      </div>
    </AbsoluteFill>
  );
};

const VideoBody: React.FC<{ t: number }> = ({ t }) => {
  const k = currentItem(t, videoAt);
  if (k < 0) {
    return <MagicFill />;
  }
  const start = videoAt(k);
  const progress = span(t, start, start + VIDEO_RENDER);
  const filled = SHOTS.filter((_, i) => t >= videoAt(i) + VIDEO_RENDER).length;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: "0 0 58px 0", overflow: "hidden", borderRadius: 8 }}>
        <MagicFill phase={progress < 1 ? progress : undefined} color={C.video} />
        {progress >= 1 ? (
          <Sequence from={Math.round((start + VIDEO_RENDER) * FPS)} layout="none">
            <OffthreadVideo
              src={heroAsset(SHOTS[k].clip)}
              muted
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          </Sequence>
        ) : (
          <Develop src={SHOTS[k].clipFrame} reveal={expoOut(progress) * 0.85} />
        )}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 6 }}>
        <Slots filled={filled} src={(i) => SHOTS[i].clipFrame} height={46} />
      </div>
    </AbsoluteFill>
  );
};

const CollectBody: React.FC<{ t: number }> = ({ t }) => {
  const n = SHOTS.filter((_, i) => t >= collectedAt(i)).length;
  const k = currentItem(t, collectedAt);
  const bump = k >= 0 ? 1 - span(t, collectedAt(k), collectedAt(k) + 0.2) : 0;
  return (
    <AbsoluteFill style={{ padding: 12, gap: 10, justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontSize: 40,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            transform: `scale(${1 + bump * 0.25})`,
            transformOrigin: "left center"
          }}
        >
          {n}
        </span>
        <span style={{ fontSize: 15, fontFamily: MONO, color: C.dim }}>
          videos
        </span>
      </div>
      <Slots filled={n} src={(i) => SHOTS[i].clipFrame} height={28} />
    </AbsoluteFill>
  );
};

const ConcatBody: React.FC<{ t: number }> = ({ t }) => {
  const p = span(t, CONCAT[0], CONCAT[1]);
  const joined = expoOut(p);
  return (
    <AbsoluteFill style={{ padding: 12, justifyContent: "center", gap: 10 }}>
      <div style={{ display: "flex", gap: (1 - joined) * 8, height: 44 }}>
        {SHOTS.map((s, i) => (
          <div
            key={s.name}
            style={{
              flex: 1,
              borderRadius: i === 0 ? "5px 0 0 5px" : i === SHOT_COUNT - 1 ? "0 5px 5px 0" : 0,
              overflow: "hidden",
              opacity: t >= CONCAT[0] ? 1 : 0.18,
              background: C.raised
            }}
          >
            <Img
              src={heroAsset(s.clipFrame)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 14, fontFamily: MONO, color: C.dim }}>
        {t < CONCAT[0] ? "waiting for list" : p < 1 ? "joining 5 clips" : "15.0 s · 1 video"}
      </div>
    </AbsoluteFill>
  );
};

const OutputBody: React.FC<{ t: number }> = ({ t }) => {
  if (t < FILM_AT) {
    return (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <MagicFill />
        <span style={{ position: "relative", fontSize: 16, color: C.dim }}>
          Waiting for video
        </span>
      </AbsoluteFill>
    );
  }
  const reveal = expoOut(span(t, FILM_AT, FILM_AT + 0.5));
  return (
    <AbsoluteFill style={{ opacity: reveal }}>
      <Sequence from={Math.round(FILM_AT * FPS)} layout="none">
        <OffthreadVideo
          src={heroAsset(FILM)}
          muted
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      </Sequence>
    </AbsoluteFill>
  );
};

// ─── Wires ──────────────────────────────────────────────────────────────────

const Packet: React.FC<{ at: [number, number]; color: string }> = ({ at, color }) => (
  <circle cx={at[0]} cy={at[1]} r={9} fill={color} style={{ filter: `drop-shadow(0 0 12px ${color})` }} />
);

const Wires: React.FC<{ t: number }> = ({ t }) => {
  const flows: { edge: number; us: number[] }[] = [
    { edge: 0, us: t >= B.run && t < B.run + 0.35 ? [span(t, B.run, B.run + 0.35)] : [] },
    { edge: 1, us: packets(t, (i) => itemAt(i) - 0.0, 0.14) },
    { edge: 2, us: packets(t, (i) => imageAt(i) + IMAGE_RENDER - 0.02, 0.1) },
    { edge: 3, us: packets(t, (i) => videoAt(i) + VIDEO_RENDER - 0.02, 0.1) },
    { edge: 4, us: t >= CONCAT[0] - 0.12 && t < CONCAT[0] ? [span(t, CONCAT[0] - 0.12, CONCAT[0])] : [] },
    { edge: 5, us: t >= CONCAT[1] - 0.05 && t < FILM_AT ? [span(t, CONCAT[1] - 0.05, FILM_AT)] : [] }
  ];
  return (
    <svg
      width={3300}
      height={1200}
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
    >
      {EDGES.map((e, k) => {
        const draw = expoOut(span(t, e.draw, e.draw + WIRE_DRAW));
        if (draw <= 0) {
          return null;
        }
        const [a, b] = edgePoints(e);
        const color = PORT_COLOR[e.type];
        const live = flows[k].us.length > 0;
        return (
          <g key={k}>
            <path
              d={bezierPath(a, b)}
              pathLength={1}
              fill="none"
              stroke={color}
              strokeOpacity={live ? 0.35 : 0.18}
              strokeWidth={14}
              strokeDasharray="1 1"
              strokeDashoffset={1 - draw}
            />
            <path
              d={bezierPath(a, b)}
              pathLength={1}
              fill="none"
              stroke={color}
              strokeWidth={4}
              strokeDasharray="1 1"
              strokeDashoffset={1 - draw}
            />
            {flows[k].us.map((u, i) => (
              <Packet key={i} at={bezierAt(a, b, u)} color={color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
};

/** The wire dragged from a video output onto a text input, and refused. */
const RejectedWire: React.FC<{ t: number }> = ({ t }) => {
  const [r0, r1] = B.reject;
  if (t < r0 || t > r1) {
    return null;
  }
  const from = outAt("video");
  const target = inAt("image", 0);
  // Drag out and loop back over the nodes, hover the prompt input, snap back.
  const reach = kf(t, [
    [r0 + 0.1, 0],
    [r0 + 0.9, 1],
    [r0 + 1.35, 1],
    [r0 + 1.75, 0]
  ]);
  const mid: [number, number] = [from[0] + 120, from[1] - 230];
  const end: [number, number] =
    reach < 0.5
      ? [
          from[0] + (mid[0] - from[0]) * (reach * 2),
          from[1] + (mid[1] - from[1]) * (reach * 2)
        ]
      : [
          mid[0] + (target[0] - 26 - mid[0]) * ((reach - 0.5) * 2),
          mid[1] + (target[1] - mid[1]) * ((reach - 0.5) * 2)
        ];
  const near = span(reach, 0.7, 1);
  const color = near > 0.5 ? REJECT_RED : C.video;
  const d = `M${from[0]},${from[1]} C${from[0] + 220},${from[1]} ${end[0] + 220},${end[1] - 260} ${end[0]},${end[1]}`;
  return (
    <svg
      width={3300}
      height={1200}
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
    >
      <path d={d} fill="none" stroke={color} strokeWidth={4} strokeDasharray="12 10" />
      <circle cx={end[0]} cy={end[1]} r={11} fill={color} style={{ filter: `drop-shadow(0 0 14px ${color})` }} />
    </svg>
  );
};

/** 0..1 while the refused wire hovers the prompt input. */
const rejectGlow = (t: number): number => {
  const [r0] = B.reject;
  return span(t, r0 + 0.75, r0 + 0.95) * (1 - span(t, r0 + 1.4, r0 + 1.6));
};

const RejectTag: React.FC<{ t: number }> = ({ t }) => {
  const g = rejectGlow(t);
  if (g <= 0) {
    return null;
  }
  const [x, y] = inAt("image", 0);
  return (
    <div
      style={{
        position: "absolute",
        left: x - 30,
        top: y - 118,
        transform: `translateX(-50%) scale(${0.9 + g * 0.1})`,
        opacity: g,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        borderRadius: R.pill,
        background: "rgba(40,10,18,0.92)",
        border: `1px solid ${REJECT_RED}`,
        boxShadow: `0 0 30px ${REJECT_RED}55`,
        whiteSpace: "nowrap",
        fontSize: 18,
        fontFamily: MONO,
        color: C.text
      }}
    >
      <span style={{ color: C.video }}>video</span>
      <span style={{ color: REJECT_RED, fontWeight: 700 }}>≠</span>
      <span style={{ color: C.textual }}>text</span>
      <span style={{ color: C.dim, fontFamily: FONT }}>not connectable</span>
    </div>
  );
};

// ─── Captions ───────────────────────────────────────────────────────────────

type Cap = { at: number; until: number; step: string; title: string; sub: string };

const CAPTIONS: Cap[] = [
  { at: 2.4, until: 6.2, step: "01", title: "Wire the steps.", sub: "Every port has a type: text, image, video, audio." },
  { at: 6.4, until: 8.4, step: "02", title: "Wrong wires don't connect.", sub: "A video output can't feed a text prompt." },
  { at: 8.6, until: 14.6, step: "03", title: "Run it. Watch every step.", sub: "Five shots in. One cut out. The same graph runs again tomorrow." },
  { at: 14.9, until: 17.0, step: "04", title: "Swap the model. Keep the graph.", sub: "One Text To Image node, whichever provider runs the model." }
];

const Caption: React.FC<{ t: number }> = ({ t }) => {
  const cap = CAPTIONS.find((c) => t >= c.at && t < c.until);
  if (!cap) {
    return null;
  }
  const inP = expoOut(span(t, cap.at, cap.at + 0.4));
  const outP = span(t, cap.until - 0.25, cap.until);
  const words = cap.title.split(" ");
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        bottom: 70,
        maxWidth: 1200,
        opacity: 1 - outP,
        transform: `translateY(${outP * 16}px)`
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontFamily: MONO,
          fontSize: 18,
          color: C.dim,
          opacity: inP
        }}
      >
        <span
          style={{
            padding: "3px 10px",
            borderRadius: R.pill,
            backgroundImage: ACCENT_GRADIENT,
            color: "#0B1220",
            fontWeight: 700
          }}
        >
          {cap.step}
        </span>
        NodeTool workflow
      </div>
      <div style={{ marginTop: 14, fontSize: 64, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
        {words.map((w, i) => {
          const p = expoOut(span(t, cap.at + 0.05 + i * 0.06, cap.at + 0.4 + i * 0.06));
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                marginRight: "0.25em",
                opacity: p,
                transform: `translateY(${(1 - p) * 34}px)`,
                filter: `blur(${(1 - p) * 8}px)`
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
      <div style={{ marginTop: 12, fontSize: 26, color: "rgba(247,248,248,0.75)", opacity: span(t, cap.at + 0.3, cap.at + 0.7) }}>
        {cap.sub}
      </div>
    </div>
  );
};

const Shade: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "linear-gradient(to top, rgba(5,6,10,0.92) 0%, rgba(5,6,10,0.55) 22%, transparent 42%)"
    }}
  />
);

// ─── Title and end card ─────────────────────────────────────────────────────

const OpeningTitle: React.FC<{ t: number }> = ({ t }) => {
  const [a, b] = B.title;
  if (t > b) {
    return null;
  }
  const out = span(t, b - 0.45, b);
  const lines = [
    { text: "Every step", at: 0.2 },
    { text: "is a node.", at: 0.55 }
  ];
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        opacity: 1 - out,
        transform: `scale(${1 + out * 0.25})`,
        filter: `blur(${out * 10}px)`
      }}
    >
      {lines.map((l, i) => {
        const p = backOut(span(t, a + l.at, a + l.at + 0.45), 1.4);
        return (
          <div
            key={l.text}
            style={{
              fontSize: 150,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              opacity: clamp01(p * 1.5),
              transform: `translateY(${(1 - p) * 80}px) scale(${0.8 + p * 0.2})`,
              ...(i === 1
                ? {
                    backgroundImage: ACCENT_GRADIENT,
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                    paddingBottom: 12
                  }
                : { color: C.text })
            }}
          >
            {l.text}
          </div>
        );
      })}
      <div
        style={{
          marginTop: 30,
          fontSize: 28,
          color: C.dim,
          opacity: span(t, 1.0, 1.4)
        }}
      >
        Node-based workflows for image, video, audio, and text
      </div>
    </AbsoluteFill>
  );
};

const Wall: React.FC<{ t: number }> = ({ t }) => {
  const [w0] = B.wall;
  // The wall clears before the end card lands, so the card sits on the bare grid.
  const show = span(t, w0, w0 + 0.6) * (1 - span(t, B.end[0] + 0.2, B.end[0] + 0.8));
  if (show <= 0) {
    return null;
  }
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        gap: 22,
        opacity: show,
        maskImage: "linear-gradient(90deg, transparent, black 12%, black 88%, transparent)"
      }}
    >
      {WALL.map((row, r) => {
        const dir = r % 2 === 0 ? -1 : 1;
        const shift = (t - w0) * 120 * dir + (dir > 0 ? -600 : 0);
        const chips = [...row, ...row, ...row];
        return (
          <div key={r} style={{ display: "flex", gap: 18, transform: `translateX(${shift - 200}px)` }}>
            {chips.map((c, i) => {
              const p = expoOut(span(t, w0 + 0.05 * ((i + r * 3) % 12), w0 + 0.5 + 0.05 * ((i + r * 3) % 12)));
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexShrink: 0,
                    padding: "16px 24px",
                    borderRadius: R.lg,
                    background: C.paper,
                    border: `1px solid ${C.lineStrong}`,
                    boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
                    fontSize: 26,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    opacity: p,
                    transform: `translateY(${(1 - p) * 30}px)`
                  }}
                >
                  <span style={{ width: 14, height: 14, borderRadius: 7, background: c.color, boxShadow: `0 0 12px ${c.color}` }} />
                  {c.title}
                </div>
              );
            })}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const EndCard: React.FC<{ t: number }> = ({ t }) => {
  const [e0] = B.end;
  const inP = span(t, e0 + 0.3, e0 + 0.9);
  const out = span(t, SECONDS - 0.65, SECONDS - 0.1);
  if (inP <= 0) {
    return null;
  }
  const facts = ["Open source", "Your own provider keys", "Local or cloud models"];
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        background: `rgba(5,6,10,${0.88 * inP})`,
        opacity: 1 - out
      }}
    >
      <div
        style={{
          fontSize: 30,
          fontFamily: MONO,
          color: C.dim,
          opacity: inP,
          letterSpacing: "0.12em",
          textTransform: "uppercase"
        }}
      >
        Hundreds of nodes. One canvas.
      </div>
      <div
        style={{
          marginTop: 18,
          fontSize: 132,
          fontWeight: 800,
          letterSpacing: "-0.04em",
          lineHeight: 1.02,
          textAlign: "center",
          opacity: inP,
          transform: `scale(${0.92 + expoOut(inP) * 0.08})`
        }}
      >
        Node-based
        <br />
        <span
          style={{
            backgroundImage: ACCENT_GRADIENT,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent"
          }}
        >
          workflows
        </span>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 40 }}>
        {facts.map((f, i) => {
          const p = expoOut(span(t, e0 + 0.7 + i * 0.12, e0 + 1.1 + i * 0.12));
          return (
            <div
              key={f}
              style={{
                padding: "12px 22px",
                borderRadius: R.pill,
                border: `1px solid ${C.lineStrong}`,
                background: "rgba(16,17,19,0.9)",
                fontSize: 26,
                opacity: p,
                transform: `translateY(${(1 - p) * 20}px)`
              }}
            >
              {f}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 44, fontSize: 34, fontWeight: 600, opacity: span(t, e0 + 1.1, e0 + 1.5) }}>
        NodeTool
      </div>
    </AbsoluteFill>
  );
};

// ─── The reel ───────────────────────────────────────────────────────────────

export const NodesHero: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;

  const s = kf(t, CAM_S);
  const cx = kf(t, CAM_X);
  const cy = kf(t, CAM_Y);
  // A whip pan smears a little, as a camera would.
  const panPx = Math.abs(kf(t + 1 / FPS, CAM_X) - cx) * s;
  const whipBlur = Math.min(6, Math.max(0, panPx - 60) / 15);
  // The graph sinks behind the wall and is gone by the end card.
  const graphFade = 1 - span(t, B.wall[0] + 0.1, B.wall[0] + 0.9);

  const mi = modelIndex(t);
  const [sw0, sw1] = B.swap;
  const step = (sw1 - sw0 - 0.5) / (MODELS.length - 1);
  const sinceFlip = mi > 0 ? t - (sw0 + 0.35 + (mi - 1) * step) : 1;
  const flip = mi > 0 && t < sw1 ? 1 - span(sinceFlip, 0, 0.3) : 0;
  const model = MODELS[mi];

  const progressOf = (start: (i: number) => number, len: number): number | undefined => {
    const k = currentItem(t, start);
    return k < 0 ? undefined : span(t, start(k), start(k) + len);
  };

  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: C.text, overflow: "hidden" }}>
      <Grid t={t} />

      <AbsoluteFill style={{ opacity: graphFade }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 3300,
            height: 1200,
            transformOrigin: "0 0",
            transform: `translate(${960 - cx * s}px, ${EYE_Y - cy * s}px) scale(${s})`,
            filter: whipBlur > 0.2 ? `blur(${whipBlur}px)` : undefined
          }}
        >
          <Wires t={t} />
          {NODE_LIST.map((n) => {
            const state = nodeState(n.id, t);
            switch (n.id) {
              case "shots":
                return (
                  <GraphNode key={n.id} n={n} t={t} state={state}>
                    <ShotsBody t={t} />
                  </GraphNode>
                );
              case "foreach":
                return (
                  <GraphNode key={n.id} n={n} t={t} state={state}>
                    <ForEachBody t={t} />
                  </GraphNode>
                );
              case "image":
                return (
                  <GraphNode
                    key={n.id}
                    n={n}
                    t={t}
                    state={state}
                    progress={progressOf(imageAt, IMAGE_RENDER)}
                    rejectPort={rejectGlow(t)}
                    chip={
                      <ModelChip
                        name={model.name}
                        detail={model.provider}
                        flip={flip}
                      />
                    }
                  >
                    <ImageBody t={t} />
                  </GraphNode>
                );
              case "video":
                return (
                  <GraphNode
                    key={n.id}
                    n={n}
                    t={t}
                    state={state}
                    progress={progressOf(videoAt, VIDEO_RENDER)}
                    chip={<ModelChip name={VIDEO_MODEL} />}
                  >
                    <VideoBody t={t} />
                  </GraphNode>
                );
              case "collect":
                return (
                  <GraphNode key={n.id} n={n} t={t} state={state}>
                    <CollectBody t={t} />
                  </GraphNode>
                );
              case "concat":
                return (
                  <GraphNode
                    key={n.id}
                    n={n}
                    t={t}
                    state={state}
                    progress={span(t, CONCAT[0], CONCAT[1])}
                  >
                    <ConcatBody t={t} />
                  </GraphNode>
                );
              case "output":
                return (
                  <GraphNode key={n.id} n={n} t={t} state={state}>
                    <OutputBody t={t} />
                  </GraphNode>
                );
            }
          })}
          <RejectedWire t={t} />
          <RejectTag t={t} />
        </div>
      </AbsoluteFill>

      <Shade />
      <Caption t={t} />
      <OpeningTitle t={t} />
      <Wall t={t} />
      <EndCard t={t} />
    </AbsoluteFill>
  );
};
