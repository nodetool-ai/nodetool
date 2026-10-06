/**
 * Sketch: the reader draws on the ink layer, then regenerates the one layer
 * that is bound to a prompt. The title and the ink stay as they are.
 */
import React from "react";
import { AbsoluteFill, Img } from "remotion";

import { expoOut, span } from "../clock";
import { TITLE } from "../data";
import { ACCENT_GRADIENT, C, R, heroAsset } from "../theme";
import {
  Develop,
  Icon,
  MagicFill,
  MetaChip,
  Panel,
  PanelHeader,
  ProgressBar,
  type AgentStatus,
  type IconName
} from "../ui";
import { EditorStage, Pointer, useBoxes, useStageRef, useT } from "./common";

const CANVAS_W = 1040;
const CANVAS_H = 585;
const DRAW: readonly [number, number] = [0.2, 1.75];
const SELECT_AT = 2.45;
const REGEN_AT = 2.95;
const DONE_AT = 4.3;
const BEFORE = "bed/still-eyes-under-the-bed.jpg";
const AFTER = "bed/clip-scared-monster.jpg";
const PROMPT =
  "A shy purple monster under the bed, caught in the flashlight beam";

/** A hand-drawn star: five points with a little wobble, closed. */
const star = (cx: number, cy: number, r: number, seed: number): number[][] => {
  const pts: number[][] = [];
  for (let k = 0; k <= 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr =
      (k % 2 === 0 ? r : r * 0.45) * (1 + 0.06 * Math.sin(k * 3.1 + seed));
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return pts;
};

/** The ink strokes, in canvas pixels: two stars and a beam swoosh. */
const STROKES: number[][][] = [
  star(860, 110, 52, 1),
  star(950, 205, 26, 4),
  Array.from({ length: 24 }, (_, i) => {
    const u = i / 23;
    return [700 + u * 270, 300 + Math.sin(u * Math.PI) * -46 + u * 12];
  })
];

const lengthOf = (pts: number[][]): number =>
  pts
    .slice(1)
    .reduce(
      (sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]),
      0
    );
const TOTAL = STROKES.reduce((sum, s) => sum + lengthOf(s), 0);

/** The strokes cut at `p` of their total length, and the pen's tip. */
const drawn = (p: number): { paths: number[][][]; tip: number[] | null } => {
  let left = p * TOTAL;
  const paths: number[][][] = [];
  let tip: number[] | null = null;
  for (const s of STROKES) {
    if (left <= 0) {
      break;
    }
    const out = [s[0]];
    for (let i = 1; i < s.length; i++) {
      const seg = Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
      if (left >= seg) {
        out.push(s[i]);
        left -= seg;
      } else {
        const u = left / seg;
        out.push([
          s[i - 1][0] + (s[i][0] - s[i - 1][0]) * u,
          s[i - 1][1] + (s[i][1] - s[i - 1][1]) * u
        ]);
        left = 0;
        break;
      }
    }
    paths.push(out);
    tip = out[out.length - 1];
  }
  return { paths, tip: p > 0 && p < 1 ? tip : null };
};

const TOOLS: IconName[] = [
  "pointer",
  "brush",
  "eraser",
  "text",
  "square",
  "move"
];

type Layer = {
  id: string;
  name: string;
  thumb: React.ReactNode;
  prompt?: boolean;
};

