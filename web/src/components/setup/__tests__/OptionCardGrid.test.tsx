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

const renderGrid = (onSelect = jest.fn()) => {
  render(
    <ThemeProvider theme={mockTheme}>
      <OptionCardGrid label="Genre" options={options} onSelect={onSelect} />
    </ThemeProvider>
  );
  return onSelect;
};

describe("OptionCardGrid", () => {
  it("calls back with the picked option's id", async () => {
    const user = userEvent.setup();
    const onSelect = renderGrid();

    await user.click(screen.getByRole("button", { name: /Comedy/ }));

    expect(onSelect).toHaveBeenCalledWith("comedy");
  });

  it("does not fire for a disabled card and names why it is off", async () => {
    const user = userEvent.setup();
    const onSelect = renderGrid();

    const card = screen.getByRole("button", { name: /Musical/ });
    expect(card).toHaveAttribute("aria-disabled", "true");
    expect(card).toHaveAttribute(
      "title",
      "Available once the score flow ships"
    );

    await user.click(card);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("marks the selected card pressed", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <OptionCardGrid
          label="Genre"
          options={options}
          selectedId="horror"
          onSelect={jest.fn()}
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("button", { name: /Horror/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: /Comedy/ })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("renders card art through the media primitive, resolved", () => {
    renderGrid();

    const art = screen
      .getByRole("button", { name: /Horror/ })
      .querySelector("img");
    expect(art).toHaveAttribute("src", "https://assets.test/horror-still");
  });
});
