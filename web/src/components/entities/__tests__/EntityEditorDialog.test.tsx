/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Entity } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../node/ImageRefPreview", () => ({
  __esModule: true,
  default: ({ value }: { value?: { asset_id?: string } }) => (
    <div data-testid="preview">{value?.asset_id}</div>
  )
}));

jest.mock("../EntityAssetPickerDialog", () => ({
  __esModule: true,
  default: ({
    open,
    onPick
  }: {
    open: boolean;
    onPick: (assetId: string) => void;
  }) =>
    open ? (
      <button type="button" onClick={() => onPick("asset-2")}>
        pick asset-2
      </button>
    ) : null
}));

const mockSave = jest.fn();
jest.mock("../../../serverState/useEntities", () => ({
  useSaveEntity: () => ({ mutateAsync: mockSave, isPending: false })
}));

import EntityEditorDialog from "../EntityEditorDialog";

const entity: Entity = {
  type: "entity",
  id: "asset-1",
  kind: "character",
  name: "Mara",
  descriptor: "a tall woman with red hair",
  reference_images: [
    { type: "image", asset_id: "asset-1", uri: "asset://asset-1" }
  ]
};

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("EntityEditorDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSave.mockResolvedValue(entity);
  });

  it("swaps an existing entity's picture and keeps its id", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <EntityEditorDialog
        open
        onClose={jest.fn()}
        assetId="asset-1"
        entity={entity}
      />
    );
    expect(screen.getByTestId("preview")).toHaveTextContent("asset-1");

    await user.click(screen.getByRole("button", { name: "Change image" }));
    await user.click(screen.getByRole("button", { name: "pick asset-2" }));
    expect(screen.getByTestId("preview")).toHaveTextContent("asset-2");

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: "asset-1",
        reference_asset_id: "asset-2"
      })
    );
  });

  it("tags the picked asset itself when creating a new entity", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <EntityEditorDialog open onClose={jest.fn()} assetId="asset-1" />
    );

    await user.click(screen.getByRole("button", { name: "Change image" }));
    await user.click(screen.getByRole("button", { name: "pick asset-2" }));

    await user.type(screen.getByLabelText(/Name/), "Rex");
    await user.type(screen.getByLabelText(/Descriptor/), "a scruffy terrier");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: "asset-2",
        reference_asset_id: "asset-2"
      })
    );
  });
});
