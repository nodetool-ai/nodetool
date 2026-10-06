/**
 * Game: the agent darkens the level on request, the reader presses Play,
 * and Mia's flashlight finds the stars and, at the end, the monster.
 */
import React from "react";
import { AbsoluteFill, Img } from "remotion";

import { expoOut, span } from "../clock";
import { TITLE, entity } from "../data";
import { C, MONO, R, heroAsset } from "../theme";
import {
  Icon,
  MetaChip,
  Panel,
  PanelHeader,
  type AgentStatus,
  type IconName
} from "../ui";
import {
  EditorStage,
  Pointer,
  kf,
  useBoxes,
  useStageRef,
  useT
} from "./common";

const LEVEL_W = 1060;
const LEVEL_H = 596;
const FLOOR = 470;
const DARKEN: readonly [number, number] = [0.25, 1.05];
const PLAY_AT = 1.4;
const RUN: readonly [number, number] = [1.6, 5.4];
const STARS: ReadonlyArray<readonly [number, number]> = [
  [290, 400],
  [430, 350],
  [560, 420],
  [690, 365],
  [820, 410]
];
const EYES: readonly [number, number] = [985, 470];

type Row = { name: string; role: string; icon: IconName };
const TREE: Row[] = [
  { name: "Level", role: "Mia's room", icon: "square" },
  { name: "Mia", role: "Player", icon: "person" },
  { name: "Flashlight", role: "Light", icon: "light" },
  { name: "Stars ×5", role: "Pickup", icon: "star" },
  { name: "Monster", role: "Goal", icon: "person" }
];

const Outline: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  color: string;
}> = ({ x, y, w, h, label, color }) => (
  <div
    style={{
      position: "absolute",
      left: x - w / 2,
      top: y - h / 2,
      width: w,
      height: h,
      border: `2px dashed ${color}`,
      borderRadius: 8
    }}
  >
    {label ? (
      <div
        style={{
          position: "absolute",
          left: -2,
          top: -30,
          padding: "2px 9px",
          borderRadius: R.sm,
          background: color,
          color: "#08090A",
          fontSize: 14,
          fontWeight: 600,
          whiteSpace: "nowrap"
        }}
      >
        {label}
      </div>
    ) : null}
  </div>
);

