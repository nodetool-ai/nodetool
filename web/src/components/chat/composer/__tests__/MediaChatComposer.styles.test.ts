import ThemeNodetool from "../../../themes/ThemeNodetool";
import { createMediaComposerStyles } from "../MediaChatComposer.styles";

describe("createMediaComposerStyles colour schemes", () => {
  it("cannot branch on theme.palette.mode: it is fixed to the default scheme", () => {
    // The CSS-vars theme bakes theme.palette from one scheme, so a
    // `theme.palette.mode === "light"` check is true in dark mode too.
    expect(ThemeNodetool.palette.mode).toBe("light");
  });

  it("puts the dark card look behind the .dark class selector", () => {
    const { styles } = createMediaComposerStyles(ThemeNodetool);
    const darkBlock = styles.slice(styles.indexOf(".dark"));

    expect(styles).toContain(".dark");
    expect(darkBlock).toContain("var(--palette-background-default");
    expect(darkBlock).toContain("var(--palette-divider");
  });
});
