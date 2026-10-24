/**
 * Deleting a script closes its tab and drops it from the store. The tab used
 * to stay open with the script in the store, and its next load got "not
 * found" and upserted the deleted script back.
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { SidebarDocumentItem } from "../../../stores/SidebarDocumentActionsStore";

const mockCloseTab = jest.fn();
const mockDeleteMutate = jest.fn();
const mockNotify = jest.fn();
let menuOptions: { onDelete: (item: SidebarDocumentItem) => void } | null =
  null;

jest.mock("../../../hooks/script/useScripts", () => ({
  useScripts: () => ({
    data: [{ id: "s1", name: "Doomed", updatedAt: "" }],
    isLoading: false,
    isError: false,
    error: null
  }),
  useCreateScript: () => ({ mutateAsync: jest.fn(), isPending: false })
}));

jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: "/workspace" })
}));

jest.mock("../../../stores/WorkspaceTabsStore", () => {
  const state = {
    openTab: jest.fn(),
    activeTabId: null,
    closeTab: (id: string) => mockCloseTab(id)
  };
  const useWorkspaceTabsStore = (selector: (s: unknown) => unknown) =>
    selector(state);
  useWorkspaceTabsStore.getState = () => state;
  return {
    useWorkspaceTabsStore,
    creationProjectId: () => "default",
    tabId: (type: string, ref: string) => `${type}:${ref}`
  };
});

jest.mock("../../../stores/PanelStore", () => ({
  usePanelStore: (selector: (state: unknown) => unknown) =>
    selector({ setVisibility: jest.fn() })
}));

jest.mock("../../../trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      scripts: { list: { invalidate: jest.fn() }, get: { setData: jest.fn() } },
      storyboards: { list: { invalidate: jest.fn() } }
    }),
    scripts: {
      update: { useMutation: () => ({ mutate: jest.fn() }) },
      delete: {
        useMutation: () => ({
          mutate: (...args: unknown[]) => mockDeleteMutate(...args)
        })
      }
    }
  }
}));

jest.mock("../../../hooks/useSidebarDocumentMenu", () => ({
  useSidebarDocumentMenu: (options: typeof menuOptions) => {
    menuOptions = options;
    return jest.fn();
  }
}));

jest.mock("../../../lib/scriptStoryboardDowngrade", () => ({
  downgradeBoardsLinkedToScript: jest.fn(async () => [])
}));

jest.mock("../../../utils/notifyMutationError", () => ({
  notifyMutationError: (...args: unknown[]) => mockNotify(...args)
}));

import { useScriptStore } from "../../../stores/script/ScriptStore";
import ScriptListPanel from "../ScriptListPanel";

const renderPanel = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ScriptListPanel projectId="default" />
    </ThemeProvider>
  );

const requestDelete = async (): Promise<void> => {
  act(() =>
    menuOptions?.onDelete({ id: "s1", name: "Doomed" } as SidebarDocumentItem)
  );
  await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
};

describe("ScriptListPanel delete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useScriptStore.setState({ scripts: {}, serverRevisions: {}, history: {} });
    useScriptStore.getState().loadScript("s1", {
      title: "Doomed",
      cast: [],
      sections: [],
      timelineId: null,
      storyboardId: null
    });
    useScriptStore.getState().setServerRevision("s1", "rev-1");
  });

  it("closes the deleted script's tab and drops it from the store", async () => {
    mockDeleteMutate.mockImplementation(
      (_input: unknown, options: { onSuccess: () => void }) =>
        options.onSuccess()
    );
    renderPanel();
    await requestDelete();
    expect(mockDeleteMutate).toHaveBeenCalledWith(
      { id: "s1" },
      expect.anything()
    );
    expect(mockCloseTab).toHaveBeenCalledWith("script:s1");
    expect(useScriptStore.getState().scripts["s1"]).toBeUndefined();
  });

  it("keeps the tab and says so when the delete fails", async () => {
    mockDeleteMutate.mockImplementation(
      (_input: unknown, options: { onError: (error: Error) => void }) =>
        options.onError(new Error("offline"))
    );
    renderPanel();
    await requestDelete();
    expect(mockCloseTab).not.toHaveBeenCalled();
    expect(useScriptStore.getState().scripts["s1"]).toBeDefined();
    expect(mockNotify).toHaveBeenCalled();
  });
});
