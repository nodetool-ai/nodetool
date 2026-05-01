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
    expect(String(sx.boxShadow)).toContain("var(--palette-grey-100)");
  });

  it("returns crisp selected styles for output nodes", () => {
    const sx = getOutputNodeSelectionSx(mockTheme, true);

    expect(sx.backdropFilter).toBe("none");
    expect(sx.WebkitBackdropFilter).toBe("none");
    expect(sx.filter).toBe("none");
    expect(String(sx.border)).toContain("3px solid");
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
    expect(String(sx.outline)).toContain("#77b4e6");
    expect(String(sx.boxShadow)).toContain("#77b4e6");
  });
});
