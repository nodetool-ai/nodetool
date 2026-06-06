/**
 * @jest-environment node
 */
import { cursorStyleForTool } from "../sketchCursorStyle";
import type { SketchTool } from "../types";

describe("cursorStyleForTool", () => {
  it('returns "move" for move and transform tools', () => {
    expect(cursorStyleForTool("move")).toBe("move");
    expect(cursorStyleForTool("transform")).toBe("move");
  });

  it('returns "crosshair" for crop, select, and eyedropper tools', () => {
    expect(cursorStyleForTool("crop")).toBe("crosshair");
    expect(cursorStyleForTool("select")).toBe("crosshair");
    expect(cursorStyleForTool("eyedropper")).toBe("crosshair");
  });

  it('returns "none" for drawing tools (brush, pencil, eraser, blur)', () => {
    expect(cursorStyleForTool("brush")).toBe("none");
    expect(cursorStyleForTool("pencil")).toBe("none");
    expect(cursorStyleForTool("eraser")).toBe("none");
    expect(cursorStyleForTool("blur")).toBe("none");
  });

  it('returns "crosshair" as fallback for other tools', () => {
    expect(cursorStyleForTool("fill")).toBe("crosshair");
    expect(cursorStyleForTool("shape")).toBe("crosshair");
    expect(cursorStyleForTool("gradient")).toBe("crosshair");
    expect(cursorStyleForTool("segment")).toBe("crosshair");
    expect(cursorStyleForTool("adjust")).toBe("crosshair");
    expect(cursorStyleForTool("clone_stamp")).toBe("crosshair");
  });

  it('returns "crosshair" for unknown tool values', () => {
    expect(cursorStyleForTool("nonexistent" as SketchTool)).toBe("crosshair");
  });
});
