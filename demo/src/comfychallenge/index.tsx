import React from "react";
import { Composition, registerRoot } from "remotion";

import {
  ComfyChallenge,
  DEFAULT_FLAGS,
  FPS,
  totalFrames,
  type ComfyChallengeProps
} from "./ComfyChallenge";

const defaultProps: ComfyChallengeProps = DEFAULT_FLAGS;

function ComfyChallengeRoot(): React.JSX.Element {
  return (
    <Composition
      id="ComfyChallenge"
      component={ComfyChallenge}
      durationInFrames={totalFrames()}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={defaultProps}
    />
  );
}

registerRoot(ComfyChallengeRoot);
