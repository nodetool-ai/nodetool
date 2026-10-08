import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { Object3D, PerspectiveCamera, Scene, Vector3 } from "three";
import { createGameSession3D, createNative3DGame, type AnyGameDocumentOp } from "@nodetool-ai/game-runtime";
import { GameInput3D } from "@nodetool-ai/game-renderer";
import type { GameRenderer3D } from "@nodetool-ai/game-renderer/browser3d";
import { getGameDraftStore } from "../../../../stores/game/GameDraftStore";
import type { GamePlaySession3D } from "../../useGamePlaySession3D";
import GameViewport3D from "../GameViewport3D";
import GameEditorShell from "../../shell/GameEditorShell";
import { handleGameUndo } from "../../gameEditorShortcuts";

interface GestureControl {
  object: Object3D | undefined;
  dragging: boolean;
  emit(type: string, value?: unknown): void;
}
let mockGizmo: GestureControl | undefined;
function mockCaptureGizmo(control: GestureControl): void { mockGizmo = control; }

jest.mock("three/addons/controls/TransformControls.js", () => ({
  TransformControls: class {
    object: Object3D | undefined;
    dragging = false;
    private listeners = new Map<string, (event: { value: unknown }) => void>();
    constructor() { mockCaptureGizmo(this); }
    addEventListener(type: string, listener: (event: { value: unknown }) => void) { this.listeners.set(type, listener); }
    removeEventListener(type: string) { this.listeners.delete(type); }
    emit(type: string, value?: unknown) {
      if (type === "dragging-changed") { this.dragging = value === true; }
      this.listeners.get(type)?.({ value });
    }
    getHelper() { return new (jest.requireActual<typeof import("three")>("three").Object3D)(); }
    attach(object: Object3D) { this.object = object; }
    detach() { this.object = undefined; }
    setMode() {}
    setTranslationSnap() {}
    setRotationSnap() {}
    setScaleSnap() {}
    dispose() {}
  }
}));
jest.mock("three/addons/controls/OrbitControls.js", () => ({
  OrbitControls: class {
    target = new (jest.requireActual<typeof import("three")>("three").Vector3)();
    enabled = true;
    update() {}
    addEventListener() {}
    removeEventListener() {}
    dispose() {}
  }
}));
jest.mock("three/addons/controls/FlyControls.js", () => ({ FlyControls: jest.fn() }));

