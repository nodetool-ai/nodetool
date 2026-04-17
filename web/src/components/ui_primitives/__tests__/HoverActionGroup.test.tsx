import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { HoverActionGroup } from "../HoverActionGroup";
import mockTheme from "../../../__mocks__/themeMock";

const renderGroup = (
  props: Partial<React.ComponentProps<typeof HoverActionGroup>> = {}
) =>
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
    const box = container.firstChild as HTMLElement;
    expect(box).toHaveStyle({ opacity: "0" });
  });

  it("is always visible when alwaysVisible is set", () => {
    const { container } = renderGroup({ alwaysVisible: true });
    const box = container.firstChild as HTMLElement;
    expect(box).toHaveStyle({ opacity: "1" });
  });

  it("applies configured transition duration", () => {
    const { container } = renderGroup({ transitionMs: 300 });
    const box = container.firstChild as HTMLElement;
    expect(box).toHaveStyle({ transition: "opacity 300ms ease" });
  });

  it("passes through extra props", () => {
    const { container } = renderGroup({
      "data-testid": "hag",
      "aria-label": "Row actions"
    } as any);
    expect(container.firstChild).toHaveAttribute("data-testid", "hag");
    expect(container.firstChild).toHaveAttribute("aria-label", "Row actions");
  });
});
