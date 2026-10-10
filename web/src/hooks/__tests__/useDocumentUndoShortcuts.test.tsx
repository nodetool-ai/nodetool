import { act, fireEvent, renderHook } from "@testing-library/react";
import { useDocumentUndoShortcuts } from "../useDocumentUndoShortcuts";
import { initKeyListeners, useKeyPressedStore } from "../../stores/KeyPressedStore";

jest.mock("../useContextCommands", () => ({ useContextCommands: jest.fn() }));

const pressUndo = (target: Element): boolean => {
  let prevented = false;
  act(() => {
    prevented = !fireEvent.keyDown(target, { key: "z", ctrlKey: true });
    fireEvent.keyUp(target, { key: "z" });
    fireEvent.keyUp(target, { key: "Control" });
  });
  return prevented;
};

describe("useDocumentUndoShortcuts", () => {
  let release: () => void;
  beforeEach(() => {
    release = initKeyListeners();
    useKeyPressedStore.setState({ pressedKeys: new Set() });
  });
  afterEach(() => {
    release();
    document.body.innerHTML = "";
  });

  const setup = () => {
    const onUndo = jest.fn();
    renderHook(() =>
      useDocumentUndoShortcuts({ active: true, onUndo, onRedo: jest.fn() })
    );
    return onUndo;
  };

  it("undoes the document from a field on the surface", () => {
    const onUndo = setup();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    expect(pressUndo(input)).toBe(true);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("leaves Cmd/Ctrl+Z to a text field inside a dialog", () => {
    const onUndo = setup();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const input = document.createElement("input");
    dialog.appendChild(input);
    document.body.appendChild(dialog);
    input.focus();
    expect(pressUndo(input)).toBe(false);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("leaves Cmd/Ctrl+Z to a text field outside the given root", () => {
    const onUndo = jest.fn();
    const root = document.createElement("div");
    const inside = document.createElement("textarea");
    root.appendChild(inside);
    const outside = document.createElement("input");
    document.body.append(root, outside);
    renderHook(() =>
      useDocumentUndoShortcuts({
        active: true,
        onUndo,
        onRedo: jest.fn(),
        root: () => root
      })
    );
    outside.focus();
    expect(pressUndo(outside)).toBe(false);
    expect(onUndo).not.toHaveBeenCalled();
    inside.focus();
    pressUndo(inside);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
