import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import QuickAccessSidebar from "../QuickAccessSidebar";

const renderSidebar = (
  onCategoryClick = jest.fn(),
  hiddenViews: readonly ("nodes" | "favorites" | "history" | "settings")[] = []
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <QuickAccessSidebar
        activeCategory="nodes"
        onCategoryClick={onCategoryClick}
        hiddenViews={hiddenViews}
      />
    </ThemeProvider>
  );

describe("QuickAccessSidebar", () => {
  it("orders related views and docks workflow context separately", () => {
    const { container } = renderSidebar();
    const top = container.querySelector<HTMLElement>(".quick-access-top");
    const bottom = container.querySelector<HTMLElement>(".quick-access-bottom");

    expect(top).not.toBeNull();
    expect(bottom).not.toBeNull();
    if (!top || !bottom) return;

    expect(
      within(top)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual([
      "Nodes",
      "Favorite Nodes",
      "Recent Nodes",
      "Workflows",
      "Apps",
      "Chats",
      "Sketches",
      "Scripts",
      "Storyboards",
      "Entities",
      "Timelines",
      "JS Scripts"
    ]);
    expect(
      within(bottom)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual(["Workflow Settings", "Workspace", "Assets", "Library"]);
    expect(within(top).getAllByRole("separator")).toHaveLength(3);
  });

  it("removes hidden node tools outside workflow editing", () => {
    const { container } = renderSidebar(jest.fn(), [
      "nodes",
      "favorites",
      "history",
      "settings"
    ]);
    const top = container.querySelector<HTMLElement>(".quick-access-top");
    const bottom = container.querySelector<HTMLElement>(
      ".quick-access-bottom"
    );

    expect(top).not.toBeNull();
    expect(bottom).not.toBeNull();
    if (!top || !bottom) return;

    expect(within(top).queryByRole("button", { name: "Nodes" })).toBeNull();
    expect(within(top).getAllByRole("separator")).toHaveLength(2);
    expect(within(top).getAllByRole("button")[0]).toHaveAccessibleName(
      "Workflows"
    );
    expect(
      within(bottom)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual(["Workspace", "Assets", "Library"]);
  });

  it("selects a view from any group", async () => {
    const user = userEvent.setup();
    const onCategoryClick = jest.fn();
    renderSidebar(onCategoryClick);

    await user.click(
      screen.getByRole("button", { name: "Favorite Nodes" })
    );
    await user.click(screen.getByRole("button", { name: "Library" }));

    expect(onCategoryClick).toHaveBeenNthCalledWith(1, "favorites");
    expect(onCategoryClick).toHaveBeenNthCalledWith(2, "library");
  });
});
