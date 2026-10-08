import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Entity, Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../hooks/useResolvedMediaUri");

const mockLibrary: Entity[] = [];
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: mockLibrary, isLoading: false })
}));

// The library picker renders asset previews that need the app's providers;
// stand in one button per library entity.
jest.mock("../../entities/EntityPicker", () => ({
  __esModule: true,
  default: ({ onSelect }: { onSelect: (entity: Entity) => void }) => (
    <div>
      {mockLibrary.map((item) => (
        <button key={item.id} type="button" onClick={() => onSelect(item)}>
          {`Pick ${item.name}`}
        </button>
      ))}
    </div>
  )
}));

import ShotEntitiesField from "../ShotEntitiesField";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";

const BOARD = "board-entities";

const entity = (id: string, name: string): Entity =>
  ({
    id,
    name,
    kind: "character",
    descriptor: "",
    reference_images: [{ type: "image", uri: `asset://${id}`, asset_id: id }]
  }) as unknown as Entity;

const mark = entity("mark", "Mark Cruise");
const katy = entity("katy", "Katy Cruise");
const bazaar = entity("bazaar", "Exotic Bazaar");

const seed = (entityIds: string[], shotEntityIds?: string[]) => {
  const store = useStoryboardStore.getState();
  store.ensureBoard(BOARD);
  store.setEntityIds(BOARD, entityIds);
  store.upsertShot(BOARD, {
    type: "shot",
    id: "shot-1",
    index: 0,
    action: "At the bazaar",
    status: "planned",
    ...(shotEntityIds && { entity_ids: shotEntityIds })
  } as Shot);
};

const shotEntityIds = () =>
  useStoryboardStore
    .getState()
    .boards[BOARD]?.shots.find((s) => s.id === "shot-1")?.entity_ids;

const renderField = (
  boardEntities: Entity[],
  appliedIds: string[],
  readOnly = false
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ShotEntitiesField
        boardId={BOARD}
        shotId="shot-1"
        boardEntities={boardEntities}
        appliedIds={appliedIds}
        boardEntityIds={boardEntities.map((e) => e.id)}
        readOnly={readOnly}
      />
    </ThemeProvider>
  );

beforeEach(() => {
  mockLibrary.splice(0, mockLibrary.length, mark, katy, bazaar);
});

afterEach(() => {
  useStoryboardStore.getState().removeBoard(BOARD);
});

describe("ShotEntitiesField", () => {
  it("shows a named tile for each entity in the shot", () => {
    seed(["mark", "katy"], ["mark", "katy"]);
    renderField([mark, katy], ["mark", "katy"]);
    const tiles = screen.getAllByTestId("entity-tile");
    expect(tiles).toHaveLength(2);
    expect(screen.getByText("Mark Cruise")).toBeInTheDocument();
    expect(screen.getByText("Katy Cruise")).toBeInTheDocument();
  });

  it("removes an entity from the shot", async () => {
    seed(["mark", "katy"], ["mark", "katy"]);
    renderField([mark, katy], ["mark", "katy"]);
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Katy Cruise from this shot" })
    );
    expect(shotEntityIds()).toEqual(["mark"]);
  });

  it("adds a library entity to the board and the shot", async () => {
    seed(["mark"], ["mark"]);
    renderField([mark], ["mark"]);
    await userEvent.click(
      screen.getByRole("button", { name: /Choose entities/ })
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Pick Exotic Bazaar" })
    );
    expect(useStoryboardStore.getState().boards[BOARD]?.entityIds).toEqual([
      "mark",
      "bazaar"
    ]);
    expect(shotEntityIds()).toEqual(["mark", "bazaar"]);
  });

  it("offers no changes on a read-only board", () => {
    seed(["mark"], ["mark"]);
    renderField([mark], ["mark"], true);
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Choose entities/ })).toBeNull();
  });
});
