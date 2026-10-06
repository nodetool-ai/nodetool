/**
 * 3D: the agent blocks out Mia's room with simple shapes and lights, the
 * view orbits, and one click renders the angle as a reference still.
 */
import React from "react";
import { AbsoluteFill } from "remotion";

import { expoOut, span } from "../clock";
import { TITLE } from "../data";
import { C, R } from "../theme";
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
import {
  EditorStage,
  Pointer,
  kf,
  useBoxes,
  useStageRef,
  useT
} from "./common";

const TILT = 24;
const RENDER_AT = 3.55;
const RENDERED = 4.6;
const RENDER = "bed/still-moonlit-bedroom.jpg";

type Obj = { name: string; icon: IconName; at: number };
const OBJECTS: Obj[] = [
  { name: "Wall · window", icon: "square", at: 0.25 },
  { name: "Bed", icon: "cube", at: 0.5 },
  { name: "Rug", icon: "cube", at: 0.75 },
  { name: "Mia", icon: "person", at: 1.0 },
  { name: "Monster", icon: "person", at: 1.25 },
  { name: "Moonlight", icon: "light", at: 1.5 },
  { name: "Flashlight", icon: "light", at: 1.75 },
  { name: "Camera", icon: "camera", at: 2.0 }
];
const pop = (t: number, i: number): number =>
  expoOut(span(t, OBJECTS[i].at, OBJECTS[i].at + 0.45));

const face = (
  w: number,
  h: number,
  transform: string,
  color: string
): React.ReactNode => (
  <div
    style={{
      position: "absolute",
      left: -w / 2,
      top: -h / 2,
      width: w,
      height: h,
      background: color,
      transform,
      border: "1px solid rgba(255,255,255,0.12)",
      backfaceVisibility: "hidden"
    }}
  />
);

/** A box standing on the floor at (x, z), its base raised by `y`. */
const Box3: React.FC<{
  w: number;
  h: number;
  d: number;
  x: number;
  z: number;
  y?: number;
  color: [string, string, string];
  s: number;
}> = ({ w, h, d, x, z, y = 0, color: [top, front, side], s }) =>
  s <= 0 ? null : (
    <div
      style={{
        position: "absolute",
        transformStyle: "preserve-3d",
        transform: `translate3d(${x}px, ${-(y + (h * s) / 2)}px, ${z}px) scale3d(${s}, ${s}, ${s})`
      }}
    >
      {face(w, h, `translateZ(${d / 2}px)`, front)}
      {face(w, h, `rotateY(180deg) translateZ(${d / 2}px)`, front)}
      {face(d, h, `rotateY(90deg) translateZ(${w / 2}px)`, side)}
      {face(d, h, `rotateY(-90deg) translateZ(${w / 2}px)`, side)}
      {face(w, d, `rotateX(90deg) translateZ(${h / 2}px)`, top)}
    </div>
  );

/** A flat shape that always faces the viewer: spheres, gizmos. */
const Billboard: React.FC<{
  x: number;
  y: number;
  z: number;
  theta: number;
  s: number;
  children: React.ReactNode;
}> = ({ x, y, z, theta, s, children }) =>
  s <= 0 ? null : (
    <div
      style={{
        position: "absolute",
        transformStyle: "preserve-3d",
        transform: `translate3d(${x}px, ${-y}px, ${z}px) rotateY(${-theta}deg) rotateX(${TILT}deg) scale(${s})`
      }}
    >
      <div style={{ position: "absolute", transform: "translate(-50%, -50%)" }}>
        {children}
      </div>
    </div>
  );

const Sphere: React.FC<{ size: number; color: string; glow?: string }> = ({
  size,
  color,
  glow
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: `radial-gradient(circle at 35% 30%, ${color}, #000 120%)`,
      boxShadow: glow ? `0 0 40px ${glow}` : undefined
    }}
  />
);

const Gizmo: React.FC<{ icon: IconName; color: string }> = ({
  icon,
  color
}) => (
  <div
    style={{
      width: 46,
      height: 46,
      borderRadius: 23,
      display: "grid",
      placeItems: "center",
      background: "rgba(8,9,10,0.75)",
      border: `2px solid ${color}`
    }}
  >
    <Icon name={icon} size={24} color={color} />
  </div>
);

