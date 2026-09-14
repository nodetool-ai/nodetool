import { makeClip } from "@nodetool-ai/timeline";
import type { ActiveLayer } from "@nodetool-ai/timeline/render";

import { sceneRequiresPerFrameResolution } from "../PreviewCompositor";

function layer(reframe: boolean): ActiveLayer {
  const clip = makeClip({ id: "shot" });
  if (reframe) {
    clip.reframe = {
      mode: "auto",
      samples: [
        { sourceMs: 0, x: 0.2, y: 0.5 },
        { sourceMs: 1000, x: 0.8, y: 0.5 }
      ]
    };
  }
  return {
    kind: "image",
    clip,
    clipId: "shot",
    trackIndex: 0,
    blendMode: "normal",
    opacity: 1,
    assetId: "asset"
  };
}

describe("Smart Reframe preview scheduling", () => {
  it("resolves reframed still and video layers on every playback frame", () => {
    expect(sceneRequiresPerFrameResolution([layer(true)])).toBe(true);
    expect(sceneRequiresPerFrameResolution([layer(false)])).toBe(false);
  });
});
