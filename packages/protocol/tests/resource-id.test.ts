import { describe, expect, it } from "vitest";
import { assetIdFromRef } from "../src/resource-id.js";

const FULL = "3e53f6cbb3a34f949de988183791cd14";
const SHORT = "3e53f6cbb3a3";

describe("assetIdFromRef", () => {
  it.each([
    [`asset://${SHORT}.jpg`, SHORT],
    [`asset://${SHORT}`, SHORT],
    [`asset://${FULL}.png`, FULL],
    [`asset://${FULL}?v=2`, FULL],
    [SHORT, SHORT],
    [FULL, FULL],
    [`${SHORT}.jpg`, SHORT],
    [` ${FULL} `, FULL]
  ])("reads %s as %s", (ref, id) => {
    expect(assetIdFromRef(ref)).toBe(id);
  });

  it.each([
    "package://nodetool-base/timelines/voltra/street.jpg",
    "https://example.com/a.png",
    "personal:user-1",
    "banner.png"
  ])("leaves %s unchanged", (ref) => {
    expect(assetIdFromRef(ref)).toBe(ref);
  });
});
