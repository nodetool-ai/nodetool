import React, { useMemo } from "react";
import { staticFile } from "remotion";

import { DemoPlayer } from "@web-demo";
import { getCast } from "./casts/registry";
import { TutorialShell } from "./components/TutorialShell";
import type { TutorialStep } from "./components/StepIndicator";
import { buildCameraKeys, cameraAt, type CameraCast } from "./camera";
import type { CaptionCue } from "./types";

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
 * The "How to use NodeTool" intro tutorial (and every graph-editor tutorial /
 * cookbook video built on the same cast format).
 *
 * Three beats over one continuous take:
 *   1. a title card,
 *   2. the real graph UI replaying a workflow — narrated by a step indicator
 *      (which node is active) and lower-third captions,
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
  const resolveAssetUrl = (file: string) => staticFile(`casts/${cast.id}/${file}`);

  // Animated camera: zoom/pan onto each step's focus node, then pull back.
  const cameraKeys = useMemo(
    () => buildCameraKeys(cast as CameraCast, steps, replayWindowMs),
    [cast, steps, replayWindowMs]
  );

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
      {(timeMs) => (
        <DemoPlayer
          cast={cast}
          timeMs={timeMs}
          resolveAssetUrl={resolveAssetUrl}
          viewport={cameraAt(cameraKeys, timeMs)}
        />
      )}
    </TutorialShell>
  );
};
