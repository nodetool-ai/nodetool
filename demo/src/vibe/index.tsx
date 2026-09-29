import React from "react";
import { Composition, registerRoot } from "remotion";
import { VibeRace } from "./VibeRace";
import { DURATION, FPS, HEIGHT, WIDTH } from "./theme";

export function VibeRoot(): React.JSX.Element {
  return <Composition id="VibeRace" component={VibeRace} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={DURATION} />;
}

registerRoot(VibeRoot);
