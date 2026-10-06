import mockTheme from "../../../__mocks__/themeMock";
import {
  getPreviewNodeSelectionSx,
  getOutputNodeSelectionSx,
  getBaseNodeSelectionStyles
} from "../selectionStyles";

describe("selectionStyles", () => {
  it("returns crisp selected styles for preview nodes", () => {
    const sx = getPreviewNodeSelectionSx(mockTheme, true);

    expect(sx.backdropFilter).toBe("none");
    expect(sx.WebkitBackdropFilter).toBe("none");
    expect(sx.filter).toBe("none");
    expect(String(sx.border)).toMatch(/^1px solid /);
  });

  it("returns crisp selected styles for output nodes", () => {
    const sx = getOutputNodeSelectionSx(mockTheme, true);

    expect(sx.backdropFilter).toBe("none");
    expect(sx.WebkitBackdropFilter).toBe("none");
    expect(sx.filter).toBe("none");
    expect(String(sx.border)).toContain("1px solid");
  });

  it("keeps base-node selection visible without blur keys", () => {
    const sx = getBaseNodeSelectionStyles({
      selected: true,
      isFocused: false,
      isLoading: false,
      hasParent: false,
      hasToggleableResult: false,
      baseColor: "#77b4e6",
      parentColor: null,
      theme: mockTheme,
      minHeight: 150
    });

    expect(sx.backdropFilter).toBe("none");
    expect(sx.WebkitBackdropFilter).toBe("none");
    expect(sx.filter).toBe("none");
    expect(String(sx.border)).toContain("#77b4e6");
  });

  it.each([
    { selected: false, isFocused: false, isLoading: false },
    { selected: true, isFocused: false, isLoading: false },
    { selected: true, isFocused: false, isLoading: true },
    { selected: false, isFocused: true, isLoading: false }
  ])("draws one 1px edge with no outer ring (%o)", (state) => {
    const sx = getBaseNodeSelectionStyles({
      ...state,
      hasAmbientRing: true,
      hasParent: false,
      hasToggleableResult: false,
      baseColor: "#77b4e6",
      parentColor: null,
      theme: mockTheme,
      minHeight: 150
    });

    expect(String(sx.border)).toMatch(/^1px (solid|dashed) /);
    expect(sx.outline).toBe("none");
    expect(String(sx.boxShadow)).not.toMatch(/(^|, )0 0 0 \d/);
  });
});
