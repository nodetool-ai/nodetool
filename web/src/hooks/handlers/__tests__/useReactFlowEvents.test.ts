import { renderHook } from "@testing-library/react";
import { Viewport } from "@xyflow/react";
import { useReactFlowEvents } from "../useReactFlowEvents";
import { useNodes } from "../../../contexts/NodeContext";
import useNodeMenuStore from "../../../stores/NodeMenuStore";

jest.mock("../../../contexts/NodeContext");
jest.mock("../../../stores/NodeMenuStore");

describe("useReactFlowEvents", () => {
  const mockSetViewport = jest.fn();
  const mockCloseNodeMenu = jest.fn();

  const mockedUseNodes = useNodes as unknown as jest.Mock;
  const mockedUseNodeMenuStore = useNodeMenuStore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseNodes.mockImplementation((selector) => {
      const state = {
        setViewport: mockSetViewport,
        edges: [],
        nodes: []
      };
      return selector(state);
    });
    mockedUseNodeMenuStore.mockImplementation((selector) => {
      const state = {
        closeNodeMenu: mockCloseNodeMenu
      };
      return selector(state);
    });
  });

  it("returns handleMoveEnd and handleOnMoveStart functions", () => {
    const { result } = renderHook(() => useReactFlowEvents());
    expect(result.current.handleMoveEnd).toBeDefined();
    expect(result.current.handleOnMoveStart).toBeDefined();
  });

  describe("handleMoveEnd", () => {
    it("calls setViewport with the viewport", () => {
      const { result } = renderHook(() => useReactFlowEvents());
      const viewport: Viewport = { x: 100, y: 200, zoom: 1.5 };
      const event = {} as any;

      result.current.handleMoveEnd(event, viewport);

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
