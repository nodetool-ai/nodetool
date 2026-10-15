/**
 * Below 1440 wide, toasts move to the bottom right above the status bar, so
 * they no longer cover the home screen's getting-started checklist (UX study
 * 3, D7). jsdom does no layout, so this pins the rule that moves them.
 */
import mockTheme from "../../../__mocks__/themeMock";
import { TOAST_BOTTOM_BELOW_WIDTH, styles } from "../Alert";

describe("toast placement", () => {
  const css = styles(mockTheme).styles;

  it("anchors toasts at the bottom on narrower windows", () => {
    const query = `@media (max-width: ${TOAST_BOTTOM_BELOW_WIDTH - 1}px)`;
    const at = css.indexOf(query);
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at)).toMatch(/^[^}]*top:auto;bottom:calc\(/);
  });
});
