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
  useVideoConfig
} from "remotion";
import {
  DemoPlayer,
  ChatDemoPlayer,
  DocDemoPlayer,
  TimelineDemoPlayer,
  agentChatCast,
  heroBriefCast,
  heroStoryboardCast,
  heroTimelineCast,
  promoTimelineCast,
  promoTrailerCast
} from "@web-demo";
import { getDocCast } from "../casts/docRegistry";
import { getCast } from "../casts/registry";
import { frameRect } from "../promo/helpers";
import { useInterFont } from "../promo/fonts";
import { usePendingMediaDelay } from "../promo/usePendingMediaDelay";
import {
  PROMO_BG,
  PROMO_FONT,
  PROMO_TEXT,
  PROMO_TEXT_DIM
} from "../promo/theme";
import {
  SURFACE_LOOP_FPS,
  SURFACE_LOOP_FRAMES,
  surfaceCastTimeMs
} from "./surfaceRange";
export { SURFACE_LOOP_FPS, SURFACE_LOOP_FRAMES, surfaceOutputFrames } from "./surfaceRange";

/** The timeline cast's clips and score are pinned under public/casts/promo. */
const resolvePromoAsset = (file: string): string =>
  staticFile(`casts/promo/${file}`);

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
  /** Hide the baked corner card when the loop is used under separate titles. */
  labelVisible?: boolean;
  /** Play the selected cast interval at its recorded speed. */
  realtime?: boolean;
  /** `doc` replays a document cast, `timeline` the timeline editor cast. */
  kind: "chat" | "doc" | "timeline" | "graph";
  /** Cast id for this surface. */
  castId?: string;
  durationMs?: number;
  sampleSpanFrames?: number;
  outputWidth?: number;
  outputHeight?: number;
  logicalWidth?: number;
  viewport?: { x: number; y: number; zoom: number };
  tracksHeightPx?: number;
  chrome?: boolean;
  harness?: boolean;
  /** Slice of the cast to cover, in cast milliseconds. */
  fromMs: number;
  toMs: number;
  /**
   * Pixels of surface below the frame, panned into view over the loop (`doc`
   * only). Set it when a cast's surface is taller than the frame, so the last
   * thing to arrive is not hidden below the fold.
   */
  panPx?: number;
  /**
   * Scale applied to the surface (`doc` only). The surface is laid out in a
   * frame `zoom` times smaller and scaled back up, so a surface that does not
   * fill 1920×1080 on its own — the storyboard grid is two rows of cards —
   * still fills the loop instead of sitting in a field of background.
   */
  zoom?: number;
};

export const SURFACE_LOOPS: SurfaceLoopEntry[] = [
  {
    slug: "chat",
    label: "Chat",
    claim: "Plan the project",
    kind: "chat",
    castId: "hero-brief",
    fromMs: 1500,
    toMs: 11400
  },
  {
    slug: "storyboard",
    label: "Storyboard",
    claim: "Pre-vis before you spend",
    kind: "doc",
    castId: "storyboard-assistant",
    fromMs: 700,
    toMs: 23000,
    zoom: 1.5
  },
  {
    slug: "script",
    label: "Script & Voice",
    claim: "The script is the source of truth",
    kind: "doc",
    castId: "script-assistant",
    fromMs: 600,
    toMs: 18000
  },
  {
    slug: "sketch",
    label: "Sketch",
    claim: "Pro image editing meets diffusion",
    kind: "doc",
    castId: "sketch-assistant",
    fromMs: 500,
    toMs: 14800
  },
  {
    slug: "timeline",
    label: "Timeline",
    claim: "Generate at the playhead",
    kind: "timeline",
    fromMs: 1200,
    toMs: 16400
  },
  {
    slug: "graph",
    label: "Workflow",
    claim: "Compare models on one canvas",
    kind: "graph",
    fromMs: 2600,
    toMs: 9400
  }
];

