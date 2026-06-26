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
  introSeconds,
  outroSeconds,
  replayWindowMs,
  steps,
  captions,
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
        <TitleCard title="NodeTool" subtitle="Build AI workflows visually — no code" />
      </Sequence>

      <Sequence from={introFrames + replayFrames} durationInFrames={outroFrames}>
        <OutroCard
          title="Your turn"
          points={[
            "Drag in a node, wire it to the next",
            "Hit Run — watch every node light up",
            "Outputs preview right on the canvas",
          ]}
          footer="github.com/nodetool-ai/nodetool"
        />
      </Sequence>
    </AbsoluteFill>
  );
};

/** Default narration for the bundled `intro-tutorial` cast. */
export const DEFAULT_TUTORIAL_STEPS: TutorialStep[] = [
  { atMs: 0, label: "Text input" },
  { atMs: 900, label: "Enhance with an LLM" },
  { atMs: 5600, label: "Generate an image" },
  { atMs: 14400, label: "Preview the result" },
];

export const DEFAULT_TUTORIAL_CAPTIONS: CaptionCue[] = [
  { fromMs: 200, toMs: 2200, text: "Each node does one task — wire its output into the next node's input." },
  { fromMs: 2400, toMs: 5400, text: "An LLM node rewrites the prompt, streaming its answer live." },
  { fromMs: 5600, toMs: 13800, text: "The next node turns that prompt into an image, step by step." },
  { fromMs: 14000, toMs: 16400, text: "Outputs render right on the canvas. No code, no glue." },
];
