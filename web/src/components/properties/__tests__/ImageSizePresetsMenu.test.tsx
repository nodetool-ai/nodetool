import React from "react";
import { stub } from "../../../test-utils/doubles";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import { ImageSizePresetsMenu } from "../ImageSizePresetsMenu";

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

const renderMenu = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ImageSizePresetsMenu
        anchorEl={document.body}
        open
        onClose={jest.fn()}
        onSelect={jest.fn()}
        currentWidth={512}
        currentHeight={512}
      />
    </ThemeProvider>
  );

describe("ImageSizePresetsMenu search focus", () => {
  const original = window.matchMedia;
  let focusSpy: jest.SpyInstance;

  beforeEach(() => {
    // MUI's Menu moves focus to its list right after mount, so assert on the
    // input's own focus call rather than the final activeElement.
    focusSpy = jest.spyOn(HTMLInputElement.prototype, "focus");
  });

  afterEach(() => {
    focusSpy.mockRestore();
    window.matchMedia = original;
  });

  it("focuses the search field on a fine pointer", () => {
    mockMatchMedia(false);
    renderMenu();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(focusSpy).toHaveBeenCalled();
  });

  it("leaves the search field unfocused on a coarse pointer", () => {
    mockMatchMedia(true);
    renderMenu();
    // The virtual keyboard would otherwise cover the preset list.
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(focusSpy).not.toHaveBeenCalled();
  });
});
