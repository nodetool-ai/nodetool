import { createRef } from "react";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { z } from "zod";
import { gameAuthoring } from "@nodetool-ai/protocol";
import { anyGameDocumentOp, applyAnyGameOps, validateAnyGame } from "@nodetool-ai/game-runtime";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { gameDocument, type GameRenderFrame } from "@nodetool-ai/protocol/game.js";

import { getGameDraftStore } from "../../../stores/game/GameDraftStore";
import { isMac } from "../../../utils/platform";
import GameViewport from "../viewport2d/GameViewport";

jest.mock("../../../utils/platform", () => ({ isMac: jest.fn(() => true) }));

const theme = createTheme({
  cssVariables: true,
  colorSchemes: {
    light: { palette: { warning: { main: "#d98a20" }, info: { main: "#267d9d" } } },
    dark: { palette: { warning: { main: "#ffb86c" }, info: { main: "#22d3ee" } } }
  }
});

const document = gameDocument.parse({
  schemaVersion: 2, engineVersion: "1", id: "game", revision: "1", entrySceneId: "room",
  pixelsPerUnit: 32, tickRate: 60, inputActions: [], assets: {},
  scenes: [{ id: "room", name: "Room", entities: [{ id: "ship", name: "Ship", transform2d: { x: 0, y: 0 } }] }]
});

const frame: GameRenderFrame = {
  tick: 0, width: 16, height: 9, pixelsPerUnit: 32,
  camera: { x: 0, y: 0, zoom: 1 }, tiles: [], hud: [],
  sprites: [{ entityId: "ship", assetId: "ship", x: 0, y: 0, previousX: 0, previousY: 0,
    rotation: 0, scaleX: 1, scaleY: 1, width: 1, height: 1, layer: 0 }]
};

it("draws selected outlines and handles with concrete theme colors", () => {
  const strokes: string[] = [];
  const fills: string[] = [];
  const context = {
    strokeStyle: "#000000", fillStyle: "#000000", lineWidth: 1,
    clearRect: jest.fn(), save: jest.fn(), restore: jest.fn(), translate: jest.fn(), rotate: jest.fn(),
    beginPath: jest.fn(), arc: jest.fn(),
    strokeRect: jest.fn(function (this: { strokeStyle: string }) { strokes.push(this.strokeStyle); }),
    fillRect: jest.fn(function (this: { fillStyle: string }) { fills.push(this.fillStyle); }),
    fill: jest.fn(function (this: { fillStyle: string }) { fills.push(this.fillStyle); })
  };
  const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true, value: jest.fn(() => context)
  });
  try {
    render(<ThemeProvider theme={theme}><GameViewport
      canvasRef={createRef<HTMLCanvasElement>()} frame={frame} document={document}
      playing={false} paused={false} active selectedIds={["ship"]} highlightedIds={[]}
      onSelect={jest.fn()} onSelectMany={jest.fn()} onMove={jest.fn()} onTransform={jest.fn()}
      onLight={jest.fn()} onCamera={jest.fn()} onViewportAspect={jest.fn()}
      onKeyDown={jest.fn()} onKeyUp={jest.fn()} onBlur={jest.fn()}
    /></ThemeProvider>);
    expect(strokes).toContain("#d98a20");
    expect(fills).toContain("#d98a20");
  } finally {
    if (originalGetContext) Object.defineProperty(HTMLCanvasElement.prototype, "getContext", originalGetContext);
  }
});

