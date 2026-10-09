import { DisplayFrameCoordinator } from "../DisplayFrameCoordinator";

function setup() {
  const coordinator = new DisplayFrameCoordinator();
  const compositeImmediate = jest.fn();
  coordinator.setCallbacks({ drainPendingStroke: jest.fn(), compositeImmediate });
  return { coordinator, compositeImmediate };
}

describe("DisplayFrameCoordinator", () => {
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    rafCallbacks = [];
    jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => rafCallbacks.push(cb));
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("composites only the dirty rect for a buffered-stroke move", () => {
    const { coordinator, compositeImmediate } = setup();
    coordinator.requestFrame("paint-move", "immediate", { x: 10, y: 10, w: 5, h: 5 });
    expect(compositeImmediate).toHaveBeenCalledWith({ x: 10, y: 10, w: 5, h: 5 });
  });

  it("covers a cancelled rAF's dirty rect in the immediate frame", () => {
    const { coordinator, compositeImmediate } = setup();
    coordinator.requestFrame("layer-effect", "raf", { x: 0, y: 0, w: 4, h: 4 });
    coordinator.requestFrame("paint-move", "immediate", { x: 10, y: 10, w: 5, h: 5 });
    expect(compositeImmediate).toHaveBeenCalledTimes(1);
    expect(compositeImmediate).toHaveBeenCalledWith({ x: 0, y: 0, w: 15, h: 15 });
  });

  it("runs a full composite when the cancelled rAF was a full redraw", () => {
    const { coordinator, compositeImmediate } = setup();
    coordinator.requestFrame("viewport-change", "raf");
    coordinator.requestFrame("paint-move", "immediate", { x: 10, y: 10, w: 5, h: 5 });
    expect(compositeImmediate).toHaveBeenCalledWith(null);
    expect(rafCallbacks).toHaveLength(1);
  });

  it("coalesces rAF dirty rects into one composite", () => {
    const { coordinator, compositeImmediate } = setup();
    coordinator.requestFrame("paint-move", "raf", { x: 0, y: 0, w: 2, h: 2 });
    coordinator.requestFrame("paint-move", "raf", { x: 8, y: 8, w: 2, h: 2 });
    rafCallbacks[0](0);
    expect(compositeImmediate).toHaveBeenCalledTimes(1);
    expect(compositeImmediate).toHaveBeenCalledWith({ x: 0, y: 0, w: 10, h: 10 });
  });
});
