/**
 * @jest-environment node
 */
import { cursorForHandle, ROTATE_CURSOR_CSS } from "../cursorMapping";

describe("cursorForHandle", () => {
  it('returns "default" for null handle', () => {
    expect(cursorForHandle(null, 0)).toBe("default");
  });

  it('returns "move" for the move handle', () => {
    expect(cursorForHandle("move", 0)).toBe("move");
  });

  it("returns the rotate cursor for the rotate handle", () => {
    expect(cursorForHandle("rotate", 0)).toBe(ROTATE_CURSOR_CSS);
  });

  it('returns "crosshair" for the pivot handle', () => {
    expect(cursorForHandle("pivot", 0)).toBe("crosshair");
  });

  describe("directional scale handles at 0 rotation", () => {
    it('returns "ns-resize" for top handle', () => {
      expect(cursorForHandle("top", 0)).toBe("ns-resize");
    });

    it('returns "nesw-resize" for top-right handle', () => {
      expect(cursorForHandle("top-right", 0)).toBe("nesw-resize");
    });

    it('returns "ew-resize" for right handle', () => {
      expect(cursorForHandle("right", 0)).toBe("ew-resize");
    });

    it('returns "nwse-resize" for bottom-right handle', () => {
      expect(cursorForHandle("bottom-right", 0)).toBe("nwse-resize");
    });

    it('returns "ns-resize" for bottom handle', () => {
      expect(cursorForHandle("bottom", 0)).toBe("ns-resize");
    });

    it('returns "nesw-resize" for bottom-left handle', () => {
      expect(cursorForHandle("bottom-left", 0)).toBe("nesw-resize");
    });

    it('returns "ew-resize" for left handle', () => {
      expect(cursorForHandle("left", 0)).toBe("ew-resize");
    });

    it('returns "nwse-resize" for top-left handle', () => {
      expect(cursorForHandle("top-left", 0)).toBe("nwse-resize");
    });
  });

  describe("rotation affects cursor direction", () => {
    it("rotates top handle cursor by 90 degrees (PI/2 radians)", () => {
      expect(cursorForHandle("top", Math.PI / 2)).toBe("ew-resize");
    });

    it("rotates right handle cursor by 90 degrees", () => {
      expect(cursorForHandle("right", Math.PI / 2)).toBe("ns-resize");
    });
  });
});
