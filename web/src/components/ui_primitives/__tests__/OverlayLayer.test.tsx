import "@testing-library/jest-dom";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { Dialog } from "../Dialog";
import { Popover } from "../Popover";

// Every overlay portals to `document.body`, so the roots are siblings there
// rather than ancestors of the content they wrap.
const roots = (selector: string): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>(selector));

const soleRoot = (selector: string): HTMLElement => {
  const found = roots(selector);
  expect(found).toHaveLength(1);
  return found[0];
};

const layerOf = (root: HTMLElement): number => Number(root.style.zIndex);

const withTheme = (children: ReactNode) => (
  <ThemeProvider theme={mockTheme}>{children}</ThemeProvider>
);

describe("overlay layering", () => {
  it("stacks a dialog opened from inside a popover above that popover", () => {
    render(
      withTheme(
        <Popover open anchorEl={document.body}>
          <Dialog open title="Delete conversation" content="Gone for good." />
        </Popover>
      )
    );

    expect(screen.getByText("Gone for good.")).toBeInTheDocument();
    const popoverLayer = layerOf(soleRoot(".MuiPopover-root"));
    const dialogLayer = layerOf(soleRoot(".MuiDialog-root"));

    expect(popoverLayer).toBe(mockTheme.zIndex.popover2);
    expect(dialogLayer).toBeGreaterThan(popoverLayer);
  });

  it("stacks a popover opened from inside a nested dialog above that dialog", () => {
    render(
      withTheme(
        <Popover open anchorEl={document.body}>
          <Dialog open title="Outer">
            <Popover open anchorEl={document.body}>
              <span>menu item</span>
            </Popover>
          </Dialog>
        </Popover>
      )
    );

    expect(screen.getByText("menu item")).toBeInTheDocument();
    const popoverLayers = roots(".MuiPopover-root").map(layerOf);
    const dialogLayer = layerOf(soleRoot(".MuiDialog-root"));

    expect(popoverLayers).toHaveLength(2);
    expect(Math.min(...popoverLayers)).toBeLessThan(dialogLayer);
    expect(Math.max(...popoverLayers)).toBeGreaterThan(dialogLayer);
  });

  it("leaves a dialog outside any popover on the theme's modal layer", () => {
    render(withTheme(<Dialog open title="Standalone" content="Body text." />));

    expect(screen.getByText("Body text.")).toBeInTheDocument();
    expect(soleRoot(".MuiDialog-root").style.zIndex).toBe("");
  });
});
