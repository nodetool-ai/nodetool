import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Entity } from "@nodetool-ai/protocol";

import mockTheme from "../../../__mocks__/themeMock";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";

const projectEntities: Entity[] = [
  {
    type: "entity",
    id: "character-a",
    project_id: "project-a",
    kind: "character",
    name: "Marta",
    descriptor: "A tall woman"
  }
];

jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: projectEntities })
}));
jest.mock("../../../serverState/useStylePresets", () => ({
  ...jest.requireActual("../../../serverState/useStylePresets"),
  useStylePresets: () => ({
    data: [
      {
        entityId: "system-comic",
        presetId: "comic",
        name: "Comic",
        descriptor: "Bold inked comic panels",
        thumbnail: "package://nodetool-base/styles/comic.jpg"
      }
    ]
  })
}));

import BoardStyleDialog from "../BoardStyleDialog";

const BOARD_ID = "board-a";

describe("BoardStyleDialog project presets", () => {
  beforeEach(() => {
    useStoryboardStore.setState({
      boards: {},
      history: {},
      serverRevisions: {}
    });
    useStoryboardStore.getState().ensureBoard(BOARD_ID);
    useStoryboardStore
      .getState()
      .setEntityIds(BOARD_ID, [projectEntities[0].id]);
  });

  it("applies a shipped style while a named project is active", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={mockTheme}>
          <BoardStyleDialog boardId={BOARD_ID} open onClose={jest.fn()} />
        </ThemeProvider>
      </QueryClientProvider>
    );
    await userEvent.click(screen.getByRole("radio", { name: /Comic/ }));

    const board = useStoryboardStore.getState().boards[BOARD_ID];
    expect(board.style).toBe("Bold inked comic panels");
    expect(board.entityIds).toEqual(["character-a", "system-comic"]);
  });
});
