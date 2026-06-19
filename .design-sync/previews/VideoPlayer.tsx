import * as React from "react";

import { VideoPlayer } from "nodetool";

const SRC = "https://www.w3schools.com/html/mov_bbb.mp4";

export const Default = () => (
  <div style={{ width: 420 }}>
    <VideoPlayer src={SRC} muted />
  </div>
);

export const Looping = () => (
  <div style={{ width: 420 }}>
    <VideoPlayer src={SRC} muted loop autoplay />
  </div>
);
