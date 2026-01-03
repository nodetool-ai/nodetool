import { renderHook } from "@testing-library/react";
import { Viewport } from "@xyflow/react";

describe("useReactFlowEvents", () => {
  const mockSetViewport = jest.fn();
  const mockCloseNodeMenu = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.doMock("../../../contexts/NodeContext", () => ({
      useNodes: jest.fn(() => ({ setViewport: mockSetViewport }))
    }));
    jest.doMock("../../../stores/NodeMenuStore", () => ({
      default: jest.fn(() => ({ closeNodeMenu: mockCloseNodeMenu }))
    }));
  });

  afterEach(() => {
    jest.resetModules();
  });

  it("returns handleMoveEnd and handleOnMoveStart functions", async () => {
    const { useReactFlowEvents } = await import("../useReactFlowEvents");
    const { result } = renderHook(() => useReactFlowEvents());
    expect(result.current.handleMoveEnd).toBeDefined();
    expect(result.current.handleOnMoveStart).toBeDefined();
  });

  describe("handleMoveEnd", () => {
    it("calls setViewport with the viewport", async () => {
      const { useReactFlowEvents } = await import("../useReactFlowEvents");
      const { result } = renderHook(() => useReactFlowEvents());
      const viewport: Viewport = { x: 100, y: 200, zoom: 1.5 };
      const event = {} as any;

      result.current.handleMoveEnd(event, viewport);

      expect(mockSetViewport).toHaveBeenCalledWith(viewport);
    });
  });

  describe("handleOnMoveStart", () => {
    it("calls closeNodeMenu when event type is pan", async () => {
      const { useReactFlowEvents } = await import("../useReactFlowEvents");
      const { result } = renderHook(() => useReactFlowEvents());
      const event = { type: "pan" } as any;

      result.current.handleOnMoveStart(event);

      expect(mockCloseNodeMenu).toHaveBeenCalled();
    });

    it("does not call closeNodeMenu for non-pan events", async () => {
      const { useReactFlowEvents } = await import("../useReactFlowEvents");
      const { result } = renderHook(() => useReactFlowEvents());
      const event = { type: "zoom" } as any;

      result.current.handleOnMoveStart(event);

      expect(mockCloseNodeMenu).not.toHaveBeenCalled();
    });
  });
});
