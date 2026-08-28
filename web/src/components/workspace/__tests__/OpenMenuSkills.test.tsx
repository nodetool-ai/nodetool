/**
 * The `[+]` menu's New skill item creates a skill document and opens it
 * as a workspace tab.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const createSkill = jest.fn(async () => ({
  id: "skill-1",
  name: "skill-abc"
}));

jest.mock("../../../hooks/skills/useSkills", () => ({
  useCreateSkill: () => ({ mutateAsync: createSkill })
}));

const openTab = jest.fn();
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
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
jest.mock("../../../hooks/storyboard/useStoryboards", () => ({
  useCreateStoryboard: () => ({ mutateAsync: jest.fn() }),
  useExampleStoryboards: () => ({ data: undefined, isLoading: false }),
  useInstallExampleStoryboard: () => ({ mutateAsync: jest.fn() })
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
jest.mock("../../../lib/newDocumentId", () => ({
  newDocumentId: () => "minted-skill-id"
}));

import OpenMenu from "../OpenMenu";

const renderMenu = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <OpenMenu anchorEl={document.body} open onClose={jest.fn()} />
    </ThemeProvider>
  );

describe("OpenMenu skills", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a skill and opens it as a tab", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByText("New skill"));

    await waitFor(() =>
      expect(createSkill).toHaveBeenCalledWith({
        id: "minted-skill-id",
        name: expect.stringMatching(/^skill-[a-z0-9]+$/),
        description: "A reusable skill for the NodeTool agent.",
        content:
          "# New skill\n\nDescribe what this skill does and when the agent should use it."
      })
    );
    expect(openTab).toHaveBeenCalledWith({
      type: "skill",
      ref: "skill-1",
      mode: "edit",
      title: "skill-abc"
    });
  });

  it("reports a failed create instead of dying quietly", async () => {
    createSkill.mockRejectedValueOnce(new Error("store down"));
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByText("New skill"));

    await waitFor(() => expect(addNotification).toHaveBeenCalled());
    expect(addNotification.mock.calls[0][0].content).toContain("store down");
    expect(openTab).not.toHaveBeenCalled();
  });
});
