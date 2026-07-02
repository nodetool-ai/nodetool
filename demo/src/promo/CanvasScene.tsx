/**
 * Scenes 2–3 — Act 1 on the canvas. The real graph editor replays the
 * promo-trailer cast: one shot brief fans out into four text-to-video takes
 * (Seedance ×2, Wan ×2) that render in parallel. Then the pick beat: the
 * camera settles on two takes, the cursor weighs them, and clicks the winner.
 *
 * The camera is authored here (not ../camera.ts) because it is shot design,
 * not step tracking — and it must adapt to both the 16:9 and 3:2 formats.
 */
import React, { useMemo } from "react";
import {
  AbsoluteFill,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { DemoPlayer, promoTrailerCast } from "@web-demo";
import { usePendingMediaDelay } from "./usePendingMediaDelay";
import { Cursor, type CursorWaypoint } from "./Cursor";
import { Headline, SelectionRing } from "./overlays";
import {
  cameraAt,
  frameRect,
  progress,
  project,
  type CameraKey,
} from "./helpers";
import { PROMO_BG } from "./theme";

const resolvePromoAsset = (file: string): string =>
  staticFile(`casts/promo/${file}`);

/** Frames before the cast clock starts (the crossfade from the hook). */
const CAST_START_FRAME = 8;

/**
 * Graph geometry from promoTrailerCast's node layout (positions are shot
 * design — see the cast). Node heights are estimates for framing; the video
 * content cards render ~400px tall.
 */
const NODE_H = 410;
const SEEDANCE = { x: 480, y: 40, w: 320 };
const WAN26 = { x: 880, y: 40, w: 320 };
const ALL_NODES_RECT = { x0: -20, y0: 20, x1: 1210, y1: 990 };
const BRIEF_RECT = { x0: -60, y0: 360, x1: 360, y1: 760 };
const GRID_RECT = { x0: 450, y0: 10, x1: 1215, y1: 995 };
const TOP_PAIR_RECT = { x0: 445, y0: 0, x1: 1215, y1: NODE_H + 70 };
const WINNER_RECT = { x0: 440, y0: 0, x1: 850, y1: NODE_H + 70 };

export const CanvasScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const castMs = Math.max(0, ((frame - CAST_START_FRAME) / 30) * 1000);
  const onPendingMedia = usePendingMediaDelay("canvas");

  const cameraKeys = useMemo<CameraKey[]>(() => {
    const wide = frameRect(ALL_NODES_RECT, width, height, 110, 1.2);
    const brief = frameRect(BRIEF_RECT, width, height, 150, 1.5);
    const grid = frameRect(GRID_RECT, width, height, 90, 1.2);
    const gridPushed = { ...grid, zoom: grid.zoom * 1.06 };
    const topPair = frameRect(TOP_PAIR_RECT, width, height, 110, 1.4);
    const winner = frameRect(WINNER_RECT, width, height, 130, 1.6);
    // Re-center pushed shots on the same rect centers.
    const recenter = (vp: typeof grid, rect: typeof GRID_RECT) => ({
      ...vp,
      x: width / 2 - ((rect.x0 + rect.x1) / 2) * vp.zoom,
      y: height / 2 - ((rect.y0 + rect.y1) / 2) * vp.zoom,
    });
    return [
      { t: 0, vp: wide },
      { t: 1300, vp: wide },
      { t: 2000, vp: brief },
      { t: 2700, vp: brief },
      { t: 3500, vp: grid },
      { t: 9000, vp: recenter(gridPushed, GRID_RECT) },
      { t: 9600, vp: recenter(gridPushed, GRID_RECT) },
      { t: 10400, vp: topPair },
      { t: 12300, vp: topPair },
      { t: 13100, vp: winner },
    ];
  }, [width, height]);

  const vp = cameraAt(cameraKeys, castMs);

  // ── Pick beat: cursor weighs the two top-row takes, clicks the winner. ──
  const wanCenter = project(vp, WAN26.x + WAN26.w / 2, WAN26.y + NODE_H * 0.42);
  const seedanceCenter = project(
    vp,
    SEEDANCE.x + SEEDANCE.w / 2,
    SEEDANCE.y + NODE_H * 0.42
  );
  const cursorEntry = project(vp, 1150, 900);
  const waypoints: CursorWaypoint[] = [
    { frame: 306, x: cursorEntry.x, y: cursorEntry.y },
    { frame: 330, x: wanCenter.x, y: wanCenter.y },
    { frame: 344, x: wanCenter.x, y: wanCenter.y },
    { frame: 362, x: seedanceCenter.x, y: seedanceCenter.y, click: true },
  ];

  const ringTopLeft = project(vp, SEEDANCE.x - 8, SEEDANCE.y - 8);
  const ringBottomRight = project(
    vp,
    SEEDANCE.x + SEEDANCE.w + 8,
    SEEDANCE.y + NODE_H + 8
  );
  const ringOpacity = progress(frame, 362, 370);

  return (
    <AbsoluteFill style={{ background: PROMO_BG }}>
      <DemoPlayer
        cast={promoTrailerCast}
        timeMs={castMs}
        resolveAssetUrl={resolvePromoAsset}
        viewport={vp}
        onPendingMedia={onPendingMedia}
      />

      {ringOpacity > 0 ? (
        <SelectionRing
          x={ringTopLeft.x}
          y={ringTopLeft.y}
          width={ringBottomRight.x - ringTopLeft.x}
          height={ringBottomRight.y - ringTopLeft.y}
          opacity={ringOpacity}
        />
      ) : null}

      {frame >= 298 ? <Cursor frame={frame} waypoints={waypoints} /> : null}

      <Headline
        from={88}
        to={280}
        text="Generate variations on the canvas."
        small="One prompt. Four takes. Seedance · Wan — your keys."
      />
      <Headline from={300} to={412} text="Keep the takes that work." />
    </AbsoluteFill>
  );
};
