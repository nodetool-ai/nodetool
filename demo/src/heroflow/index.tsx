import React from "react";
import { Composition, Still, registerRoot } from "remotion";

import { DURATION_FRAMES, FPS } from "./clock";
import { HeroFlow } from "./HeroFlow";
import { MOCKUPS, MockupFrame, MockupOverview } from "./Mockups";

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
