/**
 * Shared mocks for the `OpenMenu` suites.
 *
 * `OpenMenu` reaches for every document-creating hook in the app, so each suite
 * re-declared the same eleven `jest.mock` blocks before it could assert on one
 * of them, and they had drifted: only one stubbed `newDocumentId`, only one
 * stubbed `creationProjectId`. Importing this module registers all of them.
 *
 * Test-only. The `mock` prefixes are required — Jest's factory hoisting refuses
 * an out-of-scope reference whose name does not begin with them.
 */
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../__mocks__/themeMock";
import OpenMenu from "./OpenMenu";

/** Set by a suite that renders the storyboard submenu; undefined otherwise. */
export const mockExampleStoryboards: {
  value: Record<string, unknown>[] | undefined;
} = { value: undefined };

export const mockOpenMenu = {
  openTab: jest.fn(),
  addNotification: jest.fn(),
  createAsset: jest.fn(),
  createNew: jest.fn(),
  createNewThread: jest.fn(),
  createTimeline: jest.fn(),
  createStoryboard: jest.fn(),
  installExample: jest.fn(),
  createApplication: jest.fn(),
  createScript: jest.fn(),
  createJsScript: jest.fn(),
  createSkill: jest.fn()
};

const mockSelectorOver =
  <S,>(state: S) =>
  <T,>(selector: (s: S) => T): T =>
    selector(state);

jest.mock("../../hooks/storyboard/useStoryboards", () => ({
  useCreateStoryboard: () => ({ mutateAsync: mockOpenMenu.createStoryboard }),
  useExampleStoryboards: (enabled?: boolean) => ({
    data: enabled === false ? undefined : mockExampleStoryboards.value,
    isLoading: false
  }),
  useInstallExampleStoryboard: () => ({
    mutateAsync: mockOpenMenu.installExample
  })
}));

jest.mock("../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "default",
  useWorkspaceTabsStore: mockSelectorOver({ openTab: mockOpenMenu.openTab })
}));

jest.mock("../../stores/NotificationStore", () => ({
  useNotificationStore: mockSelectorOver({
    addNotification: mockOpenMenu.addNotification
  })
}));

jest.mock("../../stores/AssetStore", () => ({
  useAssetStore: mockSelectorOver({ createAsset: mockOpenMenu.createAsset })
}));

jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: mockSelectorOver({ createNew: mockOpenMenu.createNew })
}));

jest.mock("../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: mockSelectorOver({ createNewThread: mockOpenMenu.createNewThread })
}));

jest.mock("../../hooks/useTimelineSequence", () => ({
  useCreateTimeline: () => ({ mutateAsync: mockOpenMenu.createTimeline })
}));

jest.mock("../../hooks/useApplications", () => ({
  useCreateApplication: () => ({ mutateAsync: mockOpenMenu.createApplication })
}));

jest.mock("../../hooks/script/useScripts", () => ({
  useCreateScript: () => ({ mutateAsync: mockOpenMenu.createScript })
}));

jest.mock("../../hooks/jsScript/useJsScripts", () => ({
  useCreateJsScript: () => ({ mutateAsync: mockOpenMenu.createJsScript })
}));

jest.mock("../../hooks/skills/useSkills", () => ({
  useCreateSkill: () => ({ mutateAsync: mockOpenMenu.createSkill })
}));

jest.mock("../../lib/newDocumentId", () => ({
  newDocumentId: () => "minted-skill-id"
}));

export const renderOpenMenu = (): void => {
  render(
    <ThemeProvider theme={mockTheme}>
      <OpenMenu anchorEl={document.body} open onClose={jest.fn()} />
    </ThemeProvider>
  );
};
