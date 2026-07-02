/**
 * Scenes 4–5 — Act 2 on the timeline. The real timeline editor replays the
 * promo cast: the four Act-1 takes land on the video track, get swapped and
 * trimmed, the score lands underneath, and the cut plays. Then the
 * generate-at-the-playhead beat: the prompt bar types a shot description,
 * Generate is pressed, and the clip lands at the playhead — walking the real
 * `queued → generating → generated` clip states.
 */
import React from "react";
import {
  AbsoluteFill,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  PROMO_PLAYHEAD_MODEL,
  PROMO_PLAYHEAD_PROMPT,
  TimelineDemoPlayer,
  promoTimelineCast,
} from "@web-demo";
import { Cursor, type CursorWaypoint } from "./Cursor";
import { GenerateBar, Headline } from "./overlays";
import { usePendingMediaDelay } from "./usePendingMediaDelay";
import { PROMO_BG } from "./theme";

const resolvePromoAsset = (file: string): string =>
  staticFile(`casts/promo/${file}`);

/** Frames before the cast clock starts (the crossfade from the canvas). */
const CAST_START_FRAME = 8;

export const TimelineScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const castMs = Math.max(0, ((frame - CAST_START_FRAME) / 30) * 1000);
  const onPendingMedia = usePendingMediaDelay("timeline");

  const tracksHeightPx = Math.round(height * 0.3);

  // Generate-button center, derived from the GenerateBar's layout.
  const barWidth = Math.min(1380, width * 0.86);
  const buttonX = width / 2 + barWidth / 2 - 14 - 78;
  const buttonY = 63;
  const waypoints: CursorWaypoint[] = [
    { frame: 352, x: width * 0.56, y: height * 0.5 },
    { frame: 390, x: buttonX, y: buttonY },
    { frame: 392, x: buttonX, y: buttonY, click: true },
  ];

  return (
    <AbsoluteFill style={{ background: PROMO_BG }}>
      <TimelineDemoPlayer
        cast={promoTimelineCast}
        timeMs={castMs}
        resolveAssetUrl={resolvePromoAsset}
        tracksHeightPx={tracksHeightPx}
        onPendingMedia={onPendingMedia}
      />

      <GenerateBar
        from={300}
        to={478}
        typeFrom={330}
        typeTo={386}
        pressFrame={392}
        prompt={PROMO_PLAYHEAD_PROMPT}
        model={PROMO_PLAYHEAD_MODEL}
      />

      {frame >= 344 && frame <= 420 ? (
        <Cursor frame={frame} waypoints={waypoints} />
      ) : null}

      <Headline
        from={30}
        to={288}
        text="Build the final video on the timeline."
        small="Multi-track video & audio. Trim, swap, and score the cut."
        anchor={0.62}
      />
      <Headline
        from={306}
        to={492}
        text="Missing a shot? Prompt it at the playhead."
        small="The clip lands on the track. No import step."
        anchor={0.62}
      />
    </AbsoluteFill>
  );
};
