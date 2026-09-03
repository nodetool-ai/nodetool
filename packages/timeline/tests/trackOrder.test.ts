import { describe, expect, it } from "vitest";

import { moveTrackOrder } from "../src/trackOrder.js";

const stack = [
  { id: "text", index: 0 },
  { id: "scrim", index: 1 },
  { id: "picture", index: 2 }
];

describe("moveTrackOrder", () => {
  it("lifts a track to the top by index", () => {
    expect(moveTrackOrder(stack, "picture", { toIndex: 0 })).toEqual([
      "picture",
      "text",
      "scrim"
    ]);
  });

  it("clamps an index past either end", () => {
    expect(moveTrackOrder(stack, "text", { toIndex: 99 })).toEqual([
      "scrim",
      "picture",
      "text"
    ]);
    expect(moveTrackOrder(stack, "picture", { toIndex: -4 })).toEqual([
      "picture",
      "text",
      "scrim"
    ]);
  });

  it("reads `before` and `after` against the current stack", () => {
    // The picture track was added last and covers everything; sending it
    // behind the scrim is the fix the tool exists for.
    expect(moveTrackOrder(stack, "text", { afterId: "picture" })).toEqual([
      "scrim",
      "picture",
      "text"
    ]);
    expect(moveTrackOrder(stack, "picture", { beforeId: "scrim" })).toEqual([
      "text",
      "picture",
      "scrim"
    ]);
  });

  it("sorts by index rather than trusting array order", () => {
    const shuffled = [
      { id: "picture", index: 2 },
      { id: "text", index: 0 },
      { id: "scrim", index: 1 }
    ];
    expect(moveTrackOrder(shuffled, "picture", { toIndex: 0 })).toEqual([
      "picture",
      "text",
      "scrim"
    ]);
  });

  it("refuses a move it cannot make instead of returning the same order", () => {
    expect(() => moveTrackOrder(stack, "nope", { toIndex: 0 })).toThrow(
      /no track "nope" to move/
    );
    expect(() => moveTrackOrder(stack, "text", {})).toThrow(
      /toIndex.*before.*after/
    );
    expect(() => moveTrackOrder(stack, "text", { beforeId: "text" })).toThrow(
      /relative to itself/
    );
    expect(() => moveTrackOrder(stack, "text", { afterId: "gone" })).toThrow(
      /no track "gone"/
    );
  });
});
