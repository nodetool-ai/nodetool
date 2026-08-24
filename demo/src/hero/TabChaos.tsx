/**
 * The "five-tab tax" animation for the landing page's pain grid
 * (marketing/POSITIONING_PLAN.md Part 5) — a 5 s silent loop.
 *
 * Five tool windows drift apart, each with its own export, its own bill, and
 * a hand-off between them. They then collapse into the real NodeTool canvas,
 * replayed from the promo cast: the resolution is product footage, only the
 * problem is drawn.
 *
 * Eight and a half seconds, not the five the plan asked for. Five windows and
 * a headline is more than a reader takes in at a glance, and the loop has to
 * survive being watched twice.
 *
 * The windows carry roles, not competitor names. The landing-page copy names
 * the tools in prose; a chip with someone's brand on it is a different claim
 * and a different legal question.
 */
import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { DemoPlayer, promoTrailerCast } from "@web-demo";
import { frameRect } from "../promo/helpers";
import { useInterFont } from "../promo/fonts";
import {
  PROMO_ACCENT_GRADIENT,
  PROMO_BG,
  PROMO_FONT,
  PROMO_TEXT,
  PROMO_TEXT_DIM,
} from "../promo/theme";

export const TAB_CHAOS_FPS = 30;
export const TAB_CHAOS_FRAMES = 255;

const COLLAPSE_FROM = 130;
const CANVAS_FROM = 168;
const FADE = 12;

const resolvePromoAsset = (file: string): string =>
  staticFile(`casts/promo/${file}`);

/** The scattered stack: role, what it costs you, and where it sits at rest. */
const WINDOWS = [
  { role: "Image tool", cost: "subscription · export", x: -0.27, y: -0.17, tilt: -7 },
  { role: "Video tool", cost: "credit pack · export", x: 0.25, y: -0.16, tilt: 5 },
  { role: "Voice tool", cost: "per-character · export", x: -0.3, y: 0.16, tilt: 6 },
  { role: "Editor", cost: "seat · manual import", x: 0.26, y: 0.14, tilt: -5 },
  { role: "Automation", cost: "task tier · no media", x: 0.02, y: 0.3, tilt: 3 },
];

/** One tool window: a title bar, a role, and the line that hurts. */
const ToolWindow: React.FC<{
  index: number;
  role: string;
  cost: string;
  x: number;
  y: number;
  tilt: number;
}> = ({ index, role, cost, x, y, tilt }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const scale = Math.min(width, height) / 1080;
  const w = 420 * scale;
  const h = 150 * scale;

  // Each window arrives on its own beat, drifts, then falls into the middle.
  const arrive = interpolate(frame, [index * 10, index * 10 + 22], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const drift = Math.sin((frame + index * 21) / 40) * 8 * scale;
  const collapse = interpolate(
    frame,
    [COLLAPSE_FROM + index * 4, COLLAPSE_FROM + 36 + index * 4],
    [0, 1],
    {
      easing: Easing.in(Easing.cubic),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  const cx = width / 2 + x * width * (1 - collapse);
  const cy = height / 2 + y * height * (1 - collapse) + drift;

  return (
    <div
      style={{
        position: "absolute",
        left: cx - w / 2,
        top: cy - h / 2,
        width: w,
        height: h,
        opacity: arrive * (1 - collapse),
        transform: `rotate(${tilt * (1 - collapse)}deg) scale(${
          (0.94 + 0.06 * arrive) * (1 - 0.35 * collapse)
        })`,
        borderRadius: 14 * scale,
        background: "rgba(15,23,42,0.92)",
        border: "1px solid rgba(148,163,184,0.24)",
        boxShadow: `0 ${26 * scale}px ${70 * scale}px rgba(0,0,0,0.55)`,
        fontFamily: PROMO_FONT,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8 * scale,
          alignItems: "center",
          padding: `${12 * scale}px ${18 * scale}px`,
          borderBottom: "1px solid rgba(148,163,184,0.16)",
        }}
      >
        {["#f87171", "#fbbf24", "#4ade80"].map((c) => (
          <span
            key={c}
            style={{
              width: 10 * scale,
              height: 10 * scale,
              borderRadius: "50%",
              background: c,
              opacity: 0.75,
            }}
          />
        ))}
      </div>
      <div style={{ padding: `${18 * scale}px ${24 * scale}px` }}>
        <div
          style={{ fontSize: 30 * scale, fontWeight: 600, color: PROMO_TEXT }}
        >
          {role}
        </div>
        <div
          style={{
            fontSize: 20 * scale,
            color: PROMO_TEXT_DIM,
            marginTop: 6 * scale,
          }}
        >
          {cost}
        </div>
      </div>
    </div>
  );
};

export const TabChaos: React.FC = () => {
  useInterFont();
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const scale = Math.min(width, height) / 1080;

  const problemOpacity = interpolate(
    frame,
    [20, 38, COLLAPSE_FROM + 6, COLLAPSE_FROM + 26],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const canvasOpacity = interpolate(frame, [CANVAS_FROM, CANVAS_FROM + 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const answerOpacity = interpolate(
    frame,
    [CANVAS_FROM + 24, CANVAS_FROM + 46],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const fade = Math.max(
    interpolate(frame, [0, FADE], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    interpolate(frame, [TAB_CHAOS_FRAMES - FADE, TAB_CHAOS_FRAMES], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  // The four takes, framed the way the hero reel frames them.
  const viewport = frameRect(
    { x0: 450, y0: 10, x1: 1215, y1: 995 },
    width,
    height,
    90,
    1.2
  );

  return (
    <AbsoluteFill style={{ background: PROMO_BG }}>
      {canvasOpacity > 0 ? (
        <AbsoluteFill style={{ opacity: canvasOpacity }}>
          <DemoPlayer
            cast={promoTrailerCast}
            timeMs={11500}
            resolveAssetUrl={resolvePromoAsset}
            viewport={viewport}
          />
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(to top, rgba(2,6,23,0.9) 0%, rgba(2,6,23,0.5) 22%, transparent 44%)",
            }}
          />
        </AbsoluteFill>
      ) : null}

      {frame < CANVAS_FROM + 18 ? (
        <AbsoluteFill>
          {WINDOWS.map((w, i) => (
            <ToolWindow key={w.role} index={i} {...w} />
          ))}
        </AbsoluteFill>
      ) : null}

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "7%",
          opacity: problemOpacity,
          textAlign: "center",
          fontFamily: PROMO_FONT,
        }}
      >
        <div style={{ fontSize: 58 * scale, fontWeight: 600, color: PROMO_TEXT }}>
          Five tabs. Five bills. Four exports.
        </div>
        <div
          style={{
            fontSize: 26 * scale,
            color: PROMO_TEXT_DIM,
            marginTop: 12 * scale,
          }}
        >
          Every hand-off loses the prompt, the seed, and the context.
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "9%",
          opacity: answerOpacity,
          textAlign: "center",
          fontFamily: PROMO_FONT,
        }}
      >
        <div
          style={{
            fontSize: 66 * scale,
            fontWeight: 600,
            backgroundImage: PROMO_ACCENT_GRADIENT,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          One canvas.
        </div>
      </div>

      {fade > 0 ? (
        <AbsoluteFill style={{ background: "#000", opacity: fade }} />
      ) : null}
    </AbsoluteFill>
  );
};
