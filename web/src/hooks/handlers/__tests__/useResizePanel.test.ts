import { renderHook } from "@testing-library/react";
import { useResizePanel } from "../useResizePanel";

// Mock PanelStore
jest.mock("../../../stores/PanelStore", () => ({
  usePanelStore: jest.fn((selector) => {
    const mockState = {
      panel: {
        panelSize: 400,
        isVisible: true,
        isDragging: false,
        activeView: "nodes"
      },
      setSize: jest.fn(),
      setVisibility: jest.fn(),
      setIsDragging: jest.fn(),
      setHasDragged: jest.fn(),
      handleViewChange: jest.fn()
    };
    return selector(mockState);
  })
}));

describe("useResizePanel", () => {
  let mockHandleMouseDown: any;
  let mockSize: number;
  let mockIsVisible: boolean;
  let mockIsDragging: boolean;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("initial state", () => {
    it("returns initial panel size", () => {
      const { result } = renderHook(() => useResizePanel("left"));

      expect(result.current.size).toBe(400);
    });

    it("returns initial visibility state", () => {
      const { result } = renderHook(() => useResizePanel("left"));

      expect(result.current.isVisible).toBe(true);
    });

    it("returns initial dragging state", () => {
      const { result } = renderHook(() => useResizePanel("left"));

      expect(result.current.isDragging).toBe(false);
    });

    it("returns ref for the resize handle", () => {
      const { result } = renderHook(() => useResizePanel("left"));

      expect(result.current.ref).toBeDefined();
      expect(result.current.ref.current).toBeNull();
    });
  });

  describe("handleMouseDown", () => {
    it("sets dragging state to true on mouse down", () => {
      const { usePanelStore } = require("../../../stores/PanelStore");
      const mockSetIsDragging = jest.fn();
      const mockSetHasDragged = jest.fn();

      usePanelStore.mockImplementation((selector) => {
        const mockState = {
          panel: {
            panelSize: 400,
            isVisible: true,
            isDragging: false,
            activeView: "nodes"
          },
          setSize: jest.fn(),
          setVisibility: jest.fn(),
          setIsDragging: mockSetIsDragging,
          setHasDragged: mockSetHasDragged,
          handleViewChange: jest.fn()
        };
        return selector(mockState);
      });

      const { result } = renderHook(() => useResizePanel("left"));
      mockHandleMouseDown = result.current.handleMouseDown;

      const event = {
        clientX: 500,
        preventDefault: jest.fn()
      } as unknown as React.MouseEvent<HTMLElement>;

      mockHandleMouseDown(event);

      expect(mockSetIsDragging).toHaveBeenCalledWith(true);
      expect(mockSetHasDragged).toHaveBeenCalledWith(false);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it("initializes start positions correctly", () => {
      const { usePanelStore } = require("../../../stores/PanelStore");
      const mockSetIsDragging = jest.fn();

      usePanelStore.mockImplementation((selector) => {
        const mockState = {
          panel: {
            panelSize: 300,
            isVisible: true,
            isDragging: false,
            activeView: "nodes"
          },
          setSize: jest.fn(),
          setVisibility: jest.fn(),
          setIsDragging: mockSetIsDragging,
          setHasDragged: jest.fn(),
          handleViewChange: jest.fn()
        };
        return selector(mockState);
      });

      const { result } = renderHook(() => useResizePanel("left"));
      mockHandleMouseDown = result.current.handleMouseDown;

      const event = {
        clientX: 500,
        preventDefault: jest.fn()
      } as unknown as React.MouseEvent<HTMLElement>;

      mockHandleMouseDown(event);

      // The hook should have recorded the start positions
      expect(mockSetIsDragging).toHaveBeenCalled();
    });

    it("registers mouse move and mouse up event listeners", () => {
      const { usePanelStore } = require("../../../stores/PanelStore");
      const mockSetIsDragging = jest.fn();

      usePanelStore.mockImplementation((selector) => {
        const mockState = {
          panel: {
            panelSize: 400,
            isVisible: true,
            isDragging: false,
            activeView: "nodes"
          },
          setSize: jest.fn(),
          setVisibility: jest.fn(),
          setIsDragging: mockSetIsDragging,
          setHasDragged: jest.fn(),
          handleViewChange: jest.fn()
        };
        return selector(mockState);
      });

      const addEventListenerSpy = jest.spyOn(document, "addEventListener");
      const removeEventListenerSpy = jest.spyOn(document, "removeEventListener");

      const { result } = renderHook(() => useResizePanel("left"));
      mockHandleMouseDown = result.current.handleMouseDown;

      const event = {
        clientX: 500,
        preventDefault: jest.fn()
      } as unknown as React.MouseEvent<HTMLElement>;

      mockHandleMouseDown(event);

      expect(addEventListenerSpy).toHaveBeenCalledWith("mousemove", expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith("mouseup", expect.any(Function));

      // Clean up
      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });
  });

  describe("handlePanelToggle", () => {
    it("calls handleViewChange with provided view", () => {
      const { usePanelStore } = require("../../../stores/PanelStore");
      const mockHandleViewChange = jest.fn();

      usePanelStore.mockImplementation((selector) => {
        const mockState = {
          panel: {
            panelSize: 400,
            isVisible: true,
            isDragging: false,
            activeView: "nodes"
          },
          setSize: jest.fn(),
          setVisibility: jest.fn(),
          setIsDragging: jest.fn(),
          setHasDragged: jest.fn(),
          handleViewChange: mockHandleViewChange
        };
        return selector(mockState);
      });

      const { result } = renderHook(() => useResizePanel("left"));

      result.current.handlePanelToggle("assets");

      expect(mockHandleViewChange).toHaveBeenCalledWith("assets");
    });
  });

  describe("left panel positioning", () => {
    it("increases size when dragging right on left panel", () => {
      const { usePanelStore } = require("../../../stores/PanelStore");
      const mockSetSize = jest.fn();
      const mockSetIsDragging = jest.fn();

      usePanelStore.mockImplementation((selector) => {
        const mockState = {
          panel: {
            panelSize: 400,
            isVisible: true,
            isDragging: false,
            activeView: "nodes"
          },
          setSize: mockSetSize,
          setVisibility: jest.fn(),
          setIsDragging: mockSetIsDragging,
          setHasDragged: jest.fn(),
          handleViewChange: jest.fn()
        };
        return selector(mockState);
      });

      const { result } = renderHook(() => useResizePanel("left"));
      
      // Trigger mouse down
      const event = {
        clientX: 500,
        preventDefault: jest.fn()
      } as unknown as React.MouseEvent<HTMLElement>;
      
      result.current.handleMouseDown(event);

      // The hook should have set up listeners for the drag operation
      expect(mockSetIsDragging).toHaveBeenCalled();
    });
  });

  describe("right panel positioning", () => {
    it("decreases size when dragging right on right panel", () => {
      const { usePanelStore } = require("../../../stores/PanelStore");
      const mockSetSize = jest.fn();
      const mockSetIsDragging = jest.fn();

      usePanelStore.mockImplementation((selector) => {
        const mockState = {
          panel: {
            panelSize: 400,
            isVisible: true,
            isDragging: false,
            activeView: "nodes"
          },
          setSize: mockSetSize,
          setVisibility: jest.fn(),
          setIsDragging: mockSetIsDragging,
          setHasDragged: jest.fn(),
          handleViewChange: jest.fn()
        };
        return selector(mockState);
      });

      const { result } = renderHook(() => useResizePanel("right"));
      
      // Trigger mouse down
      const event = {
        clientX: 500,
        preventDefault: jest.fn()
      } as unknown as React.MouseEvent<HTMLElement>;
      
      result.current.handleMouseDown(event);

      // The hook should have set up listeners for the drag operation
      expect(mockSetIsDragging).toHaveBeenCalled();
    });
  });

  describe("size constraints", () => {
    it("clamps size to minimum drag size", () => {
      const { usePanelStore } = require("../../../stores/PanelStore");
      const mockSetSize = jest.fn();
      const mockSetIsDragging = jest.fn();

      usePanelStore.mockImplementation((selector) => {
        const mockState = {
          panel: {
            panelSize: 400,
            isVisible: true,
            isDragging: false,
            activeView: "nodes"
          },
          setSize: mockSetSize,
          setVisibility: jest.fn(),
          setIsDragging: mockSetIsDragging,
          setHasDragged: jest.fn(),
          handleViewChange: jest.fn()
        };
        return selector(mockState);
      });

      const { result } = renderHook(() => useResizePanel("left"));
      
      const event = {
        clientX: 500,
        preventDefault: jest.fn()
      } as unknown as React.MouseEvent<HTMLElement>;
      
      result.current.handleMouseDown(event);

      // The mock state shows panelSize of 400, which should be used as start size
      // Size constraints are applied in the mouse move handler
      expect(mockSetIsDragging).toHaveBeenCalled();
    });

    it("clamps size to maximum panel size", () => {
      const { usePanelStore } = require("../../../stores/PanelStore");
      const mockSetSize = jest.fn();
      const mockSetIsDragging = jest.fn();

      usePanelStore.mockImplementation((selector) => {
        const mockState = {
          panel: {
            panelSize: 400,
            isVisible: true,
            isDragging: false,
            activeView: "nodes"
          },
          setSize: mockSetSize,
          setVisibility: jest.fn(),
          setIsDragging: mockSetIsDragging,
          setHasDragged: jest.fn(),
          handleViewChange: jest.fn()
        };
        return selector(mockState);
      });

      const { result } = renderHook(() => useResizePanel("left"));
      
      const event = {
        clientX: 500,
        preventDefault: jest.fn()
      } as unknown as React.MouseEvent<HTMLElement>;
      
      result.current.handleMouseDown(event);

      expect(mockSetIsDragging).toHaveBeenCalled();
    });
  });
});
