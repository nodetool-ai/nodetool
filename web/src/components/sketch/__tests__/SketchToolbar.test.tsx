import React from "react";
import { render, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import SketchToolbar from "../SketchToolbar";

function renderToolbar() {
  const theme = createTheme({
    cssVariables: true
  });

  return render(
    <ThemeProvider theme={theme}>
      <SketchToolbar
        activeTool="move"
        selectMode="rectangle"
        onToolChange={jest.fn()}
        foregroundColor="#000000"
        backgroundColor="#ffffff"
        onForegroundColorChange={jest.fn()}
        onBackgroundColorChange={jest.fn()}
        onSwapColors={jest.fn()}
        onResetColors={jest.fn()}
      />
    </ThemeProvider>
  );
}

describe("SketchToolbar", () => {
  it("renders the requested top tool group order and multiple grouped sections", () => {
    const { container } = renderToolbar();

    const toolGroups = Array.from(container.querySelectorAll(".tool-group"));
    expect(toolGroups).toHaveLength(4);

    const topGroupButtons = within(toolGroups[0] as HTMLElement).getAllByRole("button");
    expect(topGroupButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Move",
      "Transform",
      "Select",
      "Crop"
    ]);
  });
});
