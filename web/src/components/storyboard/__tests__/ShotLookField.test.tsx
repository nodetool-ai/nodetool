import React, { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ShotLookField from "../ShotLookField";
import { BoardStyleDialog } from "../BoardStyleDialog";
import { draftFromShot } from "../shotDraft";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";

jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));
jest.mock("../../../serverState/useStylePresets", () => ({
  useStylePresets: () => ({ data: [] }),
  mergeStylePresetEntities: () => []
}));

const Harness = () => {
  const [draft, setDraft] = useState(
    draftFromShot(
      {
        type: "shot",
        id: "s",
        index: 0,
        action: "A lighthouse",
        status: "planned"
      },
      null
    )
  );
  return (
    <ShotLookField draft={draft} onChange={setDraft} renderMode="keyframe" />
  );
};

it("selects a shot override and clears it to inherit the board", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <Harness />
    </ThemeProvider>
  );
  expect(
    screen.getByText("Empty selection inherits the board look.")
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Choose look" }));
  const option = screen.getByRole("option", { name: /ARRI Alexa/ });
  fireEvent.click(option);
  expect(option).toHaveAttribute("aria-selected", "true");
  fireEvent.click(option);
  expect(option).toHaveAttribute("aria-selected", "false");
});

it("writes a board look from the style dialog and supports undo", () => {
  useStoryboardStore.getState().ensureBoard("looks");
  render(
    <ThemeProvider theme={mockTheme}>
      <BoardStyleDialog boardId="looks" open onClose={jest.fn()} />
    </ThemeProvider>
  );
  fireEvent.click(screen.getByRole("option", { name: /ARRI Alexa/ }));
  expect(useStoryboardStore.getState().boards.looks.look_preset_ids).toEqual([
    "look.arri-alexa"
  ]);
  act(() => useStoryboardStore.getState().undo("looks"));
  expect(useStoryboardStore.getState().boards.looks.look_preset_ids).toEqual(
    []
  );
});

it("counts camera presets against the shot look selection limit", () => {
  const draft = { ...draftFromShot({ type: "shot", id: "s", index: 0, action: "A lighthouse", status: "planned" }, null), presetIds: ["camera.dolly-in", "camera.handheld"], lookPresetIds: ["look.arri-alexa"] };
  render(<ThemeProvider theme={mockTheme}><ShotLookField draft={draft} onChange={jest.fn()} renderMode="keyframe" /></ThemeProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Choose look" }));
  expect(screen.getByRole("option", { name: /Bleach Bypass/i })).toHaveAttribute("aria-disabled", "true");
});
