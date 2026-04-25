import { createDefaultLayer } from "../types";
import { getMergeSelectedLayersPlan } from "../layerMergeSelection";

describe("getMergeSelectedLayersPlan", () => {
  it("returns a top-down merge order for contiguous sibling selections", () => {
    const lower = createDefaultLayer("Lower", "raster", 64, 64);
    const middle = createDefaultLayer("Middle", "raster", 64, 64);
    const upper = createDefaultLayer("Upper", "raster", 64, 64);

    const plan = getMergeSelectedLayersPlan(
      [lower, middle, upper],
      [lower.id, middle.id, upper.id]
    );

    expect(plan).toEqual({
      survivingLayerId: lower.id,
      mergeOrder: [upper.id, middle.id]
    });
  });

  it("rejects non-contiguous selections", () => {
    const lower = createDefaultLayer("Lower", "raster", 64, 64);
    const middle = createDefaultLayer("Middle", "raster", 64, 64);
    const upper = createDefaultLayer("Upper", "raster", 64, 64);

    expect(
      getMergeSelectedLayersPlan(
        [lower, middle, upper],
        [lower.id, upper.id]
      )
    ).toBeNull();
  });

  it("rejects locked, grouped, or cross-parent selections", () => {
    const parentA = "parent-a";
    const lower = { ...createDefaultLayer("Lower", "raster", 64, 64), parentId: parentA };
    const upper = {
      ...createDefaultLayer("Upper", "raster", 64, 64),
      locked: true,
      parentId: parentA
    };

    expect(
      getMergeSelectedLayersPlan([lower, upper], [lower.id, upper.id])
    ).toBeNull();

    const otherParentLayer = {
      ...createDefaultLayer("Other", "raster", 64, 64),
      parentId: "parent-b"
    };

    expect(
      getMergeSelectedLayersPlan(
        [lower, otherParentLayer],
        [lower.id, otherParentLayer.id]
      )
    ).toBeNull();
  });
});
