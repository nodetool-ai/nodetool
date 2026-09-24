import React from "react";
import { Composition, registerRoot } from "remotion";
import { SereinReference } from "./SereinReference";
import { DURATION, FPS, HEIGHT, WIDTH } from "./theme";

export function SereinRoot(): React.JSX.Element {
  return (
    <Composition
      id="SereinReference"
      component={SereinReference}
      width={WIDTH}
      height={HEIGHT}
      fps={FPS}
      durationInFrames={DURATION}
    />
  );
}

registerRoot(SereinRoot);
