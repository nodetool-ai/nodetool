/**
 * @jest-environment jsdom
 */
import { resolveAction, type DispatcherState } from "../dispatcher";

function makeEvent(
  key: string,
  opts: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean; repeat?: boolean } = {}
): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...opts
  });
}

function state(activeTool: DispatcherState["activeTool"]): DispatcherState {
  return { activeTool };
}

describe("resolveAction — scope resolution", () => {
  it("returns null when focused element is an input", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    expect(resolveAction(makeEvent("z", { ctrlKey: true }), state("brush"))).toBeNull();
    input.blur();
    document.body.removeChild(input);
  });

  it("returns null when focused element is a textarea", () => {
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    ta.focus();
    expect(resolveAction(makeEvent("z", { ctrlKey: true }), state("brush"))).toBeNull();
    ta.blur();
    document.body.removeChild(ta);
  });

  it("resolves Ctrl+Z to undo in global scope", () => {
    expect(resolveAction(makeEvent("z", { ctrlKey: true }), state("brush"))).toBe("undo");
  });

  it("resolves Ctrl+Shift+Z to redo in global scope", () => {
    expect(resolveAction(makeEvent("z", { ctrlKey: true, shiftKey: true }), state("brush"))).toBe("redo");
  });

  it("resolves Ctrl+Z to transform-undo when activeTool is transform", () => {
    expect(resolveAction(makeEvent("z", { ctrlKey: true }), state("transform"))).toBe("transform-undo");
  });

  it("resolves Enter to transform-commit when activeTool is transform", () => {
    expect(resolveAction(makeEvent("Enter"), state("transform"))).toBe("transform-commit");
  });

  it("resolves Enter to crop-commit when activeTool is crop", () => {
    expect(resolveAction(makeEvent("Enter"), state("crop"))).toBe("crop-commit");
  });

  it("resolves Escape to transform-cancel in transform mode", () => {
    expect(resolveAction(makeEvent("Escape"), state("transform"))).toBe("transform-cancel");
  });

  it("resolves Escape to cancel-or-deselect in global scope", () => {
    expect(resolveAction(makeEvent("Escape"), state("brush"))).toBe("cancel-or-deselect");
  });

  it("resolves bare M to tool-select-rect", () => {
    expect(resolveAction(makeEvent("m"), state("brush"))).toBe("tool-select-rect");
  });

  it("resolves bare B to tool-brush", () => {
    expect(resolveAction(makeEvent("b"), state("move"))).toBe("tool-brush");
  });

  it("resolves Ctrl+A to select-all", () => {
    expect(resolveAction(makeEvent("a", { ctrlKey: true }), state("brush"))).toBe("select-all");
  });

  it("resolves Ctrl+I to invert-colors and Ctrl+Shift+I to invert-selection", () => {
    expect(resolveAction(makeEvent("i", { ctrlKey: true }), state("brush"))).toBe("invert-colors");
    expect(resolveAction(makeEvent("i", { ctrlKey: true, shiftKey: true }), state("brush"))).toBe("invert-selection");
  });

  it("resolves Ctrl+Shift+Alt+T to repeat-transform-on-copy", () => {
    expect(
      resolveAction(makeEvent("t", { ctrlKey: true, shiftKey: true, altKey: true }), state("brush"))
    ).toBe("repeat-transform-on-copy");
  });

  it("returns null for unknown combos", () => {
    expect(resolveAction(makeEvent("F12"), state("brush"))).toBeNull();
  });

  it("ArrowDown resolves to nudge-down in global scope", () => {
    expect(resolveAction(makeEvent("ArrowDown"), state("brush"))).toBe("nudge-down");
  });
});
