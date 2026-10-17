import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { TabGroup } from "../TabGroup";

const renderWithTheme = (component: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);

const TABS = [
  { value: "params", label: "Params", count: 4 },
  { value: "io", label: "I/O", count: 0 },
  { value: "help", label: "Help" }
];

describe("TabGroup", () => {
  it("renders a labelled tablist with one tab per item", () => {
    renderWithTheme(
      <TabGroup
        tabs={TABS}
        value="params"
        onChange={jest.fn()}
        aria-label="Sections"
      />
    );
    expect(screen.getByRole("tablist", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: /Params/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("shows a count after the label, including zero, and none when omitted", () => {
    renderWithTheme(
      <TabGroup tabs={TABS} value="params" onChange={jest.fn()} />
    );
    expect(screen.getByRole("tab", { name: /Params/ })).toHaveTextContent(
      "Params4"
    );
    expect(screen.getByRole("tab", { name: /I\/O/ })).toHaveTextContent("I/O0");
    expect(
      screen.getByRole("tab", { name: "Help" }).querySelector(".tab-group-count")
    ).toBeNull();
  });

  it("reports a click on another tab through onChange", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    renderWithTheme(<TabGroup tabs={TABS} value="params" onChange={onChange} />);
    await user.click(screen.getByRole("tab", { name: "Help" }));
    expect(onChange).toHaveBeenCalledWith("help");
  });

  it("reports a click on the selected tab through onReselect", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const onReselect = jest.fn();
    renderWithTheme(
      <TabGroup
        tabs={TABS}
        value="params"
        onChange={onChange}
        onReselect={onReselect}
      />
    );
    await user.click(screen.getByRole("tab", { name: /Params/ }));
    expect(onReselect).toHaveBeenCalledWith("params");
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("tab", { name: "Help" }));
    expect(onReselect).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("help");
  });

  it("selects no tab when value is false", () => {
    renderWithTheme(<TabGroup tabs={TABS} value={false} onChange={jest.fn()} />);
    screen
      .getAllByRole("tab")
      .forEach((tab) => expect(tab).toHaveAttribute("aria-selected", "false"));
  });

  it("lays the tabs out vertically", () => {
    renderWithTheme(
      <TabGroup
        tabs={TABS}
        value="io"
        orientation="vertical"
        onChange={jest.fn()}
      />
    );
    expect(screen.getByRole("tablist")).toHaveAttribute(
      "aria-orientation",
      "vertical"
    );
  });
});
