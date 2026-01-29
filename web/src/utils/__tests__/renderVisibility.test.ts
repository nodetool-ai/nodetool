import { VISIBLE_ELEMENTS_NODE_THRESHOLD } from "../../config/constants";
import { shouldRenderVisibleElements } from "../renderVisibility";

describe("shouldRenderVisibleElements", () => {
  it("returns false for zero nodes", () => {
    expect(shouldRenderVisibleElements(0)).toBe(false);
  });

  it("returns false below the threshold", () => {
    expect(
      shouldRenderVisibleElements(VISIBLE_ELEMENTS_NODE_THRESHOLD - 1)
    ).toBe(false);
  });

  it("returns true at the threshold", () => {
    expect(
      shouldRenderVisibleElements(VISIBLE_ELEMENTS_NODE_THRESHOLD)
    ).toBe(true);
  });

  it("returns true well above the threshold", () => {
    expect(shouldRenderVisibleElements(200)).toBe(true);
    expect(shouldRenderVisibleElements(1000)).toBe(true);
  });

  it("returns false for negative values", () => {
    expect(shouldRenderVisibleElements(-1)).toBe(false);
  });
});
