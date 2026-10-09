import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Entity } from "@nodetool-ai/protocol";
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

import StoryboardEntitiesField from "../StoryboardEntitiesField";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";

const BOARD = "board-settings-entities";

const entity = (id: string, name: string): Entity =>
  ({
    id,
    name,
    kind: "character",
    descriptor: "",
    reference_images: [{ type: "image", uri: `asset://${id}`, asset_id: id }]
  }) as unknown as Entity;

const mark = entity("mark", "Mark Cruise");
const bazaar = entity("bazaar", "Exotic Bazaar");

const boardEntityIds = () =>
  useStoryboardStore.getState().boards[BOARD]?.entityIds;

const renderField = (entityIds: string[], readOnly = false) => {
  useStoryboardStore.getState().ensureBoard(BOARD);
  useStoryboardStore.getState().setEntityIds(BOARD, entityIds);
  return render(
    <ThemeProvider theme={mockTheme}>
      <StoryboardEntitiesField
        boardId={BOARD}
        entityIds={entityIds}
        readOnly={readOnly}
      />
    </ThemeProvider>
  );
};

beforeEach(() => {
  mockLibrary.splice(0, mockLibrary.length, mark, bazaar);
});

afterEach(() => {
  useStoryboardStore.getState().removeBoard(BOARD);
});

describe("StoryboardEntitiesField", () => {
  it("shows the board's entities as named tiles", () => {
    renderField(["mark"]);
    expect(screen.getAllByTestId("entity-tile")).toHaveLength(1);
    expect(screen.getByText("Mark Cruise")).toBeInTheDocument();
  });

  it("removes an entity from the board", async () => {
    renderField(["mark", "bazaar"]);
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Mark Cruise from the board" })
    );
    expect(boardEntityIds()).toEqual(["bazaar"]);
  });

  it("adds a library entity to the board", async () => {
    renderField(["mark"]);
    await userEvent.click(
      screen.getByRole("button", { name: /Choose entities/ })
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Pick Exotic Bazaar" })
    );
    expect(boardEntityIds()).toEqual(["mark", "bazaar"]);
  });

  it("offers no changes on a read-only board", () => {
    renderField(["mark"], true);
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Choose entities/ })).toBeNull();
  });
});
