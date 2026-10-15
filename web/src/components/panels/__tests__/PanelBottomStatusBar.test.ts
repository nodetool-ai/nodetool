/**
 * The status bar's cpu/mem readout gives way before it can cover the last tab
 * (UX study 3, D7): with a side panel docked at 1280 wide it cut "Trace" to
 * "Tr". jsdom does no layout, so this pins the rule that does the hiding.
 */
import mockTheme from "../../../__mocks__/themeMock";
import { STATUS_BAR_READOUT_MIN_WIDTH, styles } from "../PanelBottom";

describe("status bar readout", () => {
  const css = styles(mockTheme).styles;

  it("sizes itself by the bar's own width", () => {
    expect(css).toContain("container-type:inline-size");
    expect(css).toContain("container-name:statusbar");
  });

  it("hides the readout once the bar is narrow", () => {
    const query = `@container statusbar (max-width: ${STATUS_BAR_READOUT_MIN_WIDTH}px)`;
    const at = css.indexOf(query);
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at)).toMatch(/\.meta-cluster\{display:none;\}/);
    // After the readout's own display rule, so it wins at equal specificity.
    expect(at).toBeGreaterThan(css.indexOf(".meta-cluster{"));
  });
});
