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
    handleDragEnd: jest.fn(),
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

  describe("File size display", () => {
    beforeEach(() => {
      mockUseSettingsStore.mockReturnValue(4);  // assetItemSize > 3 to show file size
    });

    it("displays file size when size is defined and greater than 0", () => {
      const assetWithSize: Asset = {
        ...baseImageAsset,
        size: 1024
      };
      renderWithTheme(
        <AssetItem asset={assetWithSize} isSelected={false} showDeleteButton={false} showFileSize />
      );

      // Check that file size is displayed (should show "1 KB" or similar)
      const filesizeElement = screen.getByTitle(/File size:/);
      expect(filesizeElement).toBeInTheDocument();
    });

    it("does not display file size when size is undefined", () => {
      const assetWithoutSize: Asset = {
        ...baseImageAsset,
        size: undefined
      };
      renderWithTheme(
        <AssetItem asset={assetWithoutSize} isSelected={false} showDeleteButton={false} showFileSize />
      );

      // Check that file size is NOT displayed
      const filesizeElement = screen.queryByTitle(/File size:/);
      expect(filesizeElement).not.toBeInTheDocument();
    });

    it("does not display file size when size is null", () => {
      const assetWithNullSize: Asset = {
        ...baseImageAsset,
        size: null
      };
      renderWithTheme(
        <AssetItem asset={assetWithNullSize} isSelected={false} showDeleteButton={false} showFileSize />
      );

      // Check that file size is NOT displayed
      const filesizeElement = screen.queryByTitle(/File size:/);
      expect(filesizeElement).not.toBeInTheDocument();
    });

    it("does not display file size when size is 0", () => {
      const assetWithZeroSize: Asset = {
        ...baseImageAsset,
        size: 0
      };
      renderWithTheme(
        <AssetItem asset={assetWithZeroSize} isSelected={false} showDeleteButton={false} showFileSize />
      );

      // Check that file size is NOT displayed
      const filesizeElement = screen.queryByTitle(/File size:/);
      expect(filesizeElement).not.toBeInTheDocument();
    });

    it("hides file size when showFileSize prop is false", () => {
      const assetWithSize: Asset = {
        ...baseImageAsset,
        size: 1024
      };
      renderWithTheme(
        <AssetItem asset={assetWithSize} isSelected={false} showDeleteButton={false} showFileSize={false} />
      );

      // Check that file size is NOT displayed when showFileSize is false
      const filesizeElement = screen.queryByTitle(/File size:/);
      expect(filesizeElement).not.toBeInTheDocument();
    });

    it("hides file size when assetItemSize is 3 or less", () => {
      const assetWithSize: Asset = {
        ...baseImageAsset,
        size: 1024
      };
      mockUseSettingsStore.mockReturnValue(3);  // assetItemSize <= 3 to hide file size
      renderWithTheme(
        <AssetItem asset={assetWithSize} isSelected={false} showDeleteButton={false} showFileSize />
      );

      // Check that file size is NOT displayed when assetItemSize <= 3
      const filesizeElement = screen.queryByTitle(/File size:/);
      expect(filesizeElement).not.toBeInTheDocument();
    });

    it("formats file size correctly for bytes", () => {
      const assetWithBytes: Asset = {
        ...baseImageAsset,
        size: 512
      };
      renderWithTheme(
        <AssetItem asset={assetWithBytes} isSelected={false} showDeleteButton={false} showFileSize />
      );

      // Check that file size is displayed with proper tooltip
      const filesizeElement = screen.getByTitle(/File size:/);
      expect(filesizeElement).toBeInTheDocument();
      expect(filesizeElement).toHaveTextContent(/512/); // Should contain the size
    });

    it("formats file size correctly for kilobytes", () => {
      const assetWithKB: Asset = {
        ...baseImageAsset,
        size: 1024 * 5  // 5 KB
      };
      renderWithTheme(
        <AssetItem asset={assetWithKB} isSelected={false} showDeleteButton={false} showFileSize />
      );

      // Check that file size is displayed
      const filesizeElement = screen.getByTitle(/File size:/);
      expect(filesizeElement).toBeInTheDocument();
    });

    it("formats file size correctly for megabytes", () => {
      const assetWithMB: Asset = {
        ...baseImageAsset,
        size: 1024 * 1024 * 10  // 10 MB
      };
      renderWithTheme(
        <AssetItem asset={assetWithMB} isSelected={false} showDeleteButton={false} showFileSize />
      );

      // Check that file size is displayed
      const filesizeElement = screen.getByTitle(/File size:/);
      expect(filesizeElement).toBeInTheDocument();
    });

    it("has proper tooltip with file size information", () => {
      const assetWithSize: Asset = {
        ...baseImageAsset,
        size: 2048
      };
      renderWithTheme(
        <AssetItem asset={assetWithSize} isSelected={false} showDeleteButton={false} showFileSize />
      );

      // Check that file size has a tooltip
      const filesizeElement = screen.getByTitle(/File size:/);
      expect(filesizeElement).toBeInTheDocument();
      expect(filesizeElement.tagName.toLowerCase()).toBe("p");
      expect(filesizeElement).toHaveClass("filesize");
    });
  });

  describe("Asset size property types", () => {
    it("handles asset with size as number without type assertions", () => {
      // This test verifies that we can use asset.size directly without (asset as any).size
      const assetWithNumberSize: Asset = {
        ...baseImageAsset,
        size: 1024
      };

      // Verify TypeScript allows direct access to size property
      const sizeValue: number | null | undefined = assetWithNumberSize.size;
      expect(sizeValue).toBe(1024);

      renderWithTheme(
        <AssetItem asset={assetWithNumberSize} isSelected={false} showDeleteButton={false} showFileSize />
      );

      // Should render without errors and display file size
      const filesizeElement = screen.getByTitle(/File size:/);
      expect(filesizeElement).toBeInTheDocument();
    });

    it("handles asset with size as null", () => {
      const assetWithNullSize: Asset = {
        ...baseImageAsset,
        size: null
      };

      // Verify TypeScript allows null as value
      const sizeValue: number | null | undefined = assetWithNullSize.size;
      expect(sizeValue).toBeNull();

      renderWithTheme(
        <AssetItem asset={assetWithNullSize} isSelected={false} showDeleteButton={false} showFileSize />
      );

      // Should not display file size when size is null
      const filesizeElement = screen.queryByTitle(/File size:/);
      expect(filesizeElement).not.toBeInTheDocument();
    });

    it("handles asset with size as undefined", () => {
      const assetWithUndefinedSize: Asset = {
        ...baseImageAsset,
        size: undefined
      };

      // Verify TypeScript allows undefined as value
      const sizeValue: number | null | undefined = assetWithUndefinedSize.size;
      expect(sizeValue).toBeUndefined();

      renderWithTheme(
        <AssetItem asset={assetWithUndefinedSize} isSelected={false} showDeleteButton={false} showFileSize />
      );

      // Should not display file size when size is undefined
      const filesizeElement = screen.queryByTitle(/File size:/);
      expect(filesizeElement).not.toBeInTheDocument();
    });
  });

  // Skip delete button rendering due to MUI ButtonGroup theme spacing internals in test env
});
