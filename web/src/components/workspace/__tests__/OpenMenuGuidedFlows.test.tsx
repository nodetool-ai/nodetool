/**
 * The `[+]` menu's guided flows: the starters the menu lists first. The
 * blank documents below them are covered by `OpenMenuCreate` and friends;
 * this suite covers what the redesign added.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  mockCancelDestination,
  mockGuidedDestination,
  mockGuidedStarters,
  mockPickDestination,
  renderOpenMenu
} from "../openMenuTestHarness";

const startStoryboard = jest.fn(async () => undefined);
const startVideo = jest.fn(async () => undefined);

describe("OpenMenu guided flows", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGuidedDestination.pending = null;
    mockGuidedDestination.projectName = "Personal";
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
  });

  it("asks where the flow should live once it is waiting", () => {
    mockGuidedDestination.pending = { id: "storyboard", title: "Storyboard" };
    mockGuidedDestination.projectName = "Aurora launch";
    renderOpenMenu();

    expect(screen.getByText("Start Storyboard in…")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Start in current project, Aurora launch"
      })
    ).toBeInTheDocument();
  });

  it("resolves the waiting flow into the picked destination", async () => {
    const user = userEvent.setup();
    mockGuidedDestination.pending = { id: "storyboard", title: "Storyboard" };
    renderOpenMenu();

    await user.click(
      screen.getByRole("button", { name: "Start in a new project" })
    );
    expect(mockPickDestination).toHaveBeenCalledWith("new");
  });

  it("drops the wait when the picker closes", async () => {
    const user = userEvent.setup();
    mockGuidedDestination.pending = { id: "storyboard", title: "Storyboard" };
    renderOpenMenu();

    await user.keyboard("{Escape}");
    expect(mockCancelDestination).toHaveBeenCalled();
    expect(startStoryboard).not.toHaveBeenCalled();
  });
});