const Scene: React.FC<{ t: number; theta: number }> = ({ t, theta }) => (
  <div
    style={{
      position: "absolute",
      left: "50%",
      top: "66%",
      transformStyle: "preserve-3d",
      transform: `scale3d(0.82, 0.82, 0.82) rotateX(${-TILT}deg) rotateY(${theta}deg)`
    }}
  >
    {/* Floor grid */}
    <div
      style={{
        position: "absolute",
        left: -600,
        top: -600,
        width: 1200,
        height: 1200,
        transform: "rotateX(90deg)",
        backgroundImage:
          "linear-gradient(rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.18) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
        maskImage: "radial-gradient(closest-side, black 60%, transparent)"
      }}
    />
    {/* Wall and window */}
    {pop(t, 0) > 0 ? (
      <div
        style={{
          position: "absolute",
          left: -500,
          top: -460 * pop(t, 0),
          width: 1000,
          height: 460 * pop(t, 0),
          transform: "translateZ(-420px)",
          background: "linear-gradient(#1c2647, #121a33)",
          border: "1px solid rgba(255,255,255,0.1)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 600,
            top: 80,
            width: 190,
            height: 200,
            background:
              "radial-gradient(circle at 60% 35%, #f4f7ff 0 22px, #8fb4ff 24px, #26407d 80%)",
            border: "8px solid #2b3a63",
            boxShadow: "0 0 60px rgba(143,180,255,0.6)"
          }}
        />
      </div>
    ) : null}
    {/* Rug */}
    {pop(t, 2) > 0 ? (
      <div
        style={{
          position: "absolute",
          left: -170,
          top: -120,
          width: 340,
          height: 240,
          borderRadius: "50%",
          background: "#3b2f5e",
          transform: `translate3d(140px, -1px, 140px) rotateX(90deg) scale(${pop(t, 2)})`
        }}
      />
    ) : null}
    {/* Flashlight beam on the floor */}
    {pop(t, 6) > 0 ? (
      <div
        style={{
          position: "absolute",
          left: -300,
          top: -60,
          width: 300,
          height: 120,
          transform: `translate3d(60px, -2px, 70px) rotateX(90deg)`,
          clipPath: "polygon(100% 45%, 0 0, 0 100%, 100% 55%)",
          background:
            "linear-gradient(to left, rgba(255,214,120,0.9), rgba(255,214,120,0))",
          opacity: pop(t, 6)
        }}
      />
    ) : null}
    {/* Bed */}
    <Box3
      w={380}
      h={70}
      d={220}
      x={-260}
      z={-200}
      color={["#4a5f99", "#34518f", "#2a4176"]}
      s={pop(t, 1)}
    />
    <Box3
      w={370}
      h={36}
      d={212}
      x={-260}
      z={-200}
      y={70}
      color={["#6d8be0", "#5876c4", "#4a64a8"]}
      s={pop(t, 1)}
    />
    <Box3
      w={80}
      h={24}
      d={170}
      x={-400}
      z={-200}
      y={106}
      color={["#e8eefc", "#cbd5ee", "#b4c0dd"]}
      s={pop(t, 1)}
    />
    {/* Mia */}
    <Box3
      w={44}
      h={84}
      d={36}
      x={110}
      z={70}
      color={["#ffd866", "#f5c84c", "#d9ad37"]}
      s={pop(t, 3)}
    />
    <Billboard x={110} y={112 * pop(t, 3)} z={70} theta={theta} s={pop(t, 3)}>
      <Sphere size={58} color="#5a3a2a" />
    </Billboard>
    {/* Monster, half under the bed */}
    <Billboard x={-150} y={44} z={-40} theta={theta} s={pop(t, 4)}>
      <div style={{ position: "relative" }}>
        <Sphere size={96} color="#a66bff" glow="rgba(166,107,255,0.35)" />
        <div
          style={{
            position: "absolute",
            left: 26,
            top: 32,
            width: 14,
            height: 14,
            borderRadius: 7,
            background: "#7CFF6B",
            boxShadow: "0 0 10px #7CFF6B"
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 54,
            top: 32,
            width: 14,
            height: 14,
            borderRadius: 7,
            background: "#7CFF6B",
            boxShadow: "0 0 10px #7CFF6B"
          }}
        />
      </div>
    </Billboard>
    {/* Lights and camera */}
    <Billboard x={260} y={330} z={-380} theta={theta} s={pop(t, 5)}>
      <Gizmo icon="light" color="#8fb4ff" />
    </Billboard>
    <Billboard x={150} y={70} z={70} theta={theta} s={pop(t, 6)}>
      <Gizmo icon="light" color="#FFD678" />
    </Billboard>
    <Billboard x={250} y={190} z={260} theta={theta} s={pop(t, 7)}>
      <Gizmo icon="camera" color={C.info} />
    </Billboard>
  </div>
);

