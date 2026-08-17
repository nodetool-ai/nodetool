/**
 * The dialog is anchored to the cursor, and the cursor is on the New Folder
 * button — which sits near the top of the Library panel. A fixed upward offset
 * therefore put the name field above the viewport, leaving only Cancel and
 * Create Folder on screen (#5004).
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { installGlobal } from "../../../test-utils/doubles";
import AssetCreateFolderConfirmation from "../AssetCreateFolderConfirmation";

const mockGridState = {
  createFolderDialogOpen: true,
  setCreateFolderDialogOpen: jest.fn(),
  selectedAssetIds: [] as string[],
  currentFolder: null,
  setSelectedAssetIds: jest.fn(),
  setSelectedAssets: jest.fn()
};

const mockAssetState = {
  createFolder: jest.fn(),
  update: jest.fn()
};

jest.mock("../../../stores/AssetGridStore", () => ({
  useAssetGridStore: <R,>(select: (state: typeof mockGridState) => R): R =>
    select(mockGridState)
}));

jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: <R,>(select: (state: typeof mockAssetState) => R): R =>
    select(mockAssetState)
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <R,>(
    select: (state: { addNotification: () => void }) => R
  ): R => select({ addNotification: jest.fn() })
}));

jest.mock("../../../serverState/useAssets", () => ({
  __esModule: true,
  default: () => ({
    refetchAssetsAndFolders: jest.fn(),
    folderFilesFiltered: []
  })
}));

const DIALOG_WIDTH = 400;
const DIALOG_HEIGHT = 220;
const VIEWPORT_WIDTH = 1200;
const VIEWPORT_HEIGHT = 800;

const openAt = (clientX: number, clientY: number): HTMLElement => {
  document.dispatchEvent(new MouseEvent("mousemove", { clientX, clientY }));

  // jsdom lays nothing out, so the measurement the placement reads has to be
  // supplied — reading the real height is the whole point of the fix.
  jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: DIALOG_WIDTH,
    height: DIALOG_HEIGHT,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: DIALOG_WIDTH,
    bottom: DIALOG_HEIGHT,
    toJSON: () => ({})
  });

  render(
    <ThemeProvider theme={mockTheme}>
      <AssetCreateFolderConfirmation />
    </ThemeProvider>
  );

  const dialog = document.querySelector(".asset-create-folder-dialog");
  if (!(dialog instanceof HTMLElement)) {
    throw new Error("expected the create-folder dialog to render");
  }
  return dialog;
};

describe("AssetCreateFolderConfirmation placement", () => {
  beforeEach(() => {
    installGlobal("innerWidth", VIEWPORT_WIDTH);
    installGlobal("innerHeight", VIEWPORT_HEIGHT);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps the name field on screen when opened near the top of the window", () => {
    const dialog = openAt(990, 100);

    expect(parseFloat(dialog.style.top)).toBeGreaterThanOrEqual(0);
    expect(dialog.style.visibility).toBe("visible");
    expect(screen.getByDisplayValue("New Folder")).toBeVisible();
  });

  it("stays on screen when the cursor was never tracked", () => {
    const dialog = openAt(0, 0);

    expect(parseFloat(dialog.style.top)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(dialog.style.left)).toBeGreaterThanOrEqual(0);
  });

  it("keeps the dialog inside the bottom-right corner", () => {
    const dialog = openAt(1190, 795);

    expect(parseFloat(dialog.style.left) + DIALOG_WIDTH).toBeLessThanOrEqual(
      VIEWPORT_WIDTH
    );
    expect(parseFloat(dialog.style.top) + DIALOG_HEIGHT).toBeLessThanOrEqual(
      VIEWPORT_HEIGHT
    );
  });

  it("sits above and left of the cursor when there is room", () => {
    const dialog = openAt(900, 600);

    expect(parseFloat(dialog.style.top)).toBe(600 - DIALOG_HEIGHT);
    expect(parseFloat(dialog.style.left)).toBe(900 - DIALOG_WIDTH);
  });
});