it("pans by drag and Mac scroll while keeping wheel zoom elsewhere", () => {
  jest.mocked(isMac).mockReturnValue(true);
  const context = { clearRect: jest.fn(), fillRect: jest.fn(), strokeRect: jest.fn() };
  const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true, value: jest.fn(() => context)
  });
  const onCamera = jest.fn();
  const onSelect = jest.fn();
  try {
    const view = render(<ThemeProvider theme={theme}><GameViewport
      canvasRef={createRef<HTMLCanvasElement>()} frame={{ ...frame, sprites: [] }} document={document}
      playing={false} paused={false} active selectedIds={[]} highlightedIds={[]}
      onSelect={onSelect} onSelectMany={jest.fn()} onMove={jest.fn()} onTransform={jest.fn()}
      onLight={jest.fn()} onCamera={onCamera} onViewportAspect={jest.fn()}
      onKeyDown={jest.fn()} onKeyUp={jest.fn()} onBlur={jest.fn()}
    /></ThemeProvider>);
    const overlay = screen.getByRole("group", { name: "Game edit overlay" });
    overlay.setPointerCapture = jest.fn();
    jest.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 512, bottom: 288, width: 512, height: 288, toJSON: () => undefined
    });
    fireEvent.click(screen.getByRole("button", { name: "Pan" }));
    expect(getComputedStyle(overlay).cursor).toBe("grab");
    const down = createEvent.pointerDown(overlay);
    Object.defineProperties(down, { button: { value: 0 }, pointerId: { value: 1 }, clientX: { value: 256 }, clientY: { value: 144 } });
    fireEvent(overlay, down);
    expect(getComputedStyle(overlay).cursor).toBe("grabbing");
    const move = createEvent.pointerMove(overlay);
    Object.defineProperties(move, { pointerId: { value: 1 }, clientX: { value: 288 }, clientY: { value: 176 } });
    fireEvent(overlay, move);
    fireEvent.pointerUp(overlay);
    expect(onCamera).toHaveBeenCalledWith({ x: -1, y: 1, zoom: 1 });
    expect(onSelect).not.toHaveBeenCalled();
    expect(getComputedStyle(overlay).cursor).toBe("grab");
    fireEvent.click(screen.getByRole("button", { name: "Pan" }));
    const select = createEvent.pointerDown(overlay);
    Object.defineProperties(select, { button: { value: 0 }, pointerId: { value: 2 }, clientX: { value: 256 }, clientY: { value: 144 }, shiftKey: { value: false } });
    fireEvent(overlay, select);
    expect(onSelect).toHaveBeenCalledWith("ship", false);

    onSelect.mockClear();
    onCamera.mockClear();
    const rightDown = createEvent.pointerDown(overlay);
    Object.defineProperties(rightDown, { button: { value: 2 }, pointerId: { value: 3 }, clientX: { value: 256 }, clientY: { value: 144 } });
    fireEvent(overlay, rightDown);
    const rightMove = createEvent.pointerMove(overlay);
    Object.defineProperties(rightMove, { pointerId: { value: 3 }, clientX: { value: 288 }, clientY: { value: 176 } });
    fireEvent(overlay, rightMove);
    fireEvent.pointerUp(overlay);
    expect(onCamera).toHaveBeenCalledWith({ x: -1, y: 1, zoom: 1 });
    expect(onSelect).not.toHaveBeenCalled();
    const contextMenu = createEvent.contextMenu(overlay);
    fireEvent(overlay, contextMenu);
    expect(contextMenu.defaultPrevented).toBe(true);

    onCamera.mockClear();
    fireEvent.wheel(overlay, { deltaX: 32, deltaY: 64 });
    expect(onCamera).toHaveBeenCalledWith({ x: 1, y: -2, zoom: 1 });
    onCamera.mockClear();
    fireEvent.wheel(overlay, { deltaY: -100, ctrlKey: true, clientX: 256, clientY: 144 });
    expect(onCamera).toHaveBeenCalledWith({ x: 0, y: 0, zoom: Math.exp(0.1) });

    jest.mocked(isMac).mockReturnValue(false);
    view.rerender(<ThemeProvider theme={theme}><GameViewport
      canvasRef={createRef<HTMLCanvasElement>()} frame={{ ...frame, sprites: [] }} document={document}
      playing={false} paused={false} active selectedIds={[]} highlightedIds={[]}
      onSelect={onSelect} onSelectMany={jest.fn()} onMove={jest.fn()} onTransform={jest.fn()}
      onLight={jest.fn()} onCamera={onCamera} onViewportAspect={jest.fn()}
      onKeyDown={jest.fn()} onKeyUp={jest.fn()} onBlur={jest.fn()}
    /></ThemeProvider>);
    onCamera.mockClear();
    fireEvent.wheel(overlay, { deltaX: 32, deltaY: 64, clientX: 256, clientY: 144 });
    expect(onCamera).toHaveBeenCalledWith({ x: 0, y: 0, zoom: Math.exp(-0.064) });
  } finally {
    if (originalGetContext) Object.defineProperty(HTMLCanvasElement.prototype, "getContext", originalGetContext);
  }
});

it("hits entities in the supplied scene", () => {
  const sceneDocument = gameDocument.parse({ ...document, scenes: [
    ...document.scenes,
    { id: "arena", name: "Arena", entities: [{ id: "tower", name: "Tower", transform2d: { x: 2, y: 0 } }] }
  ] });
  const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true, value: jest.fn(() => ({ clearRect: jest.fn(), fillRect: jest.fn() }))
  });
  const onSelect = jest.fn();
  try {
    render(<ThemeProvider theme={theme}><GameViewport
      canvasRef={createRef<HTMLCanvasElement>()} frame={{ ...frame, sprites: [] }} document={sceneDocument} sceneId="arena"
      playing={false} paused={false} active selectedIds={[]} highlightedIds={[]}
      onSelect={onSelect} onSelectMany={jest.fn()} onMove={jest.fn()} onTransform={jest.fn()}
      onLight={jest.fn()} onCamera={jest.fn()} onViewportAspect={jest.fn()}
      onKeyDown={jest.fn()} onKeyUp={jest.fn()} onBlur={jest.fn()}
    /></ThemeProvider>);
    const overlay = screen.getByRole("group", { name: "Game edit overlay" });
    overlay.setPointerCapture = jest.fn();
    jest.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 512, bottom: 288, width: 512, height: 288, toJSON: () => undefined
    });
    const down = createEvent.pointerDown(overlay);
    Object.defineProperties(down, { button: { value: 0 }, pointerId: { value: 1 }, clientX: { value: 320 }, clientY: { value: 144 }, shiftKey: { value: false } });
    fireEvent(overlay, down);
    expect(onSelect).toHaveBeenCalledWith("tower", false);
  } finally {
    if (originalGetContext) Object.defineProperty(HTMLCanvasElement.prototype, "getContext", originalGetContext);
  }
});

