import { renderHook, act } from "@testing-library/react";
import { useMiniMapStore } from "../MiniMapStore";

describe("MiniMapStore", () => {
  beforeEach(() => {
    useMiniMapStore.setState({
      visible: false,
      zoomLevel: 1
    });
  });

  describe("visibility", () => {
    it("should have default visible as false", () => {
      const { result } = renderHook(() => useMiniMapStore());
      expect(result.current.visible).toBe(false);
    });

    it("should toggle visibility", () => {
      const { result } = renderHook(() => useMiniMapStore());

      act(() => {
        result.current.toggleVisible();
      });
      expect(result.current.visible).toBe(true);

      act(() => {
        result.current.toggleVisible();
      });
      expect(result.current.visible).toBe(false);
    });

    it("should set visibility", () => {
      const { result } = renderHook(() => useMiniMapStore());

      act(() => {
        result.current.setVisible(true);
      });
      expect(result.current.visible).toBe(true);

      act(() => {
        result.current.setVisible(false);
      });
      expect(result.current.visible).toBe(false);
    });
  });

  describe("zoom level", () => {
    it("should have default zoomLevel as 1", () => {
      const { result } = renderHook(() => useMiniMapStore());
      expect(result.current.zoomLevel).toBe(1);
    });

    it("should set zoom level", () => {
      const { result } = renderHook(() => useMiniMapStore());

      act(() => {
        result.current.setZoomLevel(1.5);
      });
      expect(result.current.zoomLevel).toBe(1.5);
    });

    it("should clamp zoom level to minimum", () => {
      const { result } = renderHook(() => useMiniMapStore());

      act(() => {
        result.current.setZoomLevel(0.1);
      });
      expect(result.current.zoomLevel).toBe(0.5);
    });

    it("should clamp zoom level to maximum", () => {
      const { result } = renderHook(() => useMiniMapStore());

      act(() => {
        result.current.setZoomLevel(5);
      });
      expect(result.current.zoomLevel).toBe(2);
    });

    it("should zoom in", () => {
      const { result } = renderHook(() => useMiniMapStore());

      act(() => {
        result.current.zoomIn();
      });
      expect(result.current.zoomLevel).toBeCloseTo(1.1);

      act(() => {
        result.current.zoomIn();
      });
      expect(result.current.zoomLevel).toBeCloseTo(1.2);
    });

    it("should zoom out", () => {
      const { result } = renderHook(() => useMiniMapStore());

      act(() => {
        result.current.zoomOut();
      });
      expect(result.current.zoomLevel).toBe(0.9);

      act(() => {
        result.current.zoomOut();
      });
      expect(result.current.zoomLevel).toBe(0.8);
    });

    it("should reset zoom", () => {
      const { result } = renderHook(() => useMiniMapStore());

      act(() => {
        result.current.setZoomLevel(1.5);
      });
      expect(result.current.zoomLevel).toBe(1.5);

      act(() => {
        result.current.resetZoom();
      });
      expect(result.current.zoomLevel).toBe(1);
    });

    it("should not zoom in beyond maximum", () => {
      const { result } = renderHook(() => useMiniMapStore());

      act(() => {
        result.current.setZoomLevel(1.9);
      });

      act(() => {
        result.current.zoomIn();
      });
      expect(result.current.zoomLevel).toBe(2);
    });

    it("should not zoom out beyond minimum", () => {
      const { result } = renderHook(() => useMiniMapStore());

      act(() => {
        result.current.setZoomLevel(0.6);
      });

      act(() => {
        result.current.zoomOut();
      });
      expect(result.current.zoomLevel).toBe(0.5);
    });
  });
});
