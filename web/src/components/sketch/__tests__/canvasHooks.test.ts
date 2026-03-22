/**
 * Tests for the canvas/ module barrel exports and hook interfaces.
 */
import { useCompositing } from "../sketchCanvasHooks/useCompositing";
import { useCanvasImperativeHandle } from "../sketchCanvasHooks/useCanvasImperativeHandle";
import { useOverlayRenderer } from "../sketchCanvasHooks/useOverlayRenderer";
import { usePointerHandlers } from "../sketchCanvasHooks/usePointerHandlers";

describe("canvas module exports", () => {
  it("exports useCompositing hook", () => {
    expect(typeof useCompositing).toBe("function");
  });

  it("exports useCanvasImperativeHandle hook", () => {
    expect(typeof useCanvasImperativeHandle).toBe("function");
  });

  it("exports useOverlayRenderer hook", () => {
    expect(typeof useOverlayRenderer).toBe("function");
  });

  it("exports usePointerHandlers hook", () => {
    expect(typeof usePointerHandlers).toBe("function");
  });
});
