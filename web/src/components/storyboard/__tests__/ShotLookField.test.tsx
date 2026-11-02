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

const Harness: React.FC<{ boardLookIds?: readonly string[] }> = ({ boardLookIds }) => {
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
    <ShotLookField
      draft={draft}
      onChange={setDraft}
      renderMode="keyframe"
      boardLookIds={boardLookIds}
    />
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

it("labels the field and names the board looks an empty shot inherits", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <Harness boardLookIds={["look.arri-alexa", "look.teal-amber"]} />
    </ThemeProvider>
  );
  expect(screen.getByText("Shot look")).toBeVisible();
  expect(
    screen.getByText("Using the board look: ARRI Alexa, Teal and amber")
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Choose look" }));
  fireEvent.click(screen.getByRole("option", { name: /Bolex H16/ }));
  expect(screen.queryByText(/Using the board look/)).not.toBeInTheDocument();
});

it("puts the art style above the board look in the style dialog", () => {
  useStoryboardStore.getState().ensureBoard("order");
  render(
    <ThemeProvider theme={mockTheme}>
      <BoardStyleDialog boardId="order" open onClose={jest.fn()} />
    </ThemeProvider>
  );
  const artStyle = screen.getByText("Art style");
  const boardLook = screen.getByText("Board look");
  expect(
    artStyle.compareDocumentPosition(boardLook) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
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
