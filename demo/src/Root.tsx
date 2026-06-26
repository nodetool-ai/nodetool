import React from "react";
import { Composition } from "remotion";

import { WorkflowDemo, type WorkflowDemoProps } from "./WorkflowDemo";
import {
  Tutorial,
  type TutorialProps,
  DEFAULT_TUTORIAL_STEPS,
  DEFAULT_TUTORIAL_CAPTIONS,
} from "./Tutorial";
import { DEFAULT_CAST, getCast, listCasts } from "./casts/registry";
import type { DemoCast } from "@web-demo";

const WIDTH = 1920;
const HEIGHT = 1080;

const TUTORIAL_CAST_ID = "intro-tutorial";
const TUTORIAL_INTRO_S = 2.5;
const TUTORIAL_OUTRO_S = 4;
const TUTORIAL_REPLAY_WINDOW_MS = 16500;

function tutorialFrames(fps: number): number {
  return Math.round(
    (TUTORIAL_INTRO_S + TUTORIAL_REPLAY_WINDOW_MS / 1000 + TUTORIAL_OUTRO_S) * fps
  );
}

/** Turn a cast id into a valid, readable Remotion composition id. */
function compositionId(castId: string): string {
  const slug = castId.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return `Demo-${slug || "cast"}`;
}

function framesFor(cast: DemoCast, introSeconds: number): number {
  const fps = cast.fps ?? 30;
  const intro = Math.round(introSeconds * fps);
  return Math.max(1, intro + Math.ceil((cast.durationMs / 1000) * fps));
}

/**
 * Registers one composition per cast, plus a canonical `WorkflowDemo` bound to
 * the default cast (so the `npm run render` script has a stable target).
 */
export const Root: React.FC = () => {
  const sampleProps: WorkflowDemoProps = {
    castId: DEFAULT_CAST.id,
    title: "NodeTool",
    subtitle: "Visual AI workflows",
    introSeconds: 1.5,
    captions: [
      { fromMs: 200, toMs: 1900, text: "Generating text, streaming live…" },
      { fromMs: 2200, toMs: 3800, text: "Output renders right on the canvas" },
    ],
  };

  const tutorialCast = getCast(TUTORIAL_CAST_ID);
  const tutorialFps = tutorialCast.fps ?? 30;
  const tutorialProps: TutorialProps = {
    castId: TUTORIAL_CAST_ID,
    introSeconds: TUTORIAL_INTRO_S,
    outroSeconds: TUTORIAL_OUTRO_S,
    replayWindowMs: TUTORIAL_REPLAY_WINDOW_MS,
    steps: DEFAULT_TUTORIAL_STEPS,
    captions: DEFAULT_TUTORIAL_CAPTIONS,
  };

  return (
    <>
      <Composition
        id="Tutorial"
        component={Tutorial}
        defaultProps={tutorialProps}
        fps={tutorialFps}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={tutorialFrames(tutorialFps)}
      />

      <Composition
        id="WorkflowDemo"
        component={WorkflowDemo}
        defaultProps={sampleProps}
        fps={DEFAULT_CAST.fps ?? 30}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={framesFor(DEFAULT_CAST, sampleProps.introSeconds ?? 0)}
      />

      {listCasts().map((cast) => (
        <Composition
          key={cast.id}
          id={compositionId(cast.id)}
          component={WorkflowDemo}
          defaultProps={{ castId: cast.id } as WorkflowDemoProps}
          fps={cast.fps ?? 30}
          width={WIDTH}
          height={HEIGHT}
          durationInFrames={framesFor(cast, 0)}
        />
      ))}
    </>
  );
};
