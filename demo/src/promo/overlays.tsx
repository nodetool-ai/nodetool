/**
 * Text and UI overlays for the promo scenes: the muted-first message cards
 * (every scene's copy must land with the sound off), the node selection
 * ring, and the generate-at-the-playhead prompt bar.
 */
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import {
  PROMO_ACCENT_GRADIENT,
  PROMO_FONT,
  PROMO_FONT_MONO,
  PROMO_FUCHSIA,
  PROMO_PANEL,
  PROMO_PANEL_BORDER,
  PROMO_TEXT,
  PROMO_TEXT_DIM,
} from "./theme";

/** Bottom scrim so the message cards stay readable over busy UI. */
export const BottomScrim: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: "26%",
      background:
        "linear-gradient(to top, rgba(2,6,23,0.82), rgba(2,6,23,0))",
      opacity,
      pointerEvents: "none",
    }}
  />
);

/**
 * The scene's message card: a large headline pinned near the bottom, with an
 * optional smaller supporting line. `from`/`to` are scene-local frames.
 */
export const Headline: React.FC<{
  from: number;
  to: number;
  text: string;
  small?: string;
  /** Vertical anchor as a fraction of frame height (default near-bottom). */
  anchor?: number;
}> = ({ from, to, text, small, anchor = 0.86 }) => {
  const frame = useCurrentFrame();
  if (frame < from - 10 || frame > to + 10) return null;

  const enter = interpolate(frame, [from, from + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exit = interpolate(frame, [to - 8, to], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(enter, exit);
  const rise = (1 - enter) * 18;

  return (
    <>
      <BottomScrim opacity={opacity} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${anchor * 100}%`,
          transform: `translateY(calc(-100% + ${rise}px))`,
          textAlign: "center",
          opacity,
          pointerEvents: "none",
        }}
      >
        {/* Dark halo so the copy reads over bright footage — the bottom
            scrim alone is not enough when the monitor fills the frame. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(1300px, 92%)",
            height: small ? 260 : 190,
            background:
              "radial-gradient(50% 50% at 50% 50%, rgba(2,6,23,0.78), rgba(2,6,23,0.45) 55%, transparent 75%)",
            filter: "blur(6px)",
          }}
        />
        <div
          style={{
            position: "relative",
            fontFamily: PROMO_FONT,
            fontWeight: 800,
            fontSize: 58,
            letterSpacing: "-0.02em",
            color: PROMO_TEXT,
            textShadow:
              "0 2px 6px rgba(0,0,0,0.9), 0 4px 24px rgba(0,0,0,0.8), 0 0 56px rgba(0,0,0,0.7)",
          }}
        >
          {text}
        </div>
        {small ? (
          <div
            style={{
              position: "relative",
              marginTop: 14,
              fontFamily: PROMO_FONT,
              fontWeight: 500,
              fontSize: 27,
              color: PROMO_TEXT_DIM,
              textShadow:
                "0 1px 4px rgba(0,0,0,0.9), 0 2px 16px rgba(0,0,0,0.8)",
            }}
          >
            {small}
          </div>
        ) : null}
      </div>
    </>
  );
};

/** A glowing selection ring around a screen-space rectangle. */
export const SelectionRing: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}> = ({ x, y, width, height, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height,
      borderRadius: 14,
      border: `3px solid ${PROMO_FUCHSIA}`,
      boxShadow: `0 0 0 3px rgba(232,121,249,0.25), 0 0 42px rgba(232,121,249,0.45)`,
      opacity,
      pointerEvents: "none",
    }}
  />
);

/** Sparkle glyph for the prompt bar (matches the product's generate affordance). */
const Sparkle: React.FC<{ size?: number; color?: string }> = ({
  size = 26,
  color = PROMO_FUCHSIA,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 2.5 L13.8 9.2 L20.5 11 L13.8 12.8 L12 19.5 L10.2 12.8 L3.5 11 L10.2 9.2 Z"
      fill={color}
    />
    <path d="M19 3 L19.7 5.3 L22 6 L19.7 6.7 L19 9 L18.3 6.7 L16 6 L18.3 5.3 Z" fill={color} opacity={0.7} />
  </svg>
);

/**
 * The "Generate a video at the playhead…" bar, recreated to match the real
 * timeline editor's top bar (see marketing/public/creatives_timeline.png):
 * prompt input with a typing caret, model/duration/resolution chips, and a
 * Generate button that visibly presses.
 */
export const GenerateBar: React.FC<{
  /** Scene-local frames. */
  from: number;
  to: number;
  typeFrom: number;
  typeTo: number;
  pressFrame: number;
  prompt: string;
  model: string;
}> = ({ from, to, typeFrom, typeTo, pressFrame, prompt, model }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > to) return null;

  const enter = interpolate(frame, [from, from + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exit = interpolate(frame, [to - 8, to], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(enter, exit);

  const typedChars = Math.round(
    interpolate(frame, [typeFrom, typeTo], [0, prompt.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );
  const typed = prompt.slice(0, typedChars);
  const caretOn = frame < typeTo + 12 && Math.floor(frame / 8) % 2 === 0;

  const pressed = frame >= pressFrame && frame <= pressFrame + 6;
  const generating = frame > pressFrame + 6;

  const chip = (label: string): React.JSX.Element => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "10px 16px",
        borderRadius: 10,
        border: `1px solid ${PROMO_PANEL_BORDER}`,
        background: "rgba(2,6,23,0.6)",
        color: PROMO_TEXT_DIM,
        fontFamily: PROMO_FONT_MONO,
        fontSize: 19,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );

  return (
    <div
      style={{
        position: "absolute",
        top: 26,
        left: "50%",
        transform: `translateX(-50%) translateY(${(1 - enter) * -16}px)`,
        width: "min(1380px, 86%)",
        display: "flex",
        gap: 14,
        alignItems: "center",
        padding: 14,
        borderRadius: 16,
        background: PROMO_PANEL,
        border: `1px solid ${PROMO_PANEL_BORDER}`,
        boxShadow: "0 18px 60px rgba(0,0,0,0.6)",
        opacity,
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "12px 18px",
          borderRadius: 12,
          border: `1px solid ${PROMO_PANEL_BORDER}`,
          background: "rgba(2,6,23,0.65)",
          minWidth: 0,
        }}
      >
        <Sparkle />
        <div
          style={{
            fontFamily: PROMO_FONT,
            fontWeight: 500,
            fontSize: 23,
            color: typed ? PROMO_TEXT : PROMO_TEXT_DIM,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {typed || "Generate a video at the playhead..."}
          {caretOn && typed ? (
            <span style={{ color: PROMO_FUCHSIA }}>▍</span>
          ) : null}
        </div>
      </div>
      {chip(model)}
      {chip("2 Sec")}
      {chip("720p")}
      <div
        style={{
          padding: "12px 26px",
          borderRadius: 12,
          background: generating
            ? "rgba(59,130,246,0.35)"
            : PROMO_ACCENT_GRADIENT,
          color: generating ? PROMO_TEXT_DIM : "#0f172a",
          fontFamily: PROMO_FONT,
          fontWeight: 600,
          fontSize: 22,
          transform: `scale(${pressed ? 0.94 : 1})`,
          whiteSpace: "nowrap",
        }}
      >
        {generating ? "Generating…" : "Generate"}
      </div>
    </div>
  );
};
