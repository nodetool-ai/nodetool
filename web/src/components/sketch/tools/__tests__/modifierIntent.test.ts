/**
 * @jest-environment node
 */
import {
  selectionCombineMode,
  selectionCombineModeFromSnapshot,
} from "../modifierIntent";
import type { ModifierSnapshot } from "../modifierIntent";

describe("selectionCombineMode", () => {
  it('returns "replace" when no modifiers are held', () => {
    expect(selectionCombineMode(false, false)).toBe("replace");
  });

  it('returns "add" when only shift is held', () => {
    expect(selectionCombineMode(true, false)).toBe("add");
  });

  it('returns "subtract" when only alt is held', () => {
    expect(selectionCombineMode(false, true)).toBe("subtract");
  });

  it('returns "intersect" when both shift and alt are held', () => {
    expect(selectionCombineMode(true, true)).toBe("intersect");
  });
});

describe("selectionCombineModeFromSnapshot", () => {
  it('returns "replace" for a null snapshot', () => {
    expect(selectionCombineModeFromSnapshot(null)).toBe("replace");
  });

  it("delegates to selectionCombineMode for non-null snapshots", () => {
    const snap: ModifierSnapshot = { shift: true, alt: false };
    expect(selectionCombineModeFromSnapshot(snap)).toBe("add");
  });

  it("handles shift+alt snapshot", () => {
    const snap: ModifierSnapshot = { shift: true, alt: true };
    expect(selectionCombineModeFromSnapshot(snap)).toBe("intersect");
  });
});