it("drags a selected parent and child once using parent-local coordinates", () => {
  const childDocument = gameDocument.parse({ ...document, scenes: [{ id: "room", name: "Room", entities: [
    { id: "parent", transform2d: { x: 5, y: 0 } },
    { id: "child", parentId: "parent", transform2d: { x: 2, y: 0 } },
    { id: "other", transform2d: { x: -2, y: 0 } }
  ] }] });
  const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true,
    value: jest.fn(() => ({ clearRect: jest.fn(), fillRect: jest.fn() })) });
  const onMove = jest.fn();
  const onGestureStart = jest.fn(() => 47);
  const onGestureEnd = jest.fn();
  try {
    render(<ThemeProvider theme={theme}><GameViewport canvasRef={createRef<HTMLCanvasElement>()}
      frame={{ ...frame, sprites: [] }} document={childDocument} playing={false} paused={false} active
      selectedIds={["parent", "child", "other"]} highlightedIds={[]}
      onSelect={jest.fn()} onSelectMany={jest.fn()} onMove={onMove}
      onGestureStart={onGestureStart} onGestureEnd={onGestureEnd} onTransform={jest.fn()}
      onLight={jest.fn()} onCamera={jest.fn()} onViewportAspect={jest.fn()}
      onKeyDown={jest.fn()} onKeyUp={jest.fn()} onBlur={jest.fn()} /></ThemeProvider>);
    const overlay = screen.getByRole("group", { name: "Game edit overlay" });
    overlay.setPointerCapture = jest.fn();
    jest.spyOn(overlay, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0,
      right: 512, bottom: 288, width: 512, height: 288, toJSON: () => undefined });
    const down = createEvent.pointerDown(overlay);
    Object.defineProperties(down, { button: { value: 0 }, pointerId: { value: 1 }, clientX: { value: 480 }, clientY: { value: 144 } });
    fireEvent(overlay, down);
    const move = createEvent.pointerMove(overlay);
    Object.defineProperties(move, { pointerId: { value: 1 }, clientX: { value: 512 }, clientY: { value: 144 } });
    fireEvent(overlay, move);
    fireEvent.pointerUp(overlay);
    expect(onMove.mock.calls).toEqual([["parent", 6, 0, 47], ["other", -1, 0, 47]]);
    expect(onGestureStart).toHaveBeenCalledTimes(1);
    expect(onGestureEnd).toHaveBeenCalledWith(47);
    expect(onGestureEnd.mock.invocationCallOrder[0]).toBeGreaterThan(onMove.mock.invocationCallOrder[1]);
  } finally {
    if (originalGetContext) Object.defineProperty(HTMLCanvasElement.prototype, "getContext", originalGetContext);
  }
});


it.each(["pointercancel", "lostpointercapture", "blur", "unmount"])("closes an unfinished edit gesture on %s without committing its preview", (boundary) => {
  const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true,
    value: jest.fn(() => ({ clearRect: jest.fn(), fillRect: jest.fn() })) });
  const order: string[] = [];
  const onMove = jest.fn();
  const onGestureStart = jest.fn(() => { order.push("begin"); return 51; });
  const onGestureEnd = jest.fn();
  try {
    const view = render(<ThemeProvider theme={theme}><GameViewport canvasRef={createRef<HTMLCanvasElement>()}
      frame={frame} document={document} playing={false} paused={false} active selectedIds={[]} highlightedIds={[]}
      onSelect={() => order.push("select")} onSelectMany={jest.fn()} onMove={onMove} onTransform={jest.fn()}
      onGestureStart={onGestureStart} onGestureEnd={onGestureEnd}
      onLight={jest.fn()} onCamera={jest.fn()} onViewportAspect={jest.fn()}
      onKeyDown={jest.fn()} onKeyUp={jest.fn()} onBlur={jest.fn()} /></ThemeProvider>);
    const overlay = screen.getByRole("group", { name: "Game edit overlay" });
    overlay.setPointerCapture = jest.fn();
    jest.spyOn(overlay, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0,
      right: 512, bottom: 288, width: 512, height: 288, toJSON: () => undefined });
    const down = createEvent.pointerDown(overlay);
    Object.defineProperties(down, { button: { value: 0 }, pointerId: { value: 1 }, clientX: { value: 256 }, clientY: { value: 144 } });
    fireEvent(overlay, down);
    expect(order).toEqual(["select", "begin"]);
    const move = createEvent.pointerMove(overlay);
    Object.defineProperties(move, { pointerId: { value: 1 }, clientX: { value: 288 }, clientY: { value: 144 } });
    fireEvent(overlay, move);
    if (boundary === "unmount") { view.unmount(); }
    else if (boundary === "blur") { fireEvent.blur(window); }
    else { fireEvent(overlay, new Event(boundary, { bubbles: true })); }
    expect(onMove).not.toHaveBeenCalled();
    expect(onGestureEnd).toHaveBeenCalledTimes(1);
    expect(onGestureEnd).toHaveBeenCalledWith(51);
    if (boundary !== "unmount") {
      fireEvent.pointerUp(overlay);
      view.unmount();
      expect(onGestureEnd).toHaveBeenCalledTimes(1);
    }
  } finally {
    if (originalGetContext) { Object.defineProperty(HTMLCanvasElement.prototype, "getContext", originalGetContext); }
  }
});

