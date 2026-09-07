import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Entity } from "@nodetool-ai/protocol";
import mockTheme from "../../../../__mocks__/themeMock";

const entities: Entity[] = [
  {
    type: "entity",
    id: "mara",
    project_id: "default",
    kind: "character",
    name: "Mara",
    descriptor: "Mara wears a red raincoat",
    reference_images: [],
    voice_id: null,
    lora: null,
    palette: null
  },
  {
    type: "entity",
    id: "station",
    project_id: "default",
    kind: "location",
    name: "Station",
    descriptor: "An empty concrete station",
    reference_images: [],
    voice_id: null,
    lora: null,
    palette: null
  }
];

jest.mock("../../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: entities, isLoading: false })
}));
jest.mock("../../../entities/EntityAssetPickerDialog", () => () => null);
jest.mock("../../../entities/EntityEditorDialog", () => () => null);

import { useStoryboardStore } from "../../../../stores/storyboard/StoryboardStore";
import { EntitiesStep } from "../EntitiesStep";

const BOARD_ID = "board";

beforeEach(() => {
  useStoryboardStore.setState({ boards: {} });
  useStoryboardStore.getState().ensureBoard(BOARD_ID);
  useStoryboardStore.getState().setScreenplay(BOARD_ID, {
    type: "screenplay",
    id: "screenplay",
    title: "Rain",
    shots: [
      {
        type: "shot",
        id: "shot-1",
        index: 0,
        action: "Mara waits",
        status: "planned"
      },
      {
        type: "shot",
        id: "shot-2",
        index: 1,
        action: "The empty road",
        status: "planned"
      }
    ]
  });
});

it("assigns a selected entity to matching shots, then allows shot refinement", async () => {
  const user = userEvent.setup();
  render(
    <ThemeProvider theme={mockTheme}>
      <EntitiesStep boardId={BOARD_ID} />
    </ThemeProvider>
  );

  await user.click(screen.getByRole("checkbox", { name: "Mara · character" }));

  let board = useStoryboardStore.getState().getBoard(BOARD_ID);
  expect(board?.entityIds).toEqual(["mara"]);
  expect(board?.shots.map((shot) => shot.entity_ids)).toEqual([["mara"], []]);

  const shotAssignments = screen.getAllByRole("checkbox", { name: "Mara" });
  await user.click(shotAssignments[1]);

  board = useStoryboardStore.getState().getBoard(BOARD_ID);
  expect(board?.shots.map((shot) => shot.entity_ids)).toEqual([
    ["mara"],
    ["mara"]
  ]);

  await user.click(
    screen.getByRole("checkbox", { name: "Station · location" })
  );
  board = useStoryboardStore.getState().getBoard(BOARD_ID);
  expect(board?.shots.map((shot) => shot.entity_ids)).toEqual([
    ["mara", "station"],
    ["mara", "station"]
  ]);
});

it("filters the library without losing selections or shot assignments", async () => {
  const user = userEvent.setup();
  render(
    <ThemeProvider theme={mockTheme}>
      <EntitiesStep boardId={BOARD_ID} />
    </ThemeProvider>
  );

  await user.click(screen.getByRole("checkbox", { name: "Mara · character" }));
  await user.type(
    screen.getByRole("textbox", { name: "Search entities" }),
    "concrete"
  );
  expect(
    screen.queryByRole("checkbox", { name: "Mara · character" })
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("checkbox", { name: "Station · location" })
  ).not.toBeChecked();
  expect(screen.getByRole("status")).toHaveTextContent(
    "1 selected for this storyboard"
  );

  await user.click(screen.getByRole("button", { name: "Clear search" }));
  await user.click(screen.getByRole("button", { name: "Selected (1)" }));
  expect(
    screen.getByRole("checkbox", { name: "Mara · character" })
  ).toBeChecked();
  expect(
    screen.queryByRole("checkbox", { name: "Station · location" })
  ).not.toBeInTheDocument();
  expect(screen.getAllByRole("checkbox", { name: "Mara" })[0]).toBeChecked();
});
