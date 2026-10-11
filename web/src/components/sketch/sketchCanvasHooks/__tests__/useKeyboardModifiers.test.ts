/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { useKeyboardModifiers } from "../useKeyboardModifiers";

function renderModifiers() {
  const onAltHeldChange = jest.fn();
  const onSpaceHeldChange = jest.fn();
  const isSpacePanningRef = { current: false };
  const isSizeDraggingRef = { current: false };
  const hook = renderHook(() =>
    useKeyboardModifiers({
      isSpacePanningRef,
      isSizeDraggingRef,
      onAltHeldChange,
      onSpaceHeldChange
    })
  );
  return { hook, onAltHeldChange, onSpaceHeldChange, isSpacePanningRef };
}

function key(type: "keydown" | "keyup", init: KeyboardEventInit) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent(type, init));
  });
}

describe("useKeyboardModifiers", () => {
  it("does not arm the S brush-size drag for Cmd+S or Ctrl+S", () => {
    const { hook } = renderModifiers();

    key("keydown", { key: "s", metaKey: true });
    expect(hook.result.current.sKeyHeldRef.current).toBe(false);

    key("keydown", { key: "s", ctrlKey: true });
    expect(hook.result.current.sKeyHeldRef.current).toBe(false);

    key("keydown", { key: "s" });
    expect(hook.result.current.sKeyHeldRef.current).toBe(true);
  });

  it("releases S when Cmd is released, since macOS drops the S keyup", () => {
    const { hook } = renderModifiers();

    key("keydown", { key: "s" });
    key("keydown", { key: "Meta", metaKey: true });
    key("keyup", { key: "Meta" });

    expect(hook.result.current.sKeyHeldRef.current).toBe(false);
  });

  it("releases every held key when the window loses focus", () => {
    const { hook, onAltHeldChange, onSpaceHeldChange, isSpacePanningRef } =
      renderModifiers();

    key("keydown", { key: "Alt", altKey: true });
    key("keydown", { key: "Shift", shiftKey: true });
    key("keydown", { key: " " });
    key("keydown", { key: "s" });
    isSpacePanningRef.current = true;

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

    const { altHeldRef, shiftHeldRef, spaceHeldRef, sKeyHeldRef } =
      hook.result.current;
    expect(altHeldRef.current).toBe(false);
    expect(shiftHeldRef.current).toBe(false);
    expect(spaceHeldRef.current).toBe(false);
    expect(sKeyHeldRef.current).toBe(false);
    expect(isSpacePanningRef.current).toBe(false);
    expect(onAltHeldChange).toHaveBeenLastCalledWith(false);
    expect(onSpaceHeldChange).toHaveBeenLastCalledWith(false);
  });
});
