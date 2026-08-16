/**
 * The fullscreen Assets page docks the folder tree beside the grid and pins it
 * open — there is no control to close it. On a phone that pane leaves the grid
 * no room, so narrow viewports must fall back to the toggleable sidebar
 * behaviour.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

let matchesNarrow = false;

jest.mock("@mui/material/useMediaQuery", () => ({
  __esModule: true,
  default: () => matchesNarrow
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
jest.mock("../panels/AssetFoldersPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="folders-panel" />
}));
jest.mock("../panels/AssetFilesPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="files-panel" />
}));
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
  default: <T,>(selector: (s: unknown) => T) =>
    selector({ user: { id: "user-1" } })
}));

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  __esModule: true,
  useWorkflowManager: <T,>(selector: (s: unknown) => T) =>
    selector({ currentWorkflowId: null })
}));

jest.mock("../../../stores/ContextMenuStore", () => ({
  __esModule: true,
  default: <T,>(selector: (s: unknown) => T) =>
    selector({ openMenuType: null })
}));

jest.mock("../../../stores/KeyPressedStore", () => ({
  __esModule: true,
  useKeyPressedStore: <T,>(selector: (s: unknown) => T) =>
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

// The grid also renders a MUI <Divider>, which carries the same implicit role.
const SPLITTER = "Resize the folder pane";

describe("AssetGrid folder pane", () => {
  it("docks the folder tree beside the grid on a wide viewport", async () => {
    matchesNarrow = false;
    renderGrid();

    expect(await screen.findByTestId("folders-panel")).toBeInTheDocument();
    // Beside the grid, so the separator between the two runs vertically.
    expect(screen.getByRole("separator", { name: SPLITTER })).toHaveAttribute(
      "aria-orientation",
      "vertical"
    );
    expect(screen.getByTestId("actions-menu")).toHaveAttribute(
      "data-fullscreen",
      "true"
    );
  });

  it("leaves the folder tree closed and toggleable on a narrow viewport", async () => {
    matchesNarrow = true;
    renderGrid();

    expect(await screen.findByTestId("files-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("folders-panel")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("separator", { name: SPLITTER })
    ).not.toBeInTheDocument();
    // The toolbar drops its fullscreen layout, which is what shows the
    // "Show folders" toggle.
    expect(screen.getByTestId("actions-menu")).toHaveAttribute(
      "data-fullscreen",
      "false"
    );
  });

  it("resizes the folder pane from the keyboard", async () => {
    matchesNarrow = false;
    renderGrid();

    const separator = await screen.findByRole("separator", { name: SPLITTER });
    expect(separator).toHaveAttribute("aria-valuenow", "300");

    separator.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(separator).toHaveAttribute("aria-valuenow", "316");

    await userEvent.keyboard("{Home}");
    expect(Number(separator.getAttribute("aria-valuenow"))).toBe(
      Number(separator.getAttribute("aria-valuemin"))
    );
  });
});
