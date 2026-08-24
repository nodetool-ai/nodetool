/**
 * The landing-page hero reel (marketing/POSITIONING_PLAN.md Part 5) — a ~15 s
 * silent loop that shows the whole claim in three stages:
 *
 *   1  Generate   0–160   one brief fans out into four takes on the real canvas
 *   2  Cut      152–312   the takes become a cut on the real timeline editor
 *   3  Deliver  304–450   the finished trailer plays full-frame
 *
 * It replays the same two casts the 50 s product video uses, so the footage is
 * real product output, not a mockup. Unlike the product video this carries no
 * audio, no cursor, and no voice-over beats: it autoplays muted in the hero and
 * loops, so it opens and closes on black and every claim is on-screen text.
 *
 * The cast clock runs faster than real time here — a 15 s reel has to cover
 * what the product video spends 50 s on. Replay is a deterministic seek, so a
 * compressed time map costs nothing.
 */
import React, { useMemo } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  DemoPlayer,
  TimelineDemoPlayer,
  promoTimelineCast,
  promoTrailerCast,
} from "@web-demo";
import { usePendingMediaDelay } from "../promo/usePendingMediaDelay";
import { cameraAt, frameRect, type CameraKey } from "../promo/helpers";
import { useInterFont } from "../promo/fonts";
import {
  PROMO_ACCENT_GRADIENT,
  PROMO_BG,
  PROMO_FONT,
  PROMO_TEXT,
  PROMO_TEXT_DIM,
} from "../promo/theme";

export const HERO_FPS = 30;
export const HERO_DURATION_FRAMES = 450;

const CUT_FROM = 152;
const DELIVER_FROM = 304;
/** Length of every cross-dissolve, and of the opening and closing fades. */
const DISSOLVE = 14;

const resolvePromoAsset = (file: string): string =>
  staticFile(`casts/promo/${file}`);

/** The four take nodes, in graph coordinates (see promoTrailerCast). */
const GRID_RECT = { x0: 450, y0: 10, x1: 1215, y1: 995 };
/** The brief node plus the first take, for the opening beat. */
const OPEN_RECT = { x0: -40, y0: 240, x1: 900, y1: 880 };

/** A stage caption: number chip, claim, and one supporting line. */
const Caption: React.FC<{
  step: string;
  text: string;
  small: string;
  /** Frames, relative to the enclosing sequence. */
  from: number;
  to: number;
  /** Which edge to sit against. Use "top" when the surface has bottom chrome. */
  place?: "top" | "bottom";
}> = ({ step, text, small, from, to, place = "bottom" }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const opacity = Math.min(
    interpolate(frame, [from, from + 10], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    interpolate(frame, [to - 10, to], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );
  if (opacity <= 0) return null;

  const scale = Math.min(width, portrait ? height * 0.62 : height) / 1080;
  return (
    <>
      <AbsoluteFill
        style={{
          background:
            place === "top"
              ? "linear-gradient(to bottom, rgba(2,6,23,0.95) 0%, rgba(2,6,23,0.82) 16%, rgba(2,6,23,0.5) 28%, transparent 46%)"
              : "linear-gradient(to top, rgba(2,6,23,0.88) 0%, rgba(2,6,23,0.55) 18%, transparent 40%)",
          opacity,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          ...(place === "top"
            ? { top: `${portrait ? 8 : 6}%` }
            : { bottom: `${portrait ? 12 : 7}%` }),
          opacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14 * scale,
          fontFamily: PROMO_FONT,
          padding: `0 ${60 * scale}px`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 20 * scale,
            fontWeight: 600,
            letterSpacing: 3,
            color: PROMO_TEXT_DIM,
            textTransform: "uppercase",
          }}
        >
          {step}
        </div>
        <div
          style={{
            fontSize: 54 * scale,
            fontWeight: 600,
            color: PROMO_TEXT,
            lineHeight: 1.15,
          }}
        >
          {text}
        </div>
        <div style={{ fontSize: 28 * scale, color: PROMO_TEXT_DIM }}>
          {small}
        </div>
      </div>
    </>
  );
};

/** Stage 1 — the canvas renders four takes from one brief. */
const GenerateStage: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const onPendingMedia = usePendingMediaDelay("hero-canvas");

  // Compress the cast: the brief beat, then the four takes rendering.
  const castMs = interpolate(frame, [0, 30, 160], [900, 2600, 11800], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cameraKeys = useMemo<CameraKey[]>(() => {
    const open = frameRect(OPEN_RECT, width, height, 110, 1.3);
    const grid = frameRect(GRID_RECT, width, height, 80, 1.2);
    return [
      { t: 900, vp: open },
      { t: 2600, vp: open },
      { t: 4200, vp: grid },
      { t: 11800, vp: { ...grid, zoom: grid.zoom * 1.05 } },
    ];
  }, [width, height]);

  return (
    <AbsoluteFill style={{ background: PROMO_BG }}>
      <DemoPlayer
        cast={promoTrailerCast}
        timeMs={castMs}
        resolveAssetUrl={resolvePromoAsset}
        viewport={cameraAt(cameraKeys, castMs)}
        onPendingMedia={onPendingMedia}
      />
      <Caption
        step="1 · Generate"
        text="One brief, four takes."
        small="Every major model, called with your own keys."
        from={14}
        to={150}
      />
    </AbsoluteFill>
  );
};

/** Stage 2 — the takes become a cut on the timeline. */
const CutStage: React.FC = () => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const onPendingMedia = usePendingMediaDelay("hero-timeline");

  const castMs = interpolate(frame, [0, 160], [1200, 15200], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: PROMO_BG }}>
      <TimelineDemoPlayer
        cast={promoTimelineCast}
        timeMs={castMs}
        resolveAssetUrl={resolvePromoAsset}
        tracksHeightPx={Math.round(height * 0.32)}
        onPendingMedia={onPendingMedia}
        chrome={false}
      />
      <Caption
        step="2 · Cut"
        text="Cut it on the built-in timeline."
        small="Multi-track video and audio. Prompt a missing shot at the playhead."
        from={16}
        to={146}
        place="top"
      />
    </AbsoluteFill>
  );
};

