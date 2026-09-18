import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import MorePanel from "../MorePanel";

const renderPanel = (onSelectView = jest.fn()) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MorePanel onSelectView={onSelectView} />
    </ThemeProvider>
  );

describe("MorePanel", () => {
  it("groups non-document utility views into sections", () => {
    renderPanel();

    expect(screen.getByText("Workflow tools")).toBeInTheDocument();
    expect(screen.getByText("Agent tools")).toBeInTheDocument();
    expect(screen.getAllByText("Workspace")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /Favorite Nodes/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Workflow Output/ })
    ).toBeNull();
    expect(screen.getByRole("button", { name: /Skills/ })).toBeInTheDocument();
  });

  it("searches across every section", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(
      screen.getByRole("textbox", { name: "Search all panels" }),
      "workspace"
    );

    expect(
      screen.getByRole("button", { name: /^Workspace/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Favorite Nodes/ })).toBeNull();
    expect(screen.queryByText("Workflow tools")).toBeNull();
  });

  it("opens the selected nested panel", async () => {
    const user = userEvent.setup();
    const onSelectView = jest.fn();
    renderPanel(onSelectView);

    await user.click(screen.getByRole("button", { name: /Favorite Nodes/ }));

    expect(onSelectView).toHaveBeenCalledWith("favorites");
  });

  it("opens the global skills panel outside the project tree", async () => {
    const user = userEvent.setup();
    const onSelectView = jest.fn();
    renderPanel(onSelectView);

    await user.click(screen.getByRole("button", { name: /Skills/ }));

    expect(onSelectView).toHaveBeenCalledWith("skills");
  });
});
