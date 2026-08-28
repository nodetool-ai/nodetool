/**
 * The `[+]` menu creates documents. Open-existing entries live in the
 * left panel, not here.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../hooks/storyboard/useStoryboards", () => ({
  useCreateStoryboard: () => ({ mutateAsync: jest.fn() }),
  useExampleStoryboards: () => ({ data: undefined, isLoading: false }),
  useInstallExampleStoryboard: () => ({ mutateAsync: jest.fn() })
}));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: <T,>(selector: (s: { openTab: jest.Mock }) => T) =>
    selector({ openTab: jest.fn() })
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(
    selector: (s: { addNotification: jest.Mock }) => T
  ) => selector({ addNotification: jest.fn() })
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

const renderMenu = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <OpenMenu anchorEl={document.body} open onClose={jest.fn()} />
    </ThemeProvider>
  );

const OPEN_ITEMS = ["Open workflow…", "Open asset…", "Open chat…"];

describe("OpenMenu", () => {
  it("offers creators and no open-existing entries", () => {
    renderMenu();

    expect(screen.getByText("New workflow")).toBeInTheDocument();
    expect(screen.getByText("New chat")).toBeInTheDocument();
    expect(screen.getByText("New skill")).toBeInTheDocument();
    for (const label of OPEN_ITEMS) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });
});
