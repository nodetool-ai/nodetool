import React from "react";
import { Composition, registerRoot } from "remotion";

import { AureliFilm, FPS, TOTAL_FRAMES } from "./AureliFilm";

const Root: React.FC = () => (
  <Composition id="AureliFilm" component={AureliFilm} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
);

registerRoot(Root);
