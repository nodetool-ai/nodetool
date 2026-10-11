import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { gameDocument, gameDocument3D, type GameDocument, type GameDocument3D } from "@nodetool-ai/protocol";
import { applyGameOps, applyGameOps3D, type GameDocumentOp, type GameDocumentOp3D } from "@nodetool-ai/game-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import GameInspector from "../../panels/inspector/GameInspector";
import GameInspector3D from "../../panels/inspector/GameInspector3D";
import ScriptParamsEditor, { scriptParamEdit } from "../editors/ScriptParamsEditor";

const SOURCE = "(input) => ({ state: input.params, commands: [{ kind: 'setVelocity', x: input.params.speed, y: 0 }] })";
const PARAMS = {
  speed: { type: "number", default: 1, minimum: 0, maximum: 10 },
  target: { type: "entity" },
  hit: { type: "asset", kind: "audio" }
} as const;

const initial = gameDocument.parse({
  schemaVersion: 4, engineVersion: "3", id: "game", revision: "one", entrySceneId: "main", pixelsPerUnit: 16, tickRate: 60,
  inputActions: [],
  assets: {
    image: { assetId: "image-file", digest: "digest", mediaKind: "image", width: 1, height: 1 },
    hit: { assetId: "hit-file", digest: "hit-digest", mediaKind: "audio", width: 1, height: 1 }
  },
  scenes: [{ id: "main", name: "Main", entities: [
    { id: "hero", name: "Hero", transform2d: { x: 0, y: 0 }, body2d: { type: "kinematic" }, collider2d: { width: 1, height: 1 },
      behaviors: [{ kind: "script", source: SOURCE, params: PARAMS }] },
    { id: "goal", name: "Goal", transform2d: { x: 5, y: 0 } }
  ] }]
});

function Fixture({ onDocument, onOps }: { onDocument: (document: GameDocument) => void; onOps?: (ops: GameDocumentOp[]) => void }) {
  const [document, setDocument] = useState(initial);
  const apply = (ops: GameDocumentOp[]) => {
    onOps?.(ops);
    const next = applyGameOps(document, ops);
    setDocument(next);
    onDocument(next);
  };
  return <ThemeProvider theme={mockTheme}><GameInspector document={document} activeSceneId="main" selectedIds={["hero"]} onOps={apply}
    onSceneChange={() => undefined} onEditScript={() => undefined} /></ThemeProvider>;
}

