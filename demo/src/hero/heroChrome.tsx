/**
 * The motion-graphics chrome shared by every stage of the hero reel: the
 * stage rail across the top, the lower-left caption block, and the two
 * transition primitives (a settle-in dissolve and the black that opens and
 * closes the loop).
 *
 * Kept apart from `HeroProject.tsx` so the stage components read as a
 * storyboard — surface, camera, caption — rather than as layout code.
 */
import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import {
  PROMO_ACCENT_GRADIENT,
  PROMO_FONT,
  PROMO_TEXT,
  PROMO_TEXT_DIM,
} from "../promo/theme";

/**
 * Length of every cross-dissolve, and of the opening and closing fades.
 *
 * Short on purpose. Two of the transitions land one dense UI on top of
 * another, and anything longer reads as a double exposure of two screens
 * rather than as a cut; the scale settle carries the motion instead.
 */
export const DISSOLVE = 8;

/**
 * The reel is banded rather than full-bleed: a rail across the top, the
 * product surface in the middle, the caption below it. Bands beat a scrim
 * here because two of the four surfaces (chat, timeline) carry their own
 * chrome along the bottom edge, and a caption laid over that reads as a
 * collision however dark the gradient under it is.
 *
 * Both numbers are in the 1080-tall design space; `useScale` maps them.
 */
export const RAIL_BAND = 112;
export const CAPTION_BAND = 172;

/**
 * Where the product surface sits in the frame, in video pixels.
 *
 * Landscape fills everything the rail and the caption leave. Portrait does
 * not: a 9:16 frame leaves 1636 px between the two bands, and a desktop UI
 * stretched down that far is a third of a screen of content over two thirds
 * of background. The portrait band is capped square-ish and centred between
 * them, which also puts the surface at eye level on a phone. The rail and the
 * caption then hug the band rather than the frame edges.
 */
export const surfaceBand = (
  width: number,
  height: number,
  scale: number
): { top: number; height: number } => {
  const railTop = RAIL_BAND * scale;
  const available = height - railTop - CAPTION_BAND * scale;
  const capped = Math.min(available, width);
  return { top: railTop + (available - capped) / 2, height: capped };
};

/** Scale factor for a design authored against a 1080-tall frame. */
export const useScale = (): number => {
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  return Math.min(width, portrait ? height * 0.6 : height) / 1080;
};

