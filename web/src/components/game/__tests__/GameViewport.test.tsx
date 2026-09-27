import { createRef } from "react";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { gameDocument, type GameRenderFrame } from "@nodetool-ai/protocol/game.js";

import { isMac } from "../../../utils/platform";
import GameViewport from "../GameViewport";

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
