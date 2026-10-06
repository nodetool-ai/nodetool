/**
 * Shared pieces of the editor loops: the stage an editor fills, a pointer
 * that moves between measured controls, and keyframe helpers on the clock.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  useCurrentFrame
} from "remotion";

import { ensureInterLoaded, useInterFont } from "../../promo/fonts";
import { FPS, inOut, span } from "../clock";
import { C } from "../theme";
import { AgentStatusContext, Stage, type AgentStatus } from "../ui";

/** Every loop is six seconds: the showcase advances on the loop's end. */
export const LOOP_SECONDS = 6;
export const LOOP_FRAMES = LOOP_SECONDS * FPS;

export const useT = (): number => useCurrentFrame() / FPS;

/** Eased piecewise interpolation through `[time, value]` keys. */
export const kf = (
  t: number,
  keys: ReadonlyArray<readonly [number, number]>
): number => {
  if (t <= keys[0][0]) {
    return keys[0][1];
  }
  for (let k = 1; k < keys.length; k++) {
    const [t0, v0] = keys[k - 1];
    const [t1, v1] = keys[k];
    if (t <= t1) {
      return v0 + (v1 - v0) * inOut(span(t, t0, t1));
    }
  }
  return keys[keys.length - 1][1];
};

export type Box = { x: number; y: number; w: number; h: number };
export type Boxes = Record<string, Box>;

/**
 * Measures the `data-hf` controls under `root` once, in stage pixels, so the
 * pointer can aim at real buttons rather than guessed coordinates.
 */
export const useBoxes = (
  root: React.RefObject<HTMLDivElement | null>
): Boxes | null => {
  const [boxes, setBoxes] = useState<Boxes | null>(null);
  const [handle] = useState(() => delayRender("editor: measure"));
  useEffect(() => {
    let alive = true;
    ensureInterLoaded()
      .catch(() => undefined)
      .then(() => document.fonts.ready)
      .then(
        () =>
          new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      )
      .then(() => {
        if (!alive || !root.current) {
          return;
        }
        const origin = root.current.getBoundingClientRect();
        const k = origin.width / 1920;
        const out: Boxes = {};
        root.current.querySelectorAll("[data-hf]").forEach((el) => {
          const id = el.getAttribute("data-hf");
          if (!id) {
            return;
          }
          const r = el.getBoundingClientRect();
          out[id] = {
            x: (r.left - origin.left) / k,
            y: (r.top - origin.top) / k,
            w: r.width / k,
            h: r.height / k
          };
        });
        setBoxes(out);
        continueRender(handle);
      });
    return () => {
      alive = false;
    };
  }, [handle, root]);
  return boxes;
};

/** The center of a measured control, or the stage center before measuring. */
export const centerOf = (boxes: Boxes | null, id: string): [number, number] => {
  const b = boxes?.[id];
  return b ? [b.x + b.w / 2, b.y + b.h / 2] : [960, 540];
};

/**
 * One editor, scaled to fill the frame, with the agent's status in its
 * header and the pointer and overlays drawn above it in stage pixels.
 */
export const EditorStage: React.FC<{
  scale: number;
  agent?: AgentStatus | null;
  stageRef: React.RefObject<HTMLDivElement | null>;
  overlay?: React.ReactNode;
  children: React.ReactNode;
}> = ({ scale, agent = null, stageRef, overlay, children }) => {
  useInterFont();
  return (
    <Stage>
      <AbsoluteFill ref={stageRef}>
        <AgentStatusContext.Provider value={agent}>
          <AbsoluteFill style={{ transform: `scale(${scale})` }}>
            {children}
          </AbsoluteFill>
        </AgentStatusContext.Provider>
        {overlay}
      </AbsoluteFill>
    </Stage>
  );
};

export const useStageRef = (): React.RefObject<HTMLDivElement | null> =>
  useRef<HTMLDivElement>(null);

export type PointerKey = {
  t: number;
  /**
   * A control id from the measured boxes (its center, or a point at the
   * fractions `fx`, `fy` of its box), or a stage point.
   */
  at:
    | string
    | { id: string; fx: number; fy: number }
    | readonly [number, number];
  click?: boolean;
};

const pointOf = (boxes: Boxes, at: PointerKey["at"]): [number, number] => {
  if (typeof at === "string") {
    return centerOf(boxes, at);
  }
  if ("id" in at) {
    const b = boxes[at.id];
    return b ? [b.x + b.w * at.fx, b.y + b.h * at.fy] : [960, 540];
  }
  return [at[0], at[1]];
};

/**
 * The pointer: it glides between keys and presses on the keys marked
 * `click`. Before the first key and after the last it rests off the target.
 */
export const Pointer: React.FC<{
  t: number;
  boxes: Boxes | null;
  path: PointerKey[];
  visible?: [number, number];
}> = ({ t, boxes, path, visible = [0, 99] }) => {
  if (!boxes || t < visible[0] || t > visible[1]) {
    return null;
  }
  const points = path.map((k) => pointOf(boxes, k.at));
  const x = kf(
    t,
    path.map((k, i) => [k.t, points[i][0]] as const)
  );
  const y = kf(
    t,
    path.map((k, i) => [k.t, points[i][1]] as const)
  );
  const press = path
    .filter((k) => k.click)
    .map((k) => span(t, k.t - 0.02, k.t + 0.28))
    .find((p) => p > 0 && p < 1);
  const fade =
    span(t, visible[0], visible[0] + 0.25) *
    (1 - span(t, visible[1] - 0.25, visible[1]));
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: fade }}>
      {press !== undefined ? (
        <div
          style={{
            position: "absolute",
            left: -26 - press * 14,
            top: -26 - press * 14,
            width: 52 + press * 28,
            height: 52 + press * 28,
            borderRadius: "50%",
            border: `2px solid rgba(255,255,255,${0.7 * (1 - press)})`
          }}
        />
      ) : null}
      <svg
        width={34}
        height={34}
        viewBox="0 0 24 24"
        style={{
          position: "absolute",
          left: -4,
          top: -3,
          transform: `scale(${press !== undefined ? 1 - Math.sin(press * Math.PI) * 0.15 : 1})`,
          filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.6))"
        }}
      >
        <path
          d="M4 2.5l15.5 8.2-6.6 1.7-2.4 6.6z"
          fill={C.text}
          stroke="#08090A"
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
