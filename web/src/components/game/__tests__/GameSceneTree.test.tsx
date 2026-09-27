import { createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { gameDocument, type GameDocument } from "@nodetool-ai/protocol/game.js";
import { applyGameOps, type GameDocumentOp } from "@nodetool-ai/game-runtime";

import mockTheme from "../../../__mocks__/themeMock";
import GameSceneTree from "../GameSceneTree";

function fixture(): GameDocument {
  return gameDocument.parse({
    schemaVersion: 2, engineVersion: "1", id: "game", revision: "1", entrySceneId: "room",
    pixelsPerUnit: 32, tickRate: 60, inputActions: [],
    assets: { image: { assetId: "builtin:image", digest: "image", width: 32, height: 32 } },
    scenes: [{ id: "room", name: "Room", entities: [
      { id: "parent", name: "Parent", transform2d: { x: 0, y: 0 } },
      { id: "child", name: "Child", parentId: "parent", transform2d: { x: 0, y: 0 } },
      { id: "sibling", name: "Sibling", transform2d: { x: 0, y: 0 } },
      { id: "prefab", name: "Prefab", templateOnly: true, transform2d: { x: 0, y: 0 } }
    ] }]
  });
}

function renderTree(document = fixture(), scriptErrorEntityId?: string) {
  const onOps = jest.fn<void, [GameDocumentOp[]]>();
  const onSelect = jest.fn();
  render(<ThemeProvider theme={mockTheme}>
    <GameSceneTree document={document} selectedIds={[]} scriptErrorEntityId={scriptErrorEntityId}
      onSelect={onSelect} onOps={onOps} />
  </ThemeProvider>);
  return { onOps, onSelect };
}

function drag(source: HTMLElement, target: HTMLElement, y: number) {
  const transfer = { setData: jest.fn(), effectAllowed: "none" };
  jest.spyOn(target, "getBoundingClientRect").mockReturnValue({
    top: 0, bottom: 100, height: 100, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => undefined
  });
  fireEvent.dragStart(source, { dataTransfer: transfer });
  fireEvent.dragOver(target, { dataTransfer: transfer, clientY: y });
  const event = createEvent.drop(target, { dataTransfer: transfer });
  Object.defineProperty(event, "clientY", { value: y });
  fireEvent(target, event);
}

describe("GameSceneTree", () => {
  it("keeps the ancestor visible when search matches a nested child and groups prefabs", async () => {
    renderTree();
    expect(screen.getByText("Prefabs")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Search entities" }), "child");
    expect(screen.getByRole("button", { name: "Parent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Child" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sibling" })).not.toBeInTheDocument();
  });

  it("adds a chosen preset through one reducer op and selects it", async () => {
    const { onOps, onSelect } = renderTree();
    await userEvent.click(screen.getByRole("button", { name: "Add entity to Room" }));
    await userEvent.click(within(screen.getByRole("menu", { name: "Add game entity" })).getByText("Static wall"));
    const ops = onOps.mock.calls[0][0];
    expect(ops).toHaveLength(1);
    const next = applyGameOps(fixture(), ops);
    const wall = next.scenes[0].entities.at(-1);
    expect(wall?.body2d?.type).toBe("static");
    expect(wall?.collider2d).toBeDefined();
    expect(onSelect).toHaveBeenCalledWith(wall?.id, false);
  });

  it("reparents and reorders entities through reducer ops", () => {
    const { onOps } = renderTree();
    drag(screen.getByRole("button", { name: "Sibling" }), screen.getByRole("button", { name: "Parent" }), 50);
    const reparented = applyGameOps(fixture(), onOps.mock.calls[0][0]);
    expect(reparented.scenes[0].entities.find((entity) => entity.id === "sibling")?.parentId).toBe("parent");
    drag(screen.getByRole("button", { name: "Child" }), screen.getByRole("button", { name: "Sibling" }), 90);
    expect(onOps.mock.calls[1][0]).toContainEqual({
      op: "move_entity", scene_id: "room", entity_id: "child", to_index: 2
    });
  });

  it("rejects a drop that would create a parent cycle", () => {
    const { onOps } = renderTree();
    drag(screen.getByRole("button", { name: "Parent" }), screen.getByRole("button", { name: "Child" }), 50);
    expect(onOps).not.toHaveBeenCalled();
  });

  it("supports keyboard reparenting", () => {
    const { onOps } = renderTree();
    fireEvent.keyDown(screen.getByRole("button", { name: "Sibling" }), { altKey: true, key: "ArrowRight" });
    const next = applyGameOps(fixture(), onOps.mock.calls[0][0]);
    expect(next.scenes[0].entities.find((entity) => entity.id === "sibling")?.parentId).toBe("parent");
  });

  it("marks an entity with a script preparation failure", () => {
    renderTree(fixture(), "child");
    expect(screen.getByRole("button", { name: "Child, has errors" })).toBeInTheDocument();
  });

  it("moves a whole subtree into the prefab group", () => {
    const { onOps } = renderTree();
    drag(screen.getByRole("button", { name: "Parent" }), screen.getByText("Prefabs"), 50);
    const next = applyGameOps(fixture(), onOps.mock.calls[0][0]);
    expect(next.scenes[0].entities.find((entity) => entity.id === "parent")?.templateOnly).toBe(true);
    expect(next.scenes[0].entities.find((entity) => entity.id === "child")?.templateOnly).toBe(true);
  });
});
