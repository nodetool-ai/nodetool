import { VISIBLE_ELEMENTS_NODE_THRESHOLD } from "../../config/constants";
import { shouldRenderVisibleElements } from "../renderVisibility";

describe("shouldRenderVisibleElements", () => {
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
});
