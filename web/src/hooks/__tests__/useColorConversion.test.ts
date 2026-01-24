import { renderHook, act } from "@testing-library/react";
import { useColorConversion } from "../useColorConversion";

describe("useColorConversion", () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  describe("initialization", () => {
    it("initializes with hex color", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      expect(result.current.state.hexInput).toBe("#ff0000");
      expect(result.current.state.rgbInputs).toEqual({ r: 255, g: 0, b: 0 });
      expect(result.current.state.alphaInput).toBe(100);
    });

    it("initializes RGB values from hex", () => {
      const { result } = renderHook(() =>
        useColorConversion("#00ff00", 1.0, mockOnChange)
      );

      expect(result.current.state.rgbInputs).toEqual({ r: 0, g: 255, b: 0 });
    });

    it("initializes HSL values from hex", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      expect(result.current.state.hslInputs.h).toBe(0);
      expect(result.current.state.hslInputs.s).toBe(100);
      expect(result.current.state.hslInputs.l).toBe(50);
    });

    it("initializes with custom alpha", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 0.5, mockOnChange)
      );

      expect(result.current.state.alphaInput).toBe(50);
    });
  });

  describe("hex input handling", () => {
    it("updates hex input value", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleHexChange("#00ff00");
      });

      expect(result.current.state.hexInput).toBe("#00ff00");
    });

    it("calls onChange with valid 6-digit hex", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleHexChange("#00ff00");
      });

      expect(mockOnChange).toHaveBeenCalledWith("#00ff00", 1.0);
    });

    it("calls onChange with valid 3-digit hex", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleHexChange("#0f0");
      });

      expect(mockOnChange).toHaveBeenCalledWith("#0f0", 1.0);
    });

    it("adds # prefix if missing", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleHexChange("00ff00");
      });

      expect(mockOnChange).toHaveBeenCalledWith("#00ff00", 1.0);
    });

    it("does not call onChange with invalid hex", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleHexChange("#gggggg");
      });

      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it("does not call onChange with incomplete hex", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleHexChange("#ff00");
      });

      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  describe("RGB input handling", () => {
    it("updates R component", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleRgbChange("r", "128");
      });

      expect(result.current.state.rgbInputs.r).toBe(128);
      expect(mockOnChange).toHaveBeenCalled();
    });

    it("updates G component", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleRgbChange("g", "200");
      });

      expect(result.current.state.rgbInputs.g).toBe(200);
    });

    it("updates B component", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleRgbChange("b", "64");
      });

      expect(result.current.state.rgbInputs.b).toBe(64);
    });

    it("clamps values to 0-255 range", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleRgbChange("r", "300");
      });

      expect(result.current.state.rgbInputs.r).toBe(255);

      act(() => {
        result.current.handlers.handleRgbChange("g", "-10");
      });

      expect(result.current.state.rgbInputs.g).toBe(0);
    });

    it("handles empty string as 0", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleRgbChange("r", "");
      });

      expect(result.current.state.rgbInputs.r).toBe(0);
    });

    it("converts RGB to hex and calls onChange", () => {
      const { result } = renderHook(() =>
        useColorConversion("#000000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleRgbChange("g", "255");
      });

      const lastCall = mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1];
      expect(lastCall[0]).toBe("#00ff00");
    });
  });

  describe("HSL input handling", () => {
    it("updates H component", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleHslChange("h", "180");
      });

      expect(result.current.state.hslInputs.h).toBe(180);
    });

    it("updates S component", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleHslChange("s", "75");
      });

      expect(result.current.state.hslInputs.s).toBe(75);
    });

    it("updates L component", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleHslChange("l", "60");
      });

      expect(result.current.state.hslInputs.l).toBe(60);
    });

    it("clamps H to 0-360 range", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleHslChange("h", "400");
      });

      expect(result.current.state.hslInputs.h).toBe(360);

      act(() => {
        result.current.handlers.handleHslChange("h", "-10");
      });

      expect(result.current.state.hslInputs.h).toBe(0);
    });

    it("clamps S and L to 0-100 range", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleHslChange("s", "150");
      });

      expect(result.current.state.hslInputs.s).toBe(100);

      act(() => {
        result.current.handlers.handleHslChange("l", "-10");
      });

      expect(result.current.state.hslInputs.l).toBe(0);
    });

    it("converts HSL to hex and calls onChange", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleHslChange("h", "120");
      });

      expect(mockOnChange).toHaveBeenCalled();
      const lastCall = mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1];
      expect(lastCall[0]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  describe("HSB input handling", () => {
    it("updates H component", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleHsbChange("h", "240");
      });

      expect(result.current.state.hsbInputs.h).toBe(240);
    });

    it("updates S component", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleHsbChange("s", "80");
      });

      expect(result.current.state.hsbInputs.s).toBe(80);
    });

    it("updates B component", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleHsbChange("b", "90");
      });

      expect(result.current.state.hsbInputs.b).toBe(90);
    });

    it("clamps H to 0-360 range", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleHsbChange("h", "500");
      });

      expect(result.current.state.hsbInputs.h).toBe(360);
    });

    it("clamps S and B to 0-100 range", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleHsbChange("s", "-5");
      });

      expect(result.current.state.hsbInputs.s).toBe(0);

      act(() => {
        result.current.handlers.handleHsbChange("b", "120");
      });

      expect(result.current.state.hsbInputs.b).toBe(100);
    });

    it("converts HSB to hex and calls onChange", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleHsbChange("h", "240");
      });

      expect(mockOnChange).toHaveBeenCalled();
    });
  });

  describe("CMYK input handling", () => {
    it("updates all CMYK components", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleCmykChange("c", "50");
      });
      expect(result.current.state.cmykInputs.c).toBe(50);

      act(() => {
        result.current.handlers.handleCmykChange("m", "25");
      });
      expect(result.current.state.cmykInputs.m).toBe(25);

      act(() => {
        result.current.handlers.handleCmykChange("y", "75");
      });
      expect(result.current.state.cmykInputs.y).toBe(75);

      act(() => {
        result.current.handlers.handleCmykChange("k", "10");
      });
      expect(result.current.state.cmykInputs.k).toBe(10);
    });

    it("clamps values to 0-100 range", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleCmykChange("c", "150");
      });

      expect(result.current.state.cmykInputs.c).toBe(100);

      act(() => {
        result.current.handlers.handleCmykChange("m", "-20");
      });

      expect(result.current.state.cmykInputs.m).toBe(0);
    });

    it("converts CMYK to hex and calls onChange", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleCmykChange("c", "100");
      });

      expect(mockOnChange).toHaveBeenCalled();
      const lastCall = mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1];
      expect(lastCall[0]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  describe("LAB input handling", () => {
    it("updates all LAB components", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleLabChange("l", "75");
      });
      expect(result.current.state.labInputs.l).toBe(75);

      act(() => {
        result.current.handlers.handleLabChange("a", "50");
      });
      expect(result.current.state.labInputs.a).toBe(50);

      act(() => {
        result.current.handlers.handleLabChange("b", "-30");
      });
      expect(result.current.state.labInputs.b).toBe(-30);
    });

    it("clamps L to 0-100 range", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleLabChange("l", "150");
      });

      expect(result.current.state.labInputs.l).toBe(100);

      act(() => {
        result.current.handlers.handleLabChange("l", "-10");
      });

      expect(result.current.state.labInputs.l).toBe(0);
    });

    it("clamps A and B to -128 to 127 range", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleLabChange("a", "200");
      });

      expect(result.current.state.labInputs.a).toBe(127);

      act(() => {
        result.current.handlers.handleLabChange("b", "-200");
      });

      expect(result.current.state.labInputs.b).toBe(-128);
    });

    it("converts LAB to hex and calls onChange", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleLabChange("l", "50");
      });

      expect(mockOnChange).toHaveBeenCalled();
    });
  });

  describe("alpha input handling", () => {
    it("updates alpha value", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleAlphaChange("50");
      });

      expect(result.current.state.alphaInput).toBe(50);
      expect(mockOnChange).toHaveBeenCalledWith("#ff0000", 0.5);
    });

    it("clamps alpha to 0-100 range", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleAlphaChange("150");
      });

      expect(result.current.state.alphaInput).toBe(100);

      act(() => {
        result.current.handlers.handleAlphaChange("-10");
      });

      expect(result.current.state.alphaInput).toBe(0);
    });

    it("converts percentage to 0-1 range", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleAlphaChange("25");
      });

      expect(mockOnChange).toHaveBeenCalledWith("#ff0000", 0.25);

      act(() => {
        result.current.handlers.handleAlphaChange("75");
      });

      expect(mockOnChange).toHaveBeenCalledWith("#ff0000", 0.75);
    });

    it("handles empty string as 0", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      act(() => {
        result.current.handlers.handleAlphaChange("");
      });

      expect(result.current.state.alphaInput).toBe(0);
      expect(mockOnChange).toHaveBeenCalledWith("#ff0000", 0);
    });
  });

  describe("external color changes", () => {
    it("updates all color formats when color prop changes", () => {
      const { result, rerender } = renderHook(
        ({ color, alpha }) => useColorConversion(color, alpha, mockOnChange),
        { initialProps: { color: "#ff0000", alpha: 1.0 } }
      );

      rerender({ color: "#00ff00", alpha: 1.0 });

      expect(result.current.state.hexInput).toBe("#00ff00");
      expect(result.current.state.rgbInputs).toEqual({ r: 0, g: 255, b: 0 });
    });

    it("updates alpha input when alpha prop changes", () => {
      const { result, rerender } = renderHook(
        ({ color, alpha }) => useColorConversion(color, alpha, mockOnChange),
        { initialProps: { color: "#ff0000", alpha: 1.0 } }
      );

      rerender({ color: "#ff0000", alpha: 0.3 });

      expect(result.current.state.alphaInput).toBe(30);
    });
  });

  describe("callback stability", () => {
    it("returns stable handler references", () => {
      const { result, rerender } = renderHook(() =>
        useColorConversion("#ff0000", 1.0, mockOnChange)
      );

      const handlers1 = result.current.handlers;

      rerender();

      const handlers2 = result.current.handlers;

      // Handlers should maintain stable references when dependencies don't change
      expect(handlers1.handleHexChange).toBe(handlers2.handleHexChange);
      expect(handlers1.handleAlphaChange).toBe(handlers2.handleAlphaChange);
    });
  });

  describe("edge cases", () => {
    it("handles uppercase hex values", () => {
      const { result } = renderHook(() =>
        useColorConversion("#FF0000", 1.0, mockOnChange)
      );

      expect(result.current.state.hexInput).toBe("#FF0000");
    });

    it("handles black color", () => {
      const { result } = renderHook(() =>
        useColorConversion("#000000", 1.0, mockOnChange)
      );

      expect(result.current.state.rgbInputs).toEqual({ r: 0, g: 0, b: 0 });
    });

    it("handles white color", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ffffff", 1.0, mockOnChange)
      );

      expect(result.current.state.rgbInputs).toEqual({ r: 255, g: 255, b: 255 });
    });

    it("handles zero alpha", () => {
      const { result } = renderHook(() =>
        useColorConversion("#ff0000", 0, mockOnChange)
      );

      expect(result.current.state.alphaInput).toBe(0);
    });
  });
});
