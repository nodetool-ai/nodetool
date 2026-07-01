import React from "react";
import { Composition } from "remotion";

import { WorkflowDemo, type WorkflowDemoProps } from "./WorkflowDemo";
import { Tutorial } from "./Tutorial";
import { TUTORIALS, tutorialFrames } from "./tutorials";
import { COOKBOOK } from "./cookbook";
import { WORKFLOWS } from "./workflows";
import { DEFAULT_CAST, listCasts } from "./casts/registry";
import { ChatTutorial } from "./ChatTutorial";
import { CHAT_TUTORIALS, chatTutorialFrames } from "./chatTutorials";
import { TimelineTutorial } from "./TimelineTutorial";
import { TIMELINE_TUTORIALS, timelineTutorialFrames } from "./timelineTutorials";
import type { DemoCast } from "@web-demo";

const WIDTH = 1920;
const HEIGHT = 1080;

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

  return (
    <>
      {[...TUTORIALS, ...COOKBOOK, ...WORKFLOWS].map((tut) => (
        <Composition
          key={tut.compositionId}
          id={tut.compositionId}
          component={Tutorial}
          defaultProps={tut.props}
          fps={tut.fps}
          width={WIDTH}
          height={HEIGHT}
          durationInFrames={tutorialFrames(tut)}
        />
      ))}

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

      {CHAT_TUTORIALS.map((tut) => (
        <Composition
          key={tut.compositionId}
          id={tut.compositionId}
          component={ChatTutorial}
          defaultProps={tut.props}
          fps={tut.fps}
          width={WIDTH}
          height={HEIGHT}
          durationInFrames={chatTutorialFrames(tut)}
        />
      ))}

      {TIMELINE_TUTORIALS.map((tut) => (
        <Composition
          key={tut.compositionId}
          id={tut.compositionId}
          component={TimelineTutorial}
          defaultProps={tut.props}
          fps={tut.fps}
          width={WIDTH}
          height={HEIGHT}
          durationInFrames={timelineTutorialFrames(tut)}
        />
      ))}
    </>
  );
};
