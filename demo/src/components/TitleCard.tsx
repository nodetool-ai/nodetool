import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export interface TitleCardProps {
  title: string;
  subtitle?: string;
}

/**
 * A centered title card. Springs in, holds, fades out. Intended to be wrapped
 * in a <Sequence> so it only occupies the opening beat of the video.
 */
export const TitleCard: React.FC<TitleCardProps> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 200 } });
  const exit = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const opacity = Math.min(enter, exit);
  const translateY = interpolate(enter, [0, 1], [24, 0]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        background:
          "radial-gradient(circle at 50% 40%, rgba(124,58,237,0.25), rgba(15,15,23,0.95))",
        opacity,
      }}
    >
      <div style={{ textAlign: "center", transform: `translateY(${translateY}px)` }}>
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 92,
            color: "#f8fafc",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              marginTop: 16,
              fontFamily: "Inter, system-ui, sans-serif",
              fontWeight: 400,
              fontSize: 36,
              color: "#a78bfa",
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
