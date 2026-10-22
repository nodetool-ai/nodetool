import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { Popover } from "../Popover";
import { BORDER_RADIUS } from "../tokens";

const paper = (): HTMLElement => {
  const found = document.querySelector<HTMLElement>(".MuiPopover-paper");
  if (!found) {
    throw new Error("Popover paper not rendered");
  }
  return found;
};

describe("Popover surface", () => {
  it("draws the menu surface by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <Popover open anchorEl={document.body}>
          content
        </Popover>
      </ThemeProvider>
    );
    const style = getComputedStyle(paper());
    expect(style.borderRadius).toBe(BORDER_RADIUS.lg);
    expect(style.borderStyle).toBe("solid");
  });

  it("lets a caller's paperSx override the default surface", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <Popover open anchorEl={document.body} paperSx={{ borderRadius: 0 }}>
          content
        </Popover>
      </ThemeProvider>
    );
    expect(getComputedStyle(paper()).borderRadius).toBe("0");
  });
});
