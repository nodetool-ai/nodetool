import { createRef } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { Box3, BoxGeometry, Group, Matrix4, Mesh, Object3D, OrthographicCamera, PerspectiveCamera, Quaternion, Scene, Vector3 } from "three";
import { createGameSession3D, createNative3DGame, type AnyGameDocumentOp } from "@nodetool-ai/game-runtime";
import { GameInput3D } from "@nodetool-ai/game-renderer";
import type { GameRenderer3D } from "@nodetool-ai/game-renderer/browser3d";
import { getGameDraftStore } from "../../../../stores/game/GameDraftStore";
import { createGamePanelLayoutStore } from "../../../../stores/game/GamePanelLayoutStore";
import type { GamePlaySession3D } from "../../useGamePlaySession3D";
import GameViewport3D from "../GameViewport3D";
import mockTheme from "../../../../__mocks__/themeMock";
import GameEditorShell from "../../shell/GameEditorShell";
import { getGameShortcutStore } from "../../../../stores/game/GameShortcutStore";
import { getGameViewportSettings3DStore } from "../../../../stores/game/GameViewportSettings3DStore";

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
    axis: string | null = null;
    space = "world";
    attach(object: Object3D) { this.object = object; }
    detach() { this.object = undefined; }
    setMode() {}
    setSpace(space: string) { this.space = space; }
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
jest.mock("three/addons/controls/FlyControls.js", () => ({
  FlyControls: class {
    movementSpeed = 0;
    rollSpeed = 0;
    addEventListener() {}
    removeEventListener() {}
    update() {}
    dispose() {}
  }
}));

beforeEach(() => { getGameViewportSettings3DStore(null).getState().reset(); });

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
    getEntityObject: () => entity, projectedBounds: () => [], setEditorCamera: jest.fn(), setEditorView: jest.fn(), dispose: jest.fn()
  };
  const host: GamePlaySession3D = {
    canvasRef, rendererRef: { current: renderer }, inputRef: { current: new GameInput3D() },
    frame, inspection: null, backend: "webgl2", playing: false, playDocument: null, error: null,
    beginPlay: jest.fn(), restart: jest.fn(), stop: jest.fn(), step: jest.fn(), save: jest.fn(),
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
    selectedIds={["player-visual"]} sceneId={document.entrySceneId} onOps={onOps}
    onGestureStart={onGestureStart} onGestureEnd={onGestureEnd} />;
  const view = render(<ThemeProvider theme={useShell ? mockTheme : createTheme({ cssVariables: true })}>{useShell
    ? <GameEditorShell dimension="3d"
      toolbar={{ name: "Viewport undo", playing: false, playSession: false, loading: false, saving: false,
        saveStatus: "saved", assistantOpen: false, sceneTreeOpen: false, inspectorOpen: false, playHref: "/game/undo",
        onPlay: jest.fn(), onStop: jest.fn(), onStep: jest.fn(), onSave: jest.fn(), onLoad: jest.fn(),
        onPublish: jest.fn(), onAssistant: jest.fn(), onSceneTree: jest.fn(), onInspector: jest.fn() }}
      status={{ tick: 0, score: 0, won: false, backend: "WebGL2" }}
      panels={[{ id: "viewport", keyboardScope: true, node: viewport }]}
      layoutStore={createGamePanelLayoutStore({ anonymous: true },
        { getItem: () => null, setItem: () => undefined, removeItem: () => undefined })}
      commands={{ "edit.undo": { run: () => store.getState().undo() }, "edit.redo": { run: () => store.getState().redo() } }} />
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
      set: { transform3d: expect.objectContaining({ position: expect.objectContaining({ x: 2 }) }) } })], 61, "Move");
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

