import { nextToolbarFit, type ToolbarFit } from "../toolbarFit";

const wide: ToolbarFit = { narrow: false, neededWidthPx: 0 };

describe("nextToolbarFit", () => {
  it("stays labelled while the controls fit", () => {
    expect(nextToolbarFit(wide, 1600, 1600)).toBe(wide);
  });

  it("goes compact on overflow and remembers the width the labels need", () => {
    expect(nextToolbarFit(wide, 1280, 1330)).toEqual({ narrow: true, neededWidthPx: 1330 });
  });

  it("stays compact until the toolbar is wide enough for the labels again", () => {
    const narrow: ToolbarFit = { narrow: true, neededWidthPx: 1330 };
    expect(nextToolbarFit(narrow, 1300, 1300)).toBe(narrow);
    expect(nextToolbarFit(narrow, 1330, 1330)).toEqual({ narrow: false, neededWidthPx: 1330 });
  });

  it("ignores an unmeasured toolbar", () => {
    expect(nextToolbarFit(wide, 0, 0)).toBe(wide);
  });
});
