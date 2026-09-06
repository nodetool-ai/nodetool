import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { HoverActionGroup } from "../HoverActionGroup";
import mockTheme from "../../../__mocks__/themeMock";
import { firstElement } from "../../../test-utils/doubles";

/**
 * The group's own props, plus the `data-*` the pass-through test sets.
 * TypeScript special-cases `data-*` on a JSX attribute, not on an object type.
 */
type RenderGroupProps = Partial<
  React.ComponentProps<typeof HoverActionGroup>
> & {
  "data-testid"?: string;
};

const renderGroup = (props: RenderGroupProps = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <HoverActionGroup {...props}>
        <button type="button" data-testid="action">
          Action
        </button>
      </HoverActionGroup>
    </ThemeProvider>
  );

describe("HoverActionGroup", () => {
  it("renders children", () => {
    renderGroup();
    expect(screen.getByTestId("action")).toBeInTheDocument();
  });

  it("starts hidden by default", () => {
    const { container } = renderGroup();
    const box = firstElement(container);
    expect(box).toHaveStyle({ opacity: "0" });
  });

  it("is always visible when alwaysVisible is set", () => {
    const { container } = renderGroup({ alwaysVisible: true });
    const box = firstElement(container);
    expect(box).toHaveStyle({ opacity: "1" });
  });

  // A pointer without hover can never trigger the reveal, so the group must
  // opt out of hiding entirely there.
  it("reveals the actions where hover is unavailable", () => {
    renderGroup();
    // Emotion inserts through the CSSOM, so the <style> tags read as empty.
    const sheets = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => rule.cssText)
      .join("");
    expect(sheets).toMatch(/@media \(hover: none\) \{[^}]*opacity: 1/);
  });

  it("applies configured transition duration", () => {
    const { container } = renderGroup({ transitionMs: 300 });
    const box = firstElement(container);
    expect(box).toHaveStyle({ transition: "opacity 300ms ease" });
  });

  it("passes through extra props", () => {
    const { container } = renderGroup({
      "data-testid": "hag",
      "aria-label": "Row actions"
    });
    expect(container.firstChild).toHaveAttribute("data-testid", "hag");
    expect(container.firstChild).toHaveAttribute("aria-label", "Row actions");
  });
});
