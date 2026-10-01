import {
  MENTION_MENU_MAX_HEIGHT,
  mentionMenuPosition
} from "../mentionMenuPosition";

const rectAt = (top: number, height = 80): DOMRect =>
  ({
    top,
    bottom: top + height,
    left: 40,
    right: 640,
    width: 600,
    height,
    x: 40,
    y: top,
    toJSON: () => ({})
  }) as DOMRect;

describe("mentionMenuPosition", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 900
    });
  });

  it("opens upward above a composer at the foot of the panel", () => {
    const style = mentionMenuPosition(rectAt(780));
    expect(style.bottom).toBe(900 - 780 + 6);
    expect(style.top).toBeUndefined();
  });

  it("opens downward below a prompt near the top of the viewport", () => {
    const style = mentionMenuPosition(rectAt(160));
    expect(style.top).toBe(160 + 80 + 6);
    expect(style.bottom).toBeUndefined();
  });

  it("opens upward whenever the full menu fits above", () => {
    const style = mentionMenuPosition(rectAt(MENTION_MENU_MAX_HEIGHT + 20, 600));
    expect(style.bottom).toBeDefined();
  });
});
