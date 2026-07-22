import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const deleteMutateMock = jest.fn();
jest.mock("../../../hooks/storyboard/useStoryboards", () => ({
  useStoryboards: () => ({
    data: [
      {
        id: "board-1",
        name: "My film",
        shotCount: 3,
        updatedAt: "2024-01-01T00:00:00.000Z"
      }
    ],
    isLoading: false
  }),
  useCreateStoryboard: () => ({ mutateAsync: jest.fn() }),
  useDeleteStoryboard: () => ({ mutate: deleteMutateMock })
}));

const removeBoardMock = jest.fn();
jest.mock("../../../stores/storyboard/StoryboardStore", () => ({
  useStoryboardStore: (selector: (s: unknown) => unknown) =>
    selector({ removeBoard: removeBoardMock })
}));

const closeTabMock = jest.fn();
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  tabId: (type: string, ref: string) => `${type}:${ref}`,
  useWorkspaceTabsStore: (selector: (s: unknown) => unknown) =>
    selector({ openTab: jest.fn(), closeTab: closeTabMock })
}));

import StoryboardSidebar from "../StoryboardSidebar";

const renderSidebar = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StoryboardSidebar activeBoardId="board-1" />
    </ThemeProvider>
  );

beforeEach(() => {
  deleteMutateMock.mockClear();
  removeBoardMock.mockClear();
  closeTabMock.mockClear();
});

describe("StoryboardSidebar delete confirmation", () => {
  it("does not delete until the confirmation is accepted", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole("button", { name: "Delete storyboard" }));

    // The mutation must not fire from the icon click alone.
    expect(deleteMutateMock).not.toHaveBeenCalled();
    expect(screen.getByText("Delete storyboard?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteMutateMock).toHaveBeenCalledWith({ id: "board-1" });
    expect(removeBoardMock).toHaveBeenCalledWith("board-1");
    expect(closeTabMock).toHaveBeenCalledWith("storyboard:board-1");
  });

  it("cancelling the dialog leaves the board untouched", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole("button", { name: "Delete storyboard" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteMutateMock).not.toHaveBeenCalled();
    expect(removeBoardMock).not.toHaveBeenCalled();
  });
});
