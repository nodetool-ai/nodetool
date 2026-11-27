import {
  focalLengthMmToFovDeg,
  fovDegToFocalLengthMm,
  type Model3DFreeCameraPose
} from "@nodetool-ai/timeline";

import {
  MAX_FREE_LENS_MM,
  MIN_FREE_DISTANCE,
  formatFreePose,
  freeDollyFromWheel,
  freeLensFromWheel,
  freeOrbitFromDrag,
  freeTruckFromDrag
} from "../model3dFreeCameraGesture";

const pose = (over: Partial<Model3DFreeCameraPose> = {}): Model3DFreeCameraPose => ({
  position: [0, 1, 5],
  target: [0, 1, 0],
  rollDeg: 0,
  fovDeg: 90,
  ...over
});

const expectVec = (actual: readonly number[], expected: readonly number[]) => {
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 6));
};

const distance = (p: Model3DFreeCameraPose) =>
  Math.hypot(
    p.position[0] - p.target[0],
    p.position[1] - p.target[1],
    p.position[2] - p.target[2]
  );

describe("freeOrbitFromDrag", () => {
  it("turns the eye a quarter circle around the target for a quarter frame height", () => {
    const next = freeOrbitFromDrag(pose(), 100, 0, 400);
    expectVec(next.position, [-5, 1, 0]);
    expectVec(next.target, [0, 1, 0]);
  });

  it("raises the eye on a downward drag and keeps the distance", () => {
    const next = freeOrbitFromDrag(pose(), 0, 50, 400);
    expect(next.position[1]).toBeGreaterThan(1);
    expect(distance(next)).toBeCloseTo(5, 6);
  });

  it("stops one degree short of the pole", () => {
    const next = freeOrbitFromDrag(pose(), 0, 4000, 400);
    const rise = next.position[1] - next.target[1];
    expect(Math.asin(rise / 5) * (180 / Math.PI)).toBeCloseTo(89, 6);
  });

  it("keeps roll and lens", () => {
    const next = freeOrbitFromDrag(pose({ rollDeg: 12, fovDeg: 40 }), 30, 10, 400);
    expect(next.rollDeg).toBe(12);
    expect(next.fovDeg).toBe(40);
  });
});

describe("freeTruckFromDrag", () => {
  it("slides eye and target together so the picture follows the pointer", () => {
    // fov 90 at distance 5: the frame is 10 units tall, so 40 px of 400 is 1 unit.
    const next = freeTruckFromDrag(pose(), 40, 0, 400);
    expectVec(next.position, [-1, 1, 5]);
    expectVec(next.target, [-1, 1, 0]);
  });

  it("moves the camera up for a downward drag", () => {
    const next = freeTruckFromDrag(pose(), 0, 40, 400);
    expectVec(next.position, [0, 2, 5]);
    expectVec(next.target, [0, 2, 0]);
  });

  it("follows the rolled picture axes", () => {
    // Rolled 90 degrees the picture's right is world up or down, never X.
    const next = freeTruckFromDrag(pose({ rollDeg: 90 }), 40, 0, 400);
    expect(next.position[0]).toBeCloseTo(0, 6);
    expect(Math.abs(next.position[1] - 1)).toBeCloseTo(1, 6);
  });
});

describe("freeDollyFromWheel", () => {
  it("moves the eye toward the target when scrolling up", () => {
    const next = freeDollyFromWheel(pose(), -100);
    expect(distance(next)).toBeCloseTo(5 * 0.95, 6);
    expectVec(next.target, [0, 1, 0]);
  });

  it("moves away when scrolling down, and undoes the same notch", () => {
    const out = freeDollyFromWheel(pose(), 100);
    expect(distance(out)).toBeGreaterThan(5);
    expect(distance(freeDollyFromWheel(out, -100))).toBeCloseTo(5, 6);
  });

  it("never reaches the target", () => {
    const next = freeDollyFromWheel(pose(), -1e6);
    expect(distance(next)).toBeCloseTo(MIN_FREE_DISTANCE, 9);
  });
});

describe("freeLensFromWheel", () => {
  it("lengthens the lens when scrolling up and leaves the eye alone", () => {
    const start = pose({ fovDeg: focalLengthMmToFovDeg(35) });
    const next = freeLensFromWheel(start, -100);
    expect(fovDegToFocalLengthMm(next.fovDeg)).toBeCloseTo(35 / 0.95, 6);
    expectVec(next.position, start.position);
  });

  it("clamps the lens", () => {
    const next = freeLensFromWheel(pose(), -1e6);
    expect(fovDegToFocalLengthMm(next.fovDeg)).toBeCloseTo(MAX_FREE_LENS_MM, 6);
  });
});

describe("formatFreePose", () => {
  it("names the eye and the lens", () => {
    expect(formatFreePose(pose({ fovDeg: focalLengthMmToFovDeg(35) }))).toBe(
      "Eye 0.00, 1.00, 5.00 · Lens 35 mm"
    );
  });
});
