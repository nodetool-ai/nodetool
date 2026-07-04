/**
 * Scene 2 — the title card. After the hook fades to black, five quiet
 * seconds: the NodeTool mark and the line the hook used to rush past.
 * Fades in from black and hands off to the canvas scene's crossfade.
 */
import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { easeOutProgress, progress } from "./helpers";
import {
  PROMO_ACCENT_GRADIENT,
  PROMO_BG,
  PROMO_FONT,
  PROMO_TEXT,
} from "./theme";

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fadeIn = progress(frame, 0, 14);
  const fadeOut = 1 - progress(frame, durationInFrames - 10, durationInFrames);
  const logoIn = easeOutProgress(frame, 8, 30);
  const line1In = easeOutProgress(frame, 20, 40);
  const line2In = easeOutProgress(frame, 34, 56);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(60% 45% at 50% 40%, rgba(232,121,249,0.10), transparent 65%), radial-gradient(55% 45% at 50% 75%, rgba(59,130,246,0.08), transparent 60%), ${PROMO_BG}`,
        alignItems: "center",
        justifyContent: "center",
        opacity: Math.min(fadeIn, fadeOut),
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Img
          src={staticFile("casts/promo/logo.png")}
          style={{
            height: 128,
            marginBottom: 42,
            opacity: logoIn,
            transform: `translateY(${(1 - logoIn) * 22}px)`,
          }}
        />
        <div
          style={{
            fontFamily: PROMO_FONT,
            fontWeight: 800,
            fontSize: 84,
            letterSpacing: "-0.025em",
            lineHeight: 1.15,
            color: PROMO_TEXT,
            opacity: line1In,
            transform: `translateY(${(1 - line1In) * 18}px)`,
          }}
        >
          Made in NodeTool.
        </div>
        <div
          style={{
            fontFamily: PROMO_FONT,
            fontWeight: 800,
            fontSize: 84,
            letterSpacing: "-0.025em",
            lineHeight: 1.15,
            background: PROMO_ACCENT_GRADIENT,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            opacity: line2In,
            transform: `translateY(${(1 - line2In) * 18}px)`,
          }}
        >
          Start to finish.
        </div>
      </div>
    </AbsoluteFill>
  );
};