it("switches transform tools and snapping through registry shortcuts, honours rebinding and yields to fly mode", async () => {
  const user = userEvent.setup();
  const shortcuts = getGameShortcutStore(null);
  shortcuts.getState().resetAll();
  const fixture = await mountViewport(true, true);
  try {
    const canvas = screen.getByLabelText("3D game viewport");
    await user.click(canvas);
    await user.keyboard("e");
    expect(screen.getByRole("button", { name: "Rotate" })).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("g");
    expect(screen.getByRole("button", { name: "Snap" })).toHaveAttribute("aria-pressed", "false");
    act(() => shortcuts.getState().setBindings("tool.scale", [{ code: "KeyT" }]));
    await user.keyboard("r");
    expect(screen.getByRole("button", { name: "Scale" })).toHaveAttribute("aria-pressed", "false");
    await user.keyboard("t");
    expect(screen.getByRole("button", { name: "Scale" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Fly camera" }));
    await user.click(canvas);
    await user.keyboard("w");
    expect(within(screen.getByRole("group", { name: "Transform mode" })).getByRole("button", { name: "Move" }))
      .toHaveAttribute("aria-pressed", "false");
  } finally { shortcuts.getState().resetAll(); fixture.view.unmount(); fixture.session.dispose(); }
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

it("releases pointer lock when a running play session fails", async () => {
  const document = createNative3DGame("viewport-failed-session");
  for (const scene of document.scenes) {
    for (const entity of scene.entities) { entity.behaviors = entity.behaviors.filter((behavior) => behavior.kind !== "script"); }
  }
  const session = await createGameSession3D(document, 1);
  const canvasRef = createRef<HTMLCanvasElement>();
  let locked: Element | null = null;
  const lockDescriptor = Object.getOwnPropertyDescriptor(window.document, "pointerLockElement");
  const exitDescriptor = Object.getOwnPropertyDescriptor(window.document, "exitPointerLock");
  const exit = jest.fn(() => { locked = null; window.document.dispatchEvent(new Event("pointerlockchange")); });
  // Only the pointer-lock API is adapted because JSDOM cannot acquire a browser pointer lock.
  Object.defineProperty(window.document, "pointerLockElement", { configurable: true, get: () => locked });
  Object.defineProperty(window.document, "exitPointerLock", { configurable: true, value: exit });
  const input = new GameInput3D();
  const inputRef = { current: input };
  const host = (playing: boolean, error: string | null): GamePlaySession3D => ({
    canvasRef, rendererRef: { current: null }, inputRef, frame: session.frame(), inspection: null,
    backend: "webgl2", playing, playDocument: document, error, beginPlay: jest.fn(), restart: jest.fn(), stop: jest.fn(), step: jest.fn(),
    save: jest.fn(), load: jest.fn().mockResolvedValue(undefined), replayBeforeError: jest.fn().mockResolvedValue(undefined)
  });
  const view = (playing: boolean, error: string | null) => <ThemeProvider theme={createTheme({ cssVariables: true })}>
    <GameViewport3D document={document} host={host(playing, error)} sceneId={document.entrySceneId}
      onOps={jest.fn()} onGestureStart={jest.fn(() => 1)} onGestureEnd={jest.fn()} />
  </ThemeProvider>;
  const rendered = render(view(true, null));
  try {
    locked = screen.getByLabelText("3D game viewport");
    rendered.rerender(view(true, null));
    expect(exit).not.toHaveBeenCalled();
    rendered.rerender(view(false, "Game script [\"player\",0] for player at tick 36 failed: Game script failed: interrupted"));
    expect(exit).toHaveBeenCalledTimes(1);
    expect(locked).toBeNull();
  } finally {
    rendered.unmount();
    session.dispose();
    if (lockDescriptor) { Object.defineProperty(window.document, "pointerLockElement", lockDescriptor); }
    else { Reflect.deleteProperty(window.document, "pointerLockElement"); }
    if (exitDescriptor) { Object.defineProperty(window.document, "exitPointerLock", exitDescriptor); }
    else { Reflect.deleteProperty(window.document, "exitPointerLock"); }
  }
});

/** A viewport over the native fixture where every rendered entity is its own object with box bounds from its primitive. */
async function mountSceneViewport(selectedIds: string[]) {
  const document = createNative3DGame("viewport-multi-select");
  for (const scene of document.scenes) {
    for (const entity of scene.entities) { entity.behaviors = entity.behaviors.filter((behavior) => behavior.kind !== "script"); }
  }
  const session = await createGameSession3D(document, 1);
  const frame = session.frame();
  const scene = new Scene();
  const objects = new Map<string, Object3D>();
  for (const entity of frame.entities) {
    const size = entity.primitive?.dimensions;
    const object = size ? new Mesh(new BoxGeometry(size.x, size.y, size.z)) : new Group();
    new Matrix4().compose(new Vector3(entity.transform.position.x, entity.transform.position.y, entity.transform.position.z),
      new Quaternion().fromArray(entity.transform.rotation), new Vector3(entity.transform.scale.x, entity.transform.scale.y, entity.transform.scale.z))
      .decompose(object.position, object.quaternion, object.scale);
    object.updateMatrixWorld(true);
    scene.add(object);
    objects.set(entity.entityId, object);
  }
  const setEditorCamera = jest.fn();
  const renderer: GameRenderer3D = {
    backend: "webgl2", canvas: window.document.createElement("canvas"),
    capabilities: { backend: "webgl2", core3D: true, minimalRenderSucceeded: true, deviceStatus: "ready",
      deviceLossCount: 0, maxTextureSize: 4096, maxSamples: 4, renderer: "test", adapterType: "software",
      initializationMs: 0, missingFeatures: [] },
    render: jest.fn().mockResolvedValue(undefined), resize: jest.fn(), invalidateAsset: jest.fn(), pick: jest.fn(),
    setCameraOverride: jest.fn(), getScene: () => scene, getCamera: () => new PerspectiveCamera(),
    getEntityObject: (id) => objects.get(id) ?? null, projectedBounds: () => [], setEditorCamera, setEditorView: jest.fn(), dispose: jest.fn()
  };
  const host: GamePlaySession3D = {
    canvasRef: createRef<HTMLCanvasElement>(), rendererRef: { current: renderer }, inputRef: { current: new GameInput3D() },
    frame, inspection: null, backend: "webgl2", playing: false, playDocument: null, error: null,
    beginPlay: jest.fn(), restart: jest.fn(), stop: jest.fn(), step: jest.fn(), save: jest.fn(),
    load: jest.fn().mockResolvedValue(undefined), replayBeforeError: jest.fn().mockResolvedValue(undefined)
  };
  const store = getGameDraftStore("viewport3d-multi-select");
  store.getState().load(document, "base");
  store.getState().selectMany(selectedIds);
  const onOps = jest.fn((ops: AnyGameDocumentOp[], gestureId?: number, action?: string) => {
    store.getState().apply(ops, { label: `${action ?? "Edit"} selection`, mergeKey: "transform-selection", gestureId });
  });
  const onSelect = jest.fn((id: string, additive: boolean) => store.getState().select(id, additive));
  const onSelectMany = jest.fn((ids: string[]) => store.getState().selectMany(ids));
  const viewport = (ids: readonly string[]) => <GameViewport3D document={document} host={host} selectedIds={ids}
    sceneId={document.entrySceneId} onOps={onOps} onSelect={onSelect} onSelectMany={onSelectMany}
    onGestureStart={() => store.getState().beginGesture()} onGestureEnd={(id) => store.getState().endGesture(id)} />;
  const view = render(<ThemeProvider theme={mockTheme}><GameEditorShell dimension="3d"
    toolbar={{ name: "Viewport multi-select", playing: false, playSession: false, loading: false, saving: false,
      saveStatus: "saved", assistantOpen: false, sceneTreeOpen: false, inspectorOpen: false, playHref: "/game/multi",
      onPlay: jest.fn(), onStop: jest.fn(), onStep: jest.fn(), onSave: jest.fn(), onLoad: jest.fn(),
      onPublish: jest.fn(), onAssistant: jest.fn(), onSceneTree: jest.fn(), onInspector: jest.fn() }}
    status={{ tick: 0, score: 0, won: false, backend: "WebGL2" }}
    panels={[{ id: "viewport", keyboardScope: true, node: viewport(selectedIds) }]}
    layoutStore={createGamePanelLayoutStore({ anonymous: true },
      { getItem: () => null, setItem: () => undefined, removeItem: () => undefined })}
    commands={{ "edit.undo": { run: () => store.getState().undo() }, "edit.redo": { run: () => store.getState().redo() } }} />
  </ThemeProvider>);
  const controls = mockGizmo;
  if (!controls) { view.unmount(); session.dispose(); throw new Error("Gizmo missing"); }
  const entity = (id: string) => {
    const current = store.getState().document;
    if (current?.schemaVersion !== 3) { throw new Error("Expected a 3D draft"); }
    const found = current.scenes[0].entities.find((candidate) => candidate.id === id);
    if (!found) { throw new Error(`Entity ${id} missing`); }
    return found;
  };
  return { view, session, controls, onOps, onSelect, onSelectMany, store, document, renderer, host, objects, setEditorCamera, entity };
}

it("moves a multi-selection with one gizmo as one undo step and carries children with their parent", async () => {
  const fixture = await mountSceneViewport(["crate", "player", "player-visual"]);
  try {
    const target = fixture.controls.object;
    if (!target) { throw new Error("Gizmo did not attach to the multi-selection"); }
    // The gizmo starts at the mean of the selected roots' origins: crate (1.5, 0.5, 0) and player (0, 1, 3).
    expect(target.position.toArray()).toEqual([0.75, 0.75, 1.5]);
    const before = structuredClone(fixture.store.getState().document);
    act(() => {
      fixture.controls.emit("dragging-changed", true);
      target.position.x += 1;
      fixture.controls.emit("objectChange");
      target.position.x += 1;
      fixture.controls.emit("objectChange");
      fixture.controls.emit("dragging-changed", false);
    });
    expect(fixture.onOps).toHaveBeenCalledTimes(1);
    const [ops, , action] = fixture.onOps.mock.calls[0];
    expect(action).toBe("Move");
    // The visual follows the player through the hierarchy, so it gets no op of its own.
    expect(ops.map((op) => op.op === "update_entity" ? op.entity_id : op.op)).toEqual(["crate", "player"]);
    expect(fixture.entity("crate").transform3d.position.x).toBeCloseTo(3.5);
    expect(fixture.entity("player").transform3d.position.x).toBeCloseTo(2);
    expect(fixture.entity("player-visual").transform3d.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(fixture.store.getState().commandHistory.past).toHaveLength(1);
    act(() => fixture.store.getState().undo());
    expect(fixture.store.getState().document).toEqual(before);
  } finally { fixture.view.unmount(); fixture.session.dispose(); }
});

it("rotates each entity around its own origin with the individual pivot", async () => {
  getGameViewportSettings3DStore(null).getState().setPivot("individual");
  const user = userEvent.setup();
  const fixture = await mountSceneViewport(["crate", "pickup"]);
  try {
    await user.click(screen.getByRole("button", { name: "Rotate" }));
    const target = fixture.controls.object;
    if (!target) { throw new Error("Gizmo missing"); }
    act(() => {
      fixture.controls.emit("dragging-changed", true);
      target.quaternion.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2));
      fixture.controls.emit("objectChange");
      fixture.controls.emit("dragging-changed", false);
    });
    expect(fixture.onOps.mock.calls[0][2]).toBe("Rotate");
    for (const [id, x, z] of [["crate", 1.5, 0], ["pickup", 0, -2]] as const) {
      const transform = fixture.entity(id).transform3d;
      expect(transform.position.x).toBeCloseTo(x);
      expect(transform.position.z).toBeCloseTo(z);
      expect(new Quaternion().fromArray(transform.rotation).angleTo(new Quaternion())).toBeCloseTo(Math.PI / 2);
    }
    expect(fixture.store.getState().commandHistory.past).toHaveLength(1);
  } finally { fixture.view.unmount(); fixture.session.dispose(); }
});

it("drops the selection onto the surface below with Align to ground as one undo step", async () => {
  const user = userEvent.setup();
  const fixture = await mountSceneViewport(["pickup", "door-switch"]);
  try {
    const floorTop = new Box3().setFromObject(fixture.objects.get("floor") ?? new Object3D()).max.y;
    const expected = ["pickup", "door-switch"].map((id) => {
      const bounds = new Box3().setFromObject(fixture.objects.get(id) ?? new Object3D());
      return fixture.entity(id).transform3d.position.y + floorTop - bounds.min.y;
    });
    await user.click(screen.getByLabelText("3D game viewport"));
    await user.keyboard("{End}");
    expect(fixture.onOps).toHaveBeenCalledTimes(1);
    expect(fixture.onOps.mock.calls[0][2]).toBe("Ground");
    expect(fixture.entity("pickup").transform3d.position.y).toBeCloseTo(expected[0]);
    expect(fixture.entity("door-switch").transform3d.position.y).toBeCloseTo(expected[1]);
    expect(fixture.store.getState().commandHistory.past).toHaveLength(1);
  } finally { fixture.view.unmount(); fixture.session.dispose(); }
});

it("adds to the selection on Shift-click, clears it on an empty click and selects all with the shortcut", async () => {
  const user = userEvent.setup();
  const fixture = await mountSceneViewport(["crate"]);
  try {
    const canvas = screen.getByLabelText("3D game viewport");
    jest.mocked(fixture.renderer.pick).mockReturnValue("pickup");
    // JSDOM has no PointerEvent, so the clicks are mouse events with pointer event types.
    const click = (init: MouseEventInit) => act(() => {
      canvas.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 5, clientY: 5, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent("pointerup", { button: 0, clientX: 5, clientY: 5, bubbles: true, ...init }));
    });
    click({ shiftKey: true });
    expect(fixture.onSelect).toHaveBeenLastCalledWith("pickup", true);
    expect(fixture.store.getState().selectedIds).toEqual(["crate", "pickup"]);
    jest.mocked(fixture.renderer.pick).mockReturnValue(null);
    click({});
    expect(fixture.onSelectMany).toHaveBeenLastCalledWith([]);
    await user.click(canvas);
    await user.keyboard("{Control>}a{/Control}");
    expect(fixture.store.getState().selectedIds).toEqual(fixture.document.scenes[0].entities.map((entity) => entity.id));
  } finally { fixture.view.unmount(); fixture.session.dispose(); }
});

it("switches gizmo space, orthographic projection and axis views from shortcuts and the orientation gizmo", async () => {
  const user = userEvent.setup();
  const fixture = await mountSceneViewport(["crate"]);
  try {
    await user.click(screen.getByLabelText("3D game viewport"));
    await user.keyboard("x");
    expect(screen.getByRole("button", { name: "Local space" })).toHaveAttribute("aria-pressed", "true");
    expect((fixture.controls as unknown as { space: string }).space).toBe("local");
    // user-event has no numpad key map, so numpad presses are dispatched by code.
    fireEvent.keyDown(screen.getByLabelText("3D game viewport"), { code: "Numpad5", key: "5" });
    expect(screen.getByRole("button", { name: "Orthographic view" })).toHaveAttribute("aria-pressed", "true");
    expect(fixture.setEditorCamera.mock.calls.at(-1)?.[0]).toBeInstanceOf(OrthographicCamera);
    const camera = fixture.setEditorCamera.mock.calls.at(-1)?.[0] as OrthographicCamera;
    await user.click(screen.getByRole("button", { name: "Top view (+Y)" }));
    // The orbit target starts at (0, 1, 0), so the top view looks straight down at it.
    expect(camera.position.x).toBeCloseTo(0);
    expect(camera.position.y).toBeGreaterThan(1);
    expect(camera.position.z).toBeCloseTo(0, 2);
    fireEvent.keyDown(screen.getByLabelText("3D game viewport"), { code: "Numpad3", key: "3" });
    expect(camera.position.y).toBeCloseTo(1);
    expect(camera.position.x).toBeGreaterThan(0);
  } finally { fixture.view.unmount(); fixture.session.dispose(); }
});

it("edits snap increments and pivot from the gizmo settings and keeps them as preferences", async () => {
  const user = userEvent.setup();
  const fixture = await mountSceneViewport(["crate", "pickup"]);
  try {
    await user.click(screen.getByRole("button", { name: "Gizmo settings" }));
    const dialog = screen.getByRole("dialog", { name: "Gizmo settings" });
    await user.click(within(dialog).getByRole("button", { name: "Active entity" }));
    const rotate = within(dialog).getByLabelText("Rotate (°)");
    await user.clear(rotate);
    await user.type(rotate, "45");
    const settings = getGameViewportSettings3DStore(null).getState();
    expect(settings.pivot).toBe("active");
    expect(settings.increments.rotate).toBe(45);
    // The active entity is the last selected one, so the gizmo moves to the pickup.
    expect(fixture.controls.object?.position.toArray()).toEqual([0, 0.8, -2]);
  } finally { fixture.view.unmount(); fixture.session.dispose(); }
});

it("ignores selection, tool and gizmo-frame keys during a drag so the drag commits one undo step", async () => {
  const user = userEvent.setup();
  const fixture = await mountSceneViewport(["crate", "pickup"]);
  try {
    // Focus without a click, because a click on empty space would clear the selection before the drag.
    act(() => screen.getByLabelText("3D game viewport").focus());
    const target = fixture.controls.object;
    if (!target) { throw new Error("Gizmo missing"); }
    act(() => {
      fixture.controls.emit("dragging-changed", true);
      target.position.x += 2;
      fixture.controls.emit("objectChange");
    });
    for (const key of ["{Escape}", "e", "x", ".", "{Control>}a{/Control}", "{End}"]) { await user.keyboard(key); }
    expect(fixture.store.getState().selectedIds).toEqual(["crate", "pickup"]);
    expect(screen.getByRole("button", { name: "Move" })).toHaveAttribute("aria-pressed", "true");
    expect(getGameViewportSettings3DStore(null).getState()).toMatchObject({ space: "world", pivot: "center" });
    act(() => { fixture.controls.emit("dragging-changed", false); });
    expect(fixture.onOps).toHaveBeenCalledTimes(1);
    const [ops, , action] = fixture.onOps.mock.calls[0];
    expect(action).toBe("Move");
    expect(ops.map((op) => op.op === "update_entity" ? op.entity_id : op.op)).toEqual(["crate", "pickup"]);
    expect(fixture.entity("crate").transform3d.position.x).toBeCloseTo(3.5);
    expect(fixture.entity("pickup").transform3d.position.x).toBeCloseTo(2);
    expect(fixture.store.getState().commandHistory.past).toHaveLength(1);
    // After the drag the same keys work again.
    await user.keyboard("{Escape}");
    expect(fixture.store.getState().selectedIds).toEqual([]);
  } finally { fixture.view.unmount(); fixture.session.dispose(); }
});

it("places the active pivot on a selected child that follows its selected parent", async () => {
  getGameViewportSettings3DStore(null).getState().setPivot("active");
  const fixture = await mountSceneViewport(["player", "player-visual"]);
  try {
    const visual = fixture.host.frame?.entities.find((entity) => entity.entityId === "player-visual");
    if (!visual) { throw new Error("Fixture visual missing"); }
    const { x, y, z } = visual.transform.position;
    expect(fixture.controls.object?.position.toArray().map((value) => Number(value.toFixed(6)))).toEqual([x, y, z]);
  } finally { fixture.view.unmount(); fixture.session.dispose(); }
});

it.each(["missing", "void", "denied", "disabled-look"] as const)("delivers authored mouse actions when pointer lock is %s", async (mode) => {
  const document = createNative3DGame("viewport-mouse-actions");
  if (!document.inputActions.includes("fire")) { document.inputActions.push("fire"); }
  document.inputActions.push("alternate");
  document.inputBindings = { actions: { fire: [{ kind: "mouseButton", button: 0 }], alternate: [{ kind: "mouseButton", button: 2 }] }, axes: {},
    look: mode === "disabled-look" ? [] : [{ kind: "mouse", sensitivity: 1, invertY: false }] };
  const canvasRef = createRef<HTMLCanvasElement>();
  const input = new GameInput3D();
  const host: GamePlaySession3D = {
    canvasRef, inputRef: { current: input }, rendererRef: { current: null }, playing: true, playDocument: document,
    frame: null, inspection: null, backend: "webgl2", error: null, beginPlay: jest.fn(), restart: jest.fn(), stop: jest.fn(), step: jest.fn(),
    save: jest.fn(), load: jest.fn().mockResolvedValue(undefined), replayBeforeError: jest.fn().mockResolvedValue(undefined)
  };
  const view = render(<ThemeProvider theme={createTheme({ cssVariables: true })}>
    <GameViewport3D document={document} host={host} sceneId={document.entrySceneId} playerOnly />
  </ThemeProvider>);
  try {
    const canvas = screen.getByLabelText("3D game viewport") as HTMLCanvasElement;
    const request = jest.fn(() => mode === "denied" ? Promise.reject(new Error("Denied")) : undefined);
    Object.defineProperty(canvas, "requestPointerLock", { configurable: true, value: mode === "missing" ? undefined : request });
    canvas.setPointerCapture = jest.fn();
    const click = () => act(() => {
      canvas.dispatchEvent(new MouseEvent("pointerdown", { buttons: 1, button: 0, bubbles: true }));
      window.dispatchEvent(new MouseEvent("pointerup", { buttons: 0, button: 0, bubbles: true }));
    });
    click();
    expect(input.sample(document).justPressed).toEqual(["fire"]);
    expect(input.sample(document).justPressed).toEqual([]);
    click();
    expect(input.sample(document).justPressed).toEqual(["fire"]);
    const move = (type: string, buttons: number) => act(() => {
      canvas.dispatchEvent(new MouseEvent(type, { buttons, button: type === "pointerdown" && buttons === 2 ? 2 : 0, bubbles: true }));
    });
    move("pointerdown", 1);
    expect(input.sample(document).pressed).toEqual(["fire"]);
    move("pointermove", 3);
    expect(input.sample(document).pressed).toEqual(["fire", "alternate"]);
    move("pointermove", 2);
    expect(input.sample(document).pressed).toEqual(["alternate"]);
    move("pointerup", 0);
    expect(input.sample(document).pressed).toEqual([]);
    move("pointerdown", 2);
    expect(input.sample(document).pressed).toEqual(["alternate"]);
    move("pointermove", 3);
    expect(input.sample(document).pressed).toEqual(["fire", "alternate"]);
    move("pointermove", 1);
    expect(input.sample(document).pressed).toEqual(["fire"]);
    move("pointerup", 0);
    expect(input.sample(document).pressed).toEqual([]);
    await act(async () => {});
    if (mode === "disabled-look") { expect(request).not.toHaveBeenCalled(); }
  } finally { view.unmount(); }
});
