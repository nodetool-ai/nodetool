import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import SearchInput from "../SearchInput";
import mockTheme from "../../../__mocks__/themeMock";

// Tooltip pulls in heavy theme overrides we don't need for these unit tests.
jest.mock("../../ui_primitives", () => ({
  MOTION: jest.requireActual("../../ui_primitives/tokens").MOTION,
  BORDER_RADIUS: jest.requireActual("../../ui_primitives/tokens").BORDER_RADIUS,
  Z_INDEX: jest.requireActual("../../ui_primitives/tokens").Z_INDEX,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

// No modifier keys held during these tests.
jest.mock("../../../stores/KeyPressedStore", () => ({
  useKeyPressedStore: () => false
}));

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("SearchInput", () => {
  afterEach(() => {
    jest.useRealTimers();
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
});
