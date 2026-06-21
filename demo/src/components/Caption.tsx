import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

export interface CaptionProps {
  text: string;
}

/**
 * Lower-third caption. Place inside a <Sequence> to time it; it fades itself in
 * and out at the edges of that sequence's window.
 */
export const Caption: React.FC<CaptionProps> = ({ text }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        bottom: 72,
        maxWidth: "60%",
        padding: "14px 22px",
        borderRadius: 12,
        background: "rgba(15,15,23,0.72)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(124,58,237,0.4)",
        opacity,
      }}
    >
      <span
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 500,
          fontSize: 30,
          color: "#e2e8f0",
        }}
      >
        {text}
      </span>
    </div>
  );
};
