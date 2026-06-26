import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface OutroCardProps {
  title: string;
  /** Short call-to-action lines shown beneath the title. */
  points: string[];
  /** Footer line, e.g. a URL or command. */
  footer?: string;
}

/**
 * Closing call-to-action card. Springs in a title, staggers in a few next-step
 * lines, and shows an optional footer. Wrap in a <Sequence> for the outro beat.
 */
export const OutroCard: React.FC<OutroCardProps> = ({ title, points, footer }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 200 } });
  const translateY = interpolate(enter, [0, 1], [24, 0]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        background:
          "radial-gradient(circle at 50% 45%, rgba(124,58,237,0.32), rgba(124,58,237,0) 60%), #0f0f17",
        opacity: enter,
      }}
    >
      <div
        style={{
          textAlign: "center",
          transform: `translateY(${translateY}px)`,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 76, color: "#f8fafc", letterSpacing: "-0.02em" }}>
          {title}
        </div>
        <div style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 18 }}>
          {points.map((point, i) => {
            const appear = spring({
              frame: frame - 10 - i * 8,
              fps,
              config: { damping: 200 },
            });
            return (
              <div
                key={i}
                style={{
                  fontSize: 34,
                  color: "#e2e8f0",
                  fontWeight: 500,
                  opacity: appear,
                  transform: `translateY(${interpolate(appear, [0, 1], [12, 0])}px)`,
                }}
              >
                <span style={{ color: "#a78bfa", marginRight: 12 }}>→</span>
                {point}
              </div>
            );
          })}
        </div>
        {footer && (
          <div
            style={{
              marginTop: 44,
              fontSize: 26,
              color: "#a78bfa",
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
