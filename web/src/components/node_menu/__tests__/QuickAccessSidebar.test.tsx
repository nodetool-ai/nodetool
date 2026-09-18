import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import type { LeftPanelView } from "../../../stores/PanelStore";
import QuickAccessSidebar from "../QuickAccessSidebar";

const renderSidebar = (
  onCategoryClick = jest.fn(),
  activeCategory: "workflows" | "nodes" = "workflows",
  hiddenViews: readonly LeftPanelView[] = []
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <QuickAccessSidebar
        activeCategory={activeCategory}
        onCategoryClick={onCategoryClick}
        hiddenViews={hiddenViews}
      />
    </ThemeProvider>
  );

describe("QuickAccessSidebar", () => {
  it("shows Documents, Library, Nodes, and More", () => {
    renderSidebar();
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual(["Documents", "Library", "Nodes", "More"]);
    expect(screen.queryByRole("button", { name: "Workflows" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Apps" })).toBeNull();
    expect(screen.getByRole("button", { name: "Nodes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assets" })).toBeNull();
  });

  it("marks Nodes active when the node panel is open", () => {
    renderSidebar(jest.fn(), "nodes");

    expect(screen.getByRole("button", { name: "Nodes" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Documents" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("omits workflow-only shortcuts when they are hidden", () => {
    renderSidebar(jest.fn(), "workflows", ["nodes"]);

    expect(screen.queryByRole("button", { name: "Nodes" })).toBeNull();
    expect(screen.getByRole("button", { name: "Documents" })).toBeVisible();
  });

  it("selects a view from any group", async () => {
    const user = userEvent.setup();
    const onCategoryClick = jest.fn();
    renderSidebar(onCategoryClick);

    await user.click(screen.getByRole("button", { name: "Documents" }));
    await user.click(screen.getByRole("button", { name: "Library" }));

    expect(onCategoryClick).toHaveBeenNthCalledWith(1, "documents");
    expect(onCategoryClick).toHaveBeenNthCalledWith(2, "library");
  });
});
