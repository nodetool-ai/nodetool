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

function renderTree(document = fixture(), scriptErrorEntityId?: string, activeSceneId = "room") {
  const onOps = jest.fn<void, [GameDocumentOp[]]>();
  const onSelect = jest.fn();
  const onSelectScene = jest.fn();
  render(<ThemeProvider theme={mockTheme}>
    <GameSceneTree document={document} activeSceneId={activeSceneId} selectedIds={[]} scriptErrorEntityId={scriptErrorEntityId}
      onSelect={onSelect} onSelectScene={onSelectScene} onOps={onOps} />
  </ThemeProvider>);
  return { onOps, onSelect, onSelectScene };
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
  it("uses inspector label typography and indents each tree level", () => {
    renderTree();
    const group = screen.getByRole("button", { name: "Entities in Room" });
    const parent = screen.getByRole("button", { name: "Parent" });
    const child = screen.getByRole("button", { name: "Child" });
    const groupIndent = parseFloat(getComputedStyle(group.parentElement!).paddingLeft) +
      parseFloat(getComputedStyle(group).paddingLeft);
    const parentIndent = parseFloat(getComputedStyle(parent).paddingLeft);
    const childIndent = parseFloat(getComputedStyle(child).paddingLeft);

    expect(parent).toHaveStyle({ fontSize: "var(--fontSizeSmall)" });
    expect(parentIndent).toBeGreaterThan(groupIndent);
    expect(childIndent).toBeGreaterThan(parentIndent);
    expect(parent.querySelector("svg")).toHaveStyle({ fontSize: "var(--fontSizeNormal)" });
    expect(screen.getByRole("textbox", { name: "Search entities" })).toHaveStyle({ fontSize: "var(--fontSizeSmall)" });
  });

  it("selects a scene without collapsing it and marks the active scene", async () => {
    const document = fixture();
    document.scenes.push({ id: "arena", name: "Arena", entities: [] });
    const { onSelectScene } = renderTree(document);
    expect(screen.getByRole("button", { name: "Scene Room" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Scene Arena" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Scene Arena" }));
    expect(onSelectScene).toHaveBeenCalledWith("arena");
    expect(screen.getByRole("button", { name: "Child" })).toBeInTheDocument();
  });

  it("collapses scenes and groups independently", async () => {
    renderTree();
    await userEvent.click(screen.getByRole("button", { name: "Entities in Room" }));
    expect(screen.getByRole("button", { name: "Entities in Room" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Parent" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prefab" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Collapse Room" }));
    expect(screen.getByRole("button", { name: "Expand Room" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Prefab" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Expand Room" }));
    expect(screen.getByRole("button", { name: "Prefabs in Room" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Entities in Room" })).toHaveAttribute("aria-expanded", "false");
  });

  it("shows search matches inside collapsed sections and restores collapse state afterward", async () => {
    renderTree();
    await userEvent.click(screen.getByRole("button", { name: "Entities in Room" }));
    await userEvent.click(screen.getByRole("button", { name: "Collapse Room" }));
    const search = screen.getByRole("textbox", { name: "Search entities" });
    await userEvent.type(search, "child");
    expect(screen.getByRole("button", { name: "Parent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Child" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Entities in Room" }));
    expect(screen.queryByRole("button", { name: "Child" })).not.toBeInTheDocument();
    await userEvent.type(search, "x");
    expect(screen.getByRole("button", { name: "Entities in Room" })).toHaveAttribute("aria-expanded", "true");
    await userEvent.clear(search);
    await userEvent.type(search, "child");
    expect(screen.getByRole("button", { name: "Child" })).toBeInTheDocument();
    await userEvent.clear(search);
    expect(screen.getByRole("button", { name: "Expand Room" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Child" })).not.toBeInTheDocument();
  });

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

  it("accepts drops on a collapsed group header", async () => {
    const { onOps } = renderTree();
    await userEvent.click(screen.getByRole("button", { name: "Prefabs in Room" }));
    expect(screen.queryByRole("button", { name: "Prefab" })).not.toBeInTheDocument();
    drag(screen.getByRole("button", { name: "Parent" }), screen.getByText("Prefabs"), 50);
    const next = applyGameOps(fixture(), onOps.mock.calls[0][0]);
    expect(next.scenes[0].entities.find((entity) => entity.id === "parent")?.templateOnly).toBe(true);
    expect(next.scenes[0].entities.find((entity) => entity.id === "child")?.templateOnly).toBe(true);
  });
});
