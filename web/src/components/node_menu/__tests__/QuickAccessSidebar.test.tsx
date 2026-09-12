import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import QuickAccessSidebar from "../QuickAccessSidebar";

const renderSidebar = (
  onCategoryClick = jest.fn(),
  activeCategory: "workflows" | "nodes" = "workflows"
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <QuickAccessSidebar
        activeCategory={activeCategory}
        onCategoryClick={onCategoryClick}
      />
    </ThemeProvider>
  );

describe("QuickAccessSidebar", () => {
  it("shows only direct panel views and one More entry", () => {
    renderSidebar();
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual(["Chats", "Library", "More"]);
    expect(screen.queryByRole("button", { name: "Workflows" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Apps" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nodes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Assets" })).toBeNull();
  });

  it("marks More active while a nested panel is open", () => {
    renderSidebar(jest.fn(), "nodes");

    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Chats" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("selects a view from any group", async () => {
    const user = userEvent.setup();
    const onCategoryClick = jest.fn();
    renderSidebar(onCategoryClick);

    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(screen.getByRole("button", { name: "Library" }));

    expect(onCategoryClick).toHaveBeenNthCalledWith(1, "more");
    expect(onCategoryClick).toHaveBeenNthCalledWith(2, "library");
  });
});