it("records an actual multi-root pointer drag as one command with one undo and redo", () => {
  const childDocument = gameDocument.parse({ ...document, scenes: [{ id: "room", name: "Room", entities: [
    { id: "parent", transform2d: { x: 5, y: 0 } },
    { id: "child", parentId: "parent", transform2d: { x: 2, y: 0 } },
    { id: "other", transform2d: { x: -2, y: 0 } }
  ] }] });
  const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true,
    value: jest.fn(() => ({ clearRect: jest.fn(), fillRect: jest.fn() })) });
  const store = getGameDraftStore("viewport-store-gesture");
  store.getState().load(childDocument, "base");
  store.getState().selectMany(["parent", "child", "other"]);
  const onMove = jest.fn((id: string, x: number, y: number, gestureId?: number) => {
    store.getState().apply([{ op: "update_entity", scene_id: "room", entity_id: id, set: { transform2d: { x, y } } }],
      { label: "Move Selection", mergeKey: "move-selection", gestureId });
  });
  const onGestureStart = jest.fn(() => store.getState().beginGesture());
  const onGestureEnd = jest.fn((id: number) => store.getState().endGesture(id));
  try {
    render(<ThemeProvider theme={theme}><GameViewport canvasRef={createRef<HTMLCanvasElement>()}
      frame={{ ...frame, sprites: [] }} document={childDocument} playing={false} paused={false} active
      selectedIds={["parent", "child", "other"]} highlightedIds={[]}
      onSelect={jest.fn()} onSelectMany={jest.fn()} onMove={onMove}
      onGestureStart={onGestureStart} onGestureEnd={onGestureEnd} onTransform={jest.fn()}
      onLight={jest.fn()} onCamera={jest.fn()} onViewportAspect={jest.fn()}
      onKeyDown={jest.fn()} onKeyUp={jest.fn()} onBlur={jest.fn()} /></ThemeProvider>);
    const overlay = screen.getByRole("group", { name: "Game edit overlay" });
    overlay.setPointerCapture = jest.fn();
    jest.spyOn(overlay, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0,
      right: 512, bottom: 288, width: 512, height: 288, toJSON: () => undefined });
    const down = createEvent.pointerDown(overlay);
    Object.defineProperties(down, { button: { value: 0 }, pointerId: { value: 1 }, clientX: { value: 480 }, clientY: { value: 144 } });
    fireEvent(overlay, down);
    const move = createEvent.pointerMove(overlay);
    Object.defineProperties(move, { pointerId: { value: 1 }, clientX: { value: 512 }, clientY: { value: 144 } });
    fireEvent(overlay, move);
    fireEvent.pointerUp(overlay);
    const gestureId = onGestureStart.mock.results[0].value;
    expect(onMove.mock.calls).toEqual([["parent", 6, 0, gestureId], ["other", -1, 0, gestureId]]);
    expect(onGestureStart).toHaveBeenCalledTimes(1);
    expect(onGestureEnd).toHaveBeenCalledWith(gestureId);
    expect(onGestureEnd.mock.invocationCallOrder[0]).toBeGreaterThan(onMove.mock.invocationCallOrder[1]);
    expect(store.getState().error).toBeNull();
    expect(store.getState().commandHistory.past).toHaveLength(1);
    expect(store.getState().commandHistory.past[0].label).toBe("Move Selection");
    const moved = structuredClone(store.getState().document);
    store.getState().undo();
    expect(store.getState().document).toEqual(childDocument);
    store.getState().redo();
    expect(store.getState().document).toEqual(moved);
  } finally {
    if (originalGetContext) { Object.defineProperty(HTMLCanvasElement.prototype, "getContext", originalGetContext); }
  }
});


