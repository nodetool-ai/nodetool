/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";

import mockTheme from "../../../__mocks__/themeMock";
import type { Asset } from "../../../stores/ApiTypes";
import { useAssetGridStore } from "../../../stores/AssetGridStore";
import { useEntityLibraryStore } from "../../../stores/EntityLibraryStore";
import { openPageTab } from "../../workspace/openPageTab";
import AssetItemContextMenu from "../AssetItemContextMenu";

const closeContextMenu = jest.fn();
jest.mock("../../../stores/ContextMenuStore", () => ({
  __esModule: true,
  default: <T,>(
    selector: (s: {
      menuPosition: { x: number; y: number };
      closeContextMenu: () => void;
    }) => T
  ) => selector({ menuPosition: { x: 10, y: 20 }, closeContextMenu })
}));
jest.mock("../../workspace/openPageTab", () => ({
  openPageTab: jest.fn()
}));
jest.mock("../../../hooks/useEditVideoAsset", () => ({
  useEditVideoAsset: () => jest.fn()
}));
jest.mock("../../../serverState/useAssetFavorite", () => ({
  useSetAssetFavorite: () => jest.fn()
}));
jest.mock("../AssetInfoPanel", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../workflows/SendToWorkflowMenu", () => ({
  SendToWorkflowMenu: () => null
}));

const asset = (overrides: Partial<Asset>): Asset =>
  ({
    id: "asset-1",
    name: "Miso.png",
    content_type: "image/png",
    parent_id: "",
    user_id: "u",
    created_at: "2026-01-01T00:00:00Z",
    metadata: null,
    ...overrides
  }) as Asset;

const renderMenu = (selected: Asset[]) => {
  useAssetGridStore.setState({
    selectedAssets: selected,
    selectedAssetIds: selected.map((a) => a.id)
  });
  return render(
    <MemoryRouter>
      <ThemeProvider theme={mockTheme}>
        <AssetItemContextMenu />
      </ThemeProvider>
    </MemoryRouter>
  );
};

describe("AssetItemContextMenu — Use as entity (study-7)", () => {
  beforeEach(() => {
    useEntityLibraryStore.getState().clearCreateRequest();
    jest.mocked(openPageTab).mockClear();
    closeContextMenu.mockClear();
  });

  it("starts the guided entity flow with the right-clicked image", async () => {
    renderMenu([asset({ id: "image-1" })]);

    await userEvent.click(
      screen.getByText("Use as entity…")
    );

    const state = useEntityLibraryStore.getState();
    expect(state.createRequested).toBe(true);
    expect(state.createAssetId).toBe("image-1");
    expect(openPageTab).toHaveBeenCalledWith("entities");
    expect(closeContextMenu).toHaveBeenCalled();
  });

  it("is not offered for a video", () => {
    renderMenu([asset({ content_type: "video/mp4" })]);
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(
      screen.queryByText("Use as entity…")
    ).not.toBeInTheDocument();
  });

  it("is not offered for several images", () => {
    renderMenu([asset({ id: "a" }), asset({ id: "b" })]);
    expect(
      screen.queryByText("Use as entity…")
    ).not.toBeInTheDocument();
  });

  it("is not offered for an image that is already an entity", () => {
    renderMenu([
      asset({
        metadata: {
          nodetool_entity: { kind: "character", name: "Miso", descriptor: "", tags: [] }
        }
      })
    ]);
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(
      screen.queryByText("Use as entity…")
    ).not.toBeInTheDocument();
  });
});
