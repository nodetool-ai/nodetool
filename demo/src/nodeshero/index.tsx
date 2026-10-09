import React from "react";
import { Composition, registerRoot } from "remotion";

import { NodesHero } from "./NodesHero";
import { DURATION_FRAMES, FPS, HEIGHT, WIDTH } from "./graph";

export function NodesHeroRoot(): React.JSX.Element {
  return (
    <Composition
      id="NodesHero"
      component={NodesHero}
      durationInFrames={DURATION_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
}

registerRoot(NodesHeroRoot);
