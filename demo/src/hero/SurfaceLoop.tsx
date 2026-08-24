/**
 * Surface micro-loops (marketing/POSITIONING_PLAN.md Part 5) — one 6 s silent
 * loop per creative surface, for the landing page's surface tabs.
 *
 * Each loop replays the surface's own recorded cast, compressed into six
 * seconds and framed by a fade from and to black so the loop point does not
 * read as a cut. There is no narration, no cursor, and no step chrome: the
 * tabs carry the copy, the loop carries the motion. A surface label and a
 * one-line claim sit in a corner so the clip still says what it is when it is
 * lifted into a social post.
 *
 * The sketch loop needs `SketchRenderer` pinned to Canvas2D
 * (`preferCanvas2d`): a WebGPU canvas reads back empty when Remotion
 * screenshots it outside the frame it was drawn in, which is why this surface
 * used to render a blank canvas.
 */
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { DocDemoPlayer, TimelineDemoPlayer, promoTimelineCast } from "@web-demo";
import { getDocCast } from "../casts/docRegistry";
import { useInterFont } from "../promo/fonts";
import { PROMO_BG, PROMO_FONT, PROMO_TEXT, PROMO_TEXT_DIM } from "../promo/theme";

/** The timeline cast's clips and score are pinned under public/casts/promo. */
const resolvePromoAsset = (file: string): string =>
  staticFile(`casts/promo/${file}`);

export const SURFACE_LOOP_FPS = 30;
export const SURFACE_LOOP_FRAMES = 180;
/** Opening and closing fade, in frames. */
const FADE = 12;

/**
 * A surface loop: which cast to replay, over which slice of it. A `type`
 * alias, not an interface, so its implicit index signature satisfies
 * Remotion's `Composition` props constraint (`Record<string, unknown>`).
 */
export type SurfaceLoopEntry = {
  /** Remotion composition id and output basename. */
  slug: string;
  label: string;
  claim: string;
  /** `doc` replays a document cast, `timeline` the timeline editor cast. */
  kind: "doc" | "timeline";
  /** Document cast id (`doc` only). */
  castId?: string;
  /** Slice of the cast to cover, in cast milliseconds. */
  fromMs: number;
  toMs: number;
};

export const SURFACE_LOOPS: SurfaceLoopEntry[] = [
  {
    slug: "storyboard",
    label: "Storyboard",
    claim: "Pre-vis before you spend",
    kind: "doc",
    castId: "storyboard-assistant",
    fromMs: 700,
    toMs: 19500,
  },
  {
    slug: "script",
    label: "Script & Voice",
    claim: "The script is the source of truth",
    kind: "doc",
    castId: "script-assistant",
    fromMs: 600,
    toMs: 18000,
  },
  {
    slug: "sketch",
    label: "Sketch",
    claim: "Pro image editing meets diffusion",
    kind: "doc",
    castId: "sketch-assistant",
    fromMs: 500,
    toMs: 14800,
  },
  {
    slug: "timeline",
    label: "Timeline",
    claim: "Generate at the playhead",
    kind: "timeline",
    fromMs: 1200,
    toMs: 16400,
  },
];

/** Corner label: surface name over a one-line claim. */
export const SurfaceLabel: React.FC<{ label: string; claim: string }> = ({
  label,
  claim,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const scale = Math.min(width, height) / 1080;
  const opacity = Math.min(
    interpolate(frame, [FADE, FADE + 10], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    interpolate(
      frame,
      [SURFACE_LOOP_FRAMES - FADE - 10, SURFACE_LOOP_FRAMES - FADE],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    )
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 44 * scale,
        bottom: 40 * scale,
        opacity,
        display: "flex",
        flexDirection: "column",
        gap: 6 * scale,
        padding: `${16 * scale}px ${24 * scale}px`,
        borderRadius: 14 * scale,
        background: "rgba(2,6,23,0.72)",
        border: "1px solid rgba(148,163,184,0.22)",
        backdropFilter: "blur(6px)",
        fontFamily: PROMO_FONT,
      }}
    >
      <div
        style={{
          fontSize: 30 * scale,
          fontWeight: 600,
          color: PROMO_TEXT,
          lineHeight: 1.1,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 21 * scale, color: PROMO_TEXT_DIM }}>{claim}</div>
    </div>
  );
};

/**
 * The black that opens and closes every loop. Returns null when clear, so a
 * surface that paints to a GPU canvas is not covered by a transparent layer.
 */
export const LoopFade: React.FC<{ extraFrames?: number }> = ({
  extraFrames = 0,
}) => {
  const frame = useCurrentFrame();
  const opacity = Math.max(
    interpolate(frame, [0, FADE + extraFrames], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    interpolate(
      frame,
      [SURFACE_LOOP_FRAMES - FADE, SURFACE_LOOP_FRAMES],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    )
  );
  if (opacity <= 0) return null;
  return <AbsoluteFill style={{ background: "#000", opacity }} />;
};

export const SurfaceLoop: React.FC<SurfaceLoopEntry> = ({
  label,
  claim,
  kind,
  castId,
  fromMs,
  toMs,
}) => {
  useInterFont();
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

  const castMs = interpolate(frame, [0, SURFACE_LOOP_FRAMES], [fromMs, toMs], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: PROMO_BG }}>
      {kind === "timeline" ? (
        <TimelineDemoPlayer
          cast={promoTimelineCast}
          timeMs={castMs}
          resolveAssetUrl={resolvePromoAsset}
          tracksHeightPx={Math.round(height * 0.34)}
          chrome={false}
        />
      ) : (
        <DocDemoPlayer cast={getDocCast(castId as string)} timeMs={castMs} />
      )}
      <SurfaceLabel label={label} claim={claim} />
      <LoopFade />
    </AbsoluteFill>
  );
};
