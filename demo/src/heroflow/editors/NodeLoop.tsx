/**
 * Node editor: the graph under shot 2. The reader wires the prompt into the
 * image node and presses Run. The still renders, the clip animates from
 * it, and the result lands on the timeline.
 */
import React from "react";
import { AbsoluteFill, Img, Loop, OffthreadVideo, Sequence } from "remotion";

import { FPS, expoOut, span } from "../clock";
import { BEATS, CLIP_MODEL, STILL_MODEL, TITLE, entity } from "../data";
import { ACCENT_GRADIENT, C, MONO, R, heroAsset } from "../theme";
import {
  Develop,
  Icon,
  MagicFill,
  MetaChip,
  Panel,
  PanelHeader,
  ProgressBar
} from "../ui";
import {
  EditorStage,
  Pointer,
  kf,
  useBoxes,
  useStageRef,
  useT
} from "./common";

const SHOT = 1;
const CANVAS_W = 1800;
const CANVAS_H = 820;
const HEADER = 46;
const ROW = 38;

const WIRE: readonly [number, number] = [0.45, 1.35];
const RUN_AT = 1.75;
const IMAGE: readonly [number, number] = [1.95, 3.2];
const VIDEO: readonly [number, number] = [3.35, 4.6];
const PLACED = 4.75;

type Port = { name: string; color: string };
type NodeSpec = {
  id: string;
  x: number;
  y: number;
  w: number;
  title: string;
  kind: string;
  inputs: Port[];
  outputs: Port[];
  bodyH: number;
};

const NODES: Record<string, NodeSpec> = {
  mia: {
    id: "mia",
    x: 30,
    y: 20,
    w: 290,
    title: "Mia",
    kind: "Entity",
    inputs: [],
    outputs: [{ name: "image", color: C.image }],
    bodyH: 140
  },
  style: {
    id: "style",
    x: 30,
    y: 290,
    w: 290,
    title: "Moonlit 3D",
    kind: "Entity",
    inputs: [],
    outputs: [{ name: "image", color: C.image }],
    bodyH: 140
  },
  prompt: {
    id: "prompt",
    x: 30,
    y: 565,
    w: 380,
    title: "Prompt",
    kind: "Text",
    inputs: [],
    outputs: [{ name: "text", color: C.textual }],
    bodyH: 120
  },
  image: {
    id: "image",
    x: 510,
    y: 150,
    w: 420,
    title: "Text to Image",
    kind: STILL_MODEL,
    inputs: [
      { name: "prompt", color: C.textual },
      { name: "reference", color: C.image },
      { name: "style", color: C.image }
    ],
    outputs: [{ name: "image", color: C.image }],
    bodyH: 236
  },
  video: {
    id: "video",
    x: 1020,
    y: 150,
    w: 420,
    title: "Image to Video",
    kind: CLIP_MODEL,
    inputs: [
      { name: "image", color: C.image },
      { name: "motion", color: C.textual }
    ],
    outputs: [{ name: "video", color: C.video }],
    bodyH: 236
  },
  timeline: {
    id: "timeline",
    x: 1530,
    y: 230,
    w: 250,
    title: "Timeline clip",
    kind: "Output",
    inputs: [{ name: "video", color: C.video }],
    outputs: [],
    bodyH: 96
  }
};

const rows = (n: NodeSpec): number =>
  Math.max(n.inputs.length, n.outputs.length);
const portY = (n: NodeSpec, i: number): number =>
  n.y + HEADER + i * ROW + ROW / 2;
const outAt = (id: string, i = 0): [number, number] => [
  NODES[id].x + NODES[id].w,
  portY(NODES[id], i)
];
const inAt = (id: string, i: number): [number, number] => [
  NODES[id].x,
  portY(NODES[id], i)
];

type Edge = {
  from: [number, number];
  to: [number, number];
  color: string;
  flow: number;
};

const bezier = ([x1, y1]: number[], [x2, y2]: number[]): string => {
  const dx = Math.max(60, (x2 - x1) * 0.5);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
};

