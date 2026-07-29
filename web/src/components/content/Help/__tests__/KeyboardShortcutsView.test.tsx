import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import KeyboardShortcutsView from "../KeyboardShortcutsView";
import OnScreenKeyboard from "../OnScreenKeyboard";
import { keyboardLayouts } from "../keyboard_layouts";

const renderView = (
  props: React.ComponentProps<typeof KeyboardShortcutsView> = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <KeyboardShortcutsView {...props} />
    </ThemeProvider>
  );

describe("OnScreenKeyboard", () => {
  it("renders every row and key of the selected layout", () => {
    const { container } = render(
      <OnScreenKeyboard layout={keyboardLayouts} layoutName="english" />
    );
    const rows = container.querySelectorAll(".hg-row");
    expect(rows).toHaveLength(keyboardLayouts.english.length);
    expect(container.querySelector('[data-skbtn="q"]')).not.toBeNull();
    expect(container.querySelector('[data-skbtn="space"]')).not.toBeNull();
  });

  it("renders display labels and button theme classes", () => {
    const { container } = render(
      <OnScreenKeyboard
        layout={keyboardLayouts}
        layoutName="english"
        display={{ space: "SPACE" }}
        buttonTheme={[{ class: "has-shortcut", buttons: "c space" }]}
      />
    );
    const space = container.querySelector('[data-skbtn="space"]');
    expect(space?.textContent).toBe("SPACE");
    expect(space?.classList.contains("has-shortcut")).toBe(true);
    expect(
      container.querySelector('[data-skbtn="c"]')?.classList.contains("has-shortcut")
    ).toBe(true);
    expect(
      container.querySelector('[data-skbtn="q"]')?.classList.contains("has-shortcut")
    ).toBe(false);
  });

  it("switches layouts by layoutName", () => {
    const { container } = render(
      <OnScreenKeyboard layout={keyboardLayouts} layoutName="german" />
    );
    expect(container.querySelector('[data-skbtn="ü"]')).not.toBeNull();
  });

  it("reports mouse enter and leave per button", () => {
    const onEnter = jest.fn();
    const onLeave = jest.fn();
    const { container } = render(
      <OnScreenKeyboard
        layout={keyboardLayouts}
        layoutName="english"
        onButtonMouseEnter={onEnter}
        onButtonMouseLeave={onLeave}
      />
    );
    const key = container.querySelector('[data-skbtn="c"]') as HTMLElement;
    fireEvent.mouseEnter(key);
    expect(onEnter).toHaveBeenCalledWith("c", expect.anything());
    fireEvent.mouseLeave(key);
    expect(onLeave).toHaveBeenCalled();
  });
});

describe("KeyboardShortcutsView", () => {
  it("highlights shortcut keys with the has-shortcut class", () => {
    const { container } = renderView();
    // "c" (copy) and "control" are part of the default editor shortcuts.
    expect(
      container.querySelector('.hg-button[data-skbtn="c"].has-shortcut')
    ).not.toBeNull();
    expect(
      container.querySelector('.hg-button[data-skbtn="control"].has-shortcut')
    ).not.toBeNull();
  });

  it("marks pressed keys via physical keyboard events", () => {
    const { container } = renderView();
    fireEvent.keyDown(window, { key: "c" });
    const key = container.querySelector('.hg-button[data-skbtn="c"]');
    expect(key?.classList.contains("hg-pressed")).toBe(true);
    fireEvent.keyUp(window, { key: "c" });
    expect(key?.classList.contains("hg-pressed")).toBe(false);
  });

  it("ignores physical keyboard events when listenToPhysicalKeyboard is false", () => {
    const { container } = renderView({ listenToPhysicalKeyboard: false });
    fireEvent.keyDown(window, { key: "c" });
    expect(
      container.querySelector('.hg-button[data-skbtn="c"].hg-pressed')
    ).toBeNull();
  });
});
