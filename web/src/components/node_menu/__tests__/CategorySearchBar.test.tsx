/**
 * CategorySearchBar Component Tests
 *
 * Covers the QoL behaviours of the slim filter input shared by the workflow,
 * timeline and sketch list panels: clearing via button/Escape, focus retention
 * after clearing, and the clear button only appearing when there is a value.
 */

import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import CategorySearchBar from "../CategorySearchBar";
import mockTheme from "../../../__mocks__/themeMock";

const Harness: React.FC<{ initial?: string }> = ({ initial = "" }) => {
  const [value, setValue] = useState(initial);
  return (
    <ThemeProvider theme={mockTheme}>
      <CategorySearchBar value={value} onChange={setValue} />
    </ThemeProvider>
  );
};

describe("CategorySearchBar", () => {
  it("does not show the clear button when empty", () => {
    render(<Harness />);
    expect(
      screen.queryByRole("button", { name: "Clear filter" })
    ).not.toBeInTheDocument();
  });

  it("shows the clear button once there is a value", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Filter category"), "abc");
    expect(
      screen.getByRole("button", { name: "Clear filter" })
    ).toBeInTheDocument();
  });

  it("clears the value and keeps focus when the clear button is clicked", async () => {
    const user = userEvent.setup();
    render(<Harness initial="hello" />);
    const input = screen.getByLabelText<HTMLInputElement>("Filter category");

    await user.click(screen.getByRole("button", { name: "Clear filter" }));

    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("clears the value when Escape is pressed in the input", async () => {
    const user = userEvent.setup();
    render(<Harness initial="hello" />);
    const input = screen.getByLabelText<HTMLInputElement>("Filter category");

    input.focus();
    await user.keyboard("{Escape}");

    expect(input).toHaveValue("");
  });
});