it("batch release: drags a selected parent and child once using parent-local coordinates", () => {
  const childDocument = gameDocument.parse({ ...document, scenes: [{ id: "room", name: "Room", entities: [
    { id: "parent", transform2d: { x: 5, y: 0 } },
    { id: "child", parentId: "parent", transform2d: { x: 2, y: 0 } },
    { id: "other", transform2d: { x: -2, y: 0 } }
  ] }] });
  const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true,
    value: jest.fn(() => ({ clearRect: jest.fn(), fillRect: jest.fn() })) });
  const onMove = jest.fn();
  const onMoves = jest.fn();
  const onGestureStart = jest.fn(() => 47);
  const onGestureEnd = jest.fn();
  try {
    render(<ThemeProvider theme={theme}><GameViewport canvasRef={createRef<HTMLCanvasElement>()}
      frame={{ ...frame, sprites: [] }} document={childDocument} playing={false} paused={false} active
      selectedIds={["parent", "child", "other"]} highlightedIds={[]}
      onSelect={jest.fn()} onSelectMany={jest.fn()} onMove={onMove} onMoves={onMoves}
      onGestureStart={onGestureStart} onGestureEnd={onGestureEnd} onTransform={jest.fn()}
      onLight={jest.fn()} onCamera={jest.fn()} onViewportAspect={jest.fn()}
      onKeyDown={jest.fn()} onKeyUp={jest.fn()} onBlur={jest.fn()} /></ThemeProvider>);
    const overlay = screen.getByRole("group", { name: "Game edit overlay" });
    overlay.setPointerCapture = jest.fn();
    jest.spyOn(overlay, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0,
      right: 512, bottom: 288, width: 512, height: 288, toJSON: () => undefined });
    const down = createEvent.pointerDown(overlay);
    Object.defineProperties(down, { button: { value: 0 }, pointerId: { value: 1 }, clientX: { value: 480 }, clientY: { value: 144 } });
    fireEvent(overlay, down);
    const move = createEvent.pointerMove(overlay);
    Object.defineProperties(move, { pointerId: { value: 1 }, clientX: { value: 512 }, clientY: { value: 144 } });
    fireEvent(overlay, move);
    expect(onMoves).not.toHaveBeenCalled();
    fireEvent.pointerUp(overlay);
    expect(onMove).not.toHaveBeenCalled();
    expect(onMoves).toHaveBeenCalledTimes(1);
    expect(onMoves).toHaveBeenCalledWith([{ id: "parent", x: 6, y: 0 }, { id: "other", x: -1, y: 0 }], 47);
    expect(onGestureStart).toHaveBeenCalledTimes(1);
    expect(onGestureEnd).toHaveBeenCalledWith(47);
    expect(onGestureEnd.mock.invocationCallOrder[0]).toBeGreaterThan(onMoves.mock.invocationCallOrder[0]);
  } finally {
    if (originalGetContext) { Object.defineProperty(HTMLCanvasElement.prototype, "getContext", originalGetContext); }
  }
});



it("child-local batch release: drags a selected parent and child once using parent-local coordinates", () => {
  const childDocument = gameDocument.parse({ ...document, scenes: [{ id: "room", name: "Room", entities: [
    { id: "parent", transform2d: { x: 5, y: 0, rotation: Math.PI / 2, scaleX: 2, scaleY: 2 } },
    { id: "child", parentId: "parent", transform2d: { x: 2, y: 0 } },
    { id: "other", transform2d: { x: -2, y: 0 } }
  ] }] });
  const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true,
    value: jest.fn(() => ({ clearRect: jest.fn(), fillRect: jest.fn() })) });
  const onMove = jest.fn();
  const onMoves = jest.fn();
  const onGestureStart = jest.fn(() => 47);
  const onGestureEnd = jest.fn();
  try {
    render(<ThemeProvider theme={theme}><GameViewport canvasRef={createRef<HTMLCanvasElement>()}
      frame={{ ...frame, sprites: [] }} document={childDocument} playing={false} paused={false} active
      selectedIds={["child"]} highlightedIds={[]}
      onSelect={jest.fn()} onSelectMany={jest.fn()} onMove={onMove} onMoves={onMoves}
      onGestureStart={onGestureStart} onGestureEnd={onGestureEnd} onTransform={jest.fn()}
      onLight={jest.fn()} onCamera={jest.fn()} onViewportAspect={jest.fn()}
      onKeyDown={jest.fn()} onKeyUp={jest.fn()} onBlur={jest.fn()} /></ThemeProvider>);
    const overlay = screen.getByRole("group", { name: "Game edit overlay" });
    overlay.setPointerCapture = jest.fn();
    jest.spyOn(overlay, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0,
      right: 512, bottom: 288, width: 512, height: 288, toJSON: () => undefined });
    const down = createEvent.pointerDown(overlay);
    Object.defineProperties(down, { button: { value: 0 }, pointerId: { value: 1 }, clientX: { value: 416 }, clientY: { value: 16 } });
    fireEvent(overlay, down);
    const move = createEvent.pointerMove(overlay);
    Object.defineProperties(move, { pointerId: { value: 1 }, clientX: { value: 448 }, clientY: { value: 16 } });
    fireEvent(overlay, move);
    expect(onMoves).not.toHaveBeenCalled();
    fireEvent.pointerUp(overlay);
    expect(onMove).not.toHaveBeenCalled();
    expect(onMoves).toHaveBeenCalledTimes(1);
    expect(onMoves.mock.calls[0][0]).toHaveLength(1);
    expect(onMoves.mock.calls[0][0][0].id).toBe("child");
    expect(onMoves.mock.calls[0][0][0].x).toBeCloseTo(2);
    expect(onMoves.mock.calls[0][0][0].y).toBeCloseTo(-0.5);
    expect(onMoves.mock.calls[0][1]).toBe(47);
    expect(onGestureStart).toHaveBeenCalledTimes(1);
    expect(onGestureEnd).toHaveBeenCalledWith(47);
    expect(onGestureEnd.mock.invocationCallOrder[0]).toBeGreaterThan(onMoves.mock.invocationCallOrder[0]);
  } finally {
    if (originalGetContext) { Object.defineProperty(HTMLCanvasElement.prototype, "getContext", originalGetContext); }
  }
});


