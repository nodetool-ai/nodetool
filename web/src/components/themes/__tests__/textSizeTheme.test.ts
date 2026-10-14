import ThemeNodetool from "../ThemeNodetool";
import { nodetoolThemeFor } from "../AppThemeRoot";

describe("text size themes", () => {
  it("keeps the shipped theme for the default size", () => {
    expect(nodetoolThemeFor("default")).toBe(ThemeNodetool);
    expect(ThemeNodetool.fontSizeNormal).toBe("15px");
  });

  it("scales every step of the type scale and MUI typography", () => {
    const larger = nodetoolThemeFor("larger");
    expect([
      larger.fontSizeGiant,
      larger.fontSizeBig,
      larger.fontSizeNormal,
      larger.fontSizeSmall,
      larger.fontSizeSmaller
    ]).toEqual(["26px", "22px", "19px", "17px", "14px"]);
    expect(larger.typography.fontSize).toBe(19);
    // Spacing is untouched, so layout and canvas units stay the same.
    expect(larger.spacing(1)).toBe(ThemeNodetool.spacing(1));
  });
});
