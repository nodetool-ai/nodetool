import { readFileSync } from "fs";
import { join } from "path";

// Bodies of the browser-capable GPU image nodes. Each must write its controls
// through `useLiveSliderWriter`, which re-runs the node in the browser while a
// control moves. `useBespokePropertyWriter` only queues a debounced server run
// (and none when instant update is off), so a body using it shows no live
// preview while the adjustment nodes beside it do.
const LIVE_PREVIEW_BODIES = [
  "BlurBody",
  "CanvasResizeBody",
  "ChannelsBody",
  "CropBody",
  "FitBody",
  "HSLAdjustBody",
  "LevelsBody",
  "PasteBody",
  "ResizeBody",
  "ResizeImageBody",
  "RotateAndFlipBody",
  "ScaleBody"
];

describe("image node bodies with live preview", () => {
  it.each(LIVE_PREVIEW_BODIES)("%s writes through useLiveSliderWriter", (name) => {
    const source = readFileSync(join(__dirname, "..", `${name}.tsx`), "utf8");
    expect(source).toMatch(/\buseLiveSliderWriter\(/);
    expect(source).not.toMatch(/\buseBespokePropertyWriter\b/);
  });
});
