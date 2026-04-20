import { describe, it, expect } from "vitest";
import {
  ScreenCaptureInput,
  ScreenFindInput,
  MouseMoveInput,
  MouseClickInput,
  MouseDragInput,
  MouseScrollInput,
  KeyPressInput,
  KeyTypeInput
} from "../src/schemas/index.js";

describe("desktop schemas", () => {
  it("accepts screen_capture with no args", () => {
    const parsed = ScreenCaptureInput.parse({});
    expect(parsed.format).toBeUndefined();
  });

  it("rejects screen_capture with zero-size region", () => {
    expect(() =>
      ScreenCaptureInput.parse({
        region: { x: 0, y: 0, width: 0, height: 100 }
      })
    ).toThrow();
  });

  it("requires non-empty query on screen_find", () => {
    expect(() => ScreenFindInput.parse({ query: "" })).toThrow();
  });

  it("accepts mouse_move with integer coords", () => {
    const parsed = MouseMoveInput.parse({ x: 500, y: 400 });
    expect(parsed.x).toBe(500);
  });

  it("rejects mouse_click with count <= 0", () => {
    expect(() =>
      MouseClickInput.parse({ x: 0, y: 0, count: 0 })
    ).toThrow();
  });

  it("accepts mouse_drag with all required coords", () => {
    const parsed = MouseDragInput.parse({
      from_x: 0,
      from_y: 0,
      to_x: 100,
      to_y: 100,
      button: "left"
    });
    expect(parsed.button).toBe("left");
  });

  it("rejects mouse_click with unknown button", () => {
    expect(() =>
      MouseClickInput.parse({ x: 0, y: 0, button: "scroll" })
    ).toThrow();
  });

  it("requires mouse_scroll dy", () => {
    expect(() => MouseScrollInput.parse({ x: 0, y: 0 })).toThrow();
  });

  it("requires non-empty keys on key_press", () => {
    expect(() => KeyPressInput.parse({ keys: "" })).toThrow();
  });

  it("accepts empty text on key_type", () => {
    const parsed = KeyTypeInput.parse({ text: "" });
    expect(parsed.text).toBe("");
  });
});
