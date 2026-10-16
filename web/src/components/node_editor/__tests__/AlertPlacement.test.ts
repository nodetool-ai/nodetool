/**
 * Toasts sit at the top right at every window width, left of the inspector
 * when it is open. UX study 4 (D5) saw them cover the inspector's Model field
 * at the top right, and the run button when narrower windows moved them to
 * the bottom right. jsdom does no layout, so this pins the rules that place
 * them.
 */
import mockTheme from "../../../__mocks__/themeMock";
import { styles } from "../Alert";

describe("toast placement", () => {
  it("keeps one top-right placement at every desktop width", () => {
    const css = styles(mockTheme).styles;
    expect(css).toContain("top:68px");
    expect(css).not.toMatch(/bottom:calc\(/);
  });

  it("moves toasts left of an open inspector", () => {
    const css = styles(mockTheme, 350).styles;
    expect(css).toMatch(/right:calc\(350px \+ /);
  });

  it("keeps the default right gutter with no inspector", () => {
    const css = styles(mockTheme, 0).styles;
    expect(css).toContain("right:calc(2em + 24px)");
  });
});