/** Fade in over `inFrames`, out over the last `outFrames` of `total`. */
export const fadeBand = (
  frame: number,
  total: number,
  inFrames: number,
  outFrames: number
): number =>
  Math.min(
    interpolate(frame, [0, inFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    interpolate(frame, [total - outFrames, total], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

/** One stage of the reel, as the rail across the top presents it. */
export interface HeroStage {
  label: string;
  /** First frame of the stage, in the reel's own timeline. */
  from: number;
  /** One past the last frame. */
  to: number;
}

/**
 * The progress rail: one segment per stage, the active one filling with the
 * accent gradient as its stage runs. It is on screen for nearly the whole
 * reel, so a viewer who joins mid-loop still knows where they are.
 */
export const StageRail: React.FC<{
  stages: HeroStage[];
  /** Frame the rail retires on — the end card carries the frame after it. */
  until: number;
}> = ({ stages, until }) => {
  const frame = useCurrentFrame();
  const scale = useScale();
  const { width, height } = useVideoConfig();
  const band = surfaceBand(width, height, scale);

  const opacity = Math.min(
    interpolate(frame, [stages[0].from, stages[0].from + 12], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    interpolate(frame, [until - 14, until], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );
  if (opacity <= 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: band.top - (RAIL_BAND - 44) * scale,
        left: 62 * scale,
        right: 62 * scale,
        opacity,
        display: "flex",
        gap: 14 * scale,
        fontFamily: PROMO_FONT,
      }}
    >
      {stages.map((stage, i) => {
        const active = frame >= stage.from && frame < stage.to;
        const done = frame >= stage.to;
        const fill = done
          ? 1
          : active
            ? interpolate(frame, [stage.from, stage.to], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
            : 0;
        return (
          <div
            key={stage.label}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 9 * scale,
            }}
          >
            <div
              style={{
                height: 3 * scale,
                borderRadius: 999,
                background: "rgba(148,163,184,0.22)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${fill * 100}%`,
                  height: "100%",
                  backgroundImage: PROMO_ACCENT_GRADIENT,
                  backgroundSize: `${width}px 100%`,
                  backgroundPosition: `${-i * (width / stages.length)}px 0`,
                }}
              />
            </div>
            <div
              style={{
                fontSize: 17 * scale,
                fontWeight: 600,
                letterSpacing: 2.4 * scale,
                textTransform: "uppercase",
                color: active || done ? PROMO_TEXT : PROMO_TEXT_DIM,
                opacity: active ? 1 : done ? 0.55 : 0.4,
              }}
            >
              {String(i + 1).padStart(2, "0")} {stage.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * The lower-left caption: a gradient rule, a bold claim, one support line.
 * The three parts stagger in so the block reads as typed rather than dropped.
 */
export const HeroCaption: React.FC<{
  claim: string;
  small: string;
  /** Frames, relative to the enclosing sequence. */
  from: number;
  to: number;
}> = ({ claim, small, from, to }) => {
  const frame = useCurrentFrame();
  const scale = useScale();
  const { width, height } = useVideoConfig();
  const band = surfaceBand(width, height, scale);
  const opacity = fadeBand(frame - from, to - from, 11, 11);
  if (opacity <= 0) return null;

  const rise = (delay: number): string => {
    const y = interpolate(frame - from - delay, [0, 16], [26, 0], {
      easing: Easing.out(Easing.cubic),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return `translateY(${y * scale}px)`;
  };
  const appear = (delay: number): number =>
    interpolate(frame - from - delay, [0, 14], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  return (
    <div
      style={{
        position: "absolute",
        left: 62 * scale,
        right: 62 * scale,
        top: band.top + band.height + 30 * scale,
        opacity,
        display: "flex",
        gap: 26 * scale,
        fontFamily: PROMO_FONT,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 5 * scale,
          height: 84 * scale,
          borderRadius: 999,
          backgroundImage: PROMO_ACCENT_GRADIENT,
          transformOrigin: "top",
          transform: `scaleY(${appear(0)})`,
        }}
      />
      <div>
        <div
          style={{
            fontSize: 48 * scale,
            fontWeight: 600,
            lineHeight: 1.06,
            letterSpacing: -1 * scale,
            color: PROMO_TEXT,
            opacity: appear(2),
            transform: rise(2),
          }}
        >
          {claim}
        </div>
        <div
          style={{
            marginTop: 12 * scale,
            fontSize: 25 * scale,
            lineHeight: 1.3,
            color: PROMO_TEXT_DIM,
            opacity: appear(7),
            transform: rise(7),
          }}
        >
          {small}
        </div>
      </div>
    </div>
  );
};

/**
 * Cross-dissolves its children in, settling a slight scale as it goes — the
 * incoming surface arrives rather than being swapped in.
 */
export const Settle: React.FC<{
  children: React.ReactNode;
  /** Scale the incoming layer starts at. 1 disables the settle. */
  from?: number;
}> = ({ children, from = 1.025 }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, DISSOLVE], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(frame, [0, DISSOLVE * 2.4], [from, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ opacity, transform: `scale(${scale})` }}>
      {children}
    </AbsoluteFill>
  );
};

/** Fades the whole reel from and to black, so the loop point is invisible. */
export const LoopFade: React.FC<{ totalFrames: number }> = ({ totalFrames }) => {
  const frame = useCurrentFrame();
  const opacity = Math.max(
    interpolate(frame, [0, DISSOLVE], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    interpolate(frame, [totalFrames - DISSOLVE, totalFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );
  if (opacity <= 0) return null;
  return <AbsoluteFill style={{ background: "#000", opacity }} />;
};
