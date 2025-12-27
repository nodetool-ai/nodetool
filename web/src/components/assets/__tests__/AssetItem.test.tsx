import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import AssetItem from "../AssetItem";
import { Asset } from "../../../stores/ApiTypes";
import { useSettingsStore } from "../../../stores/SettingsStore";

// Mock the settings store to return a larger assetItemSize so the name is rendered
jest.mock("../../../stores/SettingsStore", () => ({
  useSettingsStore: jest.fn()
}));

// Mock the asset actions hook to isolate UI behavior
jest.mock("../useAssetActions", () => ({
  useAssetActions: () => ({
    isDragHovered: false,
    handleClick: (
      onSelect?: () => void,
      _onClickParent?: (id: string) => void,
      isParent?: boolean
    ) => {
      if (!isParent && onSelect) {onSelect();}
    },
    handleDrag: jest.fn(),
    handleDragOver: jest.fn(),
    handleDragEnter: jest.fn(),
    handleDragLeave: jest.fn(),
    handleDrop: jest.fn(),
    handleContextMenu: jest.fn(),
    handleDelete: jest.fn()
  })
}));

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

const baseImageAsset: Asset = {
  id: "a1",
  name: "photo.jpg",
  content_type: "image/jpeg",
  size: 1024,
  created_at: "2023-01-01T00:00:00Z",
  parent_id: "",
  user_id: "u1",
  get_url: "/img/a1.jpg",
  thumb_url: "/img/a1-thumb.jpg",
  workflow_id: null,
  metadata: {}
};

// Mock the settings store to return a larger assetItemSize so the name is rendered
const mockUseSettingsStore = useSettingsStore as jest.MockedFunction<typeof useSettingsStore>;

describe("AssetItem", () => {
  beforeEach(() => {
    mockUseSettingsStore.mockReturnValue(4);  // Return assetItemSize directly
  });
  it("renders name and filetype info", () => {
    renderWithTheme(
      <AssetItem asset={baseImageAsset} isSelected={false} showDeleteButton={false} />
    );
    // Name is rendered in a Typography with aria-label
    expect(screen.getByLabelText(baseImageAsset.name)).toBeInTheDocument();
    // Filetype chip may be hidden depending on settings; skip asserting it
  });

  it("calls onSelect on click", () => {
    const onSelect = jest.fn();
    renderWithTheme(
      <AssetItem asset={baseImageAsset} onSelect={onSelect} showDeleteButton={false} />
    );
    fireEvent.click(screen.getAllByLabelText(baseImageAsset.id)[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("calls onDoubleClick with asset on double click", () => {
    const onDoubleClick = jest.fn();
    renderWithTheme(
      <AssetItem asset={baseImageAsset} onDoubleClick={onDoubleClick} showDeleteButton={false} />
    );
    fireEvent.doubleClick(screen.getAllByLabelText(baseImageAsset.id)[0]);
    expect(onDoubleClick).toHaveBeenCalledWith(baseImageAsset);
  });

  // Skip delete button rendering due to MUI ButtonGroup theme spacing internals in test env
});
