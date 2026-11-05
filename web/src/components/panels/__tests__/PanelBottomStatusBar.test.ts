/**
 * The status bar's cpu/mem readout gives way before it can cover the last tab
 * (UX study 3, D7): with a side panel docked at 1280 wide it cut "Trace" to
 * "Tr". jsdom does no layout, so this pins the rule that does the hiding.
 */
import mockTheme from "../../../__mocks__/themeMock";
import {
  STATUS_BAR_READOUT_MIN_WIDTH,
  statusBarViews,
  styles
} from "../PanelBottom";

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

// UX study 17: on Home, newcomers read Versions and Trace as unexplained terms
// for something they had not made.
describe("status bar tabs", () => {
  it("leaves the workflow views out when no workflow is the active tab", () => {
    expect(
      statusBarViews({ workflowActive: false, openView: null, cloud: false })
    ).toEqual(["logs", "queue", "generations", "workers"]);
  });

  it("shows Versions and Trace on a workflow", () => {
    const views = statusBarViews({ workflowActive: true, openView: null, cloud: false });
    expect(views).toContain("versions");
    expect(views).toContain("trace");
  });

  it("keeps the open panel's tab so it can be closed", () => {
    expect(
      statusBarViews({ workflowActive: false, openView: "trace", cloud: false })
    ).toContain("trace");
  });

  it("drops Workers on the cloud", () => {
    expect(
      statusBarViews({ workflowActive: true, openView: null, cloud: true })
    ).not.toContain("workers");
  });
});
