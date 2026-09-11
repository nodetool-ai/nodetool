import React from "react";
import { ChatDemoPlayer } from "@web-demo";
import { getChatCast } from "./casts/chatRegistry";
import { TutorialShell } from "./components/TutorialShell";
import { FocusCamera } from "./components/FocusCamera";
import type { TutorialStep } from "./components/StepIndicator";
import type { CaptionCue, TimeMap, TutorialShot } from "./types";

// A `type` alias so its implicit index signature satisfies Remotion's
// `Composition` props constraint (`Record<string, unknown>`).
export type ChatTutorialProps = {
  /** Which chat cast to replay (see casts/chatRegistry). */
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
 * Tutorial video for the Global Chat panel — same three-beat shell as the
 * graph-editor `Tutorial`, but replaying a `ChatDemoCast` through the real
 * `ChatView` (message bubbles, tool-call card, token streaming) instead of
 * the node canvas.
 */
export const ChatTutorial: React.FC<ChatTutorialProps> = ({
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
  const cast = getChatCast(castId);

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
          {(_samplePresentationMs, sampleCastMs, focusIds) => (
            <ChatDemoPlayer cast={cast} timeMs={sampleCastMs} focusIds={focusIds} />
          )}
        </FocusCamera>
      )}
    </TutorialShell>
  );
};
