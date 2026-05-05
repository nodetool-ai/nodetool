import { describe, expect, it } from "vitest";
import { snap } from "../src/snap.js";

describe("snap", () => {
  it("snaps to a candidate within threshold", () => {
    expect(snap(100, [120], 5, 5)).toBe(120);
  });

  it("returns original time when no candidate is in threshold", () => {
    expect(snap(100, [150], 5, 5)).toBe(100);
  });

  it("picks the closest candidate", () => {
    expect(snap(100, [95, 103, 120], 5, 5)).toBe(103);
  });

  it("breaks ties deterministically toward the smaller candidate", () => {
    expect(snap(100, [103, 97], 1, 3)).toBe(97);
  });
});