export const Model3DLoop: React.FC = () => {
  const t = useT();
  const stageRef = useStageRef();
  const boxes = useBoxes(stageRef);
  const theta = kf(t, [
    [0, -34],
    [4.2, 16],
    [6, 20]
  ]);
  const added = OBJECTS.filter((o) => t >= o.at + 0.2).length;
  const rendering = t >= RENDER_AT && t < RENDERED;
  const rendered = t >= RENDERED;
  const pressed = span(t, RENDER_AT - 0.05, RENDER_AT + 0.25);
  const agent: AgentStatus =
    added < OBJECTS.length
      ? { text: `Blocking the bedroom · ${added} of ${OBJECTS.length}` }
      : rendering
        ? { text: "Rendering this view" }
        : rendered
          ? { text: "View rendered", done: true }
          : { text: `Set blocked · ${OBJECTS.length} objects`, done: true };
  const flash = rendering ? 1 - span(t, RENDER_AT, RENDER_AT + 0.4) : 0;
  return (
    <EditorStage
      scale={1.06}
      agent={agent}
      stageRef={stageRef}
      overlay={
        <Pointer
          t={t}
          boxes={boxes}
          visible={[2.6, 4.3]}
          path={[
            { t: 2.6, at: { id: "viewport", fx: 0.7, fy: 0.75 } },
            { t: RENDER_AT, at: "render", click: true },
            { t: 4.3, at: [1840, 1000] }
          ]}
        />
      }
    >
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Panel style={{ width: 1720 }}>
          <PanelHeader
            icon="cube"
            title={`${TITLE} — Bedroom set`}
            accent={C.info}
            meta={
              <div style={{ display: "flex", gap: 10 }}>
                <MetaChip icon="camera" label="Perspective" />
              </div>
            }
          />
          <div style={{ display: "flex", height: 700 }}>
            {/* Outliner */}
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
              {OBJECTS.map((o, i) => {
                const s = pop(t, i);
                const fresh = s > 0 && s < 0.98;
                return (
                  <div
                    key={o.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: R.sm,
                      fontSize: 19,
                      fontWeight: 500,
                      opacity: s,
                      transform: `translateX(${(1 - s) * -16}px)`,
                      background: fresh ? `${C.info}1f` : "transparent"
                    }}
                  >
                    <Icon
                      name={o.icon}
                      size={19}
                      color={
                        o.icon === "light"
                          ? "#FFD678"
                          : o.icon === "camera"
                            ? C.info
                            : C.dim
                      }
                    />
                    {o.name}
                  </div>
                );
              })}
            </div>
            {/* Viewport */}
            <div
              data-hf="viewport"
              style={{
                flex: 1,
                position: "relative",
                overflow: "hidden",
                perspective: 1500,
                background:
                  "radial-gradient(80% 70% at 50% 40%, #151a26, #07080b)"
              }}
            >
              <Scene t={t} theta={theta} />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "#fff",
                  opacity: flash * 0.25
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 18,
                  top: 16,
                  display: "flex",
                  gap: 8
                }}
              >
                <MetaChip label={`Orbit ${Math.round(theta)}°`} />
              </div>
            </div>
            {/* Render */}
            <div
              style={{
                width: 360,
                flexShrink: 0,
                background: C.bg,
                borderLeft: `1px solid ${C.line}`,
                padding: "20px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 14
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
                Reference render
              </div>
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "16 / 9",
                  borderRadius: R.md,
                  overflow: "hidden",
                  background: C.raised,
                  border: `1px solid ${rendered ? `${C.image}66` : C.line}`
                }}
              >
                {rendering || (rendered && t < RENDERED + 0.5) ? (
                  <MagicFill
                    phase={rendering ? span(t, RENDER_AT, RENDERED) : undefined}
                    color={C.image}
                  />
                ) : null}
                {rendered ? (
                  <Develop
                    src={RENDER}
                    reveal={expoOut(span(t, RENDERED, RENDERED + 0.5))}
                  />
                ) : null}
                {!rendering && !rendered ? (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "grid",
                      placeItems: "center",
                      color: C.faint,
                      fontSize: 16
                    }}
                  >
                    No render yet
                  </div>
                ) : null}
                {rendering ? (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: 0
                    }}
                  >
                    <ProgressBar
                      value={span(t, RENDER_AT, RENDERED)}
                      color={C.image}
                      height={4}
                    />
                  </div>
                ) : null}
              </div>
              <div style={{ fontSize: 16, lineHeight: 1.45, color: C.dim }}>
                Seedream 4 · from the camera, in the Moonlit 3D style
              </div>
              <div
                data-hf="render"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "11px 0",
                  borderRadius: R.pill,
                  fontSize: 17,
                  fontWeight: 600,
                  color: C.text,
                  background:
                    pressed > 0 && pressed < 1
                      ? `${C.image}55`
                      : `${C.image}26`,
                  border: `1px solid ${C.image}77`
                }}
              >
                <Icon name="camera" size={18} color={C.text} />
                Render this view
              </div>
            </div>
          </div>
        </Panel>
      </AbsoluteFill>
    </EditorStage>
  );
};
