import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { SearchInput } from "../SearchInput";

const renderWithTheme = (component: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);

describe("SearchInput", () => {
  it("names the input after its placeholder", () => {
    renderWithTheme(
      <SearchInput value="" onChange={jest.fn()} placeholder="Search apps" />
    );
    expect(screen.getByRole("textbox", { name: "Search apps" })).toBeInTheDocument();
  });

  it("prefers an explicit ariaLabel over the placeholder", () => {
    renderWithTheme(
      <SearchInput
        value=""
        onChange={jest.fn()}
        placeholder="Search…"
        ariaLabel="Search workflows"
      />
    );
    expect(
      screen.getByRole("textbox", { name: "Search workflows" })
    ).toBeInTheDocument();
  });

  it("drops a pending debounced change when the value is cleared", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onChange = jest.fn();
    renderWithTheme(
      <SearchInput
        value=""
        onChange={onChange}
        placeholder="Search"
        debounceMs={200}
      />
    );

    await user.type(screen.getByRole("textbox"), "abc");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // The debounced "abc" must not land after the clear and resurrect the query.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("");
    jest.useRealTimers();
  });

  it("keeps Escape from closing the surface while there is a query to clear", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const onEscape = jest.fn();
    renderWithTheme(
      <div onKeyDown={onEscape}>
        <SearchInput value="abc" onChange={onChange} placeholder="Search" />
      </div>
    );

    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Escape}");

    expect(onChange).toHaveBeenCalledWith("");
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("lets Escape through once the query is empty", async () => {
    const user = userEvent.setup();
    const onEscape = jest.fn();
    renderWithTheme(
      <div onKeyDown={onEscape}>
        <SearchInput value="" onChange={jest.fn()} placeholder="Search" />
      </div>
    );

    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Escape}");

    expect(onEscape).toHaveBeenCalled();
  });
});
