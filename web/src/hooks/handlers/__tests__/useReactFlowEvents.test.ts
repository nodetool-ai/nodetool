import { renderHook, act } from "@testing-library/react";
import { Viewport } from "@xyflow/react";
import { useReactFlowEvents } from "../useReactFlowEvents";

jest.mock("@xyflow/react");

const mockSetViewport = jest.fn();
const mockCloseNodeMenu = jest.fn();

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn((selector) => {
    if (typeof selector === 'function') {
      return selector({ setViewport: mockSetViewport });
    }
    return { setViewport: mockSetViewport };
  })
}));

jest.mock("../../../stores/NodeMenuStore", () => ({
  default: jest.fn((selector) => {
    if (typeof selector === 'function') {
      return selector({ closeNodeMenu: mockCloseNodeMenu });
    }
    return { closeNodeMenu: mockCloseNodeMenu };
  })
}));

describe("useReactFlowEvents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("returns handleMoveEnd and handleOnMoveStart functions", () => {
    const { result } = renderHook(() => useReactFlowEvents());
    expect(result.current.handleMoveEnd).toBeDefined();
    expect(result.current.handleOnMoveStart).toBeDefined();
  });

  describe("handleMoveEnd", () => {
    it("calls setViewport with the viewport after debounce", () => {
      const { result } = renderHook(() => useReactFlowEvents());
      const viewport: Viewport = { x: 100, y: 200, zoom: 1.5 };
      const event = {} as any;

      act(() => {
        result.current.handleMoveEnd(event, viewport);
      });
      expect(mockSetViewport).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(mockSetViewport).toHaveBeenCalledWith(viewport);
    });
  });

  describe("handleOnMoveStart", () => {
    it("calls closeNodeMenu when event type is pan", () => {
      const { result } = renderHook(() => useReactFlowEvents());
      const event = { type: "pan" } as any;

      result.current.handleOnMoveStart(event);

      expect(mockCloseNodeMenu).toHaveBeenCalled();
    });

    it("does not call closeNodeMenu for non-pan events", () => {
      const { result } = renderHook(() => useReactFlowEvents());
      const event = { type: "zoom" } as any;

      result.current.handleOnMoveStart(event);

      expect(mockCloseNodeMenu).not.toHaveBeenCalled();
    });
  });
});