describe("script parameters in the inspector", () => {
  // game-runtime's script-params.test.ts plays the same set_script_params edit and shows the speed change in the simulation.
  it("stores an edited number through set_script_params without editing the source", async () => {
    const user = userEvent.setup();
    const onDocument = jest.fn();
    const ops: GameDocumentOp[][] = [];
    render(<Fixture onDocument={onDocument} onOps={(next) => ops.push(next)} />);
    const speed = screen.getByRole("textbox", { name: "Speed" });
    expect(speed).toHaveValue("1");
    await user.clear(speed);
    await user.type(speed, "4{Enter}");
    const edited: GameDocument = onDocument.mock.lastCall?.[0];
    const behavior = edited.scenes[0].entities[0].behaviors[0];
    expect(behavior).toMatchObject({ source: SOURCE, values: { speed: 4 } });
    expect(ops.at(-1)).toEqual([{ op: "set_script_params", entity_id: "hero", scene_id: "main", index: 0, values: { speed: 4 } }]);
  });

  it("selects entity and asset references from the scene and matching assets", async () => {
    const user = userEvent.setup();
    const onDocument = jest.fn();
    render(<Fixture onDocument={onDocument} />);
    await user.click(screen.getByRole("combobox", { name: "Target" }));
    await user.click(screen.getByRole("option", { name: "Goal" }));
    expect(onDocument.mock.lastCall?.[0].scenes[0].entities[0].behaviors[0].values).toEqual({ target: "goal" });
    await user.click(screen.getByRole("combobox", { name: "Hit" }));
    expect(screen.queryByRole("option", { name: "image" })).toBeNull();
    await user.click(screen.getByRole("option", { name: "hit" }));
    expect(onDocument.mock.lastCall?.[0].scenes[0].entities[0].behaviors[0].values).toEqual({ target: "goal", hit: "hit" });
  });

  it("renders 3D params and sets values through set_script_params", async () => {
    const user = userEvent.setup();
    const document3D = gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "three", revision: "draft", entrySceneId: "scene",
      tickRate: 60, presentation: { aspectRatio: 1, hudWidth: 100, hudHeight: 100 }, inputActions: [], assets: {},
      scenes: [{ id: "scene", name: "Scene", activeCameraId: "camera", entities: [
        { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } },
        { id: "mover", transform3d: {}, behaviors: [{ kind: "script", source: SOURCE, params: { speed: PARAMS.speed } }] }
      ] }] });
    const received: GameDocumentOp3D[][] = [];
    function Fixture3D() {
      const [document, setDocument] = useState<GameDocument3D>(document3D);
      return <ThemeProvider theme={mockTheme}><GameInspector3D document={document} sceneId="scene" entityId="mover" onOperationError={() => undefined}
        onScript={() => undefined} onOps={(ops) => { received.push(ops); setDocument(applyGameOps3D(document, ops)); }} /></ThemeProvider>;
    }
    render(<Fixture3D />);
    const speed = screen.getByRole("textbox", { name: "Speed" });
    await user.clear(speed);
    await user.type(speed, "3{Enter}");
    expect(received.at(-1)).toEqual([{ op: "set_script_params", scene_id: "scene", entity_id: "mover", index: 0, values: { speed: 3 } }]);
  });

  it("renders reference params as selects in the editor and clears them to null", async () => {
    const user = userEvent.setup();
    const onValues = jest.fn();
    render(<ThemeProvider theme={mockTheme}><ScriptParamsEditor params={PARAMS} values={{ target: "goal", hit: "hit" }} assets={initial.assets}
      entities={[{ id: "hero", name: "Hero" }, { id: "goal", name: "Goal" }]} onValues={onValues}
      issuePath={["scenes", 0, "entities", 0, "behaviors", 0]}
      issues={[{ path: ["scenes", 0, "entities", 0, "behaviors", 0, "values", "hit"], message: "Script parameter hit references missing asset hit" }]} /></ThemeProvider>);
    expect(screen.getByText("Script parameter hit references missing asset hit")).toBeTruthy();
    await user.click(screen.getByRole("combobox", { name: "Target" }));
    expect(screen.getByRole("option", { name: "Hero" })).toBeTruthy();
    await user.click(screen.getByRole("option", { name: "None" }));
    expect(onValues).toHaveBeenLastCalledWith({ target: null });
    await user.click(screen.getByRole("combobox", { name: "Hit" }));
    expect(screen.queryByRole("option", { name: "image" })).toBeNull();
    await user.click(screen.getByRole("option", { name: "None" }));
    expect(onValues).toHaveBeenLastCalledWith({ hit: null });
  });

  it("shows 3D reference validation errors under the param", () => {
    const document3D = gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "three", revision: "draft", entrySceneId: "scene",
      tickRate: 60, presentation: { aspectRatio: 1, hudWidth: 100, hudHeight: 100 }, inputActions: [], assets: {},
      scenes: [{ id: "scene", name: "Scene", activeCameraId: "camera", entities: [
        { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } },
        { id: "mover", transform3d: {}, behaviors: [{ kind: "script", source: SOURCE, params: { target: PARAMS.target }, values: { target: "ghost" } }] }
      ] }] });
    render(<ThemeProvider theme={mockTheme}><GameInspector3D document={document3D} sceneId="scene" entityId="mover" onOperationError={() => undefined}
      onScript={() => undefined} onOps={() => undefined} /></ThemeProvider>);
    expect(screen.getByText("Script parameter target references missing entity ghost")).toBeTruthy();
  });

  it("stores null for a cleared reference and clears a value equal to its default", () => {
    expect(scriptParamEdit(PARAMS.target, "target", "")).toEqual({ target: null });
    expect(scriptParamEdit(PARAMS.speed, "speed", 1)).toEqual({ speed: null });
    expect(scriptParamEdit(PARAMS.speed, "speed", 2)).toEqual({ speed: 2 });
  });
});
