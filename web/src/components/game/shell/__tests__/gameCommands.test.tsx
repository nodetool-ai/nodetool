import { fireEvent, render, screen } from "@testing-library/react";

import {
  dispatchGameShortcut, findGameBindingConflict, formatGameBinding, gameBindingFromEvent, GAME_COMMANDS,
  resolveGameBindings, type GameCommandHandlers
} from "../gameCommands";

function fixture(dimension: "2d" | "3d" = "2d", playing = false, overrides = {}): { handlers: Record<string, jest.Mock>; ran: string[] } {
  const handlers: Record<string, jest.Mock> = {};
  for (const entry of GAME_COMMANDS) { handlers[entry.id] = jest.fn(); }
  const commands: GameCommandHandlers = Object.fromEntries(Object.entries(handlers).map(([id, run]) => [id, { run }]));
  const ran: string[] = [];
  render(<div onKeyDown={(event) => {
    const id = dispatchGameShortcut(event, { dimension, playing, bindings: resolveGameBindings(overrides), handler: (commandId) => commands[commandId] });
    if (id) { ran.push(id); }
  }}>
    <div data-game-undo-scope><button>Entity</button><input aria-label="Entity name" /></div>
    <div data-game-panel="viewport"><canvas data-game-undo-scope aria-label="Viewport" tabIndex={0} /></div>
    <button>Toolbar</button>
    <textarea aria-label="Assistant" />
  </div>);
  return { handlers, ran };
}

it("leaves text undo inside hierarchy inputs and assistant fields (F11)", () => {
  const { handlers } = fixture();
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Entity name" }), { code: "KeyZ", ctrlKey: true });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Assistant" }), { code: "KeyZ", metaKey: true });
  expect(handlers["edit.undo"]).not.toHaveBeenCalled();
});

it("does not undo the document during play but still opens the command palette (F11)", () => {
  const { handlers } = fixture("3d", true);
  fireEvent.keyDown(screen.getByLabelText("Viewport"), { code: "KeyZ", ctrlKey: true });
  fireEvent.keyDown(screen.getByLabelText("Viewport"), { code: "KeyK", metaKey: true, shiftKey: true });
  expect(handlers["edit.undo"]).not.toHaveBeenCalled();
  expect(handlers["editor.commandPalette"]).toHaveBeenCalledTimes(1);
});

it.each(["2d", "3d"] as const)("handles undo and redo in the %s viewport and hierarchy with either modifier (F11)", (dimension) => {
  const { handlers } = fixture(dimension);
  fireEvent.keyDown(screen.getByLabelText("Viewport"), { code: "KeyZ", ctrlKey: true });
  fireEvent.keyDown(screen.getByRole("button", { name: "Entity" }), { code: "KeyZ", metaKey: true, shiftKey: true });
  expect(handlers["edit.undo"]).toHaveBeenCalledTimes(1);
  expect(handlers["edit.redo"]).toHaveBeenCalledTimes(1);
});

it("routes the same default key to the command each dimension defines", () => {
  const { ran } = fixture("3d");
  for (const code of ["KeyF", "KeyG", "KeyW", "KeyE", "KeyR", "Delete", "Home"]) {
    fireEvent.keyDown(screen.getByLabelText("Viewport"), { code });
  }
  expect(ran).toEqual(["view.frameSelection", "view.toggleSnap", "tool.move", "tool.rotate", "tool.scale"]);
});

it("keeps viewport commands inside the viewport and panel commands inside keyboard scopes", () => {
  const { handlers, ran } = fixture("2d");
  fireEvent.keyDown(screen.getByRole("button", { name: "Entity" }), { code: "Delete" });
  fireEvent.keyDown(screen.getByRole("button", { name: "Toolbar" }), { code: "KeyZ", ctrlKey: true });
  expect(ran).toEqual([]);
  fireEvent.keyDown(screen.getByRole("button", { name: "Toolbar" }), { code: "KeyK", ctrlKey: true, shiftKey: true });
  fireEvent.keyDown(screen.getByLabelText("Viewport"), { code: "Backspace" });
  fireEvent.keyDown(screen.getByLabelText("Viewport"), { code: "ArrowLeft", shiftKey: true });
  expect(ran).toEqual(["editor.commandPalette", "edit.delete", "edit.nudgeLeftFar"]);
  expect(handlers["edit.nudgeLeft"]).not.toHaveBeenCalled();
});

it("ignores a handled key press and lets a disabled command fall through", () => {
  const ran: string[] = [];
  const run = jest.fn();
  render(<div onKeyDown={(event) => {
    const id = dispatchGameShortcut(event, { dimension: "3d", playing: false, bindings: resolveGameBindings({}),
      handler: (commandId) => commandId === "tool.move" ? { run, enabled: false } : undefined });
    if (id) { ran.push(id); }
  }}>
    <div data-game-panel="viewport"><canvas data-game-undo-scope aria-label="Viewport" tabIndex={0}
      onKeyDown={(event) => { if (event.code === "KeyF") { event.preventDefault(); } }} /></div>
  </div>);
  const keyW = fireEvent.keyDown(screen.getByLabelText("Viewport"), { code: "KeyW" });
  fireEvent.keyDown(screen.getByLabelText("Viewport"), { code: "KeyF" });
  expect(keyW).toBe(true);
  expect(run).not.toHaveBeenCalled();
  expect(ran).toEqual([]);
});

it("applies rebinding and removal overrides", () => {
  const { handlers } = fixture("2d", false, { "edit.undo": [{ code: "KeyU" }], "view.toggleSnap": [] });
  fireEvent.keyDown(screen.getByLabelText("Viewport"), { code: "KeyZ", ctrlKey: true });
  fireEvent.keyDown(screen.getByLabelText("Viewport"), { code: "KeyG" });
  expect(handlers["edit.undo"]).not.toHaveBeenCalled();
  expect(handlers["view.toggleSnap"]).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByLabelText("Viewport"), { code: "KeyU" });
  expect(handlers["edit.undo"]).toHaveBeenCalledTimes(1);
});

it("records, formats and checks bindings for conflicts", () => {
  expect(gameBindingFromEvent({ code: "ShiftLeft", ctrlKey: false, metaKey: false, shiftKey: true, altKey: false })).toBeNull();
  const binding = gameBindingFromEvent({ code: "KeyK", ctrlKey: false, metaKey: true, shiftKey: true, altKey: false });
  expect(binding).toEqual({ code: "KeyK", mod: true, shift: true });
  expect(formatGameBinding({ code: "KeyZ", mod: true, shift: true }, false)).toEqual(["Ctrl", "Shift", "Z"]);
  expect(formatGameBinding({ code: "KeyZ", mod: true }, true)).toEqual(["Meta", "Z"]);
  const bindings = resolveGameBindings({});
  expect(findGameBindingConflict("view.resetCamera", { code: "KeyF" }, bindings)?.id).toBe("view.frameSelection");
  // Move (3D only) and Copy (2D only) never share an editor, so W does not conflict with a 2D-only command.
  expect(findGameBindingConflict("edit.copy", { code: "KeyW" }, bindings)).toBeUndefined();
});

it("keeps command ids unique and default bindings free of conflicts within a dimension", () => {
  expect(new Set(GAME_COMMANDS.map((entry) => entry.id)).size).toBe(GAME_COMMANDS.length);
  const bindings = resolveGameBindings({});
  for (const entry of GAME_COMMANDS) {
    for (const binding of entry.defaultBindings) {
      expect([entry.id, findGameBindingConflict(entry.id, binding, bindings)?.id]).toEqual([entry.id, undefined]);
    }
  }
});
