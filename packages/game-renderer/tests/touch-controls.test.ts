import { describe, expect, it } from "vitest";
import { stickActions } from "../src/touch-controls.js";

describe("touch controls", () => {
  it("maps a stick offset to eight-way directions with screen y pointing down", () => {
    expect(stickActions(40, 0, 10)).toEqual(["right"]);
    expect(stickActions(0, -40, 10)).toEqual(["up"]);
    expect(stickActions(-30, 30, 10)).toEqual(["left", "down"]);
    expect(stickActions(40, -8, 10)).toEqual(["right"]);
  });

  it("presses nothing inside the dead zone", () => {
    expect(stickActions(3, 4, 10)).toEqual([]);
    expect(stickActions(0, 0, 0)).toEqual([]);
  });
});
