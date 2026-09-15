import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { useAssetGridStore } from "../../../stores/AssetGridStore";

const assetStoreState = {
  load: jest.fn().mockResolvedValue({ assets: [], next: null }),
  loadCurrentFolder: jest.fn().mockResolvedValue({ assets: [], next: null }),
  loadFolderTree: jest.fn().mockResolvedValue({}),
  update: jest.fn(),
  delete: jest.fn(),
  createFolder: jest.fn(),
  get: jest
    .fn()
    .mockResolvedValue({
      id: "user-1",
      name: "Home",
      content_type: "folder",
      user_id: "user-1"
    })
};

jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: Object.assign(
    <T,>(selector: (state: typeof assetStoreState) => T) =>
      selector(assetStoreState),
    { getState: () => assetStoreState }
  )
}));
jest.mock("../../../stores/SettingsStore", () => ({
  useSettingsStore: <T,>(
    selector: (state: { settings: { assetsOrder: string } }) => T
  ) => selector({ settings: { assetsOrder: "name" } })
}));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  LOOSE_PROJECT_ID: "default",
  useWorkspaceTabsStore: <T,>(
    selector: (state: { activeProjectId: string; personalProjectId: null }) => T
  ) => selector({ activeProjectId: "project-a", personalProjectId: null })
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(
    selector: (state: { addNotification: jest.Mock }) => T
  ) => selector({ addNotification: jest.fn() })
}));
jest.mock("../../../stores/useAuth", () => ({
  __esModule: true,
  default: <T,>(selector: (state: { user: { id: string } }) => T) =>
    selector({ user: { id: "user-1" } })
}));
jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    assets: {
      list: { query: jest.fn().mockResolvedValue({ assets: [], next: null }) }
    }
  }
}));
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: <T,>(
    selector: (state: { currentWorkflowId: string }) => T
  ) => selector({ currentWorkflowId: "workflow-a" })
}));

jest.mock("../AssetActionsMenu", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../AssetViewer", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../AssetCreateFolderConfirmation", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../AssetDeleteConfirmation", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../AssetMoveToFolderConfirmation", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../AssetRenameConfirmation", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../AssetUploadOverlay", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../ImageCompareDialog", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../panels/AssetFilesPanel", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../panels/AssetFoldersPanel", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../context_menus/AssetItemContextMenu", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../context_menus/AssetGridContextMenu", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../audio/AudioPlayer", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../Dropzone", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
jest.mock("../../../serverState/useAssetUpload", () => ({
  useAssetUpload: () => ({ uploadAsset: jest.fn(), isUploading: false })
}));
jest.mock("../../../stores/ContextMenuStore", () => ({
  __esModule: true,
  default: <T,>(selector: (state: { openMenuType: null }) => T) =>
    selector({ openMenuType: null })
}));
jest.mock("../../../stores/KeyPressedStore", () => ({
  useKeyPressedStore: <T,>(
    selector: (state: { isKeyPressed: () => boolean }) => T
  ) => selector({ isKeyPressed: () => false })
}));
jest.mock("../../../hooks/assets/useAssetGridShortcuts", () => ({
  useAssetGridShortcuts: jest.fn()
}));
jest.mock("../hooks/useClickOutsideDeselect", () => ({
  __esModule: true,
  default: jest.fn()
}));

import AssetGrid from "../AssetGrid";

describe("AssetGrid project initialization", () => {
  it("retains the active workflow filter when the asset explorer mounts", async () => {
    useAssetGridStore.setState({
      scopeProjectId: null,
      workflowFilter: null,
      selectedFolderId: "user-1",
      currentFolderId: "user-1"
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={mockTheme}>
          <AssetGrid />
        </ThemeProvider>
      </QueryClientProvider>
    );
    await waitFor(() =>
      expect(useAssetGridStore.getState().workflowFilter).toBe("workflow-a")
    );
  });
});