/** Stage 3 — the finished trailer, then the headline. */
const DeliverStage: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const scale = Math.min(width, height > width ? height * 0.62 : height) / 1080;

  const zoom = interpolate(frame, [0, 146], [1.02, 1.09], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const headline = interpolate(frame, [64, 84], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: PROMO_BG }}>
      <OffthreadVideo
        src={resolvePromoAsset("close.mp4")}
        muted
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${zoom})`,
        }}
      />
      <AbsoluteFill
        style={{
          background: "rgba(2,6,23,0.9)",
          opacity: headline,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: headline,
          alignItems: "center",
          justifyContent: "center",
          fontFamily: PROMO_FONT,
          padding: `0 ${70 * scale}px`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 78 * scale,
            fontWeight: 600,
            lineHeight: 1.1,
            backgroundImage: PROMO_ACCENT_GRADIENT,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          From prompt to final cut
          <br />
          on one canvas.
        </div>
      </AbsoluteFill>
      <Caption
        step="3 · Deliver"
        text="Export the finished cut."
        small="Open source. Local-first. No credit markup."
        from={10}
        to={66}
      />
    </AbsoluteFill>
  );
};

/** Fades the whole reel from and to black, so the loop point is invisible. */
const LoopFade: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = Math.max(
    interpolate(frame, [0, DISSOLVE], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    interpolate(
      frame,
      [HERO_DURATION_FRAMES - DISSOLVE, HERO_DURATION_FRAMES],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    )
  );
  if (opacity <= 0) return null;
  return <AbsoluteFill style={{ background: "#000", opacity }} />;
};

/** Cross-dissolves its children in over the first `DISSOLVE` frames. */
const Dissolve: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, DISSOLVE], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const HeroPipeline: React.FC = () => {
  useInterFont();
  return (
    <AbsoluteFill style={{ background: PROMO_BG }}>
      <Sequence from={0} durationInFrames={CUT_FROM + DISSOLVE}>
        <GenerateStage />
      </Sequence>
      <Sequence from={CUT_FROM} durationInFrames={DELIVER_FROM - CUT_FROM + DISSOLVE}>
        <Dissolve>
          <CutStage />
        </Dissolve>
      </Sequence>
      <Sequence
        from={DELIVER_FROM}
        durationInFrames={HERO_DURATION_FRAMES - DELIVER_FROM}
      >
        <Dissolve>
          <DeliverStage />
        </Dissolve>
      </Sequence>
      <LoopFade />
    </AbsoluteFill>
  );
};
