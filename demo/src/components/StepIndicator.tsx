import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export interface TutorialStep {
  /** Replay time (ms into the cast) at which this step becomes active. */
  atMs: number;
  /** Short label, e.g. "Enhance (LLM)". */
  label: string;
}

export interface StepIndicatorProps {
  steps: TutorialStep[];
  /** Current replay time in ms (frame clock minus the intro offset). */
  timeMs: number;
}

/**
 * Top-left progress pill that tracks which node of the pipeline is active. Shows
 * the current step number, its label, and a row of dots for the whole sequence.
 * Re-springs each time the active step changes so the eye follows along.
 */
export const StepIndicator: React.FC<StepIndicatorProps> = ({ steps, timeMs }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let active = 0;
  for (let i = 0; i < steps.length; i++) {
    if (timeMs >= steps[i].atMs) active = i;
  }

  const activeAtFrame = Math.round((steps[active].atMs / 1000) * fps);
  const enter = spring({
    frame: frame - activeAtFrame,
    fps,
    config: { damping: 200 },
  });
  const translateX = interpolate(enter, [0, 1], [-12, 0]);

  return (
    <div
      style={{
        position: "absolute",
        top: 56,
        left: 64,
        padding: "16px 22px",
        borderRadius: 16,
        background: "rgba(15,15,23,0.78)",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(124,58,237,0.45)",
        fontFamily: "Inter, system-ui, sans-serif",
        boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          transform: `translateX(${translateX}px)`,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 40,
            height: 40,
            borderRadius: 12,
            background: "linear-gradient(135deg, #7c3aed, #f59e0b)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 22,
          }}
        >
          {active + 1}
        </span>
        <div>
          <div style={{ fontSize: 15, color: "#a78bfa", fontWeight: 600, letterSpacing: "0.04em" }}>
            STEP {active + 1} OF {steps.length}
          </div>
          <div style={{ fontSize: 26, color: "#f8fafc", fontWeight: 600 }}>
            {steps[active].label}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {steps.map((_, i) => (
          <span
            key={i}
            style={{
              width: i === active ? 28 : 10,
              height: 10,
              borderRadius: 5,
              background:
                i === active
                  ? "linear-gradient(90deg, #7c3aed, #f59e0b)"
                  : i < active
                    ? "rgba(167,139,250,0.55)"
                    : "rgba(255,255,255,0.16)",
              transition: "width 200ms ease",
            }}
          />
        ))}
      </div>
    </div>
  );
};
