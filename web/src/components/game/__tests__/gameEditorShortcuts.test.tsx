import { fireEvent, render, screen } from "@testing-library/react";
import { handleGameUndo } from "../gameEditorShortcuts";

function fixture(playing = false): { undo: jest.Mock; redo: jest.Mock } {
  const undo = jest.fn();
  const redo = jest.fn();
  render(<div onKeyDown={(event) => handleGameUndo(event, playing, undo, redo)}>
    <div data-game-undo-scope><button>Entity</button><input aria-label="Entity name" /></div>
    <canvas data-game-undo-scope aria-label="Viewport" tabIndex={0} />
    <textarea aria-label="Assistant" />
  </div>);
  return { undo, redo };
}

it("leaves text undo inside hierarchy inputs and assistant fields (F11)", () => {
  const { undo } = fixture();
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Entity name" }), { code: "KeyZ", ctrlKey: true });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Assistant" }), { code: "KeyZ", metaKey: true });
  expect(undo).not.toHaveBeenCalled();
});

it("does not undo the document during play (F11)", () => {
  const { undo } = fixture(true);
  fireEvent.keyDown(screen.getByLabelText("Viewport"), { code: "KeyZ", ctrlKey: true });
  expect(undo).not.toHaveBeenCalled();
});

it("handles undo and redo in viewport and hierarchy (F11)", () => {
  const { undo, redo } = fixture();
  fireEvent.keyDown(screen.getByLabelText("Viewport"), { code: "KeyZ", ctrlKey: true });
  fireEvent.keyDown(screen.getByRole("button", { name: "Entity" }), { code: "KeyZ", metaKey: true, shiftKey: true });
  expect(undo).toHaveBeenCalledTimes(1);
  expect(redo).toHaveBeenCalledTimes(1);
});
