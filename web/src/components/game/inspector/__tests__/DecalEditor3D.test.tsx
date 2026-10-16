import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { gameDocument3D, gameEntity3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { applyGameOps3D } from "@nodetool-ai/game-runtime";
import mockTheme from "../../../../__mocks__/themeMock";
import GameInspector3D from "../../panels/inspector/GameInspector3D";

function documentFixture(images = true): GameDocument3D {
  return gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "decal-game",
    revision: "saved", entrySceneId: "scene", tickRate: 60, inputActions: [],
    assets: images ? { paint: { mediaKind: "image", assetId: "paint-resource", digest: "a".repeat(64), required: true,
      format: "png", width: 1, height: 1, byteLength: 70, preparationVersion: "1" } } : {},
    presentation: { aspectRatio: 1, hudWidth: 100, hudHeight: 100 }, scenes: [{ id: "scene", name: "Scene",
      activeCameraId: "camera", entities: [
        { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } },
        { id: "wall", name: "Wall", transform3d: {}, primitive: { kind: "box", dimensions: { x: 2, y: 2, z: 2 }, material: { color: "#0088ff" } } },
        { id: "second", name: "Second wall", transform3d: {}, primitive: { kind: "box", dimensions: { x: 2, y: 2, z: 2 }, material: { color: "#0088ff" } } },
        { id: "projector", name: "Projector", transform3d: { position: { x: 0, y: 0, z: 1 } } }
      ] }] });
}

function mount(initial: GameDocument3D): { documents: GameDocument3D[]; errors: string[] } {
  const documents: GameDocument3D[] = [];
  const errors: string[] = [];
  function Fixture() {
    const [document, setDocument] = useState(initial);
    return <GameInspector3D document={document} sceneId="scene" entityId="projector" onScript={() => undefined}
      onOperationError={message => errors.push(message)} onOps={ops => {
        try { const next = applyGameOps3D(document, ops); documents.push(next); setDocument(next); }
        catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
      }} />;
  }
  render(<ThemeProvider theme={mockTheme}><Fixture /></ThemeProvider>);
  return { documents, errors };
}

it("adds, edits and removes a valid first decal through real inspector operations", async () => {
  const user = userEvent.setup();
  const initial = documentFixture();
  const fixture = mount(initial);
  await user.click(screen.getByRole("button", { name: "Add decal" }));
  const entity = () => fixture.documents.at(-1)?.scenes[0].entities.find(entity => entity.id === "projector");
  expect(entity()?.decal3d).toMatchObject({ assetId: "paint", receiverId: "wall", size: { x: 1, y: 1, z: 0.25 } });
  const size = screen.getByRole("textbox", { name: "X" });
  await user.clear(size);
  await user.type(size, "2{Enter}");
  expect(entity()?.decal3d?.size.x).toBe(2);
  await user.click(screen.getByRole("combobox", { name: "Decal receiver" }));
  await user.click(screen.getByRole("option", { name: "Second wall" }));
  expect(entity()?.decal3d?.receiverId).toBe("second");
  await user.click(screen.getByRole("button", { name: "Remove decal" }));
  expect(entity()?.decal3d).toBeUndefined();
  expect(entity()?.transform3d).toEqual(initial.scenes[0].entities.find(entity => entity.id === "projector")?.transform3d);
  expect(fixture.errors).toEqual([]);
});

it("disables addition until both an image and receiver exist", () => {
  const initial = documentFixture(false);
  initial.scenes[0].entities = initial.scenes[0].entities.filter(entity => !entity.primitive);
  const fixture = mount(initial);
  expect(screen.getByRole("button", { name: "Add decal" })).toBeDisabled();
  expect(fixture.documents).toEqual([]);
});

it("keeps the unsafe generic decal default out of the component menu", async () => {
  const user = userEvent.setup();
  mount(documentFixture());
  await user.click(screen.getByRole("button", { name: "Add component" }));
  expect(screen.queryByRole("menuitem", { name: "Decal 3D" })).not.toBeInTheDocument();
});

it("keeps the full scene decal limit when offering addition", () => {
  const initial = documentFixture();
  initial.scenes[0].entities.push(...Array.from({ length: 32 }, (_, index) => gameEntity3D.parse({
    id: `existing-${index}`, name: `Existing ${index}`, transform3d: initial.scenes[0].entities[0].transform3d,
    decal3d: { assetId: "paint", receiverId: "wall", size: { x: 1, y: 1, z: 0.25 }, opacity: 1, renderOrder: 0 }
  })));
  const fixture = mount(gameDocument3D.parse(initial));
  expect(screen.getByRole("button", { name: "Add decal" })).toBeDisabled();
  expect(fixture.documents).toEqual([]);
});
