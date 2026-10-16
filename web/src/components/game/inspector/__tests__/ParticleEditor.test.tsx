import { useStore } from "zustand";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { applyAnyGameOps, createNative3DGame } from "@nodetool-ai/game-runtime";
import { gameDocument, gameParticles, getGameParticlePreset, type AnyGameDocument } from "@nodetool-ai/protocol";

import mockTheme from "../../../../__mocks__/themeMock";
import { getGameDraftStore } from "../../../../stores/game/GameDraftStore";
import { gameSchemaFields } from "../schemaForm";
import ParticleEditor from "../editors/ParticleEditor";
import GameInspector from "../../panels/inspector/GameInspector";
import GameInspector3D from "../../panels/inspector/GameInspector3D";

jest.mock("../editors/ParticlePreview", () => ({ __esModule: true, default: () => null }));
const PARTICLE_FIELDS = gameSchemaFields(gameParticles);

function fixture(dimension: "2d" | "3d"): AnyGameDocument {
  const particles = gameParticles.parse({ emitters: [{ id: "original" }] });
  if (dimension === "3d") {
    const document = createNative3DGame("particles-inspector-3d");
    document.scenes[0].entities[0].particles = particles;
    return document;
  }
  return gameDocument.parse({ schemaVersion: 4, engineVersion: "3", id: "particles-inspector-2d", revision: "before",
    entrySceneId: "main", pixelsPerUnit: 50, tickRate: 60, inputActions: [], assets: {},
    scenes: [{ id: "main", name: "Main", entities: [{ id: "emitter", name: "Keep me", transform2d: { x: 12, y: 34 }, tags: ["keep"], particles }] }] });
}

function mountEditor(initial: AnyGameDocument, registered = false) {
  const store = getGameDraftStore(initial.id);
  store.getState().load(initial, "before");
  const entityId = initial.scenes[0].entities[0].id;
  const sceneId = initial.scenes[0].id;
  function Fixture() {
    const document = useStore(store, (state) => state.document)!;
    const entity = document.scenes[0].entities[0];
    const onChange = (next: unknown): void => {
      store.getState().apply([{ op: "update_entity", scene_id: sceneId, entity_id: entityId, set: { particles: gameParticles.parse(next) } }], { label: "Change Particles" });
    };
    if (registered) {
      return document.schemaVersion === 3
        ? <GameInspector3D document={document} sceneId={sceneId} entityId={entityId}
          onOps={(ops) => store.getState().apply(ops)} onScript={() => undefined} onOperationError={(message) => { throw new Error(message); }} />
        : <GameInspector document={document} activeSceneId={sceneId} selectedIds={[entityId]}
          onOps={(ops) => store.getState().apply(ops)} onSceneChange={() => undefined} onEditScript={() => undefined} />;
    }
    return <ParticleEditor value={entity.particles} schema={PARTICLE_FIELDS} assets={document.assets}
      dimension={document.schemaVersion === 3 ? "3d" : "2d"} path="entity.particles" issuePath={["particles"]} issues={[]} onChange={onChange} />;
  }
  render(<ThemeProvider theme={mockTheme}><Fixture /></ThemeProvider>);
  return store;
}

async function choosePreset(name: string): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "Particle preset" }));
  await user.click(screen.getByRole("option", { name }));
  await user.click(screen.getByRole("button", { name: "Apply preset" }));
}

it.each(["2d", "3d"] as const)("registers the particle editor in the actual %s inspector and preserves undo/save", async (dimension) => {
  const initial = fixture(dimension);
  const store = mountEditor(initial, true);
  await choosePreset("Fire");
  const changed = store.getState().document!;
  const expected = structuredClone(changed);
  expected.scenes[0].entities[0].particles = initial.scenes[0].entities[0].particles;
  expect(expected.scenes[0].entities[0]).toEqual(initial.scenes[0].entities[0]);
  expect(changed.scenes[0].entities[0].particles).toEqual(getGameParticlePreset("fire", dimension));
  expect(applyAnyGameOps(initial, store.getState().captureSaveOps())).toEqual(changed);
  expect(store.getState().captureSaveDocument()?.document).toEqual(changed);
  await act(async () => { store.getState().undo(); });
  expect(store.getState().document).toEqual(initial);
  await act(async () => { store.getState().redo(); });
  expect(store.getState().document).toEqual(changed);
});

it("edits lifetime curves and gradients through the shared accessible primitives", async () => {
  const store = mountEditor(fixture("2d"));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add size over lifetime" }));
  expect(store.getState().document!.scenes[0].entities[0].particles?.emitters[0].sizeOverLifetime)
    .toEqual([{ t: 0, value: 1 }, { t: 1, value: 1 }]);
  expect(screen.getByRole("group", { name: "Size over lifetime" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Add color over lifetime" }));
  expect(store.getState().document!.scenes[0].entities[0].particles?.emitters[0].colorOverLifetime).toEqual([{ t: 0, color: "#ffffff" }]);
  await user.click(screen.getByRole("button", { name: "Remove size over lifetime" }));
  expect(store.getState().document!.scenes[0].entities[0].particles?.emitters[0].sizeOverLifetime).toBeUndefined();
});

it("removes an emitter and its death references together", async () => {
  const initial = fixture("2d");
  initial.scenes[0].entities[0].particles = gameParticles.parse({ emitters: [
    { id: "parent", onDeath: [{ emitter: "child" }] }, { id: "child" }
  ] });
  const store = mountEditor(initial);
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "Particle emitter" }));
  await user.click(screen.getByRole("option", { name: "child" }));
  await user.click(screen.getByRole("button", { name: "Remove emitter" }));
  const particles = store.getState().document!.scenes[0].entities[0].particles!;
  expect(particles.emitters.map((emitter) => emitter.id)).toEqual(["parent"]);
  expect(particles.emitters[0].onDeath).toEqual([]);
  expect(screen.getByRole("button", { name: "Remove emitter" })).toBeDisabled();
});

it("repairs death references when an emitter is renamed and rejects duplicate names", async () => {
  const initial = fixture("2d");
  initial.scenes[0].entities[0].particles = gameParticles.parse({ emitters: [
    { id: "parent", onDeath: [{ emitter: "child" }] }, { id: "child" }
  ] });
  const store = mountEditor(initial);
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "Particle emitter" }));
  await user.click(screen.getByRole("option", { name: "child" }));
  const id = screen.getByRole("textbox", { name: "ID" });
  await user.tripleClick(id);
  await user.paste("renamed");
  const renamed = store.getState().document!.scenes[0].entities[0].particles!;
  expect(renamed.emitters[1].id).toBe("renamed");
  expect(renamed.emitters[0].onDeath).toEqual([{ emitter: "renamed", count: 1 }]);
  const beforeInvalid = structuredClone(store.getState().document);
  await user.tripleClick(id);
  await user.paste("parent");
  expect(screen.getByRole("alert")).toHaveTextContent(/duplicate/i);
  expect(store.getState().document).toEqual(beforeInvalid);
});