it.each(["pointercancel", "lostpointercapture", "blur", "unmount"])("batch callback closes an unfinished edit gesture on %s without committing its preview", (boundary) => {
  const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true,
    value: jest.fn(() => ({ clearRect: jest.fn(), fillRect: jest.fn() })) });
  const order: string[] = [];
  const onMove = jest.fn();
  const onMoves = jest.fn();
  const onGestureStart = jest.fn(() => { order.push("begin"); return 51; });
  const onGestureEnd = jest.fn();
  try {
    const view = render(<ThemeProvider theme={theme}><GameViewport canvasRef={createRef<HTMLCanvasElement>()}
      frame={frame} document={document} playing={false} paused={false} active selectedIds={[]} highlightedIds={[]}
      onSelect={() => order.push("select")} onSelectMany={jest.fn()} onMove={onMove} onMoves={onMoves} onTransform={jest.fn()}
      onGestureStart={onGestureStart} onGestureEnd={onGestureEnd}
      onLight={jest.fn()} onCamera={jest.fn()} onViewportAspect={jest.fn()}
      onKeyDown={jest.fn()} onKeyUp={jest.fn()} onBlur={jest.fn()} /></ThemeProvider>);
    const overlay = screen.getByRole("group", { name: "Game edit overlay" });
    overlay.setPointerCapture = jest.fn();
    jest.spyOn(overlay, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0,
      right: 512, bottom: 288, width: 512, height: 288, toJSON: () => undefined });
    const down = createEvent.pointerDown(overlay);
    Object.defineProperties(down, { button: { value: 0 }, pointerId: { value: 1 }, clientX: { value: 256 }, clientY: { value: 144 } });
    fireEvent(overlay, down);
    expect(order).toEqual(["select", "begin"]);
    const move = createEvent.pointerMove(overlay);
    Object.defineProperties(move, { pointerId: { value: 1 }, clientX: { value: 288 }, clientY: { value: 144 } });
    fireEvent(overlay, move);
    if (boundary === "unmount") { view.unmount(); }
    else if (boundary === "blur") { fireEvent.blur(window); }
    else { fireEvent(overlay, new Event(boundary, { bubbles: true })); }
    if (boundary !== "unmount") { fireEvent.pointerUp(overlay); }
    expect(onMoves).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
    expect(onGestureEnd).toHaveBeenCalledTimes(1);
    expect(onGestureEnd).toHaveBeenCalledWith(51);
    if (boundary !== "unmount") {
      fireEvent.pointerUp(overlay);
      view.unmount();
      expect(onGestureEnd).toHaveBeenCalledTimes(1);
    }
  } finally {
    if (originalGetContext) { Object.defineProperty(HTMLCanvasElement.prototype, "getContext", originalGetContext); }
  }
});


