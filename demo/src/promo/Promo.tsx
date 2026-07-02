/**
 * The landing-page / social product video, assembled from six scenes over
 * 1500 frames (50s @ 30fps) — the master cut specified in
 * marketing/VIDEO_SCRIPT.md:
 *
 *   Hook      0–104     the finished trailer pulls back into the editor,
 *                       then fades to black
 *   Title     96–246    five quiet seconds: logo + "Made in NodeTool."
 *   Canvas    238–658   Act 1: four takes render on the real graph canvas
 *   Timeline  650–1162  Act 2: the cut is built on the real timeline editor
 *   Cost      1162–1314 the honesty beat: your keys, provider prices
 *   Close     1314–1500 export → finale full-frame → brand card
 *
 * Scene layout adapts to the composition size, so one component renders both
 * the 16:9 master and the 3:2 landing-page variant. The music bed is the
 * trailer's own score — the same file sitting on the timeline's audio track
 * in Act 2, so what you hear is what the edit shows.
 */
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { HookScene } from "./HookScene";
import { TitleScene } from "./TitleScene";
import { CanvasScene } from "./CanvasScene";
import { TimelineScene } from "./TimelineScene";
import { CostScene } from "./CostScene";
import { CloseScene } from "./CloseScene";
import { useInterFont } from "./fonts";
import { PROMO_BG } from "./theme";

export const PROMO_DURATION_FRAMES = 1500;
export const PROMO_FPS = 30;

const TITLE_FROM = 96;
const CANVAS_FROM = 238;
const TIMELINE_FROM = 650;
const COST_FROM = 1162;
const CLOSE_FROM = 1314;

/** Fades its children in over the first `frames` of the enclosing sequence. */
const FadeIn: React.FC<{ frames?: number; children: React.ReactNode }> = ({
  frames = 8,
  children,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, frames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const Promo: React.FC = () => {
  useInterFont();

  return (
    <AbsoluteFill style={{ background: PROMO_BG }}>
      <Sequence from={0} durationInFrames={TITLE_FROM + 8} name="Hook">
        <HookScene />
      </Sequence>

      <Sequence
        from={TITLE_FROM}
        durationInFrames={CANVAS_FROM - TITLE_FROM + 8}
        name="Title — Made in NodeTool"
      >
        <TitleScene />
      </Sequence>

      <Sequence
        from={CANVAS_FROM}
        durationInFrames={TIMELINE_FROM - CANVAS_FROM + 8}
        name="Canvas — generate variations"
      >
        <FadeIn>
          <CanvasScene />
        </FadeIn>
      </Sequence>

      <Sequence
        from={TIMELINE_FROM}
        durationInFrames={COST_FROM - TIMELINE_FROM}
        name="Timeline — build the cut"
      >
        <FadeIn>
          <TimelineScene />
        </FadeIn>
      </Sequence>

      <Sequence
        from={COST_FROM}
        durationInFrames={CLOSE_FROM - COST_FROM}
        name="Cost — your keys"
      >
        <FadeIn frames={6}>
          <CostScene />
        </FadeIn>
      </Sequence>

      <Sequence
        from={CLOSE_FROM}
        durationInFrames={PROMO_DURATION_FRAMES - CLOSE_FROM}
        name="Export & close"
      >
        <CloseScene />
      </Sequence>

      {/* Music bed from the title card through the UI acts — the same score
          that sits on the timeline's audio track in Act 2. The hook and
          close carry the trailer's own sound instead. */}
      <Sequence from={TITLE_FROM} durationInFrames={CLOSE_FROM - TITLE_FROM}>
        <Audio
          src={staticFile("casts/promo/trailer-music.mp3")}
          loop
          volume={(f) =>
            interpolate(
              f,
              [
                0,
                24,
                COST_FROM - TITLE_FROM,
                CLOSE_FROM - TITLE_FROM - 12,
                CLOSE_FROM - TITLE_FROM,
              ],
              [0, 0.17, 0.17, 0.06, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            )
          }
        />
      </Sequence>
    </AbsoluteFill>
  );
};
