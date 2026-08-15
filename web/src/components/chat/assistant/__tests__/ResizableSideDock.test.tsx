/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import type { ComponentProps } from "react";

import ResizableSideDock from "../ResizableSideDock";

function renderDock(
  props: Partial<ComponentProps<typeof ResizableSideDock>> = {}
) {
  return render(
    <ThemeProvider theme={createTheme({ cssVariables: true })}>
      <ResizableSideDock storageKey="test-dock" {...props}>
        <div>panel</div>
      </ResizableSideDock>
    </ThemeProvider>
  );
}

describe("ResizableSideDock", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders a resize handle and keeps the body", () => {
    renderDock();
    expect(screen.getByTestId("assistant-side-dock")).toBeTruthy();
    expect(screen.getByRole("separator", { name: "Resize assistant panel" })).toBeTruthy();
    expect(screen.getByText("panel")).toBeTruthy();
  });

  it("grows the panel with ArrowLeft", async () => {
    const user = userEvent.setup();
    renderDock({ defaultWidth: 340 });
    const handle = screen.getByRole("separator");
    handle.focus();
    await user.keyboard("{ArrowLeft}");
    expect(handle).toHaveAttribute("aria-valuenow", "356");
  });

  it("renders children without a handle when disabled", () => {
    renderDock({ enabled: false });
    expect(screen.queryByTestId("assistant-side-dock")).toBeNull();
    expect(screen.getByText("panel")).toBeTruthy();
  });
});