it("throwing batch release: drags a selected parent and child once using parent-local coordinates", () => {
  const childDocument = gameDocument.parse({ ...document, scenes: [{ id: "room", name: "Room", entities: [
    { id: "parent", transform2d: { x: 5, y: 0 } },
    { id: "child", parentId: "parent", transform2d: { x: 2, y: 0 } },
    { id: "other", transform2d: { x: -2, y: 0 } }
  ] }] });
  const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true,
    value: jest.fn(() => ({ clearRect: jest.fn(), fillRect: jest.fn() })) });
  const onMove = jest.fn();
  const failure = new Error("Expected batch callback failure");
  const errors: unknown[] = [];
  const report = (event: ErrorEvent) => { if (event.error === failure) { errors.push(event.error); event.preventDefault(); } };
  window.addEventListener("error", report);
  const onMoves = jest.fn(() => { throw failure; });
  const onGestureStart = jest.fn(() => 47);
  const onGestureEnd = jest.fn();
  try {
    render(<ThemeProvider theme={theme}><GameViewport canvasRef={createRef<HTMLCanvasElement>()}
      frame={{ ...frame, sprites: [] }} document={childDocument} playing={false} paused={false} active
      selectedIds={["parent", "child", "other"]} highlightedIds={[]}
      onSelect={jest.fn()} onSelectMany={jest.fn()} onMove={onMove} onMoves={onMoves}
      onGestureStart={onGestureStart} onGestureEnd={onGestureEnd} onTransform={jest.fn()}
      onLight={jest.fn()} onCamera={jest.fn()} onViewportAspect={jest.fn()}
      onKeyDown={jest.fn()} onKeyUp={jest.fn()} onBlur={jest.fn()} /></ThemeProvider>);
    const overlay = screen.getByRole("group", { name: "Game edit overlay" });
    overlay.setPointerCapture = jest.fn();
    jest.spyOn(overlay, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0,
      right: 512, bottom: 288, width: 512, height: 288, toJSON: () => undefined });
    const down = createEvent.pointerDown(overlay);
    Object.defineProperties(down, { button: { value: 0 }, pointerId: { value: 1 }, clientX: { value: 480 }, clientY: { value: 144 } });
    fireEvent(overlay, down);
    const move = createEvent.pointerMove(overlay);
    Object.defineProperties(move, { pointerId: { value: 1 }, clientX: { value: 512 }, clientY: { value: 144 } });
    fireEvent(overlay, move);
    expect(onMoves).not.toHaveBeenCalled();
    fireEvent.pointerUp(overlay);
    expect(errors).toEqual([failure]);
    expect(onMove).not.toHaveBeenCalled();
    expect(onMoves).toHaveBeenCalledTimes(1);
    expect(onMoves).toHaveBeenCalledWith([{ id: "parent", x: 6, y: 0 }, { id: "other", x: -1, y: 0 }], 47);
    expect(onGestureStart).toHaveBeenCalledTimes(1);
    expect(onGestureEnd).toHaveBeenCalledWith(47);
    expect(onGestureEnd).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(overlay);
    expect(onMoves).toHaveBeenCalledTimes(1);
    expect(onGestureEnd).toHaveBeenCalledTimes(1);
    expect(onGestureEnd.mock.invocationCallOrder[0]).toBeGreaterThan(onMoves.mock.invocationCallOrder[0]);
  } finally {
    window.removeEventListener("error", report);
    if (originalGetContext) { Object.defineProperty(HTMLCanvasElement.prototype, "getContext", originalGetContext); }
  }
});


// Add imports from existing public packages: z from zod, gameAuthoring from protocol,
// anyGameDocumentOp/applyAnyGameOps/validateAnyGame from game-runtime,
// getGameDraftStore from ../../../stores/game/GameDraftStore.

