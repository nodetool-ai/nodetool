import React from "react";
import { DocDemoPlayer } from "@web-demo";
import { getDocCast } from "./casts/docRegistry";
import { TutorialShell } from "./components/TutorialShell";
import type { TutorialStep } from "./components/StepIndicator";
import type { CaptionCue } from "./types";

// A `type` alias so its implicit index signature satisfies Remotion's
// `Composition` props constraint (`Record<string, unknown>`).
export type DocTutorialProps = {
  /** Which document cast to replay (see casts/docRegistry). */
  castId: string;
  title: string;
  subtitle: string;
  introSeconds: number;
  outroSeconds: number;
  replayWindowMs: number;
  steps: TutorialStep[];
  captions: CaptionCue[];
  outroTitle: string;
  outroPoints: string[];
};

/**
 * Tutorial video for a document surface — sketch, script, storyboard, JS
 * script, or mini app. Same three-beat shell as the graph and timeline
 * tutorials, replaying a `DocDemoCast` through the production document
 * component with its assistant docked beside it, so the video shows the
 * document and the conversation that changed it at once.
 */
export const DocTutorial: React.FC<DocTutorialProps> = ({
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
  const cast = getDocCast(castId);

  return (
    <TutorialShell
      title={title}
      subtitle={subtitle}
      introSeconds={introSeconds}
      outroSeconds={outroSeconds}
      replayWindowMs={replayWindowMs}
      steps={steps}
      captions={captions}
      outroTitle={outroTitle}
      outroPoints={outroPoints}
    >
      {(timeMs) => <DocDemoPlayer cast={cast} timeMs={timeMs} />}
    </TutorialShell>
  );
};
