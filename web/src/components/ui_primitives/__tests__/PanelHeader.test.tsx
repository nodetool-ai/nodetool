import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { PanelHeader } from "../PanelHeader";

const renderWithTheme = (component: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);

describe("PanelHeader", () => {
  it("renders the title as an h2 heading by default", () => {
    renderWithTheme(<PanelHeader title="Versions" />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Versions" })
    ).toBeInTheDocument();
  });

  it("uses the requested heading element", () => {
    renderWithTheme(<PanelHeader title="Scene" component="h3" />);
    expect(
      screen.getByRole("heading", { level: 3, name: "Scene" })
    ).toBeInTheDocument();
  });

  it("renders no heading when the title is omitted", () => {
    renderWithTheme(<PanelHeader actions={<button type="button">New</button>} />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });

  it("shows a count of zero", () => {
    renderWithTheme(<PanelHeader title="Logs" count={0} />);
    expect(screen.getByText("0")).toHaveClass("panel-header-count");
  });

  it("renders inline controls and actions", () => {
    renderWithTheme(
      <PanelHeader title="Logs" actions={<button type="button">Fullscreen</button>}>
        <button type="button">Errors</button>
      </PanelHeader>
    );
    expect(screen.getByRole("button", { name: "Errors" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fullscreen" }).parentElement
    ).toHaveClass("panel-header-actions");
  });

  it("renders a close button that calls onClose", async () => {
    const onClose = jest.fn();
    renderWithTheme(
      <PanelHeader title="Inspector" onClose={onClose} closeLabel="Hide inspector" />
    );
    await userEvent.click(screen.getByRole("button", { name: "Hide inspector" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders no close button without onClose", () => {
    renderWithTheme(<PanelHeader title="Inspector" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps the panel-header class next to a caller class", () => {
    const { container } = renderWithTheme(
      <PanelHeader title="Queue" className="queue-header" />
    );
    const root = container.querySelector(".panel-header");
    expect(root).toHaveClass("queue-header");
  });
});
