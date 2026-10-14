import { describe, expect, it } from "vitest";
import { resolveMoveTrackArgs } from "../src/api-schemas/timeline-tool-params.js";

describe("resolveMoveTrackArgs", () => {
  const targets = [undefined, "", "  ", "a"];
  const aliases = [undefined, "b"];
  const indexes = [undefined, 0, 3];
  const anchors = [undefined, "x"];

  it("agrees with the spec over every combination of present and absent fields", () => {
    let checked = 0;
    for (const target of targets) {
      for (const trackId of aliases) {
        for (const toIndex of indexes) {
          for (const index of indexes) {
            for (const before of anchors) {
              for (const after of anchors) {
                const input = { target, trackId, toIndex, index, before, after };
                const name = target ?? trackId;
                const dest = toIndex ?? index;
                const hasName = name !== undefined && name.trim() !== "";
                const hasDest =
                  dest !== undefined || before !== undefined || after !== undefined;
                if (!hasName || !hasDest) {
                  expect(() => resolveMoveTrackArgs(input), JSON.stringify(input)).toThrow();
                } else {
                  const expected: Record<string, unknown> = { target: name };
                  if (dest !== undefined) expected.toIndex = dest;
                  if (before !== undefined) expected.before = before;
                  if (after !== undefined) expected.after = after;
                  expect(resolveMoveTrackArgs(input), JSON.stringify(input)).toEqual(expected);
                }
                checked += 1;
              }
            }
          }
        }
      }
    }
    expect(checked).toBe(4 * 2 * 3 * 3 * 2 * 2);
  });

  it("prefers toIndex over index and keeps 0 as a destination", () => {
    expect(resolveMoveTrackArgs({ target: "a", toIndex: 0, index: 5 })).toEqual({
      target: "a",
      toIndex: 0
    });
  });

  it("does not fall back to trackId when target is an empty string", () => {
    expect(() => resolveMoveTrackArgs({ target: "", trackId: "b", toIndex: 1 })).toThrow(
      /needs the track to move/
    );
  });
});
