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
        right: 64,
        bottom: 80,
        maxWidth: "78%",
        padding: "22px 34px",
        borderRadius: 16,
        background: "rgba(15,15,23,0.82)",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(124,58,237,0.45)",
        boxShadow: "0 10px 40px rgba(0,0,0,0.45)",
        opacity,
      }}
    >
      <span
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 600,
          fontSize: 46,
          lineHeight: 1.25,
          color: "#f1f5f9",
          textShadow: "0 2px 8px rgba(0,0,0,0.5)",
        }}
      >
        {text}
      </span>
    </div>
  );
};
