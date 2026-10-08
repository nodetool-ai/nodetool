/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { TimelineProvider } from "../../../stores/timeline/TimelineInstance";
import { useSettingsStore } from "../../../stores/SettingsStore";
import { ToolToggle } from "../ToolToggle";

const renderToggle = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <ToolToggle />
      </TimelineProvider>
    </ThemeProvider>
  );

describe("ToolToggle", () => {
  afterEach(() => {
    act(() =>
      useSettingsStore.getState().updateSettings({ timelineKeyboardPreset: "nodetool" })
    );
  });

  it("announces the drop modes as one exclusive radio group", async () => {
    renderToggle();
    const group = screen.getByRole("radiogroup", { name: "Drop mode" });
    expect(group).toBeInTheDocument();
    const insert = screen.getByRole("radio", { name: "Insert" });
    await userEvent.click(insert);
    expect(insert).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Overwrite" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
    expect(screen.getByRole("button", { name: "Ripple" })).toHaveAttribute(
      "aria-pressed"
    );
  });

  it("moves the checked drop mode with the arrow keys", async () => {
    renderToggle();
    const overwrite = screen.getByRole("radio", { name: "Overwrite" });
    expect(overwrite).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Insert" })).toHaveAttribute(
      "tabindex",
      "-1"
    );
    act(() => overwrite.focus());
    await userEvent.keyboard("{ArrowRight}");
    const insert = screen.getByRole("radio", { name: "Insert" });
    expect(insert).toHaveAttribute("aria-checked", "true");
    expect(insert).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Overlap" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("shows the active layout's tool key in the tooltip", async () => {
    act(() =>
      useSettingsStore.getState().updateSettings({ timelineKeyboardPreset: "fcp" })
    );
    renderToggle();
    await userEvent.hover(screen.getByRole("button", { name: "Select" }));
    expect(await screen.findByText("Select (A)")).toBeInTheDocument();
  });
});
