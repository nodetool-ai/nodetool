import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { gameDocument, gameDocument3D, gameParticles, type GameDocument } from "@nodetool-ai/protocol";
import { applyGameOps, applyGameOps3D } from "@nodetool-ai/game-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import GameInspector from "../../panels/inspector/GameInspector";
import GameInspector3D from "../../panels/inspector/GameInspector3D";
import type { GameComponentEditorProps } from "../componentEditors";

jest.mock("../componentEditors", () => ({
  GAME_COMPONENT_EDITORS: {
    particles: ({ dimension, onChange }: GameComponentEditorProps) =>
      <button onClick={() => onChange({ emitters: [{ id: "edited", rate: 7 }] })}>Set {dimension} particles</button>
  }
}));

describe("registered component editors in game inspectors", () => {
  it("disables particles for schema-1 documents", async () => {
    const user = userEvent.setup();
    const document = gameDocument.parse({
      schemaVersion: 1, engineVersion: "1", id: "legacy", revision: "saved", entrySceneId: "scene",
      pixelsPerUnit: 16, tickRate: 60, inputActions: [], assets: {},
      scenes: [{ id: "scene", name: "Scene", entities: [{ id: "emitter", transform2d: { x: 0, y: 0 } }] }]
    });
    const onOps = jest.fn();
    render(<ThemeProvider theme={mockTheme}><GameInspector document={document} activeSceneId="scene" selectedIds={["emitter"]}
      onOps={onOps} onSceneChange={() => undefined} onEditScript={() => undefined} /></ThemeProvider>);
    await user.click(screen.getByRole("button", { name: "Add component" }));
    const particles = screen.getByRole("menuitem", { name: "Particles" });
    expect(particles).toHaveAttribute("aria-disabled", "true");
    expect(onOps).not.toHaveBeenCalled();
  });

  it("adds valid 2D particles and retains the inspector's remove operation", async () => {
    const user = userEvent.setup();
    const initial = gameDocument.parse({
      schemaVersion: 2, engineVersion: "1", id: "game", revision: "saved", entrySceneId: "scene",
      pixelsPerUnit: 16, tickRate: 60, inputActions: [], assets: {},
      scenes: [{ id: "scene", name: "Scene", entities: [{ id: "emitter", transform2d: { x: 2, y: 3 } }] }]
    });
    const received: GameDocument[] = [];
    function Fixture() {
      const [document, setDocument] = useState(initial);
      return <GameInspector document={document} activeSceneId="scene" selectedIds={["emitter"]}
        onOps={(ops) => {
          const next = applyGameOps(document, ops);
          received.push(next);
          setDocument(next);
        }} onSceneChange={() => undefined} onEditScript={() => undefined} />;
    }
    render(<ThemeProvider theme={mockTheme}><Fixture /></ThemeProvider>);
    await user.click(screen.getByRole("button", { name: "Add component" }));
    await user.click(screen.getByRole("menuitem", { name: "Particles" }));
    expect(gameParticles.safeParse(received.at(-1)?.scenes[0].entities[0].particles).success).toBe(true);
    expect(screen.getByRole("button", { name: "Set 2d particles" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Particles" }));
    expect(received.at(-1)?.scenes[0].entities[0].particles).toBeUndefined();
    expect(screen.queryByRole("button", { name: "Set 2d particles" })).not.toBeInTheDocument();
  });

  it("routes 2D component edits through document operations", async () => {
    const user = userEvent.setup();
    const initial = gameDocument.parse({
      schemaVersion: 2, engineVersion: "1", id: "game", revision: "saved", entrySceneId: "scene",
      pixelsPerUnit: 16, tickRate: 60, inputActions: [], assets: {},
      scenes: [{ id: "scene", name: "Scene", entities: [{ id: "emitter", name: "Emitter", transform2d: { x: 2, y: 3 },
        particles: { emitters: [{ id: "original" }] } }] }]
    });
    let edited = initial;
    render(<ThemeProvider theme={mockTheme}><GameInspector document={initial} activeSceneId="scene" selectedIds={["emitter"]}
      onOps={(ops) => { edited = applyGameOps(edited, ops); }} onSceneChange={() => undefined} onEditScript={() => undefined} /></ThemeProvider>);
    await user.click(screen.getByRole("button", { name: "Set 2d particles" }));
    expect(edited.scenes[0].entities[0].particles?.emitters[0]).toEqual(expect.objectContaining({ id: "edited", rate: 7 }));
    expect(edited.scenes[0].entities[0].transform2d).toEqual(initial.scenes[0].entities[0].transform2d);
    expect(edited.scenes[0].entities[0].name).toBe("Emitter");
  });

  it("routes 3D component edits through document operations", async () => {
    const user = userEvent.setup();
    const initial = gameDocument3D.parse({
      schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "game", revision: "saved", entrySceneId: "scene",
      tickRate: 60, inputActions: [], assets: {}, presentation: { aspectRatio: 1, hudWidth: 100, hudHeight: 100 },
      scenes: [{ id: "scene", name: "Scene", activeCameraId: "camera", entities: [
        { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } },
        { id: "emitter", name: "Emitter", transform3d: { position: { x: 2, y: 3, z: 4 } },
          particles: { emitters: [{ id: "original" }] } }
      ] }]
    });
    let edited = initial;
    render(<ThemeProvider theme={mockTheme}><GameInspector3D document={initial} sceneId="scene" entityId="emitter"
      onOps={(ops) => { edited = applyGameOps3D(edited, ops); }} onScript={() => undefined}
      onOperationError={(message) => { throw new Error(message); }} /></ThemeProvider>);
    await user.click(screen.getByRole("button", { name: "Set 3d particles" }));
    expect(edited.scenes[0].entities[1].particles?.emitters[0]).toEqual(expect.objectContaining({ id: "edited", rate: 7 }));
    expect(edited.scenes[0].entities[1].transform3d).toEqual(initial.scenes[0].entities[1].transform3d);
    expect(edited.scenes[0].entities[1].name).toBe("Emitter");
  });
});
