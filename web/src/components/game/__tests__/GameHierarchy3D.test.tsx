import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { GameDocument3D } from "@nodetool-ai/protocol";

import mockTheme from "../../../__mocks__/themeMock";
import GameHierarchy3D from "../panels/hierarchy/GameHierarchy3D";

function fixture(): GameDocument3D {
  const transform = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
  return {
    entrySceneId: "level",
    scenes: [{ id: "level", name: "Level", entities: [
      { id: "island", name: "Island", transform3d: transform },
      { id: "warning", name: "Warning", parentId: "island", transform3d: transform },
      { id: "ferry", name: "Ferry", transform3d: transform }
    ] }]
  } as unknown as GameDocument3D;
}

function renderHierarchy() {
  const onAdd = jest.fn();
  const onSelect = jest.fn();
  const document = fixture();
  render(<ThemeProvider theme={mockTheme}>
    <GameHierarchy3D document={document} scene={document.scenes[0]} selectedIds={["ferry"]} onSelect={onSelect}
      onSelectScene={jest.fn()} onAdd={onAdd} />
  </ThemeProvider>);
  return { onAdd, onSelect };
}

describe("GameHierarchy3D", () => {
  it("adds an entity kind from the add menu", async () => {
    const { onAdd } = renderHierarchy();
    await userEvent.click(screen.getByRole("button", { name: "Add entity" }));
    await userEvent.click(within(screen.getByRole("menu", { name: "Add entity" })).getByText("Sphere"));
    expect(onAdd).toHaveBeenCalledWith("sphere");
  });

  it("selects rows and marks the selected entity", async () => {
    const { onSelect } = renderHierarchy();
    expect(screen.getByRole("button", { name: "Ferry" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Island" }));
    expect(onSelect).toHaveBeenCalledWith("island");
  });

  it("collapses children and keeps search matches with their ancestors", async () => {
    renderHierarchy();
    await userEvent.click(screen.getByRole("button", { name: "Collapse Island" }));
    expect(screen.queryByRole("button", { name: "Warning" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Search entities" }), "warn");
    expect(screen.getByRole("button", { name: "Island" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Warning" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ferry" })).not.toBeInTheDocument();
  });
});
