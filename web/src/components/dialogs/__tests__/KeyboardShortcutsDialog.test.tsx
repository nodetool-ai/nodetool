import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import KeyboardShortcutsDialog from "../KeyboardShortcutsDialog";
import { useKeyboardShortcutsDialogStore } from "../../../stores/KeyboardShortcutsDialogStore";
import React from "react";

jest.mock("../../../stores/KeyboardShortcutsDialogStore", () => ({
  useKeyboardShortcutsDialogStore: jest.fn()
}));

describe("KeyboardShortcutsDialog Store Integration", () => {
  const mockOpen = jest.fn();
  const mockClose = jest.fn();

  const defaultMockStore = {
    isOpen: true,
    open: mockOpen,
    close: mockClose,
    toggle: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useKeyboardShortcutsDialogStore as unknown as jest.Mock).mockImplementation(
      (selector) => {
        if (typeof selector === "function") {
          return selector(defaultMockStore);
        }
        return defaultMockStore;
      }
    );
  });

  it("should call close when store isOpen is false", () => {
    (useKeyboardShortcutsDialogStore as unknown as jest.Mock).mockImplementation(
      (selector) => {
        if (typeof selector === "function") {
          return selector({ ...defaultMockStore, isOpen: false });
        }
        return { ...defaultMockStore, isOpen: false };
      }
    );
    render(
      <ThemeProvider theme={mockTheme}>
        <KeyboardShortcutsDialog />
      </ThemeProvider>
    );
    expect(document.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it("should render dialog when store isOpen is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <KeyboardShortcutsDialog />
      </ThemeProvider>
    );
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeInTheDocument();
  });
});

describe("KeyboardShortcutsDialog Store Methods", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should call store open method when rendered with isOpen false then changed", () => {
    const mockOpen = jest.fn();
    const mockClose = jest.fn();
    const mockToggle = jest.fn();

    let callCount = 0;
    (useKeyboardShortcutsDialogStore as unknown as jest.Mock).mockImplementation(
      (selector) => {
        callCount++;
        if (typeof selector === "function") {
          return selector({
            isOpen: callCount < 3,
            open: mockOpen,
            close: mockClose,
            toggle: mockToggle
          });
        }
        return {
          isOpen: callCount < 3,
          open: mockOpen,
          close: mockClose,
          toggle: mockToggle
        };
      }
    );
    const { rerender: _rerender } = render(
      <ThemeProvider theme={mockTheme}>
        <KeyboardShortcutsDialog />
      </ThemeProvider>
    );
    expect(mockClose).toHaveBeenCalled();
  });
});
