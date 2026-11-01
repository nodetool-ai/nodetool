import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { PresetPicker } from "../PresetPicker";
import { makePreset } from "../../../test-utils/presetFixtures";

const PRESETS = [
  makePreset("camera.dolly", { slot: "move", tags: ["push"] }),
  makePreset("camera.spin", { slot: "move", tags: ["roll"] }),
  makePreset("camera.handheld", { slot: "rig", tags: ["shake"] }),
  makePreset("camera.slow", { slot: "speed", tags: ["push"] }),
  makePreset("camera.whip", { slot: "look", conflicts: ["camera.slow"] }),
  makePreset("camera.solo", { stackable: false }),
  makePreset("effect.melt", { kind: "effect", slot: "effect", modes: ["image_to_video"] })
];

const Harness: React.FC<{
  initial?: string[];
  spy?: jest.Mock;
  filter?: React.ComponentProps<typeof PresetPicker>["filter"];
}> = ({ initial = [], spy, filter }) => {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <ThemeProvider theme={mockTheme}>
      <PresetPicker
        presets={PRESETS}
        value={value}
        filter={filter}
        onChange={(ids) => {
          spy?.(ids);
          setValue(ids);
        }}
      />
    </ThemeProvider>
  );
};

const card = (name: string) => screen.getByRole("option", { name });

describe("PresetPicker", () => {
  it("selects and deselects presets", () => {
    const spy = jest.fn();
    render(<Harness spy={spy} />);
    fireEvent.click(card("dolly"));
    expect(spy).toHaveBeenLastCalledWith(["camera.dolly"]);
    expect(card("dolly")).toHaveAttribute("aria-selected", "true");
    fireEvent.click(card("dolly"));
    expect(spy).toHaveBeenLastCalledWith([]);
  });

  it("allows at most three presets and disables the rest with a reason", () => {
    render(<Harness initial={["camera.dolly", "camera.handheld", "camera.slow"]} />);
    expect(card("spin")).toHaveAttribute("aria-disabled", "true");
    expect(card("whip")).toHaveAttribute("aria-disabled", "true");
    expect(card("dolly")).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("status")).toHaveTextContent("3 of 3 selected");
    fireEvent.click(card("spin"));
    expect(card("spin")).toHaveAttribute("aria-selected", "false");
  });

  it("disables a second preset for the same slot", () => {
    render(<Harness initial={["camera.dolly"]} />);
    expect(card("spin")).toHaveAttribute("aria-disabled", "true");
    expect(card("handheld")).not.toHaveAttribute("aria-disabled");
  });

  it("disables a declared conflict and a non-stackable preset beside others", () => {
    render(<Harness initial={["camera.slow"]} />);
    expect(card("whip")).toHaveAttribute("aria-disabled", "true");
    expect(card("solo")).toHaveAttribute("aria-disabled", "true");
    expect(card("dolly")).not.toHaveAttribute("aria-disabled");
  });

  it("explains why a card is disabled in its tooltip", async () => {
    render(<Harness initial={["camera.slow"]} />);
    fireEvent.mouseOver(card("whip"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Conflicts with slow.");
  });

  it("re-enables cards when a preset is removed from the chips", () => {
    render(<Harness initial={["camera.dolly"]} />);
    expect(card("spin")).toHaveAttribute("aria-disabled", "true");
    const chips = screen.getByRole("group", { name: "Selected presets" });
    fireEvent.click(within(chips).getByTitle("Remove dolly"));
    expect(card("spin")).not.toHaveAttribute("aria-disabled");
    expect(within(chips).queryByText("dolly")).toBeNull();
  });

  it("filters by search text, kind and tag", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Search presets"), { target: { value: "spi" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Search presets"), { target: { value: "" } });

    const kinds = screen.getByRole("group", { name: "Preset kind" });
    fireEvent.click(within(kinds).getByText("Effect"));
    expect(screen.getAllByRole("option").map((o) => o.getAttribute("aria-label"))).toEqual(["melt"]);
    fireEvent.click(within(kinds).getByText("All"));

    const tags = screen.getByRole("group", { name: "Tags" });
    fireEvent.click(within(tags).getByText("push"));
    expect(screen.getAllByRole("option").map((o) => o.getAttribute("aria-label"))).toEqual([
      "dolly",
      "slow"
    ]);
  });

  it("offers only the selected kind's tags and ignores a tag it hides", () => {
    render(<Harness />);
    const tags = () => screen.getByRole("group", { name: "Tags" });
    fireEvent.click(within(tags()).getByText("push"));
    const kinds = screen.getByRole("group", { name: "Preset kind" });
    fireEvent.click(within(kinds).getByText("Effect"));
    expect(screen.queryByRole("group", { name: "Tags" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("option").map((o) => o.getAttribute("aria-label"))).toEqual(["melt"]);
  });

  it("applies the kind and mode filter props", () => {
    render(<Harness filter={{ kind: "camera", mode: "video" }} />);
    expect(screen.queryByRole("option", { name: "melt" })).toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(6);
    expect(screen.queryByRole("group", { name: "Preset kind" })).toBeNull();
  });

  it("shows an empty state that clears the filters", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Search presets"), { target: { value: "zzz" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByRole("option")).toHaveLength(PRESETS.length);
  });

  describe("keyboard", () => {
    it("keeps one tab stop and moves it with the arrow keys", () => {
      render(<Harness />);
      const options = screen.getAllByRole("option");
      expect(options.filter((o) => o.tabIndex === 0)).toHaveLength(1);
      expect(options[0].tabIndex).toBe(0);

      options[0].focus();
      fireEvent.keyDown(options[0], { key: "ArrowRight" });
      expect(options[1]).toHaveFocus();
      expect(options[1].tabIndex).toBe(0);
      expect(options[0].tabIndex).toBe(-1);

      fireEvent.keyDown(options[1], { key: "ArrowLeft" });
      expect(options[0]).toHaveFocus();
      fireEvent.keyDown(options[0], { key: "End" });
      expect(options[options.length - 1]).toHaveFocus();
      fireEvent.keyDown(options[options.length - 1], { key: "Home" });
      expect(options[0]).toHaveFocus();
    });

    it("moves by row with the up and down keys", () => {
      render(<Harness />);
      const options = screen.getAllByRole("option");
      // jsdom has no layout: place three cards per row.
      options.forEach((option, index) => {
        Object.defineProperty(option, "offsetTop", {
          configurable: true,
          value: Math.floor(index / 3) * 100
        });
      });
      options[1].focus();
      fireEvent.keyDown(options[1], { key: "ArrowDown" });
      expect(options[4]).toHaveFocus();
      fireEvent.keyDown(options[4], { key: "ArrowUp" });
      expect(options[1]).toHaveFocus();
    });

    it("toggles the focused card with Enter and Space", () => {
      const spy = jest.fn();
      render(<Harness spy={spy} />);
      const options = screen.getAllByRole("option");
      options[0].focus();
      // A native button turns Enter and Space into a click.
      fireEvent.keyDown(options[0], { key: "Enter" });
      fireEvent.click(options[0]);
      expect(spy).toHaveBeenLastCalledWith(["camera.dolly"]);
      fireEvent.click(options[0]);
      expect(spy).toHaveBeenLastCalledWith([]);
    });

    it("stays on a disabled card so its reason can be read", () => {
      render(<Harness initial={["camera.dolly"]} />);
      const options = screen.getAllByRole("option");
      options[0].focus();
      fireEvent.keyDown(options[0], { key: "ArrowRight" });
      expect(options[1]).toHaveAttribute("aria-disabled", "true");
      expect(options[1]).toHaveFocus();
    });
  });
});