export const GameLoop: React.FC = () => {
  const t = useT();
  const stageRef = useStageRef();
  const boxes = useBoxes(stageRef);
  const playing = t >= PLAY_AT + 0.05;
  const darkness = kf(t, [
    [DARKEN[0], 0.3],
    [DARKEN[1], 0.72]
  ]);
  const run = span(t, RUN[0], RUN[1]);
  const miaX = 130 + run * 720;
  const miaY = FLOOR - Math.abs(Math.sin(run * Math.PI * 9)) * 10;
  const collected = STARS.filter(([x]) => playing && miaX >= x - 40).length;
  const found = playing && miaX >= 820;
  const foundIn = expoOut(span(t, RUN[1] - 0.15, RUN[1] + 0.35));
  const pressed = span(t, PLAY_AT - 0.05, PLAY_AT + 0.25);
  const agent: AgentStatus | null =
    t < DARKEN[1]
      ? { text: "Darkening the level" }
      : !playing
        ? { text: "Level darker · light the way", done: true }
        : null;
  // The flashlight: a soft halo on Mia and a long ellipse ahead of her.
  const mask = `radial-gradient(circle 90px at ${miaX}px ${miaY - 10}px, transparent 30%, black 100%), radial-gradient(ellipse 240px 120px at ${miaX + 200}px ${miaY - 40}px, transparent 25%, black 100%)`;
  return (
    <EditorStage
      scale={1.06}
      agent={agent}
      stageRef={stageRef}
      overlay={
        <Pointer
          t={t}
          boxes={boxes}
          visible={[0.6, 2.1]}
          path={[
            { t: 0.6, at: { id: "level", fx: 0.6, fy: 0.6 } },
            { t: PLAY_AT, at: "play", click: true },
            { t: 2.1, at: [1100, 60] }
          ]}
        />
      }
    >
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Panel style={{ width: 1720 }}>
          <PanelHeader
            icon="gamepad"
            title={`${TITLE} — Flashlight hunt`}
            accent={C.success}
            meta={
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <MetaChip
                  label={playing ? "Playing" : "Editing"}
                  color={playing ? C.success : C.dim}
                />
                <div
                  data-hf="play"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 16px",
                    borderRadius: R.pill,
                    fontSize: 15,
                    fontWeight: 600,
                    color: playing ? C.text : "#08130B",
                    background: playing ? "rgba(255,255,255,0.06)" : C.success,
                    border: `1px solid ${playing ? C.lineStrong : C.success}`,
                    transform: `scale(${1 - Math.sin(pressed * Math.PI) * 0.08})`
                  }}
                >
                  <Icon
                    name={playing ? "stop" : "play"}
                    size={16}
                    color={playing ? C.text : "#08130B"}
                    fill
                  />
                  {playing ? "Stop" : "Play"}
                </div>
              </div>
            }
          />
          <div style={{ display: "flex", height: 660 }}>
            {/* Scene tree */}
            <div
              style={{
                width: 290,
                flexShrink: 0,
                background: C.bg,
                borderRight: `1px solid ${C.line}`,
                padding: "20px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 4
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  color: C.dim,
                  margin: "0 8px 10px"
                }}
              >
                Scene
              </div>
              {TREE.map((row, i) => (
                <div
                  key={row.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "11px 12px",
                    borderRadius: R.sm,
                    background:
                      i === 0 && !playing ? `${C.success}1c` : "transparent",
                    border: `1px solid ${i === 0 && !playing ? `${C.success}55` : "transparent"}`
                  }}
                >
                  <Icon
                    name={row.icon}
                    size={19}
                    color={row.icon === "star" ? "#FFD678" : C.dim}
                    fill={row.icon === "star"}
                  />
                  <span style={{ fontSize: 19, fontWeight: 500, flex: 1 }}>
                    {row.name}
                  </span>
                  <span style={{ fontSize: 14, color: C.dim }}>{row.role}</span>
                </div>
              ))}
            </div>
            {/* Viewport */}
            <div
              style={{
                flex: 1,
                display: "grid",
                placeItems: "center",
                background: "#060709"
              }}
            >
              <div
                data-hf="level"
                style={{
                  position: "relative",
                  width: LEVEL_W,
                  height: LEVEL_H,
                  overflow: "hidden",
                  borderRadius: R.sm
                }}
              >
                <Img
                  src={heroAsset(entity("bedroom").image)}
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 70%" }}
                />
                {/* Stars sit under the darkness: only the beam shows them. */}
                {STARS.map(([x, y], i) => {
                  const got = i < collected;
                  const at = got
                    ? span(
                        t,
                        RUN[0] + ((x - 40 - 130) / 720) * (RUN[1] - RUN[0]),
                        RUN[0] +
                          ((x - 40 - 130) / 720) * (RUN[1] - RUN[0]) +
                          0.35
                      )
                    : 0;
                  return (
                    <div
                      key={i}
                      style={{
                        position: "absolute",
                        left: x - 22,
                        top: y - 22 - at * 40,
                        opacity: 1 - at,
                        transform: `scale(${1 + at * 0.8})`,
                        filter: "drop-shadow(0 0 10px rgba(255,214,120,0.9))"
                      }}
                    >
                      <Icon name="star" size={44} color="#FFD678" fill />
                    </div>
                  );
                })}
                {/* Darkness: flat while editing, cut by the flashlight in play. */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgb(3,5,12)",
                    opacity: playing ? 0.9 : darkness,
                    maskImage: playing ? mask : undefined,
                    WebkitMaskImage: playing ? mask : undefined,
                    maskComposite: playing ? "intersect" : undefined,
                    WebkitMaskComposite: playing ? "source-in" : undefined
                  }}
                />
                {/* The monster's eyes answer the beam at the end. */}
                <div
                  style={{
                    position: "absolute",
                    left: EYES[0] - 30,
                    top: EYES[1] - 8,
                    display: "flex",
                    gap: 22,
                    opacity: found ? foundIn : 0
                  }}
                >
                  {[0, 1].map((k) => (
                    <div
                      key={k}
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        background: "#7CFF6B",
                        boxShadow: "0 0 16px #7CFF6B, 0 0 30px #7CFF6B"
                      }}
                    />
                  ))}
                </div>
                {/* Mia */}
                <div
                  style={{
                    position: "absolute",
                    left: miaX - 36,
                    top: miaY - 72,
                    width: 72,
                    height: 72,
                    borderRadius: 36,
                    overflow: "hidden",
                    border: "3px solid #FFE7A3",
                    boxShadow: "0 0 24px rgba(255,214,120,0.6)"
                  }}
                >
                  <Img
                    src={heroAsset(entity("mia").image)}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover"
                    }}
                  />
                </div>
                {/* Edit-mode handles */}
                {!playing ? (
                  <>
                    <AbsoluteFill
                      style={{
                        backgroundImage:
                          "linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px)",
                        backgroundSize: "53px 53px"
                      }}
                    />
                    <Outline
                      x={130}
                      y={FLOOR - 36}
                      w={92}
                      h={92}
                      label="Mia · Player"
                      color={C.success}
                    />
                    {STARS.map(([x, y], i) => (
                      <Outline
                        key={i}
                        x={x}
                        y={y}
                        w={56}
                        h={56}
                        color="#FFD678"
                      />
                    ))}
                    <Outline
                      x={EYES[0]}
                      y={EYES[1]}
                      w={110}
                      h={70}
                      label="Monster · Goal"
                      color={C.fuchsia}
                    />
                  </>
                ) : (
                  <div
                    style={{
                      position: "absolute",
                      left: 18,
                      top: 16,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 14px",
                      borderRadius: R.pill,
                      background: "rgba(8,9,10,0.75)",
                      fontFamily: MONO,
                      fontSize: 20,
                      color: C.text
                    }}
                  >
                    <Icon name="star" size={20} color="#FFD678" fill />
                    {collected} / {STARS.length}
                  </div>
                )}
                {found ? (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: 70,
                      display: "flex",
                      justifyContent: "center",
                      opacity: foundIn,
                      transform: `scale(${0.9 + 0.1 * foundIn})`
                    }}
                  >
                    <div
                      style={{
                        padding: "12px 26px",
                        borderRadius: R.pill,
                        background: "rgba(8,9,10,0.8)",
                        border: `1px solid ${C.success}66`,
                        fontSize: 30,
                        fontWeight: 700,
                        color: C.text
                      }}
                    >
                      You found the monster
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            {/* Inspector */}
            <div
              style={{
                width: 320,
                flexShrink: 0,
                background: C.bg,
                borderLeft: `1px solid ${C.line}`,
                padding: "20px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 16
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  color: C.dim
                }}
              >
                Level
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 18
                  }}
                >
                  <span>Darkness</span>
                  <span style={{ fontFamily: MONO, color: C.dim }}>
                    {darkness.toFixed(2)}
                  </span>
                </div>
                <div
                  style={{
                    position: "relative",
                    height: 6,
                    borderRadius: 3,
                    background: "rgba(255,255,255,0.1)"
                  }}
                >
                  <div
                    style={{
                      width: `${darkness * 100}%`,
                      height: "100%",
                      borderRadius: 3,
                      background: C.success
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: `calc(${darkness * 100}% - 9px)`,
                      top: -6,
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      background: C.text
                    }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 18 }}>Rule</span>
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: R.md,
                    background: C.overlay,
                    border: `1px solid ${C.line}`,
                    fontSize: 17,
                    lineHeight: 1.45,
                    color: C.dim
                  }}
                >
                  Only the flashlight shows the stars. Collect all five to find
                  the monster.
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </AbsoluteFill>
    </EditorStage>
  );
};