const GraphNode: React.FC<{
  n: NodeSpec;
  state: "idle" | "running" | "done";
  progress?: number;
  children?: React.ReactNode;
  lit?: string;
}> = ({ n, state, progress = 0, children, lit }) => {
  const border =
    state === "running"
      ? C.fuchsia
      : state === "done"
        ? `${C.success}88`
        : C.lineStrong;
  return (
    <div
      style={{
        position: "absolute",
        left: n.x,
        top: n.y,
        width: n.w,
        borderRadius: R.md,
        background: C.paper,
        border: `${state === "running" ? 2 : 1}px solid ${border}`,
        boxShadow:
          state === "running"
            ? `0 0 40px ${C.fuchsia}44, 0 20px 50px rgba(0,0,0,0.5)`
            : "0 20px 50px rgba(0,0,0,0.5)"
      }}
    >
      <div
        style={{
          height: HEADER,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 14px",
          borderBottom: `1px solid ${C.line}`,
          background: C.bg,
          borderRadius: `${R.md}px ${R.md}px 0 0`
        }}
      >
        <span style={{ fontSize: 19, fontWeight: 600 }}>{n.title}</span>
        <span style={{ fontSize: 14, color: C.dim }}>{n.kind}</span>
        <div style={{ flex: 1 }} />
        {state === "done" ? (
          <Icon name="check" size={18} color={C.success} stroke={2.6} />
        ) : null}
        {state === "running" ? (
          <Icon name="sparkle" size={17} color={C.fuchsia} fill />
        ) : null}
      </div>
      {Array.from({ length: rows(n) }, (_, i) => (
        <div
          key={i}
          style={{
            height: ROW,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            fontSize: 15,
            color: C.dim
          }}
        >
          <span
            style={{
              color:
                n.inputs[i] && lit === n.inputs[i].name
                  ? n.inputs[i].color
                  : C.dim
            }}
          >
            {n.inputs[i]?.name ?? ""}
          </span>
          <span>{n.outputs[i]?.name ?? ""}</span>
        </div>
      ))}
      <div
        style={{
          position: "relative",
          height: n.bodyH,
          margin: "4px 12px 12px",
          borderRadius: R.sm,
          overflow: "hidden",
          background: C.bg
        }}
      >
        {children}
        {state === "running" ? (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
            <ProgressBar value={progress} color={C.fuchsia} height={4} />
          </div>
        ) : null}
      </div>
      {[
        ...n.inputs.map((p, i) => ({ p, i, left: true })),
        ...n.outputs.map((p, i) => ({ p, i, left: false }))
      ].map(({ p, i, left }) => (
        <div
          key={`${left}-${p.name}`}
          style={{
            position: "absolute",
            [left ? "left" : "right"]: -8,
            top: HEADER + i * ROW + ROW / 2 - 8,
            width: 16,
            height: 16,
            borderRadius: 8,
            background: p.color,
            border: `3px solid ${C.paper}`,
            boxShadow:
              left && lit === p.name ? `0 0 16px ${p.color}` : undefined
          }}
        />
      ))}
    </div>
  );
};

