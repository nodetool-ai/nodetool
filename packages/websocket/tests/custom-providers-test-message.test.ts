import { describe, it, expect } from "vitest";
import { describeTestCounts } from "../src/trpc/routers/custom-providers.js";

describe("describeTestCounts", () => {
  it("names each picker that got models", () => {
    expect(describeTestCounts({ language: 12, image: 3, video: 1 })).toBe(
      "12 chat models, 3 image models and 1 video model available."
    );
    expect(describeTestCounts({ language: 1, image: 0, video: 0 })).toBe(
      "1 chat model available."
    );
    expect(describeTestCounts({ language: 0, image: 2, video: 4 })).toBe(
      "2 image models and 4 video models available."
    );
  });

  it("points at hand-typed ids when the endpoint lists nothing", () => {
    expect(describeTestCounts({ language: 0, image: 0, video: 0 })).toMatch(
      /Enter model ids by hand/
    );
  });
});
