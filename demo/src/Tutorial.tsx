import React from "react";
import {
  AbsoluteFill,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { DemoPlayer } from "@web-demo";
import { getCast } from "./casts/registry";
import { TitleCard } from "./components/TitleCard";
import { Caption } from "./components/Caption";
import { OutroCard } from "./components/OutroCard";
import { StepIndicator, type TutorialStep } from "./components/StepIndicator";
import type { CaptionCue } from "./WorkflowDemo";

// A `type` alias so its implicit index signature satisfies Remotion's
// `Composition` props constraint (`Record<string, unknown>`).
export type TutorialProps = {
  /** Which cast to replay under the narration (see casts/registry). */
  castId: string;
  /** Opening title-card heading. */
  title: string;
  /** Opening title-card subheading. */
  subtitle: string;
  /** Seconds the opening title card holds before the replay begins. */
  introSeconds: number;
  /** Seconds the closing call-to-action card holds after the replay. */
  outroSeconds: number;
  /**
   * How much of the replay to show before the outro takes over, in ms. The
   * tutorial cast holds a static finished graph after this; the outro covers it.
   */
  replayWindowMs: number;
  /** Pipeline steps tracked by the top-left indicator (replay-relative ms). */
  steps: TutorialStep[];
  /** Timed lower-third narration (replay-relative ms). */
  captions: CaptionCue[];
  /** Closing call-to-action heading. */
  outroTitle: string;
  /** Closing call-to-action bullet lines. */
  outroPoints: string[];
};

/**
 * The "How to use NodeTool" intro tutorial.
 *
 * Three beats over one continuous take:
 *   1. a title card,
 *   2. the real graph UI replaying a four-node AI pipeline — narrated by a
 *      step indicator (which node is active) and lower-third captions,
 *   3. a closing call-to-action.
 *
 * The replay is the same `DemoPlayer` the product uses, driven by Remotion's
 * frame clock, so running rings, streaming text, the progress bar, and the final
 * image are all frame-deterministic.
 */
export const Tutorial: React.FC<TutorialProps> = ({
  castId,
  title,
  subtitle,
  introSeconds,
  outroSeconds,
  replayWindowMs,
  steps,
  captions,
  outroTitle,
  outroPoints,
}) => {
  const cast = getCast(castId);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const introFrames = Math.round(introSeconds * fps);
  const replayFrames = Math.round((replayWindowMs / 1000) * fps);
  const outroFrames = Math.round(outroSeconds * fps);

  const replayFrame = Math.max(0, frame - introFrames);
  const timeMs = (replayFrame / fps) * 1000;

  const resolveAssetUrl = (file: string) => staticFile(`casts/${cast.id}/${file}`);

  return (
    <AbsoluteFill style={{ background: "#0f0f17" }}>
      <DemoPlayer cast={cast} timeMs={timeMs} resolveAssetUrl={resolveAssetUrl} />

      {/* Step indicator + captions only during the replay beat. */}
      <Sequence from={introFrames} durationInFrames={replayFrames}>
        <StepIndicator steps={steps} timeMs={timeMs} />
      </Sequence>

      {captions.map((cue, i) => {
        const from = introFrames + Math.round((cue.fromMs / 1000) * fps);
        const durationInFrames = Math.max(
          1,
          Math.round(((cue.toMs - cue.fromMs) / 1000) * fps)
        );
        return (
          <Sequence key={i} from={from} durationInFrames={durationInFrames}>
            <Caption text={cue.text} />
          </Sequence>
        );
      })}

      <Sequence from={0} durationInFrames={introFrames}>
        <TitleCard title={title} subtitle={subtitle} />
      </Sequence>

      <Sequence from={introFrames + replayFrames} durationInFrames={outroFrames}>
        <OutroCard title={outroTitle} points={outroPoints} footer="nodetool.ai" />
      </Sequence>
    </AbsoluteFill>
  );
};