/** Corner label: surface name over a one-line claim. */
export const SurfaceLabel: React.FC<{ label: string; claim: string }> = ({
  label,
  claim
}) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const scale = Math.min(width, height) / 1080;
  const opacity = Math.min(
    interpolate(frame, [FADE, FADE + 10], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    }),
    interpolate(
      frame,
      [durationInFrames - FADE - 10, durationInFrames - FADE],
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
        fontFamily: PROMO_FONT
      }}
    >
      <div
        style={{
          fontSize: 30 * scale,
          fontWeight: 600,
          color: PROMO_TEXT,
          lineHeight: 1.1
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
  extraFrames = 0
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = Math.max(
    interpolate(frame, [0, FADE + extraFrames], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    }),
    interpolate(
      frame,
      [durationInFrames - FADE, durationInFrames],
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
  labelVisible = true,
  kind,
  castId,
  fromMs,
  toMs,
  panPx = 0,
  zoom = 1,
  realtime = false,
  durationMs,
  sampleSpanFrames,
  logicalWidth,
  viewport,
  tracksHeightPx,
  chrome,
  harness = false
}) => {
  useInterFont();
  const onPendingMedia = usePendingMediaDelay("surface-graph");
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const localFrame = frame;
  const shotFrames = durationInFrames;
  const layoutWidth = logicalWidth ?? width;
  const layoutScale = width / layoutWidth;
  const layoutHeight = height / layoutScale;

  const castMs = surfaceCastTimeMs(
    localFrame,
    fps,
    shotFrames,
    fromMs,
    toMs,
    realtime && durationMs === undefined,
    sampleSpanFrames
  );
  // The pan trails the fill: it starts once the first stills have landed and
  // arrives as the last one does, leaving the last second on a full board.
  const panY = interpolate(
    localFrame,
    [shotFrames * 0.45, shotFrames * 0.85],
    [0, -panPx],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const surface = (
    <div style={{ position: "absolute", top: 0, left: 0, width: layoutWidth, height: layoutHeight, transform: `scale(${layoutScale})`, transformOrigin: "top left", overflow: "hidden" }}>
      {kind === "chat" ? (
        <ChatDemoPlayer
          cast={castId === "chat-agent-qa" ? agentChatCast : heroBriefCast}
          timeMs={castMs}
        />
      ) : kind === "graph" ? (
        <DemoPlayer
          cast={castId && castId !== promoTrailerCast.id ? getCast(castId) : promoTrailerCast}
          timeMs={castMs}
          resolveAssetUrl={resolvePromoAsset}
          viewport={viewport ?? frameRect({ x0: -60, y0: 10, x1: 1215, y1: 995 }, layoutWidth, layoutHeight, 70, 1.3)}
          onPendingMedia={onPendingMedia}
        />
      ) : kind === "timeline" ? (
        <TimelineDemoPlayer
          cast={castId === heroTimelineCast.id ? heroTimelineCast : promoTimelineCast}
          timeMs={castMs}
          resolveAssetUrl={resolvePromoAsset}
          tracksHeightPx={tracksHeightPx ?? Math.round(layoutHeight * 0.34)}
          chrome={chrome ?? false}
          onPendingMedia={onPendingMedia}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: layoutWidth / zoom,
            height: (layoutHeight + panPx) / zoom,
            transform: `scale(${zoom}) translateY(${panY / zoom}px)`,
            transformOrigin: "top left"
          }}
        >
          <DocDemoPlayer cast={castId === heroStoryboardCast.id ? heroStoryboardCast : getDocCast(castId as string)} timeMs={castMs} resolveAssetUrl={resolvePromoAsset} mediaTimeMs={localFrame * 1000 / fps} onPendingMedia={onPendingMedia} />
        </div>
      )}
    </div>
  );
  return (
    <AbsoluteFill style={{ background: PROMO_BG }}>
      {surface}
      {labelVisible && <SurfaceLabel label={label} claim={claim} />}
      {!harness && <LoopFade />}
    </AbsoluteFill>
  );
};
