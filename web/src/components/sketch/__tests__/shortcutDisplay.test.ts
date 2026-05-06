/**
 * @jest-environment jsdom
 */
import { displayCombo, isMac } from "../shortcuts";

describe("displayCombo", () => {
  it("returns every binding for redo", () => {
    expect(displayCombo("redo")).toBe(
      isMac() ? "⌘⇧Z / ⌘Y" : "Ctrl+Shift+Z / Ctrl+Y"
    );
  });

  it("returns every binding for clear-layer", () => {
    expect(displayCombo("clear-layer")).toBe("Backspace / Delete");
  });
});
