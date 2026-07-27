/**
 * The fullscreen Assets page docks the folder tree beside the grid and pins it
 * open — there is no control to close it. On a phone that pane leaves the grid
 * no room, so narrow viewports must fall back to the toggleable sidebar
 * behaviour.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const addPanel = jest.fn();
const removePanel = jest.fn();
const getPanel = jest.fn((id: string) =>
  id === "asset-files" ? { id } : undefined
);

let matchesNarrow = false;

jest.mock("@mui/material/useMediaQuery", () => ({
  __esModule: true,
  default: () => matchesNarrow
}));

jest.mock("dockview", () => ({
  __esModule: true,
  DockviewReact: ({ onReady }: { onReady: (e: unknown) => void }) => {
    React.useEffect(() => {
      onReady({ api: { addPanel, removePanel, getPanel } });
    }, [onReady]);
    return <div data-testid="dockview" />;
  }
}));

jest.mock("../AssetActionsMenu", () => ({
  __esModule: true,
  default: ({ isFullscreenAssets }: { isFullscreenAssets?: boolean }) => (
    <div data-testid="actions-menu" data-fullscreen={String(!!isFullscreenAssets)} />
  )
}));

jest.mock("../AssetViewer", () => ({ __esModule: true, default: () => null }));
jest.mock("../AssetCreateFolderConfirmation", () => ({ __esModule: true, default: () => null }));
jest.mock("../AssetDeleteConfirmation", () => ({ __esModule: true, default: () => null }));
jest.mock("../AssetMoveToFolderConfirmation", () => ({ __esModule: true, default: () => null }));
jest.mock("../AssetRenameConfirmation", () => ({ __esModule: true, default: () => null }));
jest.mock("../AssetUploadOverlay", () => ({ __esModule: true, default: () => null }));
jest.mock("../ImageCompareDialog", () => ({ __esModule: true, default: () => null }));
jest.mock("../panels/AssetFoldersPanel", () => ({ __esModule: true, default: () => null }));
jest.mock("../panels/AssetFilesPanel", () => ({ __esModule: true, default: () => null }));
jest.mock("../../context_menus/AssetItemContextMenu", () => ({ __esModule: true, default: () => null }));
jest.mock("../../context_menus/AssetGridContextMenu", () => ({ __esModule: true, default: () => null }));
jest.mock("../../audio/AudioPlayer", () => ({ __esModule: true, default: () => null }));
jest.mock("../Dropzone", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

jest.mock("../../../serverState/useAssets", () => ({
  __esModule: true,
  default: () => ({
    error: null,
    folderFiles: [],
    folderFilesFiltered: [],
    folderTree: { root: { id: "root", name: "Assets", children: [] } },
    navigateToFolderId: jest.fn()
  }),
  useAssets: () => ({
    error: null,
    folderFiles: [],
    folderFilesFiltered: [],
    folderTree: { root: { id: "root", name: "Assets", children: [] } },
    navigateToFolderId: jest.fn()
  })
}));

jest.mock("../../../serverState/useAssetUpload", () => ({
  __esModule: true,
  useAssetUpload: () => ({ uploadAsset: jest.fn(), isUploading: false })
}));

jest.mock("../../../stores/useAuth", () => ({
  __esModule: true,
  default: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: "user-1" } })
}));

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  __esModule: true,
  useWorkflowManager: (selector: (s: unknown) => unknown) =>
    selector({ currentWorkflowId: null })
}));

jest.mock("../../../stores/ContextMenuStore", () => ({
  __esModule: true,
  default: (selector: (s: unknown) => unknown) =>
    selector({ openMenuType: null })
}));

jest.mock("../../../stores/KeyPressedStore", () => ({
  __esModule: true,
  useKeyPressedStore: (selector: (s: unknown) => unknown) =>
    selector({ isKeyPressed: () => false })
}));

jest.mock("../../../hooks/assets/useAssetGridShortcuts", () => ({
  __esModule: true,
  useAssetGridShortcuts: jest.fn()
}));

jest.mock("../hooks/useClickOutsideDeselect", () => ({
  __esModule: true,
  default: jest.fn()
}));

import AssetGrid from "../AssetGrid";

const renderGrid = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <AssetGrid isFullscreenAssets initialFoldersPanelWidth={300} />
    </ThemeProvider>
  );

describe("AssetGrid folder pane", () => {
  beforeEach(() => {
    addPanel.mockClear();
    removePanel.mockClear();
    getPanel.mockClear();
  });

  it("docks the folder tree beside the grid on a wide viewport", async () => {
    matchesNarrow = false;
    renderGrid();

    await screen.findByTestId("dockview");
    const folderPanel = addPanel.mock.calls
      .map(([args]) => args)
      .find((args) => args.id === "asset-folders");
    expect(folderPanel).toBeDefined();
    expect(folderPanel.position.direction).toBe("left");
    expect(screen.getByTestId("actions-menu")).toHaveAttribute(
      "data-fullscreen",
      "true"
    );
  });

  it("leaves the folder tree closed and toggleable on a narrow viewport", async () => {
    matchesNarrow = true;
    renderGrid();

    await screen.findByTestId("dockview");
    const folderPanel = addPanel.mock.calls
      .map(([args]) => args)
      .find((args) => args.id === "asset-folders");
    expect(folderPanel).toBeUndefined();
    // The toolbar drops its fullscreen layout, which is what shows the
    // "Show folders" toggle.
    expect(screen.getByTestId("actions-menu")).toHaveAttribute(
      "data-fullscreen",
      "false"
    );
  });
});
