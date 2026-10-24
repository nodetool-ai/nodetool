import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { DocumentBar } from "../DocumentBar";
import { ModeSwitch } from "../ModeSwitch";
import { SaveStatus } from "../SaveStatus";

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("DocumentBar", () => {
  it("renders the slots in their fixed order and skips empty ones", () => {
    renderWithTheme(
      <DocumentBar
        title="Konzept B"
        status={<span>status</span>}
        mode={<button type="button">mode</button>}
        actions={<button type="button">Export</button>}
      />
    );

    const bar = screen.getByRole("toolbar", { name: "Konzept B document" });
    const order = Array.from(bar.querySelectorAll("button, span"))
      .map((node) => node.textContent)
      .filter((text) => ["Konzept B", "status", "mode", "Export"].includes(text ?? ""));
    expect(order).toEqual(["Konzept B", "status", "mode", "Export"]);
    // Only the one filled tool slot gets a divider.
    expect(screen.getAllByRole("separator")).toHaveLength(1);
  });

  it("renames the title on double-click when a rename handler is given", async () => {
    const user = userEvent.setup();
    const onRename = jest.fn();
    renderWithTheme(<DocumentBar title="Untitled" onRename={onRename} />);

    await user.dblClick(screen.getByText("Untitled"));
    const input = await screen.findByRole("textbox", { name: "Document name" });
    await user.clear(input);
    await user.type(input, "Konzept A{Enter}");

    expect(onRename).toHaveBeenCalledWith("Konzept A");
  });

  it("keeps a fixed title when there is no rename handler", async () => {
    const user = userEvent.setup();
    renderWithTheme(<DocumentBar title="Read only doc" />);

    await user.dblClick(screen.getByText("Read only doc"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("SaveStatus", () => {
  it.each([
    ["saved", "Saved"],
    ["saving", "Saving…"],
    ["dirty", "Unsaved changes"],
    ["error", "Not saved"],
    ["readOnly", "Read only"]
  ] as const)("reads %s as %s", (state, label) => {
    renderWithTheme(<SaveStatus state={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("offers Retry when a save failed", async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();
    renderWithTheme(<SaveStatus state="error" onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("ModeSwitch", () => {
  const Harness = ({ iconOnly = false }: { iconOnly?: boolean }) => {
    const [mode, setMode] = useState<"view" | "edit">("view");
    return (
      <ModeSwitch
        ariaLabel="Document mode"
        iconOnly={iconOnly}
        value={mode}
        onChange={setMode}
        options={[
          { value: "view", label: "View", icon: <span>eye</span> },
          { value: "edit", label: "Edit", icon: <span>pencil</span> }
        ]}
      />
    );
  };

  it("switches the mode and never clears it", async () => {
    const user = userEvent.setup();
    renderWithTheme(<Harness iconOnly />);

    const view = screen.getByRole("button", { name: "View" });
    const edit = screen.getByRole("button", { name: "Edit" });
    expect(view).toHaveAttribute("aria-pressed", "true");

    await user.click(edit);
    expect(edit).toHaveAttribute("aria-pressed", "true");
    await user.click(edit);
    expect(edit).toHaveAttribute("aria-pressed", "true");
  });

  it("shows labels as text unless icon-only", () => {
    renderWithTheme(<Harness />);
    expect(screen.getByText("View")).toBeInTheDocument();
  });
});
