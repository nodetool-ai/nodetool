import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

// Card art resolves through TanStack Query; this suite stands up no
// QueryClientProvider, so use the manual mock.
jest.mock("../../../hooks/useResolvedMediaUri");

import mockTheme from "../../../__mocks__/themeMock";
import { OptionCardGrid } from "../OptionCardGrid";
import type { OptionCardItem } from "../OptionCardGrid";

const options: OptionCardItem[] = [
  { id: "comedy", title: "Comedy", description: "Light and quick" },
  { id: "horror", title: "Horror", image: "asset://horror-still" },
  {
    id: "musical",
    title: "Musical",
    disabled: true,
    disabledReason: "Available once the score flow ships"
  }
];

/** No `selectedId`: a row of cards that each route somewhere. */
const renderNavigation = (onSelect = jest.fn()) => {
  render(
    <ThemeProvider theme={mockTheme}>
      <OptionCardGrid label="Genre" options={options} onSelect={onSelect} />
    </ThemeProvider>
  );
  return onSelect;
};

/** A mutually exclusive choice. */
const renderChoice = (
  selectedId: string | null = null,
  onSelect = jest.fn()
) => {
  render(
    <ThemeProvider theme={mockTheme}>
      <OptionCardGrid
        label="Genre"
        options={options}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </ThemeProvider>
  );
  return onSelect;
};

describe("OptionCardGrid", () => {
  it("calls back with the picked option's id", async () => {
    const user = userEvent.setup();
    const onSelect = renderChoice();

    await user.click(screen.getByRole("radio", { name: /Comedy/ }));

    expect(onSelect).toHaveBeenCalledWith("comedy");
  });

  it("does not fire for a disabled card and names why it is off", async () => {
    const user = userEvent.setup();
    const onSelect = renderChoice();

    const card = screen.getByRole("radio", { name: /Musical/ });
    expect(card).toHaveAttribute("aria-disabled", "true");
    expect(card).toHaveAttribute(
      "title",
      "Available once the score flow ships"
    );

    await user.click(card);

    expect(onSelect).not.toHaveBeenCalled();
  });

  // A mutually exclusive choice is a radio group, not a row of toggles: a
  // toggle says the others could be pressed too.
  it("marks the picked card checked inside a radio group", () => {
    renderChoice("horror");

    expect(
      screen.getByRole("radiogroup", { name: "Genre" })
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Horror/ })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("radio", { name: /Comedy/ })).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });

  it("gives the group one tab stop and moves with the arrow keys", async () => {
    const user = userEvent.setup();
    const onSelect = renderChoice("comedy");

    await user.tab();
    expect(screen.getByRole("radio", { name: /Comedy/ })).toHaveFocus();

    // Musical is off, so the arrow key skips it and wraps.
    await user.keyboard("{ArrowDown}");
    expect(onSelect).toHaveBeenCalledWith("horror");
    expect(screen.getByRole("radio", { name: /Horror/ })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(onSelect).toHaveBeenLastCalledWith("comedy");
    expect(screen.getByRole("radio", { name: /Comedy/ })).toHaveFocus();
  });

  // An entry card opens a flow. It has nothing to be checked or pressed about.
  it("routes navigation cards without selection semantics", async () => {
    const user = userEvent.setup();
    const onSelect = renderNavigation();

    const card = screen.getByRole("button", { name: /Comedy/ });
    expect(card).not.toHaveAttribute("aria-pressed");
    expect(card).not.toHaveAttribute("aria-checked");

    await user.click(card);
    expect(onSelect).toHaveBeenCalledWith("comedy");
  });

  it("renders card art through the media primitive, resolved", () => {
    renderChoice();

    const art = screen
      .getByRole("radio", { name: /Horror/ })
      .querySelector("img");
    expect(art).toHaveAttribute("src", "https://assets.test/horror-still");
  });
});
