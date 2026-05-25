import {
  IDLE,
  hasTargets,
  isArmed,
  isDragging,
  isDraggingHandle,
  isDraggingPivot,
  isIdle,
  type TransformToolState,
  type TransformTargets
} from "../state";
import { IDENTITY_AFFINE, makeAffineTransform } from "../../types";

const targets: TransformTargets = {
  layerIds: ["a"],
  rasterBounds: { x: 0, y: 0, width: 10, height: 10 },
  originalTransform: makeAffineTransform({ x: 0, y: 0 }),
  pivot: null
};

const armed: TransformToolState = { kind: "armed", targets };
const draggingPivot: TransformToolState = {
  kind: "draggingPivot",
  targets,
  dragStart: { x: 1, y: 2 },
  dragStartTransform: { ...IDENTITY_AFFINE }
};
const draggingHandle: TransformToolState = {
  kind: "draggingHandle",
  targets,
  gesture: {
    handle: "move",
    dragStart: { x: 0, y: 0 },
    dragStartTransform: { ...IDENTITY_AFFINE },
    dragStartCorners: null,
    center: { x: 5, y: 5 },
    pivotAtMoveStart: null,
    multi: null
  }
};

describe("TransformToolState type guards", () => {
  it("IDLE has kind 'idle'", () => {
    expect(IDLE.kind).toBe("idle");
  });

  it("isIdle narrows only the idle state", () => {
    expect(isIdle(IDLE)).toBe(true);
    expect(isIdle(armed)).toBe(false);
    expect(isIdle(draggingPivot)).toBe(false);
    expect(isIdle(draggingHandle)).toBe(false);
  });

  it("isArmed narrows only the armed state", () => {
    expect(isArmed(IDLE)).toBe(false);
    expect(isArmed(armed)).toBe(true);
    expect(isArmed(draggingPivot)).toBe(false);
    expect(isArmed(draggingHandle)).toBe(false);
  });

  it("hasTargets excludes idle, includes the rest", () => {
    expect(hasTargets(IDLE)).toBe(false);
    expect(hasTargets(armed)).toBe(true);
    expect(hasTargets(draggingPivot)).toBe(true);
    expect(hasTargets(draggingHandle)).toBe(true);
  });

  it("isDragging covers both drag kinds", () => {
    expect(isDragging(IDLE)).toBe(false);
    expect(isDragging(armed)).toBe(false);
    expect(isDragging(draggingPivot)).toBe(true);
    expect(isDragging(draggingHandle)).toBe(true);
  });

  it("isDraggingHandle narrows draggingHandle only", () => {
    expect(isDraggingHandle(draggingHandle)).toBe(true);
    expect(isDraggingHandle(draggingPivot)).toBe(false);
    expect(isDraggingHandle(armed)).toBe(false);
    expect(isDraggingHandle(IDLE)).toBe(false);
  });

  it("isDraggingPivot narrows draggingPivot only", () => {
    expect(isDraggingPivot(draggingPivot)).toBe(true);
    expect(isDraggingPivot(draggingHandle)).toBe(false);
    expect(isDraggingPivot(armed)).toBe(false);
    expect(isDraggingPivot(IDLE)).toBe(false);
  });
});
