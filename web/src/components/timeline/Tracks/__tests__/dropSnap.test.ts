import { makeClip } from "@nodetool-ai/timeline";
import { snapAssetDropMs } from "../dropSnap";

const beach = makeClip({ id: "beach", trackId: "v1", startMs: 0, durationMs: 4000 });
const other = makeClip({ id: "other", trackId: "v2", startMs: 0, durationMs: 4000 });

describe("snapAssetDropMs", () => {
  it("snaps a drop in a clip's second half to the clip's end", () => {
    // B3 dropped at 2.2 s on a 4.0 s clip and the clip was cut to 2.2 s.
    expect(snapAssetDropMs([beach], "v1", 2200)).toBe(4000);
    expect(snapAssetDropMs([beach], "v1", 3600)).toBe(4000);
  });

  it("keeps the pointer's time in a clip's first half, a gap or another track", () => {
    expect(snapAssetDropMs([beach], "v1", 1500)).toBe(1500);
    expect(snapAssetDropMs([beach], "v1", 5000)).toBe(5000);
    expect(snapAssetDropMs([other], "v1", 3000)).toBe(3000);
  });

  it("snaps a drop just past a clip's end to that end, within the snap distance", () => {
    // Study 16 E1 and E2 let go 0.7 to 0.9 s after the last picture and the
    // video played black for that long.
    expect(snapAssetDropMs([beach], "v1", 4900, 1200)).toBe(4000);
    expect(snapAssetDropMs([beach], "v1", 5300, 1200)).toBe(5300);
    expect(snapAssetDropMs([other], "v1", 4500, 1200)).toBe(4500);
  });
});
