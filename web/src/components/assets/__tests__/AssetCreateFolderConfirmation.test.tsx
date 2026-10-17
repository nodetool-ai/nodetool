/**
 * The create-folder dialog is a centered Dialog: name field, validation
 * banner, Cancel / Create footer.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import AssetCreateFolderConfirmation from "../AssetCreateFolderConfirmation";

const mockGridState = {
  createFolderDialogOpen: true,
  setCreateFolderDialogOpen: jest.fn(),
  selectedAssetIds: [] as string[],
  currentFolder: null,
  setSelectedAssetIds: jest.fn(),
  setSelectedAssets: jest.fn(),
  setFoldersVisible: jest.fn()
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

const renderDialog = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <AssetCreateFolderConfirmation />
    </ThemeProvider>
  );

describe("AssetCreateFolderConfirmation", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("opens as a centered dialog with the name field and footer", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveAccessibleName(/Create folder/);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
      "New Folder"
    );
    expect(screen.getByRole("button", { name: "Create" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  it("closes through the cancel button", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockGridState.setCreateFolderDialogOpen).toHaveBeenCalledWith(false);
  });

  it("shows a validation error without closing", () => {
    renderDialog();

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: ".hidden" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(
      screen.getByText("Name cannot start with a special character.")
    ).toBeInTheDocument();
    expect(mockGridState.setCreateFolderDialogOpen).not.toHaveBeenCalled();
    expect(mockAssetState.createFolder).not.toHaveBeenCalled();
  });

  it("selects the default name, so typing replaces it", () => {
    jest.useFakeTimers();
    try {
      renderDialog();
      act(() => {
        jest.advanceTimersByTime(20);
      });
      const input = screen.getByRole("textbox", {
        name: "Name"
      }) as HTMLInputElement;
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe("New Folder".length);
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows the folder tree after creating a folder", async () => {
    mockAssetState.createFolder.mockResolvedValue({ id: "f1" });
    renderDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
    });

    expect(mockAssetState.createFolder).toHaveBeenCalled();
    expect(mockGridState.setFoldersVisible).toHaveBeenCalledWith(true);
    expect(mockGridState.setCreateFolderDialogOpen).toHaveBeenCalledWith(false);
  });
});
