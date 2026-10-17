import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Entity } from "@nodetool-ai/protocol";

import mockTheme from "../../../__mocks__/themeMock";
import EntityPicker from "../EntityPicker";
import { useEntityLibraryStore } from "../../../stores/EntityLibraryStore";
import { openPageTab } from "../../workspace/openPageTab";

const mockEntities: { data: Entity[] } = { data: [] };
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: mockEntities.data, isLoading: false })
}));
jest.mock("../../workspace/openPageTab", () => ({
  openPageTab: jest.fn()
}));
jest.mock("../../node/ImageRefPreview", () => ({
  __esModule: true,
  default: () => null
}));

const renderPicker = (onCreateStarted?: () => void) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <EntityPicker onSelect={jest.fn()} onCreateStarted={onCreateStarted} />
    </ThemeProvider>
  );

describe("EntityPicker — creating from the picker (study-7-I2)", () => {
  beforeEach(() => {
    mockEntities.data = [];
    useEntityLibraryStore.getState().clearCreateRequest();
    jest.mocked(openPageTab).mockClear();
  });

  it("opens the add flow from an empty library and lets the host close", async () => {
    const onCreateStarted = jest.fn();
    renderPicker(onCreateStarted);

    await userEvent.click(screen.getByRole("button", { name: "New entity" }));

    expect(useEntityLibraryStore.getState().createRequested).toBe(true);
    expect(openPageTab).toHaveBeenCalledWith("entities");
    expect(onCreateStarted).toHaveBeenCalled();
  });

  it("offers New entity when a search matches nothing", async () => {
    mockEntities.data = [
      { id: "e1", name: "Marta", kind: "character" } as Entity
    ];
    renderPicker(jest.fn());

    await userEvent.type(screen.getByRole("textbox"), "Miso");

    expect(screen.getByText("No entities match")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "New entity" })
    ).toBeInTheDocument();
  });

  it("offers no create action when the host does not ask for one", () => {
    renderPicker();

    expect(screen.getByText("No entities yet")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "New entity" })
    ).not.toBeInTheDocument();
  });
});