async function mountViewport(useCommandStore = false, useShell = false) {
  const document = createNative3DGame("viewport-gesture");
  for (const scene of document.scenes) {
    for (const entity of scene.entities) { entity.behaviors = entity.behaviors.filter((behavior) => behavior.kind !== "script"); }
  }
  for (const prefab of Object.values(document.prefabs)) {
    for (const entity of prefab.entities) { entity.behaviors = entity.behaviors.filter((behavior) => behavior.kind !== "script"); }
  }
  const session = await createGameSession3D(document, 1);
  const canvasRef = createRef<HTMLCanvasElement>();
  const scene = new Scene();
  const entity = new Object3D();
  const frame = session.frame();
  const visual = frame.entities.find((entry) => entry.entityId === "player-visual");
  if (!visual) { session.dispose(); throw new Error("Fixture visual missing"); }
  entity.position.set(visual.transform.position.x, visual.transform.position.y, visual.transform.position.z);
  entity.quaternion.fromArray(visual.transform.rotation);
  entity.updateMatrixWorld(true);
  const renderer: GameRenderer3D = {
    backend: "webgl2", canvas: window.document.createElement("canvas"),
    capabilities: { backend: "webgl2", core3D: true, minimalRenderSucceeded: true, deviceStatus: "ready",
      deviceLossCount: 0, maxTextureSize: 4096, maxSamples: 4, renderer: "test", adapterType: "software",
      initializationMs: 0, missingFeatures: [] },
    render: jest.fn().mockResolvedValue(undefined), resize: jest.fn(), invalidateAsset: jest.fn(), pick: jest.fn(),
    setCameraOverride: jest.fn(), getScene: () => scene, getCamera: () => new PerspectiveCamera(),
    getEntityObject: () => entity, projectedBounds: () => [], setEditorCamera: jest.fn(), dispose: jest.fn()
  };
  const host: GamePlaySession3D = {
    canvasRef, rendererRef: { current: renderer }, inputRef: { current: new GameInput3D() },
    frame, inspection: null, backend: "webgl2", playing: false, playDocument: null, error: null,
    beginPlay: jest.fn(), stop: jest.fn(), step: jest.fn(), save: jest.fn(),
    load: jest.fn().mockResolvedValue(undefined), replayBeforeError: jest.fn().mockResolvedValue(undefined)
  };
  const store = getGameDraftStore("viewport3d-command-gesture");
  store.getState().load(document, "base");
  store.getState().select("player-visual");
  const onOps = jest.fn((ops: AnyGameDocumentOp[], gestureId?: number) => {
    if (useCommandStore) { store.getState().apply(ops, { label: "Move Player Visual", mergeKey: "transform-selection", gestureId }); }
  });
  const onGestureStart = jest.fn(() => useCommandStore ? store.getState().beginGesture() : 61);
  const onGestureEnd = jest.fn((id: number) => { if (useCommandStore) { store.getState().endGesture(id); } });
  const viewport = <GameViewport3D document={document} host={host}
    selectedId="player-visual" sceneId={document.entrySceneId} onOps={onOps}
    onGestureStart={onGestureStart} onGestureEnd={onGestureEnd} />;
  const view = render(<ThemeProvider theme={createTheme({ cssVariables: true })}>{useShell
    ? <GameEditorShell dimension="3d"
      toolbar={{ name: "Viewport undo", playing: false, playSession: false, loading: false, saving: false,
        saveStatus: "saved", assistantOpen: false, sceneTreeOpen: false, inspectorOpen: false, playHref: "/game/undo",
        onPlay: jest.fn(), onStop: jest.fn(), onStep: jest.fn(), onSave: jest.fn(), onLoad: jest.fn(),
        onPublish: jest.fn(), onAssistant: jest.fn(), onSceneTree: jest.fn(), onInspector: jest.fn() }}
      status={{ tick: 0, score: 0, won: false, backend: "WebGL2" }}
      panels={[{ id: "viewport", keyboardScope: true, node: viewport }]}
      onKeyDown={(event) => handleGameUndo(event, false,
        () => store.getState().undo(), () => store.getState().redo())} />
    : viewport}</ThemeProvider>);
  const controls = mockGizmo;
  if (!controls?.object) { view.unmount(); session.dispose(); throw new Error("Gizmo did not attach to the real selected target"); }
  return { view, session, controls, onOps, onGestureStart, onGestureEnd, store, document };
}

it("commits the real gizmo's parent-local transform before closing its gesture", async () => {
  const fixture = await mountViewport();
  try {
    const { controls, onOps, onGestureStart, onGestureEnd } = fixture;
    act(() => {
      controls.emit("dragging-changed", true);
      if (!controls.object) { throw new Error("Gizmo target missing"); }
      controls.object.position.add(new Vector3(2, 0, 0));
      controls.emit("objectChange");
      controls.emit("dragging-changed", false);
    });
    expect(onGestureStart).toHaveBeenCalledTimes(1);
    expect(onOps).toHaveBeenCalledWith([expect.objectContaining({ op: "update_entity", entity_id: "player-visual",
      set: { transform3d: expect.objectContaining({ position: expect.objectContaining({ x: 2 }) }) } })], 61);
    expect(onGestureEnd).toHaveBeenCalledWith(61);
    expect(onGestureEnd.mock.invocationCallOrder[0]).toBeGreaterThan(onOps.mock.invocationCallOrder[0]);
  } finally { fixture.view.unmount(); fixture.session.dispose(); }
});

