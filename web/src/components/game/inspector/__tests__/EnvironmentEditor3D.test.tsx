import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { gameDocument3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { applyGameOps3D } from "@nodetool-ai/game-runtime";
import mockTheme from "../../../../__mocks__/themeMock";
import GameInspector3D from "../../panels/inspector/GameInspector3D";

it("authors height and linear fog and removes fog through real scene operations", async () => {
  const user = userEvent.setup();
  const initial = gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "fog-game",
    revision: "saved", entrySceneId: "scene", tickRate: 60, inputActions: [], assets: {},
    presentation: { aspectRatio: 1, hudWidth: 100, hudHeight: 100 }, scenes: [{ id: "scene", name: "Scene",
      activeCameraId: "camera", entities: [{ id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } }] }] });
  const received: GameDocument3D[] = [];
  function Fixture() {
    const [document, setDocument] = useState(initial);
    return <GameInspector3D document={document} sceneId="scene" onScript={() => undefined}
      onOperationError={(message) => { throw new Error(message); }} onOps={(ops) => {
        const next = applyGameOps3D(document, ops);
        received.push(next);
        setDocument(next);
      }} />;
  }
  render(<ThemeProvider theme={mockTheme}><Fixture /></ThemeProvider>);
  await user.click(screen.getByRole("combobox", { name: "Fog mode" }));
  await user.click(screen.getByRole("option", { name: "Height" }));
  expect(received.at(-1)?.scenes[0].environment.fog).toMatchObject({ kind: "height", density: 0.02 });
  const falloff = screen.getByRole("textbox", { name: "Height falloff" });
  await user.clear(falloff);
  await user.type(falloff, "0.7{Enter}");
  expect(received.at(-1)?.scenes[0].environment.fog).toMatchObject({ kind: "height", heightFalloff: 0.7 });
  await user.click(screen.getByRole("combobox", { name: "Fog mode" }));
  await user.click(screen.getByRole("option", { name: "Linear" }));
  expect(received.at(-1)?.scenes[0].environment.fog).toEqual({ color: "#ffffff", near: 5, far: 50 });
  await user.click(screen.getByRole("combobox", { name: "Fog mode" }));
  await user.click(screen.getByRole("option", { name: "None" }));
  expect(received.at(-1)?.scenes[0].environment.fog).toBeUndefined();
  expect(received.at(-1)?.scenes[0].entities).toEqual(initial.scenes[0].entities);
  expect(received.at(-1)?.scenes[0].environment.ambient).toEqual(initial.scenes[0].environment.ambient);
});
