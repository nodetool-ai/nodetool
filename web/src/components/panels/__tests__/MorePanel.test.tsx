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
  it("groups all non-direct panel views into sections", () => {
    renderPanel();

    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("Workflow tools")).toBeInTheDocument();
    expect(screen.getByText("Create & edit")).toBeInTheDocument();
    expect(screen.getByText("Developer")).toBeInTheDocument();
    expect(screen.getAllByText("Workspace")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /Sketches/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /JS Scripts/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Workflows/ })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Apps/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Workflow Output/ })
    ).toBeNull();
  });

  it("searches across every section", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(
      screen.getByRole("textbox", { name: "Search all panels" }),
      "timeline"
    );

    expect(
      screen.getByRole("button", { name: /Timelines/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sketches/ })).toBeNull();
    expect(screen.queryByText("Developer")).toBeNull();
  });

  it("opens the selected nested panel", async () => {
    const user = userEvent.setup();
    const onSelectView = jest.fn();
    renderPanel(onSelectView);

    await user.click(screen.getByRole("button", { name: /Storyboards/ }));

    expect(onSelectView).toHaveBeenCalledWith("storyboards");
  });
});