export const SketchLoop: React.FC = () => {
  const t = useT();
  const stageRef = useStageRef();
  const boxes = useBoxes(stageRef);
  const ink = drawn(span(t, DRAW[0], DRAW[1]));
  const selected = t < SELECT_AT ? "ink" : "monster";
  const regen = span(t, REGEN_AT + 0.05, DONE_AT);
  const generating = t >= REGEN_AT + 0.05 && t < DONE_AT;
  const reveal = expoOut(span(t, DONE_AT, DONE_AT + 0.5));
  const after = t >= DONE_AT;
  const pressed = span(t, REGEN_AT - 0.05, REGEN_AT + 0.25);
  const agent: AgentStatus | null = generating
    ? { text: "Regenerating Monster layer" }
    : after
      ? { text: "Monster layer regenerated", done: true }
      : null;

  const canvas = boxes?.canvas;
  const tipStage =
    canvas && ink.tip
      ? [
          canvas.x + (ink.tip[0] / CANVAS_W) * canvas.w,
          canvas.y + (ink.tip[1] / CANVAS_H) * canvas.h
        ]
      : null;

  const inkSvg = (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      style={{ position: "absolute", inset: 0 }}
    >
      {ink.paths.map((p, i) => (
        <polyline
          key={i}
          points={p.map((q) => q.join(",")).join(" ")}
          fill="none"
          stroke="#FFE7A3"
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 0 8px rgba(255,200,90,0.8))" }}
        />
      ))}
    </svg>
  );

  const monsterThumb = (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {generating ? <MagicFill phase={regen} color={C.image} /> : null}
      {!generating ? (
        <Img
          src={heroAsset(after ? AFTER : BEFORE)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
    </div>
  );
  const layers: Layer[] = [
    {
      id: "ink",
      name: "Ink",
      thumb: (
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            background: "#1b1d21"
          }}
        >
          {inkSvg}
        </div>
      )
    },
    {
      id: "title",
      name: "Title",
      thumb: (
        <div
          style={{
            display: "grid",
            placeItems: "center",
            height: "100%",
            fontSize: 11,
            fontWeight: 800,
            background: "#1b1d21"
          }}
        >
          TITLE
        </div>
      )
    },
    { id: "monster", name: "Monster", prompt: true, thumb: monsterThumb },
    {
      id: "paper",
      name: "Paper",
      thumb: (
        <div
          style={{
            height: "100%",
            background: "linear-gradient(#0d1633, #05070f)"
          }}
        />
      )
    }
  ];

  return (
    <EditorStage
      scale={1.06}
      agent={agent}
      stageRef={stageRef}
      overlay={
        <>
          {tipStage ? (
            <div
              style={{
                position: "absolute",
                left: tipStage[0] - 14,
                top: tipStage[1] - 14,
                width: 28,
                height: 28,
                borderRadius: 14,
                border: "2px solid rgba(255,255,255,0.9)",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.5)"
              }}
            />
          ) : null}
          <Pointer
            t={t}
            boxes={boxes}
            visible={[1.9, 3.7]}
            path={[
              { t: 1.9, at: { id: "canvas", fx: 0.85, fy: 0.55 } },
              { t: SELECT_AT, at: "layer-monster", click: true },
              { t: REGEN_AT, at: "regen", click: true },
              { t: 3.7, at: [1840, 980] }
            ]}
          />
        </>
      }
    >
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Panel style={{ width: 1720 }}>
          <PanelHeader
            icon="brush"
            title={`${TITLE} — Poster`}
            accent={C.image}
            meta={
              <div style={{ display: "flex", gap: 10 }}>
                <MetaChip icon="layers" label="4 layers" />
                <MetaChip label="1600 × 900" />
              </div>
            }
          />
          <div style={{ display: "flex", height: 700 }}>
            {/* Tools */}
            <div
              style={{
                width: 72,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                paddingTop: 18,
                background: C.bg,
                borderRight: `1px solid ${C.line}`
              }}
            >
              {TOOLS.map((name) => {
                const on = name === (t < 1.9 ? "brush" : "pointer");
                return (
                  <div
                    key={name}
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: R.md,
                      display: "grid",
                      placeItems: "center",
                      background: on ? `${C.image}26` : "transparent",
                      border: `1px solid ${on ? `${C.image}66` : "transparent"}`
                    }}
                  >
                    <Icon name={name} size={22} color={on ? C.text : C.dim} />
                  </div>
                );
              })}
            </div>
            {/* Canvas */}
            <div
              style={{
                flex: 1,
                display: "grid",
                placeItems: "center",
                background:
                  "repeating-conic-gradient(#0c0d0f 0% 25%, #0f1012 0% 50%) 50% / 28px 28px"
              }}
            >
              <div
                data-hf="canvas"
                style={{
                  position: "relative",
                  width: CANVAS_W,
                  height: CANVAS_H,
                  overflow: "hidden",
                  boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
                  background: "linear-gradient(#0d1633, #05070f)"
                }}
              >
                {/* Monster: the prompt-bound layer. */}
                <AbsoluteFill>
                  {generating || (after && reveal < 1) ? (
                    <MagicFill
                      phase={generating ? regen : undefined}
                      color={C.image}
                    />
                  ) : null}
                  {!generating && !after ? (
                    <Img
                      src={heroAsset(BEFORE)}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover"
                      }}
                    />
                  ) : null}
                  {after ? <Develop src={AFTER} reveal={reveal} /> : null}
                  {generating ? (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0
                      }}
                    >
                      <ProgressBar value={regen} color={C.image} height={5} />
                    </div>
                  ) : null}
                </AbsoluteFill>
                {/* Title */}
                <AbsoluteFill
                  style={{
                    background:
                      "linear-gradient(to top, rgba(4,6,14,0.85), transparent 45%)"
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 48,
                    bottom: 40,
                    fontSize: 76,
                    fontWeight: 800,
                    letterSpacing: -2,
                    lineHeight: 0.95,
                    color: "#FFF4D6",
                    textShadow: "0 4px 30px rgba(0,0,0,0.6)"
                  }}
                >
                  UNDER
                  <br />
                  THE BED
                </div>
                {/* Ink */}
                {inkSvg}
                {generating ? (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      border: `2px dashed ${C.image}`,
                      pointerEvents: "none"
                    }}
                  />
                ) : null}
              </div>
            </div>
            {/* Layers */}
            <div
              style={{
                width: 380,
                flexShrink: 0,
                background: C.bg,
                borderLeft: `1px solid ${C.line}`,
                padding: "20px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 8
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  color: C.dim,
                  marginBottom: 6
                }}
              >
                Layers
              </div>
              {layers.map((l) => {
                const on = l.id === selected;
                return (
                  <div
                    key={l.id}
                    data-hf={`layer-${l.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: 9,
                      borderRadius: R.md,
                      background: on ? `${C.image}1c` : C.overlay,
                      border: `1px solid ${on ? `${C.image}66` : C.line}`
                    }}
                  >
                    <div
                      style={{
                        width: 76,
                        height: 43,
                        borderRadius: R.sm,
                        overflow: "hidden",
                        flexShrink: 0,
                        position: "relative"
                      }}
                    >
                      {l.thumb}
                    </div>
                    <span style={{ fontSize: 19, fontWeight: 600, flex: 1 }}>
                      {l.name}
                    </span>
                    {l.prompt ? (
                      <Icon name="sparkle" size={17} color={C.fuchsia} fill />
                    ) : null}
                    <Icon name="eye" size={19} color={C.dim} />
                  </div>
                );
              })}
              <div
                style={{
                  marginTop: 14,
                  padding: 16,
                  borderRadius: R.md,
                  background: C.overlay,
                  border: `1px solid ${C.line}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  opacity: selected === "monster" ? 1 : 0.35
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 15,
                    fontWeight: 600,
                    color: C.fuchsia
                  }}
                >
                  <Icon name="sparkle" size={15} color={C.fuchsia} fill />
                  Layer prompt
                </div>
                <div style={{ fontSize: 18, lineHeight: 1.4, color: C.text }}>
                  {PROMPT}
                </div>
                <div
                  data-hf="regen"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "10px 0",
                    borderRadius: R.pill,
                    fontSize: 17,
                    fontWeight: 600,
                    color: "#0B1220",
                    backgroundImage: ACCENT_GRADIENT,
                    transform: `scale(${1 - Math.sin(pressed * Math.PI) * 0.05})`
                  }}
                >
                  <Icon name="refresh" size={18} color="#0B1220" stroke={2.2} />
                  Regenerate layer
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </AbsoluteFill>
    </EditorStage>
  );
};
