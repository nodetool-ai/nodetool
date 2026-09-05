import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

// Preset samples resolve through TanStack Query; this suite stands up no
// QueryClientProvider, so use the manual mock.
jest.mock("../../../hooks/useResolvedMediaUri");

import mockTheme from "../../../__mocks__/themeMock";
import { PresetTileGrid } from "../PresetTileGrid";
import type { PresetTile } from "../PresetTileGrid";

const presets: PresetTile[] = [
  { id: "comic", title: "Comic", image: "asset://comic-sample" },
  { id: "noir", title: "Noir", image: "asset://noir-sample" },
  { id: "kling", title: "Kling", video: "asset://kling-sample" }
];

const renderGrid = (props: Partial<React.ComponentProps<typeof PresetTileGrid>> = {}) => {
  const onSelect = jest.fn();
  const onAddOwn = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <PresetTileGrid
        label="Art style"
        presets={presets}
        onSelect={onSelect}
        onAddOwn={onAddOwn}
        {...props}
      />
    </ThemeProvider>
  );
  return { onSelect, onAddOwn };
};

describe("PresetTileGrid", () => {
  it("renders a still sample through the media primitive, resolved", () => {
    renderGrid();

    const sample = screen
      .getByRole("button", { name: /Comic/ })
      .querySelector("img");
    expect(sample).toHaveAttribute("src", "https://assets.test/comic-sample");
  });

  it("calls back for the trailing Add your own tile", async () => {
    const user = userEvent.setup();
    const { onAddOwn, onSelect } = renderGrid();

    await user.click(screen.getByRole("button", { name: /Add your own/ }));

    expect(onAddOwn).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("uses the flow's own label for the trailing tile", () => {
    renderGrid({ addOwnLabel: "Add your own style" });

    expect(
      screen.getByRole("button", { name: /Add your own style/ })
    ).toBeInTheDocument();
  });

  it("selects a preset and marks it pressed", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderGrid({ selectedId: "noir" });

    expect(screen.getByRole("button", { name: /Noir/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await user.click(screen.getByRole("button", { name: /Comic/ }));
    expect(onSelect).toHaveBeenCalledWith("comic");
  });

  it("keeps a clip tile's select control outside the player", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderGrid();

    // The player carries its own controls, so the tile is not itself a button.
    const select = screen.getByRole("button", { name: "Kling" });
    expect(select.querySelector("video")).toBeNull();

    await user.click(select);
    expect(onSelect).toHaveBeenCalledWith("kling");
  });
});
