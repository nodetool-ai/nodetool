import React from "react";
import { TimelineDemoPlayer } from "@web-demo";
import { getTimelineCast } from "./casts/timelineRegistry";
import { TutorialShell } from "./components/TutorialShell";
import { FocusCamera } from "./components/FocusCamera";
import type { TutorialStep } from "./components/StepIndicator";
import type { CaptionCue, TimeMap, TutorialShot } from "./types";

// A `type` alias so its implicit index signature satisfies Remotion's
// `Composition` props constraint (`Record<string, unknown>`).
export type TimelineTutorialProps = {
  /** Which timeline cast to replay (see casts/timelineRegistry). */
  castId: string;
  title: string;
  subtitle: string;
  introSeconds: number;
  outroSeconds: number;
  replayWindowMs: number;
  steps: TutorialStep[];
  captions: CaptionCue[];
  shots: TutorialShot[];
  timeMap?: TimeMap;
  outroTitle: string;
  outroPoints: string[];
};

/**
 * Tutorial video for the timeline (video) editor — same three-beat shell as
 * the graph-editor `Tutorial`, but replaying a `TimelineDemoCast` through the
 * real `PreviewArea` + `TracksRegion` instead of the node canvas.
 */
export const TimelineTutorial: React.FC<TimelineTutorialProps> = ({
  castId,
  title,
  subtitle,
  introSeconds,
  outroSeconds,
  replayWindowMs,
  steps,
  captions,
  shots,
  timeMap,
  outroTitle,
  outroPoints,
}) => {
  const cast = getTimelineCast(castId);

  return (
    <TutorialShell
      title={title}
      subtitle={subtitle}
      introSeconds={introSeconds}
      outroSeconds={outroSeconds}
      replayWindowMs={replayWindowMs}
      steps={steps}
      captions={captions}
      timeMap={timeMap}
      outroTitle={outroTitle}
      outroPoints={outroPoints}
    >
      {(presentationTimeMs) => (
        <FocusCamera
          tutorialId={castId}
          shots={shots}
          presentationTimeMs={presentationTimeMs}
          timeMap={timeMap}
        >
          {(_samplePresentationMs, sampleCastMs) => (
            <TimelineDemoPlayer cast={cast} timeMs={sampleCastMs} />
          )}
        </FocusCamera>
      )}
    </TutorialShell>
  );
};
