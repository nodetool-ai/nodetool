/**
 * A scripted cursor overlay: glides through screen-space waypoints with
 * ease-in-out segments and fires a click pulse at marked stops. Screen
 * coordinates, so callers project graph positions first (helpers.project).
 */
import React from "react";
import { Easing, interpolate } from "remotion";

export interface CursorWaypoint {
  /** Frame (scene-local) at which the cursor arrives at this point. */
  frame: number;
  x: number;
  y: number;
  /** Fire a click pulse on arrival. */
  click?: boolean;
}

const CURSOR_SIZE = 34;

export const Cursor: React.FC<{
  frame: number;
  waypoints: CursorWaypoint[];
  /** Frames the cursor takes to fade in at the first waypoint. */
  fadeInFrames?: number;
}> = ({ frame, waypoints, fadeInFrames = 8 }) => {
  if (waypoints.length === 0) return null;

  const ts = waypoints.map((w) => w.frame);
  const opts = {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: "clamp" as const,
    extrapolateRight: "clamp" as const,
  };
  const x = interpolate(frame, ts, waypoints.map((w) => w.x), opts);
  const y = interpolate(frame, ts, waypoints.map((w) => w.y), opts);

  const opacity = interpolate(
    frame,
    [ts[0] - fadeInFrames, ts[0]],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Click pulse: an expanding, fading ring for ~14 frames after each click.
  const pulses = waypoints
    .filter((w) => w.click)
    .map((w) => {
      const dt = frame - w.frame;
      if (dt < 0 || dt > 14) return null;
      const r = interpolate(dt, [0, 14], [10, 42]);
      const a = interpolate(dt, [0, 14], [0.7, 0]);
      return { x: w.x, y: w.y, r, a };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // Press feedback: cursor dips slightly on the click frame.
  const pressed = waypoints.some(
    (w) => w.click && frame >= w.frame && frame <= w.frame + 5
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {pulses.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: p.x - p.r,
            top: p.y - p.r,
            width: p.r * 2,
            height: p.r * 2,
            borderRadius: "50%",
            border: "3px solid rgba(232, 121, 249, 0.9)",
            opacity: p.a,
          }}
        />
      ))}
      <svg
        width={CURSOR_SIZE}
        height={CURSOR_SIZE}
        viewBox="0 0 24 24"
        style={{
          position: "absolute",
          left: x,
          top: y,
          opacity,
          transform: `scale(${pressed ? 0.85 : 1})`,
          transformOrigin: "6px 4px",
          filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.55))",
        }}
      >
        <path
          d="M5.5 3.2 L5.5 17.5 L9.2 14.4 L11.6 19.8 L14.2 18.6 L11.8 13.4 L16.6 13 Z"
          fill="#f8fafc"
          stroke="#0f172a"
          strokeWidth="1.1"
        />
      </svg>
    </div>
  );
};
