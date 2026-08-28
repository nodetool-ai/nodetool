/**
 * The `[+]` menu at phone width creates only. The browse sheet behind the
 * hamburger already lists every document by category, so "Open workflow… /
 * asset… / chat…" here put the same lists behind a second button in a top row
 * that has room for neither.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

let matchesMobile = true;
jest.mock("@mui/material/useMediaQuery", () => ({
  __esModule: true,
  default: () => matchesMobile
}));

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
jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false, isFetching: false })
}));
jest.mock("../../../trpc/client", () => ({ trpcClient: {} }));
jest.mock("../../../serverState/useAssetSearch", () => ({
  useAssetSearch: () => ({ searchAssets: jest.fn() })
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
jest.mock("../../../hooks/useAutoFocusEnabled", () => ({
  useAutoFocusEnabled: () => false
}));

import OpenMenu from "../OpenMenu";

const renderMenu = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <OpenMenu anchorEl={document.body} open onClose={jest.fn()} />
    </ThemeProvider>
  );

const OPEN_ITEMS = ["Open workflow…", "Open asset…", "Open chat…"];

describe("OpenMenu at phone width", () => {
  it("keeps the creators and drops the open-existing entries", () => {
    matchesMobile = true;
    renderMenu();

    expect(screen.getByText("New workflow")).toBeInTheDocument();
    expect(screen.getByText("New chat")).toBeInTheDocument();
    for (const label of OPEN_ITEMS) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("still offers them on desktop", () => {
    matchesMobile = false;
    renderMenu();

    for (const label of OPEN_ITEMS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
