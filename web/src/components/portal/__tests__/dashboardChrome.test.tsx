import React, { useRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { DashboardSearchBox } from "../dashboardChrome";

const renderBox = (
  props: Partial<React.ComponentProps<typeof DashboardSearchBox>> = {}
) => {
  const onChange = props.onChange ?? jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <DashboardSearchBox
        value={props.value ?? ""}
        onChange={onChange}
        placeholder={props.placeholder ?? "Search…"}
        aria-label={props["aria-label"] ?? "Search"}
        kbd={props.kbd}
      />
    </ThemeProvider>
  );
  return { onChange };
};

describe("DashboardSearchBox", () => {
  it("shows the keyboard hint when empty and no clear button", () => {
    renderBox({ value: "", kbd: "/" });
    expect(screen.getByText("/")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /clear search/i })
    ).not.toBeInTheDocument();
  });

  it("replaces the hint with a clear button once there is a value", () => {
    renderBox({ value: "hello", kbd: "/" });
    expect(screen.queryByText("/")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /clear search/i })
    ).toBeInTheDocument();
  });

  it("clears the value when the clear button is clicked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderBox({ value: "hello" });
    await user.click(screen.getByRole("button", { name: /clear search/i }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("clears the value when Escape is pressed in the input", async () => {
    const user = userEvent.setup();
    const { onChange } = renderBox({ value: "hello", "aria-label": "Search" });
    const input = screen.getByLabelText("Search");
    input.focus();
    await user.keyboard("{Escape}");
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("forwards a ref to the underlying input so it can be focused", () => {
    const Harness = () => {
      const ref = useRef<HTMLInputElement>(null);
      return (
        <>
          <button onClick={() => ref.current?.focus()}>focus</button>
          <DashboardSearchBox
            ref={ref}
            value=""
            onChange={jest.fn()}
            placeholder="Search…"
            aria-label="Search"
          />
        </>
      );
    };
    render(
      <ThemeProvider theme={mockTheme}>
        <Harness />
      </ThemeProvider>
    );
    screen.getByText("focus").click();
    expect(screen.getByLabelText("Search")).toHaveFocus();
  });
});
