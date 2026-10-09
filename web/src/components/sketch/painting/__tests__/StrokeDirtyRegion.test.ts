/**
 * @jest-environment node
 */
import { StrokeDirtyRegion } from "../StrokeDirtyRegion";

const box = (minX: number, minY: number, maxX: number, maxY: number) => ({
  minX,
  minY,
  maxX,
  maxY
});

describe("StrokeDirtyRegion", () => {
  it("unions every segment into the stroke box", () => {
    const region = new StrokeDirtyRegion();
    region.track((t) => {
      t.current = box(0, 0, 10, 10);
    });
    region.track((t) => {
      t.current = box(50, 40, 60, 70);
    });
    expect(region.strokeRect).toEqual(box(0, 0, 60, 70));
  });

  it("returns only the segments since the previous take", () => {
    const region = new StrokeDirtyRegion();
    region.track((t) => {
      t.current = box(0, 0, 10, 10);
    });
    expect(region.takeFrameRect()).toEqual(box(0, 0, 10, 10));
    region.track((t) => {
      t.current = box(50, 40, 60, 70);
    });
    expect(region.takeFrameRect()).toEqual(box(50, 40, 60, 70));
    expect(region.takeFrameRect()).toBeNull();
  });

  it("ignores draws that touched nothing", () => {
    const region = new StrokeDirtyRegion();
    region.track(() => {});
    expect(region.strokeRect).toBeNull();
    expect(region.takeFrameRect()).toBeNull();
  });

  it("clears both boxes on reset", () => {
    const region = new StrokeDirtyRegion();
    region.track((t) => {
      t.current = box(0, 0, 10, 10);
    });
    region.reset();
    expect(region.strokeRect).toBeNull();
    expect(region.takeFrameRect()).toBeNull();
  });
});
