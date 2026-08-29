/**
 * The `[+]` menu's storyboard submenu: a blank board, and the boards that ship
 * with the install. Installing one opens it as a tab, which is the whole point
 * of shipping them.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const examples = {
  value: [
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
  ]
};
const createStoryboard = jest.fn(async () => ({
  id: "board-blank",
  name: "Untitled storyboard"
}));
const installExample = jest.fn(async () => ({
  id: "board-1",
  name: "Lighthouse Keeper — Opening"
}));

jest.mock("../../../hooks/storyboard/useStoryboards", () => ({
  useCreateStoryboard: () => ({ mutateAsync: createStoryboard }),
  useExampleStoryboards: (enabled: boolean) => ({
    data: enabled ? examples.value : undefined,
    isLoading: false
  }),
  useInstallExampleStoryboard: () => ({ mutateAsync: installExample })
}));

const openTab = jest.fn();
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "default",
  useWorkspaceTabsStore: <T,>(selector: (s: { openTab: jest.Mock }) => T) =>
    selector({ openTab })
}));

const addNotification = jest.fn();
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(
    selector: (s: { addNotification: jest.Mock }) => T
  ) => selector({ addNotification })
}));

jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: <T,>(selector: (s: { createAsset: jest.Mock }) => T) =>
    selector({ createAsset: jest.fn() })
}));

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: <T,>(selector: (s: { createNew: jest.Mock }) => T) =>
    selector({ createNew: jest.fn() })
}));

jest.mock("../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: <T,>(selector: (s: { createNewThread: jest.Mock }) => T) =>
    selector({ createNewThread: jest.fn() })
}));

jest.mock("../../../hooks/useTimelineSequence", () => ({
  useCreateTimeline: () => ({ mutateAsync: jest.fn() })
}));
jest.mock("../../../hooks/useApplications", () => ({
  useCreateApplication: () => ({ mutateAsync: jest.fn() })
}));
jest.mock("../../../hooks/script/useScripts", () => ({
  useCreateScript: () => ({ mutateAsync: jest.fn() })
}));
jest.mock("../../../hooks/jsScript/useJsScripts", () => ({
  useCreateJsScript: () => ({ mutateAsync: jest.fn() })
}));
jest.mock("../../../hooks/skills/useSkills", () => ({
  useCreateSkill: () => ({ mutateAsync: jest.fn() })
}));

import OpenMenu from "../OpenMenu";

const openSubmenu = async () => {
  const user = userEvent.setup();
  render(
    <ThemeProvider theme={mockTheme}>
      <OpenMenu anchorEl={document.body} open onClose={jest.fn()} />
    </ThemeProvider>
  );
  await user.click(screen.getByText("New storyboard…"));
  return user;
};

describe("OpenMenu storyboards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      expect(installExample).toHaveBeenCalledWith({
        slug: "lighthouse-keeper",
        projectId: "default"
      })
    );
    expect(openTab).toHaveBeenCalledWith({
      type: "storyboard",
      ref: "board-1",
      mode: "edit",
      title: "Lighthouse Keeper — Opening"
    });
    expect(createStoryboard).not.toHaveBeenCalled();
  });

  it("still creates an empty board from the same submenu", async () => {
    const user = await openSubmenu();
    await user.click(screen.getByText("Blank storyboard"));

    await waitFor(() => expect(createStoryboard).toHaveBeenCalled());
    expect(openTab).toHaveBeenCalledWith({
      type: "storyboard",
      ref: "board-blank",
      mode: "edit",
      title: "Untitled storyboard"
    });
  });

  it("reports a failed install instead of dying quietly", async () => {
    installExample.mockRejectedValueOnce(new Error("disk on fire"));
    const user = await openSubmenu();
    await user.click(screen.getByText("Lighthouse Keeper — Opening"));

    await waitFor(() => expect(addNotification).toHaveBeenCalled());
    expect(addNotification.mock.calls[0][0].content).toContain("disk on fire");
    expect(openTab).not.toHaveBeenCalled();
  });
});
