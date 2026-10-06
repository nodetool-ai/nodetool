import React from "react";
import { Composition, Still, registerRoot } from "remotion";

import { DURATION_FRAMES, FPS } from "./clock";
import { HeroFlow } from "./HeroFlow";
import { MOCKUPS, MockupFrame, MockupOverview } from "./Mockups";
import { LOOP_FRAMES } from "./editors/common";
import { GameLoop } from "./editors/GameLoop";
import { Model3DLoop } from "./editors/Model3DLoop";
import { NodeLoop } from "./editors/NodeLoop";
import { ScriptLoop } from "./editors/ScriptLoop";
import { SketchLoop } from "./editors/SketchLoop";
import { StoryboardLoop } from "./editors/StoryboardLoop";
import { TimelineLoop } from "./editors/TimelineLoop";

/** The landing page's "Seven editors" loops, one per showcase tab. */
export const SURFACE_LOOPS = [
  { id: "storyboard", component: StoryboardLoop },
  { id: "script", component: ScriptLoop },
  { id: "timeline", component: TimelineLoop },
  { id: "sketch", component: SketchLoop },
  { id: "3d", component: Model3DLoop },
  { id: "game", component: GameLoop },
  { id: "nodes", component: NodeLoop }
] as const;

export function HeroFlowRoot(): React.JSX.Element {
  return (
    <>
      <Composition
        id="HeroFlow"
        component={HeroFlow}
        durationInFrames={DURATION_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />
      {SURFACE_LOOPS.map((loop) => (
        <Composition
          key={loop.id}
          id={`Surface-${loop.id}`}
          component={loop.component}
          durationInFrames={LOOP_FRAMES}
          fps={FPS}
          width={1920}
          height={1080}
        />
      ))}
      <Still
        id="HeroFlow-Overview"
        component={MockupOverview}
        width={1920}
        height={1080}
      />
      {MOCKUPS.map((m) => (
        <Still
          key={m.id}
          id={`HeroFlow-${m.id}`}
          component={MockupFrame}
          defaultProps={{ id: m.id }}
          width={1920}
          height={1080}
        />
      ))}
    </>
  );
}

registerRoot(HeroFlowRoot);