it.each(["Control", "Meta"])("undoes and redoes a viewport edit with %s while the canvas has focus", async (modifier) => {
  const user = userEvent.setup();
  const fixture = await mountViewport(true, true);
  try {
    act(() => {
      fixture.store.getState().apply([{ op: "update_entity", scene_id: fixture.document.entrySceneId,
        entity_id: "player-visual", set: { transform3d: { position: { x: 2, y: 3, z: 4 } } } }],
      { label: "Move Player Visual" });
    });
    const moved = structuredClone(fixture.store.getState().document);
    expect(moved).not.toEqual(fixture.document);
    await user.click(screen.getByLabelText("3D game viewport"));
    expect(screen.getByLabelText("3D game viewport")).toHaveFocus();
    await user.keyboard(`{${modifier}>}z{/${modifier}}`);
    expect(fixture.store.getState().document).toEqual(fixture.document);
    expect(fixture.store.getState().commandHistory.past).toHaveLength(0);
    await user.keyboard(`{${modifier}>}{Shift>}z{/Shift}{/${modifier}}`);
    expect(fixture.store.getState().document).toEqual(moved);
    expect(fixture.store.getState().commandHistory.past).toHaveLength(1);
  } finally { fixture.view.unmount(); fixture.session.dispose(); }
});

it.each(["pointercancel", "lostpointercapture", "blur", "unmount"])("discards pending gizmo edits and closes the gesture on %s", async (boundary) => {
  const fixture = await mountViewport();
  try {
    const target = fixture.controls.object;
    if (!target) { throw new Error("Gizmo target missing"); }
    const initialPosition = target.position.clone();
    const initialQuaternion = target.quaternion.clone();
    const initialScale = target.scale.clone();
    act(() => {
      fixture.controls.emit("dragging-changed", true);
      if (!fixture.controls.object) { throw new Error("Gizmo target missing"); }
      fixture.controls.object.position.x += 2;
      fixture.controls.emit("objectChange");
    });
    if (boundary === "unmount") { fixture.view.unmount(); }
    else if (boundary === "blur") { fireEvent.blur(window); }
    else { fireEvent(screen.getByLabelText("3D game viewport"), new Event(boundary, { bubbles: true })); }
    const draggingAfterCancel = fixture.controls.dragging;
    expect(fixture.onOps).not.toHaveBeenCalled();
    expect(fixture.onGestureEnd).toHaveBeenCalledTimes(1);
    expect(fixture.onGestureEnd).toHaveBeenCalledWith(61);
    if (boundary !== "unmount") {
      act(() => {
        fixture.controls.emit("objectChange");
        fixture.controls.emit("dragging-changed", false);
      });
      expect(fixture.onOps).not.toHaveBeenCalled();
      expect(fixture.onGestureEnd).toHaveBeenCalledTimes(1);
      expect(draggingAfterCancel).toBe(false);
      expect(target.position).toEqual(initialPosition);
      expect(target.quaternion.toArray()).toEqual(initialQuaternion.toArray());
      expect(target.scale).toEqual(initialScale);
      act(() => {
        fixture.controls.emit("dragging-changed", true);
        target.position.x += 1;
        fixture.controls.emit("objectChange");
        fixture.controls.emit("dragging-changed", false);
      });
      expect(fixture.onGestureStart).toHaveBeenCalledTimes(2);
      expect(fixture.onOps).toHaveBeenCalledTimes(1);
      expect(fixture.onOps.mock.calls[0][1]).toBe(61);
      expect(fixture.onGestureEnd).toHaveBeenCalledTimes(2);
      fixture.view.unmount();
      expect(fixture.onGestureEnd).toHaveBeenCalledTimes(2);
    }
  } finally { fixture.view.unmount(); fixture.session.dispose(); }
});


it("records a real gizmo drag as one command with full undo and redo", async () => {
  const fixture = await mountViewport(true);
  try {
    const target = fixture.controls.object;
    if (!target) { throw new Error("Gizmo target missing"); }
    act(() => {
      fixture.controls.emit("dragging-changed", true);
      target.position.x += 1;
      fixture.controls.emit("objectChange");
      target.position.x += 1;
      fixture.controls.emit("objectChange");
      fixture.controls.emit("dragging-changed", false);
    });
    expect(fixture.store.getState().error).toBeNull();
    expect(fixture.store.getState().commandHistory.past).toHaveLength(1);
    expect(fixture.store.getState().commandHistory.past[0].label).toBe("Move Player Visual");
    const moved = structuredClone(fixture.store.getState().document);
    expect(moved).not.toEqual(fixture.document);
    fixture.store.getState().undo();
    expect(fixture.store.getState().document).toEqual(fixture.document);
    fixture.store.getState().redo();
    expect(fixture.store.getState().document).toEqual(moved);
  } finally { fixture.view.unmount(); fixture.session.dispose(); }
});
