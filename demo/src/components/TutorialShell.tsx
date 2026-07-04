import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";

import { TitleCard } from "./TitleCard";
import { Caption } from "./Caption";
import { OutroCard } from "./OutroCard";
import { StepIndicator, type TutorialStep } from "./StepIndicator";
import type { CaptionCue } from "../types";

export interface TutorialShellProps {
  /** Opening title-card heading. */
  title: string;
  /** Opening title-card subheading. */
  subtitle: string;
  /** Seconds the opening title card holds before the replay begins. */
  introSeconds: number;
  /** Seconds the closing call-to-action card holds after the replay. */
  outroSeconds: number;
  /** How much of the replay to show before the outro takes over, in ms. */
  replayWindowMs: number;
  /** Pipeline/beat steps tracked by the top-left indicator (replay-relative ms). */
  steps: TutorialStep[];
  /** Timed lower-third narration (replay-relative ms). */
  captions: CaptionCue[];
  /** Closing call-to-action heading. */
  outroTitle: string;
  /** Closing call-to-action bullet lines. */
  outroPoints: string[];
  /** The replay surface (a *DemoPlayer variant), rendered at the replay-relative time. */
  children: (timeMs: number) => React.ReactNode;
}

/**
 * Three-beat tutorial layout shared by every demo surface (graph editor,
 * chat, timeline, …): a title card, a replay narrated by a step indicator and
 * lower-third captions, and a closing call-to-action. Each surface supplies
 * its own replay player via `children`; this shell only owns the timing math
 * and the narration chrome.
 */
export const TutorialShell: React.FC<TutorialShellProps> = ({
  title,
  subtitle,
  introSeconds,
  outroSeconds,
  replayWindowMs,
  steps,
  captions,
  outroTitle,
  outroPoints,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const introFrames = Math.round(introSeconds * fps);
  const replayFrames = Math.round((replayWindowMs / 1000) * fps);
  const outroFrames = Math.round(outroSeconds * fps);

  const replayFrame = Math.max(0, frame - introFrames);
  const timeMs = (replayFrame / fps) * 1000;

  return (
    <AbsoluteFill style={{ background: "#0f0f17" }}>
      {children(timeMs)}

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
