import { render, screen } from "@testing-library/react";
import { stub } from "../../../test-utils/doubles";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { NodePickerDialog } from "../NodePickerDialog";

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

const renderDialog = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <NodePickerDialog open onSelect={jest.fn()} onClose={jest.fn()} />
    </ThemeProvider>
  );

describe("NodePickerDialog search focus", () => {
  const original = window.matchMedia;

  afterEach(() => {
    window.matchMedia = original;
  });

  it("focuses the search field on a fine pointer", () => {
    mockMatchMedia(false);
    renderDialog();
    expect(screen.getByPlaceholderText("Search nodes...")).toHaveFocus();
  });

  it("leaves the search field unfocused on a coarse pointer", () => {
    mockMatchMedia(true);
    renderDialog();
    expect(screen.getByPlaceholderText("Search nodes...")).not.toHaveFocus();
  });
});
