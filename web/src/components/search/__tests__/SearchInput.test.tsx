import React from "react";
import { stub } from "../../../test-utils/doubles";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import SearchInput from "../SearchInput";
import mockTheme from "../../../__mocks__/themeMock";
import { initKeyListeners } from "../../../stores/KeyPressedStore";

// Tooltip pulls in heavy theme overrides we don't need for these unit tests.
jest.mock("../../ui_primitives", () => ({
  MOTION: jest.requireActual("../../ui_primitives/tokens").MOTION,
  BORDER_RADIUS: jest.requireActual("../../ui_primitives/tokens").BORDER_RADIUS,
  Z_INDEX: jest.requireActual("../../ui_primitives/tokens").Z_INDEX,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

// The real dispatcher: focusOnTyping now goes through registerTypeToFocus, and
// initKeyListeners attaches the one window listener the store owns.

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);


// `useAutoFocusEnabled` reads `(pointer: coarse)`; jsdom has no matchMedia.
const mockMatchMedia = (coarse: boolean) => {
  window.matchMedia = jest.fn((query: string) => stub<MediaQueryList>({
    matches: query.includes("pointer: coarse") ? coarse : false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  }));
};

describe("SearchInput", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    mockMatchMedia(false);
  });

  afterEach(() => {
    jest.useRealTimers();
    window.matchMedia = originalMatchMedia;
  });

  it("lets the local draft lead while typing and debounces onSearchChange", () => {
    jest.useFakeTimers();
    const onSearchChange = jest.fn();
    renderWithTheme(
      <SearchInput
        onSearchChange={onSearchChange}
        searchTerm=""
        debounceTime={50}
        focusSearchInput={false}
      />
    );

    const input = screen.getByTestId("search-input-field") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hello" } });

    // The field reflects what the user typed immediately, before the debounce fires.
    expect(input.value).toBe("hello");
    expect(onSearchChange).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(60);
    });
    expect(onSearchChange).toHaveBeenCalledWith("hello");
  });

  // Regression guard: `searchTerm` is store-backed in real callers and can change
  // for reasons other than this input's own typing (programmatic reset, shared
  // state). The effect that mirrors `searchTerm` into local state is what keeps the
  // field in sync with those external changes — removing it would break this.
  it("reflects external searchTerm changes into the field", () => {
    const { rerender } = renderWithTheme(
      <SearchInput
        onSearchChange={jest.fn()}
        searchTerm="initial"
        focusSearchInput={false}
      />
    );

    const input = screen.getByTestId("search-input-field") as HTMLInputElement;
    expect(input.value).toBe("initial");

    rerender(
      <ThemeProvider theme={mockTheme}>
        <SearchInput
          onSearchChange={jest.fn()}
          searchTerm="external-reset"
          focusSearchInput={false}
        />
      </ThemeProvider>
    );
    expect(input.value).toBe("external-reset");
  });

  it("clears the field and notifies the parent when the clear button is clicked", () => {
    const onSearchChange = jest.fn();
    renderWithTheme(
      <SearchInput
        onSearchChange={onSearchChange}
        searchTerm=""
        focusSearchInput={false}
      />
    );

    const input = screen.getByTestId("search-input-field") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    expect(input.value).toBe("abc");

    fireEvent.click(screen.getByTestId("search-clear-btn"));
    expect(input.value).toBe("");
    expect(onSearchChange).toHaveBeenLastCalledWith("");
  });

  it("skips the mount focus on a coarse pointer", () => {
    mockMatchMedia(true);
    renderWithTheme(
      <SearchInput onSearchChange={jest.fn()} searchTerm="" focusSearchInput />
    );

    expect(screen.getByTestId("search-input-field")).not.toHaveFocus();
  });

  it("focuses on mount on a fine pointer", () => {
    mockMatchMedia(false);
    renderWithTheme(
      <SearchInput onSearchChange={jest.fn()} searchTerm="" focusSearchInput />
    );

    expect(screen.getByTestId("search-input-field")).toHaveFocus();
  });
});

describe("SearchInput focusOnTyping", () => {
  let detach: () => void;

  beforeEach(() => {
    window.matchMedia = jest.fn((query: string) => stub<MediaQueryList>({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    }));
    detach = initKeyListeners();
  });

  afterEach(() => {
    detach();
    document.body.innerHTML = "";
  });

  const typeAnywhere = (key: string) => {
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true })
      );
    });
  };

  it("focuses the field and forwards the key when nothing editable is focused", () => {
    const onSearchChange = jest.fn();
    renderWithTheme(
      <SearchInput
        onSearchChange={onSearchChange}
        focusOnTyping={true}
        focusSearchInput={false}
      />
    );
    const input = screen.getByTestId("search-input-field") as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);

    typeAnywhere("a");

    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("a");
  });

  it("leaves focus alone while the user is typing in another field", () => {
    renderWithTheme(
      <SearchInput
        onSearchChange={jest.fn()}
        focusOnTyping={true}
        focusSearchInput={false}
      />
    );
    const input = screen.getByTestId("search-input-field") as HTMLInputElement;
    const other = document.createElement("input");
    document.body.appendChild(other);
    other.focus();

    typeAnywhere("a");

    expect(document.activeElement).toBe(other);
    expect(input.value).toBe("");
  });

  it("does not steal focus from an inert background tab", () => {
    const { container } = renderWithTheme(
      <SearchInput
        onSearchChange={jest.fn()}
        focusOnTyping={true}
        focusSearchInput={false}
      />
    );
    const input = screen.getByTestId("search-input-field") as HTMLInputElement;
    // Stand in for WorkspaceShell's inactive .tab-layer.
    (container.firstElementChild as HTMLElement).setAttribute("inert", "");

    typeAnywhere("a");

    expect(document.activeElement).not.toBe(input);
    expect(input.value).toBe("");
  });

  it("stays out of the way when focusOnTyping is off", () => {
    renderWithTheme(
      <SearchInput
        onSearchChange={jest.fn()}
        focusOnTyping={false}
        focusSearchInput={false}
      />
    );
    const input = screen.getByTestId("search-input-field") as HTMLInputElement;

    typeAnywhere("a");

    expect(document.activeElement).not.toBe(input);
    expect(input.value).toBe("");
  });
});
