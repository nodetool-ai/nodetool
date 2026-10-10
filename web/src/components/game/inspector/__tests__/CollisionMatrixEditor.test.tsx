import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { gameDocument3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { applyGameOps3D, collisionLayerBits3D, type GameDocumentOp3D } from "@nodetool-ai/game-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import GameInspector3D from "../../panels/inspector/GameInspector3D";
import { removeCollisionLayer3D, setCollisionPair } from "../editors/CollisionMatrixEditor";

const initial = gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "three", revision: "draft", entrySceneId: "scene",
  tickRate: 60, presentation: { aspectRatio: 1, hudWidth: 100, hudHeight: 100 }, inputActions: [], assets: {},
  collisionLayers: ["world", "player", "enemy"], collisionMatrix: [["enemy", "enemy"]],
  scenes: [{ id: "scene", name: "Scene", activeCameraId: "camera", entities: [
    { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } },
    { id: "hero", transform3d: {}, body3d: { type: "kinematic" }, collider3d: { kind: "sphere", radius: 0.5, layer: "player" } },
    { id: "wall", transform3d: {}, body3d: { type: "static" }, collider3d: { kind: "box", halfExtents: { x: 1, y: 1, z: 1 } } }
  ] }] });

function Fixture({ entityId, received }: { entityId?: string; received: GameDocumentOp3D[][] }) {
  const [document, setDocument] = useState<GameDocument3D>(initial);
  return <ThemeProvider theme={mockTheme}><GameInspector3D document={document} sceneId="scene" entityId={entityId} onOperationError={(message) => { throw new Error(message); }}
    onScript={() => undefined} onOps={(ops) => { received.push(ops); setDocument(applyGameOps3D(document, ops)); }} /></ThemeProvider>;
}

function latest(received: GameDocumentOp3D[][]): GameDocument3D {
  return received.reduce((document, ops) => applyGameOps3D(document, ops), initial);
}

describe("collision layer matrix editor", () => {
  it("shows the lower triangle of layer pairs with ignored pairs unchecked", () => {
    render(<Fixture received={[]} />);
    expect(screen.getByRole("group", { name: "Collision matrix" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "enemy collides with enemy" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "enemy collides with player" })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "player collides with enemy" })).toBeNull();
    expect(screen.getAllByRole("checkbox", { name: / collides with / })).toHaveLength(6);
  });

  it("stores an unchecked pair through set_game and the derived bits stop the pair colliding", async () => {
    const user = userEvent.setup();
    const received: GameDocumentOp3D[][] = [];
    render(<Fixture received={received} />);
    await user.click(screen.getByRole("checkbox", { name: "enemy collides with player" }));
    expect(received.at(-1)).toEqual([expect.objectContaining({ op: "set_game", collision_matrix: [["enemy", "enemy"], ["enemy", "player"]] })]);
    const document = latest(received);
    const player = collisionLayerBits3D(document, "player");
    const enemy = collisionLayerBits3D(document, "enemy");
    expect((player.mask & enemy.category) === 0 && (enemy.mask & player.category) === 0).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: "enemy collides with enemy" }));
    expect(latest(received).collisionMatrix).toEqual([["enemy", "player"]]);
  });

  it("renames a layer in the matrix and on colliders, and adds a layer", async () => {
    const user = userEvent.setup();
    const received: GameDocumentOp3D[][] = [];
    render(<Fixture received={received} />);
    const name = screen.getByRole("textbox", { name: "Layer 2 name" });
    await user.clear(name);
    await user.type(name, "hero{Enter}");
    const renamed = latest(received);
    expect(renamed.collisionLayers).toEqual(["world", "hero", "enemy"]);
    expect(renamed.scenes[0].entities[1].collider3d?.layer).toBe("hero");
    await user.click(screen.getByRole("button", { name: "Add layer" }));
    expect(latest(received).collisionLayers).toEqual(["world", "hero", "enemy", "layer4"]);
  });

  it("picks a collider layer from the declared names and hides raw bits on layered colliders", async () => {
    const user = userEvent.setup();
    const received: GameDocumentOp3D[][] = [];
    render(<Fixture entityId="hero" received={received} />);
    expect(screen.queryByText("Category")).toBeNull();
    await user.click(screen.getByRole("combobox", { name: "Layer" }));
    await user.click(screen.getByRole("option", { name: "enemy" }));
    expect(latest(received).scenes[0].entities[1].collider3d?.layer).toBe("enemy");
  });

  it("keeps the raw bit grid for colliders without a layer", () => {
    render(<Fixture entityId="wall" received={[]} />);
    expect(screen.getByText("Category")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Layer" })).toBeTruthy();
  });

  it("keeps the matrix symmetric and drops pairs of a removed layer", () => {
    expect(setCollisionPair([["a", "b"]], "b", "a", true)).toEqual([]);
    expect(setCollisionPair([], "b", "a", false)).toEqual([["b", "a"]]);
    const removed = removeCollisionLayer3D(initial, "enemy");
    expect(removed.collisionLayers).toEqual(["world", "player"]);
    expect(removed.collisionMatrix).toEqual([]);
  });
});