it.each([false, true])("preserves one real pointer gesture and the public queue budget for 350 authored roots with heldPrefix=%s", (heldPrefix) => {
  const roots = Array.from({ length: 350 }, (_, index) => ({ id: `root-${index}`,
    transform2d: { x: (index % 25) * 2 - 24, y: Math.floor(index / 25) * 2 - 12 } }));
  const baseline = gameDocument.parse({ schemaVersion: 2, engineVersion: "1", id: `pointer-many-roots-${heldPrefix}`,
    revision: "1", entrySceneId: "room", pixelsPerUnit: 32, tickRate: 60, inputActions: [], assets: {},
    scenes: [{ id: "room", name: "Many roots", entities: roots }] });
  const before = gameDocument.parse({ ...baseline,
    scenes: baseline.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) => ({ ...entity,
      transform2d: { ...entity.transform2d, x: entity.transform2d.x + 1 } })) })),
    authoring: gameAuthoring.parse({ version: 1, program: { source: "return inputs.document;", inputs: { document: baseline }, seed: 1 },
      baseline, overrides: baseline.scenes[0].entities.map((entity) => ({ sceneId: "room", entityId: entity.id,
        path: ["transform2d", "x"], value: entity.transform2d.x + 1 })) }) });
  const valid = validateAnyGame(before);
  if (!valid.valid) { throw new Error(`Invalid authored many-root fixture: ${JSON.stringify(valid)}`); }
  expect(before.authoring?.overrides).toHaveLength(350);
  const store = getGameDraftStore(before.id);
  store.getState().load(before, "base-token");
  if (heldPrefix) { store.getState().apply([{ op: "update_scene", scene_id: "room", set: { name: "Submitted name" } }], { label: "Rename scene" }); }
  const prefix = structuredClone(store.getState().pendingOps);
  const prefixBytes = JSON.stringify(prefix);
  const submitted = applyAnyGameOps(before, prefix);
  expect(submitted.schemaVersion).toBe(2);
  if (heldPrefix) { expect(prefix.length).toBeGreaterThan(0); store.getState().setSaving(prefix.length); }
  store.getState().selectMany(roots.map((entity) => entity.id));
  const moveOps = submitted.scenes[0].entities.map((entity) => anyGameDocumentOp.parse({ op: "update_entity",
    scene_id: "room", entity_id: entity.id, set: { transform2d: { x: entity.transform2d.x + 1, y: entity.transform2d.y } } }));
  const expected = applyAnyGameOps(submitted, moveOps);
  const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true,
    value: jest.fn(() => ({ clearRect: jest.fn(), fillRect: jest.fn() })) });
  const onMove = jest.fn((id: string, x: number, y: number, gestureId?: number) => {
    store.getState().apply([{ op: "update_entity", scene_id: "room", entity_id: id, set: { transform2d: { x, y } } }],
      { label: "Move Selection", mergeKey: "move-selection", gestureId });
  });
  const onMoves = jest.fn((moves: readonly { id: string; x: number; y: number }[], gestureId?: number) => {
    store.getState().apply(moves.map((move) => anyGameDocumentOp.parse({ op: "update_entity", scene_id: "room", entity_id: move.id,
      set: { transform2d: { x: move.x, y: move.y } } })), { label: "Move Selection", mergeKey: "move-selection", gestureId });
  });
  const onGestureStart = jest.fn(() => store.getState().beginGesture());
  const onGestureEnd = jest.fn((id: number) => store.getState().endGesture(id));
  let view: ReturnType<typeof render> | undefined;
  try {
    view = render(<ThemeProvider theme={theme}><GameViewport canvasRef={createRef<HTMLCanvasElement>()}
      frame={{ tick: 0, width: 64, height: 40, pixelsPerUnit: 32, camera: { x: 0, y: 0, zoom: 1 }, sprites: [], tiles: [], hud: [] }}
      document={submitted} playing={false} paused={false} active selectedIds={roots.map((entity) => entity.id)} highlightedIds={[]}
      onSelect={(id, additive) => store.getState().select(id, additive)} onSelectMany={(ids, additive) => store.getState().selectMany(ids, additive)}
      onMove={onMove} onMoves={onMoves} onTransform={jest.fn()} onLight={jest.fn()} onCamera={jest.fn()} onViewportAspect={jest.fn()}
      onGestureStart={onGestureStart} onGestureEnd={onGestureEnd}
      onKeyDown={jest.fn()} onKeyUp={jest.fn()} onBlur={jest.fn()} /></ThemeProvider>);
    const overlay = screen.getByRole("group", { name: "Game edit overlay" });
    overlay.setPointerCapture = jest.fn();
    jest.spyOn(overlay, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0,
      right: 2048, bottom: 1280, width: 2048, height: 1280, toJSON: () => undefined });
    const down = createEvent.pointerDown(overlay);
    Object.defineProperties(down, { button: { value: 0 }, pointerId: { value: 1 }, clientX: { value: 288 }, clientY: { value: 1024 } });
    fireEvent(overlay, down);
    const move = createEvent.pointerMove(overlay);
    Object.defineProperties(move, { pointerId: { value: 1 }, clientX: { value: 320 }, clientY: { value: 1024 } });
    fireEvent(overlay, move);
    expect(onMove).not.toHaveBeenCalled();
    expect(onMoves).not.toHaveBeenCalled();
    const releaseStart = performance.now();
    fireEvent.pointerUp(overlay);
    const releaseMs = performance.now() - releaseStart;
    console.info(JSON.stringify({ evidence: "350-root-pointer-release", heldPrefix, releaseMs }));
    expect(onMove).not.toHaveBeenCalled();
    expect(onMoves).toHaveBeenCalledTimes(1);
    expect(onMoves.mock.calls[0][0]).toHaveLength(350);
    expect(new Set(onMoves.mock.calls[0][0].map((move) => move.id))).toEqual(new Set(roots.map((entity) => entity.id)));
    expect(onGestureStart).toHaveBeenCalledTimes(1);
    expect(onMoves.mock.calls[0][1]).toBe(onGestureStart.mock.results[0].value);
    expect(onGestureEnd).toHaveBeenCalledTimes(1);
    expect(onGestureEnd).toHaveBeenCalledWith(onGestureStart.mock.results[0].value);
    expect(onGestureEnd.mock.invocationCallOrder[0]).toBeGreaterThan(onMoves.mock.invocationCallOrder[0]);
    expect(store.getState().error).toBeNull();
    expect(store.getState().document).toEqual(expected);
    expect(store.getState().commandHistory.past).toHaveLength(heldPrefix ? 2 : 1);
    expect(store.getState().commandHistory.past.at(-1)?.label).toBe("Move Selection");
    const queued = z.array(anyGameDocumentOp).parse(JSON.parse(JSON.stringify(store.getState().pendingOps)));
    expect(JSON.stringify(queued.slice(0, prefix.length))).toBe(prefixBytes);
    expect(applyAnyGameOps(before, queued)).toEqual(expected);
    if (heldPrefix) {
      store.getState().acknowledge(submitted, "acknowledged-token", prefix.length);
      expect(applyAnyGameOps(submitted, store.getState().pendingOps)).toEqual(expected);
    }
    store.getState().undo();
    expect(store.getState().document).toEqual(submitted);
    store.getState().redo();
    expect(store.getState().document).toEqual(expected);
    // This mirrors the existing public saveDraft maximum, without importing backend-private source.
    // Assert after state/replay/history controls so a RED still demonstrates the reachable producer.
    expect(queued.length).toBeLessThanOrEqual(1024);
    expect(z.array(anyGameDocumentOp).max(1024).safeParse(queued).success).toBe(true);
  } finally {
    view?.unmount();
    if (originalGetContext) { Object.defineProperty(HTMLCanvasElement.prototype, "getContext", originalGetContext); }
  }
});
