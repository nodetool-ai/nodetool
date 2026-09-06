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

const renderGrid = (
  props: Partial<React.ComponentProps<typeof PresetTileGrid>> = {}
) => {
  const onSelect = jest.fn();
  const onAddOwn = jest.fn();
  const view = render(
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
  return { onSelect, onAddOwn, view };
};

/** The card a select control belongs to: preview area and control together. */
const cardOf = (control: HTMLElement): HTMLElement =>
  control.parentElement as HTMLElement;

describe("PresetTileGrid", () => {
  it("renders a still sample through the media primitive, resolved", () => {
    renderGrid();

    const sample = cardOf(
      screen.getByRole("radio", { name: /Comic/ })
    ).querySelector("img");
    expect(sample).toHaveAttribute("src", "https://assets.test/comic-sample");
  });

  // A plate holding the preset's own name says the same thing as the caption
  // under it, and stands in for art that is not coming. A grid with no sample
  // anywhere is a grid of text cards: the name appears once.
  it("shows no sample box, and the name once, for a grid with no art", () => {
    renderGrid({ presets: [{ id: "documentary", title: "Documentary" }] });

    const card = screen.getByRole("radio", { name: /Documentary/ });
    expect(card).toHaveTextContent("Documentary");
    expect(screen.getAllByText("Documentary")).toHaveLength(1);
    expect(card.querySelector("img")).toBeNull();
  });

  // A sample arrives long after the grid paints. It must land inside the tile
  // it belongs to, not restructure every tile around it.
  it("keeps one card shape when a sample arrives late", () => {
    const { view } = renderGrid({
      presets: [
        { id: "kling", title: "Kling" },
        { id: "veo", title: "Veo" }
      ],
      reservePreview: true
    });
    const before = screen.getByRole("radio", { name: "Veo" });

    view.rerender(
      <ThemeProvider theme={mockTheme}>
        <PresetTileGrid
          label="Art style"
          presets={[
            { id: "kling", title: "Kling", video: "asset://kling-sample" },
            { id: "veo", title: "Veo" }
          ]}
          onSelect={jest.fn()}
          onAddOwn={jest.fn()}
          reservePreview
        />
      </ThemeProvider>
    );

    // The untouched tile keeps its very element, so focus on it survives.
    expect(screen.getByRole("radio", { name: "Veo" })).toBe(before);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("preserves a description on a tile whose preview carries a player", () => {
    renderGrid({
      presets: [
        {
          id: "kling",
          title: "Kling",
          description: "Fast, stylised motion",
          video: "asset://kling-sample"
        }
      ]
    });

    expect(
      screen.getByRole("radio", { name: /Fast, stylised motion/ })
    ).toBeInTheDocument();
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

  // A flow with a real "none" choice routes it through the trailing tile. It
  // is an option, so it selects like one and shows that it is picked.
  it("makes the trailing tile a selectable option when the flow asks", async () => {
    const user = userEvent.setup();
    const { onSelect, onAddOwn } = renderGrid({
      addOwnLabel: "No style",
      addOwnOptionId: "none",
      selectedId: "none"
    });

    const option = screen.getByRole("radio", { name: /No style/ });
    expect(option).toHaveAttribute("aria-checked", "true");

    await user.click(option);
    expect(onSelect).toHaveBeenCalledWith("none");
    expect(onAddOwn).not.toHaveBeenCalled();
  });

  it("selects a preset and marks it checked", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderGrid({ selectedId: "noir" });

    expect(screen.getByRole("radio", { name: /Noir/ })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    await user.click(screen.getByRole("radio", { name: /Comic/ }));
    expect(onSelect).toHaveBeenCalledWith("comic");
  });

  it("gives the whole grid one tab stop and moves with the arrow keys", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderGrid({ selectedId: "noir" });

    await user.tab();
    expect(screen.getByRole("radio", { name: /Noir/ })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(onSelect).toHaveBeenCalledWith("kling");
    expect(screen.getByRole("radio", { name: /Kling/ })).toHaveFocus();

    await user.keyboard("{Home}");
    expect(onSelect).toHaveBeenLastCalledWith("comic");
    expect(screen.getByRole("radio", { name: /Comic/ })).toHaveFocus();
  });

  it("keeps a clip tile's select control outside the player", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderGrid();

    // The player carries its own controls, so the tile is not itself a button.
    const select = screen.getByRole("radio", { name: "Kling" });
    expect(select.querySelector("video")).toBeNull();
    expect(cardOf(select).querySelector("video")).not.toBeNull();

    await user.click(select);
    expect(onSelect).toHaveBeenCalledWith("kling");
  });

  it("names the audition button with the voice, and says what it is doing", () => {
    const { view } = renderGrid({
      presets: [{ id: "aria", title: "Aria", onPlaySample: jest.fn() }],
      aspectRatio: "4/1"
    });

    expect(screen.getByRole("button", { name: "Hear Aria" })).toBeEnabled();

    view.rerender(
      <ThemeProvider theme={mockTheme}>
        <PresetTileGrid
          label="Art style"
          presets={[
            {
              id: "aria",
              title: "Aria",
              onPlaySample: jest.fn(),
              samplePending: true
            }
          ]}
          onSelect={jest.fn()}
          onAddOwn={jest.fn()}
          aspectRatio="4/1"
        />
      </ThemeProvider>
    );

    expect(
      screen.getByRole("button", { name: "Generating sample…" })
    ).toBeDisabled();
  });

  // Returning to the step remounts every cached tile. Autoplaying all of them
  // starts several voices at once over a step nobody asked to hear again.
  it("does not autoplay a cached sample nobody asked for", () => {
    const { view } = renderGrid({
      presets: [
        {
          id: "aria",
          title: "Aria",
          audio: "asset://aria-sample",
          onPlaySample: jest.fn()
        },
        {
          id: "brook",
          title: "Brook",
          audio: "asset://brook-sample",
          onPlaySample: jest.fn()
        }
      ],
      aspectRatio: "4/1"
    });

    const players = view.container.querySelectorAll("audio");
    expect(players).toHaveLength(2);
    players.forEach((player) => expect(player).not.toHaveAttribute("autoplay"));
  });

  it("autoplays only the sample this interaction asked for", async () => {
    const user = userEvent.setup();
    const onPlaySample = jest.fn();
    const { view } = renderGrid({
      presets: [
        { id: "aria", title: "Aria", onPlaySample },
        { id: "brook", title: "Brook", audio: "asset://brook-sample" }
      ],
      aspectRatio: "4/1"
    });

    await user.click(screen.getByRole("button", { name: "Hear Aria" }));
    expect(onPlaySample).toHaveBeenCalledTimes(1);

    // The sample the caller made for the requested tile plays; the tile that
    // was already cached stays quiet.
    view.rerender(
      <ThemeProvider theme={mockTheme}>
        <PresetTileGrid
          label="Art style"
          presets={[
            {
              id: "aria",
              title: "Aria",
              onPlaySample,
              audio: "asset://aria-sample"
            },
            { id: "brook", title: "Brook", audio: "asset://brook-sample" }
          ]}
          onSelect={jest.fn()}
          onAddOwn={jest.fn()}
          aspectRatio="4/1"
        />
      </ThemeProvider>
    );

    const autoplaying = [...view.container.querySelectorAll("audio")].filter(
      (player) => player.hasAttribute("autoplay")
    );
    expect(autoplaying).toHaveLength(1);
    expect(autoplaying[0]).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Aria")
    );
  });
});
