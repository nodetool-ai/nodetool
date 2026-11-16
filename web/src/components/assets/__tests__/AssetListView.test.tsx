/**
 * The list view shows the state of an asset's file in its row: Missing with
 * Relink and Remove, and Linked (project folders PRD US7, T8).
 */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Asset } from "../../../stores/ApiTypes";

// jsdom has no layout, so the virtualizer would measure zero rows.
jest.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 40,
        end: (index + 1) * 40,
        size: 40,
        lane: 0
      })),
    getTotalSize: () => count * 40,
    measure: () => {},
    measureElement: () => {},
    scrollToIndex: () => {}
  })
}));

const mockRelink = jest.fn();
const mockRemove = jest.fn(() => Promise.resolve({ deleted_asset_ids: [] }));
jest.mock("../../../serverState/useRelinkAsset", () => ({
  useRelinkAsset: () => ({ mutate: mockRelink, isPending: false })
}));
jest.mock("../../../serverState/useAssetDeletion", () => ({
  useAssetDeletion: () => ({
    mutation: { mutateAsync: mockRemove, isPending: false }
  })
}));
jest.mock("../../../utils/localFile", () => ({
  canResolveLocalFilePaths: () => true,
  getLocalFilePath: (file: File) => `/disk/${file.name}`
}));

import AssetListView from "../AssetListView";
import { ContextMenuProvider } from "../../../providers/ContextMenuProvider";

const asset = (id: string, overrides: Partial<Asset> = {}): Asset =>
  ({
    id,
    name: `${id}.wav`,
    content_type: "audio/wav",
    get_url: `/${id}.wav`,
    thumb_url: null,
    user_id: "u1",
    parent_id: "u1",
    created_at: "2026-01-01T00:00:00Z",
    workflow_id: null,
    size: 10,
    ...overrides
  }) as Asset;

const renderList = (assets: Asset[]) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ContextMenuProvider>
        <AssetListView assets={assets} />
      </ContextMenuProvider>
    </ThemeProvider>
  );

beforeEach(() => jest.clearAllMocks());

describe("AssetListView file status", () => {
  it("shows Missing with Relink and Remove in the row of a missing asset", async () => {
    renderList([asset("gone", { offline: true }), asset("here")]);

    const row = screen.getByRole("button", { name: "gone.wav" });
    expect(within(row).getByTestId("asset-media-missing")).toHaveTextContent(
      "Missing"
    );
    const here = screen.getByRole("button", { name: "here.wav" });
    expect(within(here).queryByTestId("asset-file-status")).toBeNull();

    const input = row.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "gone.wav", { type: "audio/wav" })] }
    });
    expect(mockRelink).toHaveBeenCalledWith(
      { id: "gone", path: "/disk/gone.wav" },
      expect.anything()
    );

    fireEvent.click(within(row).getByRole("button", { name: "Remove" }));
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Remove" })).at(-1)!
    );
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith(["gone"]));
  });

  it("shows Linked in the row of a linked asset", () => {
    renderList([asset("interview", { linked: true })]);
    const row = screen.getByRole("button", { name: "interview.wav" });
    expect(within(row).getByTestId("asset-linked")).toHaveTextContent("Linked");
  });
});
