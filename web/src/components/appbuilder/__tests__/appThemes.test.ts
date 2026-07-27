import { APP_THEMES, DEFAULT_APP_THEME, appThemeFrame, resolveAppTheme } from "../appThemes";

describe("app themes", () => {
  it("resolves a document's theme id to its registry entry", () => {
    expect(resolveAppTheme("card").id).toBe("card");
    expect(resolveAppTheme("centered").maxWidth).toBe(720);
  });

  it("falls back to the default for an unknown or absent id", () => {
    expect(resolveAppTheme(undefined)).toBe(DEFAULT_APP_THEME);
    expect(resolveAppTheme("no-such-theme")).toBe(DEFAULT_APP_THEME);
  });

  it("frames only the themes that ask for it", () => {
    expect(appThemeFrame(resolveAppTheme("card"))).toHaveProperty(
      "backgroundColor"
    );
    expect(appThemeFrame(DEFAULT_APP_THEME)).toEqual({});
  });

  it("has unique ids", () => {
    const ids = APP_THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
