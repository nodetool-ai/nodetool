import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import FolderItem from "../FolderItem";
import { Asset } from "../../../stores/ApiTypes";

// Mock the asset actions hook to isolate UI behavior
jest.mock("../useAssetActions", () => ({
  useAssetActions: () => ({
    isDragHovered: false,
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

const folderAsset: Asset = {
  id: "f1",
  name: "My Folder",
  content_type: "application/x-directory",
  size: 0,
  created_at: "2023-01-01T00:00:00Z",
  parent_id: "",
  user_id: "u1",
  get_url: "/assets/f1",
  thumb_url: null,
  workflow_id: null,
  metadata: {}
};

describe("FolderItem", () => {
  it("renders folder name", () => {
    renderWithTheme(
      <FolderItem folder={folderAsset} onSelect={jest.fn()} showDeleteButton={false} />
    );
    expect(screen.getByText("My Folder")).toBeInTheDocument();
  });

  it("calls onSelect when clicked (non-gutter)", () => {
    const onSelect = jest.fn();
    renderWithTheme(
      <FolderItem folder={folderAsset} onSelect={onSelect} showDeleteButton={false} />
    );
    fireEvent.click(screen.getByText("My Folder"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  // Skip delete button rendering due to MUI ButtonGroup theme spacing internals in test env
});
