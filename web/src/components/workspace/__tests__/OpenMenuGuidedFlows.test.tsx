/**
 * The `[+]` menu's guided flows: the starters the menu lists first. The
 * blank documents below them are covered by `OpenMenuCreate` and friends;
 * this suite covers what the redesign added.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  mockGuidedStarters,
  mockGuidedStarting,
  renderOpenMenu
} from "../openMenuTestHarness";

const startStoryboard = jest.fn(async () => undefined);
const startVideo = jest.fn(async () => undefined);

describe("OpenMenu guided flows", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGuidedStarters.value = [
      {
        id: "storyboard",
        title: "Storyboard",
        description: "From a sentence to a rendered board in four steps.",
        start: startStoryboard
      },
      {
        id: "video",
        title: "Video",
        description: "From a sentence to a cut on the timeline, no board.",
        start: startVideo
      }
    ];
  });

  afterEach(() => {
    mockGuidedStarters.value = [];
    mockGuidedStarting.value = null;
  });

  // The menu stays open while a draft is created, so the item being started
  // says so instead of only going grey with the rest (O7).
  it("shows progress on the flow being started", () => {
    mockGuidedStarting.value = "video";
    renderOpenMenu();

    expect(screen.getByText("Creating…")).toBeInTheDocument();
    expect(
      screen.getByText("From a sentence to a rendered board in four steps.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("From a sentence to a cut on the timeline, no board.")
    ).toBeNull();
  });

  it("lists each guided flow under its own section", () => {
    renderOpenMenu();

    expect(screen.getByText("Guided flows")).toBeInTheDocument();
    expect(screen.getByText("Storyboard")).toBeInTheDocument();
    expect(
      screen.getByText("From a sentence to a rendered board in four steps.")
    ).toBeInTheDocument();
    expect(screen.getByText("Blank documents")).toBeInTheDocument();
  });

  it("shows an icon for every guided flow", () => {
    mockGuidedStarters.value = [
      {
        id: "storyboard",
        title: "Storyboard",
        description: "From a sentence to a rendered board in four steps.",
        icon: <span data-testid="guided-icon" />,
        start: startStoryboard
      }
    ];
    renderOpenMenu();

    expect(screen.getByTestId("guided-icon")).toBeInTheDocument();
  });

  it("starts the guided flow it was asked for", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    renderOpenMenu(onClose);
    await user.click(screen.getByText("Storyboard"));

    await waitFor(() => expect(startStoryboard).toHaveBeenCalledTimes(1));
    expect(startVideo).not.toHaveBeenCalled();
    expect(screen.queryByText("Start Storyboard in…")).not.toBeInTheDocument();
  });
});
