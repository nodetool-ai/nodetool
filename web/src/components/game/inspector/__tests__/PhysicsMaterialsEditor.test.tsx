import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { gameDocument3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { applyGameOps3D, resolvePhysicsMaterials3D, type GameDocumentOp3D } from "@nodetool-ai/game-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import GameInspector3D from "../../panels/inspector/GameInspector3D";
import { removePhysicsMaterial3D, renamePhysicsMaterial3D } from "../editors/PhysicsMaterialsEditor";

const initial = gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "three", revision: "draft", entrySceneId: "scene",
  tickRate: 60, presentation: { aspectRatio: 1, hudWidth: 100, hudHeight: 100 }, inputActions: [], assets: {},
  physicsMaterials: { ice: { friction: 0.02, frictionCombine: "min" }, rubber: { restitution: 0.85, restitutionCombine: "max" } },
  scenes: [{ id: "scene", name: "Scene", activeCameraId: "camera", entities: [
    { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } },
    { id: "ball", transform3d: {}, body3d: { type: "dynamic" }, collider3d: { kind: "sphere", radius: 0.5, physicsMaterial: "rubber" } },
    { id: "floor", transform3d: {}, body3d: { type: "static" }, collider3d: { kind: "box", halfExtents: { x: 1, y: 1, z: 1 }, friction: 1.5, frictionCombine: "max" } }
  ] }] });

function Fixture({ entityId, received }: { entityId?: string; received: GameDocumentOp3D[][] }) {
  const [document, setDocument] = useState<GameDocument3D>(initial);
  return <ThemeProvider theme={mockTheme}><GameInspector3D document={document} sceneId="scene" entityId={entityId} onOperationError={(message) => { throw new Error(message); }}
    onScript={() => undefined} onOps={(ops) => { received.push(ops); setDocument(applyGameOps3D(document, ops)); }} /></ThemeProvider>;
}

function latest(received: GameDocumentOp3D[][]): GameDocument3D {
  return received.reduce((document, ops) => applyGameOps3D(document, ops), initial);
}

/** Opens each "Add property" menu until one lists the item, as a collider's optional fields share one menu. */
async function openAddMenuItem(user: ReturnType<typeof userEvent.setup>, item: string): Promise<HTMLElement> {
  for (const button of screen.getAllByRole("button", { name: "Add property" })) {
    await user.click(button);
    const found = screen.queryByRole("menuitem", { name: item });
    if (found) { return found; }
    await user.keyboard("{Escape}");
  }
  throw new Error(`No add menu lists ${item}`);
}

describe("physics materials editor", () => {
  it("edits a material's friction through set_game", async () => {
    const user = userEvent.setup();
    const received: GameDocumentOp3D[][] = [];
    render(<Fixture received={received} />);
    const friction = screen.getAllByRole("textbox", { name: "Friction" })[0];
    await user.clear(friction);
    await user.type(friction, "0.05{Enter}");
    expect(received.at(-1)).toEqual([expect.objectContaining({ op: "set_game",
      physics_materials: expect.objectContaining({ ice: expect.objectContaining({ friction: 0.05, frictionCombine: "min" }) }) })]);
  });

  it("changes a combine rule, and the session takes it into the referencing collider", async () => {
    const user = userEvent.setup();
    const received: GameDocumentOp3D[][] = [];
    render(<Fixture received={received} />);
    await user.click(screen.getAllByRole("combobox", { name: "Restitution combine" })[1]);
    await user.click(screen.getByRole("option", { name: "multiply" }));
    const document = latest(received);
    expect(document.physicsMaterials?.rubber.restitutionCombine).toBe("multiply");
    expect(resolvePhysicsMaterials3D(document).scenes[0].entities[1].collider3d).toMatchObject({ restitution: 0.85, restitutionCombine: "multiply" });
  });

  it("renames a material on colliders, adds one and reports a duplicate name", async () => {
    const user = userEvent.setup();
    const received: GameDocumentOp3D[][] = [];
    render(<Fixture received={received} />);
    const name = screen.getByRole("textbox", { name: "Material rubber name" });
    await user.clear(name);
    await user.type(name, "bouncy{Enter}");
    const renamed = latest(received);
    expect(Object.keys(renamed.physicsMaterials ?? {})).toEqual(["ice", "bouncy"]);
    expect(renamed.scenes[0].entities[1].collider3d?.physicsMaterial).toBe("bouncy");
    await user.click(screen.getByRole("button", { name: "Add material" }));
    expect(latest(received).physicsMaterials?.material3).toEqual({ friction: 0.5, restitution: 0, frictionCombine: "average", restitutionCombine: "average" });
    const count = received.length;
    const iceName = screen.getByRole("textbox", { name: "Material ice name" });
    await user.clear(iceName);
    await user.type(iceName, "bouncy{Enter}");
    expect(screen.getByRole("alert").textContent).toContain("Material bouncy already exists");
    expect(received).toHaveLength(count);
  });

  it("picks a collider's material and hides the inline values it replaces", async () => {
    const user = userEvent.setup();
    const received: GameDocumentOp3D[][] = [];
    render(<Fixture entityId="ball" received={received} />);
    const collider = screen.getByRole("combobox", { name: "Physics material" });
    expect(screen.queryByRole("textbox", { name: "Friction" })).toBeNull();
    await user.click(collider);
    await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: "ice" }));
    expect(latest(received).scenes[0].entities[1].collider3d?.physicsMaterial).toBe("ice");
  });

  it("resets conflicting inline values when a material is added so the edit is accepted", async () => {
    const user = userEvent.setup();
    const received: GameDocumentOp3D[][] = [];
    render(<Fixture entityId="floor" received={received} />);
    expect(screen.getByRole("textbox", { name: "Friction" })).toBeTruthy();
    await user.click(await openAddMenuItem(user, "Physics material"));
    const collider = latest(received).scenes[0].entities[2].collider3d;
    expect(collider).toMatchObject({ physicsMaterial: "ice", friction: 0.5, restitution: 0 });
    expect(collider).not.toHaveProperty("frictionCombine");
    expect(screen.queryByRole("textbox", { name: "Friction" })).toBeNull();
  });

  it("keeps material order on rename and drops the record with its last material", () => {
    expect(Object.keys(renamePhysicsMaterial3D(initial, "ice", "glass").physicsMaterials ?? {})).toEqual(["glass", "rubber"]);
    const removed = removePhysicsMaterial3D(removePhysicsMaterial3D(initial, "ice"), "rubber");
    expect(removed).not.toHaveProperty("physicsMaterials");
  });
});