export const NodeLoop: React.FC = () => {
  const t = useT();
  const stageRef = useStageRef();
  const boxes = useBoxes(stageRef);
  const beat = BEATS[SHOT];
  const canvas = boxes?.canvas;
  const toStage = (p: readonly [number, number]): [number, number] =>
    canvas
      ? [
          canvas.x + (p[0] / CANVAS_W) * canvas.w,
          canvas.y + (p[1] / CANVAS_H) * canvas.h
        ]
      : [960, 540];

  // The wire the reader draws: from the prompt's output into the image node.
  const wireFrom = outAt("prompt");
  const wireTo = inAt("image", 0);
  const wireP = span(t, WIRE[0], WIRE[1]);
  const wireEnd: [number, number] = [
    kf(t, [
      [WIRE[0], wireFrom[0] + 20],
      [WIRE[1], wireTo[0]]
    ]),
    kf(t, [
      [WIRE[0], wireFrom[1] - 10],
      [WIRE[1], wireTo[1]]
    ])
  ];
  const connected = t >= WIRE[1];

  const running = t >= RUN_AT;
  const imageState = t < IMAGE[0] ? "idle" : t < IMAGE[1] ? "running" : "done";
  const videoState = t < VIDEO[0] ? "idle" : t < VIDEO[1] ? "running" : "done";
  const placed = t >= PLACED;
  const flow = (a: number, b: number): number => (t >= a && t < b ? t : 0);

  const edges: Edge[] = [
    {
      from: outAt("mia"),
      to: inAt("image", 1),
      color: C.image,
      flow: flow(IMAGE[0] - 0.2, IMAGE[1])
    },
    {
      from: outAt("style"),
      to: inAt("image", 2),
      color: C.image,
      flow: flow(IMAGE[0] - 0.2, IMAGE[1])
    },
    {
      from: outAt("image"),
      to: inAt("video", 0),
      color: C.image,
      flow: flow(VIDEO[0] - 0.2, VIDEO[1])
    },
    {
      from: outAt("video"),
      to: inAt("timeline", 0),
      color: C.video,
      flow: flow(VIDEO[1], PLACED + 0.2)
    }
  ];
  if (wireP > 0) {
    edges.push({
      from: wireFrom,
      to: connected ? wireTo : wireEnd,
      color: C.textual,
      flow: flow(IMAGE[0] - 0.2, IMAGE[1])
    });
  }
  const pressed = span(t, RUN_AT - 0.05, RUN_AT + 0.25);
  const status = !running ? "Ready" : placed ? "Done · 3.0 s" : "Running";
  const pointerPath = [
    {
      t: 0.1,
      at: toStage([wireFrom[0] + 60, wireFrom[1] + 60]) as readonly [
        number,
        number
      ]
    },
    {
      t: WIRE[0],
      at: toStage(wireFrom) as readonly [number, number],
      click: true
    },
    {
      t: WIRE[1],
      at: toStage(wireTo) as readonly [number, number],
      click: true
    },
    { t: RUN_AT, at: "run", click: true },
    { t: 2.5, at: [1800, 1000] as const }
  ];

  return (
    <EditorStage
      scale={1.0}
      stageRef={stageRef}
      overlay={
        <Pointer t={t} boxes={boxes} visible={[0.1, 2.5]} path={pointerPath} />
      }
    >
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Panel style={{ width: 1840 }}>
          <PanelHeader
            icon="grid"
            title={`${TITLE} — Shot ${SHOT + 1} workflow`}
            accent={C.primary}
            meta={
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <MetaChip
                  label={status}
                  color={placed ? C.success : running ? C.fuchsia : C.dim}
                />
                <div
                  data-hf="run"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 18px",
                    borderRadius: R.pill,
                    fontSize: 15,
                    fontWeight: 600,
                    color: "#0B1220",
                    backgroundImage: ACCENT_GRADIENT,
                    transform: `scale(${1 - Math.sin(pressed * Math.PI) * 0.08})`
                  }}
                >
                  <Icon name="play" size={15} color="#0B1220" fill />
                  Run
                </div>
              </div>
            }
          />
          <div
            data-hf="canvas"
            style={{
              position: "relative",
              width: CANVAS_W,
              height: CANVAS_H,
              margin: "0 20px",
              backgroundImage:
                "radial-gradient(rgba(255,255,255,0.08) 1.2px, transparent 1.2px)",
              backgroundSize: "26px 26px"
            }}
          >
            <svg
              width={CANVAS_W}
              height={CANVAS_H}
              style={{ position: "absolute", inset: 0, overflow: "visible" }}
            >
              {edges.map((e, i) => (
                <g key={i}>
                  <path
                    d={bezier(e.from, e.to)}
                    fill="none"
                    stroke={e.color}
                    strokeOpacity={0.55}
                    strokeWidth={3}
                  />
                  {e.flow ? (
                    <path
                      d={bezier(e.from, e.to)}
                      fill="none"
                      stroke={e.color}
                      strokeWidth={4}
                      strokeDasharray="10 22"
                      strokeDashoffset={-e.flow * 90}
                      style={{ filter: `drop-shadow(0 0 6px ${e.color})` }}
                    />
                  ) : null}
                </g>
              ))}
            </svg>
            <GraphNode n={NODES.mia} state="done">
              <Img
                src={heroAsset(entity("mia").image)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </GraphNode>
            <GraphNode n={NODES.style} state="done">
              <Img
                src={heroAsset(entity("style").image)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </GraphNode>
            <GraphNode n={NODES.prompt} state={running ? "done" : "idle"}>
              <div
                style={{
                  padding: "12px 14px",
                  fontSize: 19,
                  lineHeight: 1.4,
                  color: C.text
                }}
              >
                Mia leans over the edge of the bed. The beam finds the dark.
              </div>
            </GraphNode>
            <GraphNode
              n={NODES.image}
              state={imageState}
              progress={span(t, IMAGE[0], IMAGE[1])}
              lit={connected && t < RUN_AT + 0.4 ? "prompt" : undefined}
            >
              {imageState !== "done" || t < IMAGE[1] + 0.45 ? (
                <MagicFill
                  phase={
                    imageState === "running"
                      ? span(t, IMAGE[0], IMAGE[1])
                      : undefined
                  }
                  color={C.image}
                />
              ) : null}
              {imageState === "done" ? (
                <Develop
                  src={beat.still}
                  reveal={expoOut(span(t, IMAGE[1], IMAGE[1] + 0.45))}
                />
              ) : null}
            </GraphNode>
            <GraphNode
              n={NODES.video}
              state={videoState}
              progress={span(t, VIDEO[0], VIDEO[1])}
            >
              {videoState !== "done" ? (
                <MagicFill
                  phase={
                    videoState === "running"
                      ? span(t, VIDEO[0], VIDEO[1])
                      : undefined
                  }
                  color={C.video}
                />
              ) : (
                <Sequence from={Math.round(VIDEO[1] * FPS)}>
                  <Loop durationInFrames={Math.round(3 * FPS)}>
                    <OffthreadVideo
                      src={heroAsset(beat.clip)}
                      muted
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover"
                      }}
                    />
                  </Loop>
                </Sequence>
              )}
            </GraphNode>
            <GraphNode n={NODES.timeline} state={placed ? "done" : "idle"}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 8,
                  height: "100%",
                  padding: "0 14px"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 16,
                    color: placed ? C.text : C.faint
                  }}
                >
                  <Icon
                    name="film"
                    size={17}
                    color={placed ? C.video : C.faint}
                  />
                  V1 · Shot {SHOT + 1}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 15, color: C.dim }}>
                  {placed ? "0:02 → 0:05" : "waiting"}
                </div>
              </div>
            </GraphNode>
          </div>
        </Panel>
      </AbsoluteFill>
    </EditorStage>
  );
};
