/**
 * Tests for the canvas/ module barrel exports and hook interfaces.
 */
import { useCompositing } from "../sketchCanvasHooks/useCompositing";
import { useCanvasImperativeHandle } from "../sketchCanvasHooks/useCanvasImperativeHandle";
import { useOverlayRenderer } from "../sketchCanvasHooks/useOverlayRenderer";
import { usePointerHandlers } from "../sketchCanvasHooks/usePointerHandlers";
import { useTransformPreviewBridge } from "../sketchCanvasHooks/useTransformPreviewBridge";
import { useCanvasOrchestration } from "../sketchCanvasHooks/useCanvasOrchestration";

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

  it("exports useTransformPreviewBridge hook", () => {
    expect(typeof useTransformPreviewBridge).toBe("function");
  });

  it("exports useCanvasOrchestration hook", () => {
    expect(typeof useCanvasOrchestration).toBe("function");
  });
});
