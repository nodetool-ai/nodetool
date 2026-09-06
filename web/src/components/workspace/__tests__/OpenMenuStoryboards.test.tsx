/**
 * The `[+]` menu's storyboard submenu: a blank board, and the boards that ship
 * with the install. Installing one opens it as a tab, which is the whole point
 * of shipping them.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  mockExampleStoryboards,
  mockOpenMenu,
  renderOpenMenu
} from "../openMenuTestHarness";

const openSubmenu = async () => {
  const user = userEvent.setup();
  renderOpenMenu();
  await user.click(screen.getByText("New storyboard…"));
  return user;
};

describe("OpenMenu storyboards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExampleStoryboards.value = [
      {
        slug: "lighthouse-keeper",
        name: "Lighthouse Keeper — Opening",
        description: "A four-shot opening.",
        tags: [],
        shotCount: 4,
        clipCount: 4,
        aspectRatio: "16:9",
        thumbnailUrl: "/api/assets/packages/nodetool-base/storyboards/x.jpg"
      }
    ];
    mockOpenMenu.createStoryboard.mockResolvedValue({
      id: "board-blank",
      name: "Untitled storyboard"
    });
    mockOpenMenu.installExample.mockResolvedValue({
      id: "board-1",
      name: "Lighthouse Keeper — Opening"
    });
  });

  it("offers a blank board and every shipped example", async () => {
    await openSubmenu();
    expect(screen.getByText("Blank storyboard")).toBeInTheDocument();
    expect(screen.getByText("Lighthouse Keeper — Opening")).toBeInTheDocument();
    expect(screen.getByText("4 shots, already rendered")).toBeInTheDocument();
  });

  it("installs the example it was asked for and opens it", async () => {
    const user = await openSubmenu();
    await user.click(screen.getByText("Lighthouse Keeper — Opening"));

    await waitFor(() =>
      expect(mockOpenMenu.installExample).toHaveBeenCalledWith({
        slug: "lighthouse-keeper",
        projectId: "default"
      })
    );
    expect(mockOpenMenu.openTab).toHaveBeenCalledWith({
      type: "storyboard",
      ref: "board-1",
      mode: "edit",
      title: "Lighthouse Keeper — Opening"
    });
    expect(mockOpenMenu.createStoryboard).not.toHaveBeenCalled();
  });

  it("still creates an empty board from the same submenu", async () => {
    const user = await openSubmenu();
    await user.click(screen.getByText("Blank storyboard"));

    await waitFor(() => expect(mockOpenMenu.createStoryboard).toHaveBeenCalled());
    expect(mockOpenMenu.openTab).toHaveBeenCalledWith({
      type: "storyboard",
      ref: "board-blank",
      mode: "edit",
      title: "Untitled storyboard"
    });
  });

  it("reports a failed install instead of dying quietly", async () => {
    mockOpenMenu.installExample.mockRejectedValueOnce(
      new Error("disk on fire")
    );
    const user = await openSubmenu();
    await user.click(screen.getByText("Lighthouse Keeper — Opening"));

    await waitFor(() => expect(mockOpenMenu.addNotification).toHaveBeenCalled());
    expect(mockOpenMenu.addNotification.mock.calls[0][0].content).toContain(
      "disk on fire"
    );
    expect(mockOpenMenu.openTab).not.toHaveBeenCalled();
  });
});
