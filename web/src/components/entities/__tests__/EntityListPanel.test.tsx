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
  default: () => null
}));

const mockDelete = jest.fn();
const mockUseEntities = jest.fn();

jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => mockUseEntities(),
  useDeleteEntity: () => ({ mutate: mockDelete })
}));

jest.mock("../EntityAssetPickerDialog", () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="asset-picker" /> : null
}));

jest.mock("../EntityEditorDialog", () => ({
  __esModule: true,
  default: ({ entity }: { entity?: Entity }) => (
    <div data-testid="entity-editor">{entity?.name ?? "new"}</div>
  )
}));

import EntityListPanel, { CreateEntityButton } from "../EntityListPanel";

const entity: Entity = {
  type: "entity",
  id: "asset-1",
  kind: "character",
  name: "Mara",
  descriptor: "a tall woman with red hair"
};

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("EntityListPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lists the entities", () => {
    mockUseEntities.mockReturnValue({ data: [entity], isLoading: false });
    renderWithTheme(<EntityListPanel />);
    expect(screen.getByText("Mara")).toBeInTheDocument();
  });

  it("points at the + button when there is nothing to show", () => {
    mockUseEntities.mockReturnValue({ data: [], isLoading: false });
    renderWithTheme(<EntityListPanel />);
    expect(screen.getByText("No entities yet")).toBeInTheDocument();
  });

  it("removes an entity through the delete mutation", async () => {
    mockUseEntities.mockReturnValue({ data: [entity], isLoading: false });
    renderWithTheme(<EntityListPanel />);
    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(mockDelete).toHaveBeenCalledWith("asset-1");
  });
});

describe("CreateEntityButton", () => {
  it("opens the asset picker", async () => {
    renderWithTheme(<CreateEntityButton />);
    expect(screen.queryByTestId("asset-picker")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /new entity/i }));
    expect(screen.getByTestId("asset-picker")).toBeInTheDocument();
  });
});
