import { act } from "@testing-library/react";
import {
  useKeyPressedStore,
  registerComboCallback,
  unregisterComboCallback
} from "../KeyPressedStore";

describe("KeyPressedStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    const { setKeysPressed, resetKeyPressCount, setPaused } =
      useKeyPressedStore.getState();
    const pressedKeys = useKeyPressedStore.getState().getPressedKeys();
    const keysToReset: Record<string, boolean> = {};
    pressedKeys.forEach((key) => {
      keysToReset[key] = false;
    });
    setKeysPressed(keysToReset);
    resetKeyPressCount();
    setPaused(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("initial state", () => {
    it("has no pressed keys initially", () => {
      const state = useKeyPressedStore.getState();
      expect(state.getPressedKeys()).toEqual([]);
      expect(state.isAnyKeyPressed()).toBe(false);
    });

    it("has no last pressed key initially", () => {
      const state = useKeyPressedStore.getState();
      expect(state.lastPressedKey).toBeNull();
    });

    it("has empty key press count initially", () => {
      const state = useKeyPressedStore.getState();
      expect(state.getKeyPressCount("a")).toBe(0);
    });

    it("is not paused initially", () => {
      const state = useKeyPressedStore.getState();
      expect(state.isPaused).toBe(false);
    });
  });

  describe("setKeysPressed", () => {
    it("adds a pressed key", () => {
      const { setKeysPressed } = useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ a: true });
      });

      const state = useKeyPressedStore.getState();
      expect(state.isKeyPressed("a")).toBe(true);
      expect(state.getPressedKeys()).toContain("a");
    });

    it("removes a pressed key", () => {
      const { setKeysPressed } = useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ a: true });
        setKeysPressed({ a: false });
      });

      const state = useKeyPressedStore.getState();
      expect(state.isKeyPressed("a")).toBe(false);
      expect(state.getPressedKeys()).not.toContain("a");
    });

    it("normalizes keys to lowercase", () => {
      const { setKeysPressed } = useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ A: true });
      });

      const state = useKeyPressedStore.getState();
      expect(state.isKeyPressed("a")).toBe(true);
      expect(state.isKeyPressed("A")).toBe(true);
    });

    it("sets last pressed key", () => {
      const { setKeysPressed } = useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ a: true });
      });

      expect(useKeyPressedStore.getState().lastPressedKey).toBe("a");
    });

    it("clears last pressed key when all keys are released", () => {
      const { setKeysPressed } = useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ a: true });
        setKeysPressed({ a: false });
      });

      expect(useKeyPressedStore.getState().lastPressedKey).toBeNull();
    });

    it("tracks multiple keys", () => {
      const { setKeysPressed } = useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ a: true, b: true });
      });

      const state = useKeyPressedStore.getState();
      expect(state.isKeyPressed("a")).toBe(true);
      expect(state.isKeyPressed("b")).toBe(true);
      expect(state.getPressedKeys()).toEqual(expect.arrayContaining(["a", "b"]));
    });
  });

  describe("key press count", () => {
    it("increments press count for a key", () => {
      const { setKeysPressed } = useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ a: true });
      });

      expect(useKeyPressedStore.getState().getKeyPressCount("a")).toBe(1);
    });

    it("increments press count on multiple presses", () => {
      const { setKeysPressed } = useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ a: true });
        setKeysPressed({ a: false });
        setKeysPressed({ a: true });
      });

      expect(useKeyPressedStore.getState().getKeyPressCount("a")).toBe(2);
    });

    it("resets specific key press count", () => {
      const { setKeysPressed, resetKeyPressCount } =
        useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ a: true, b: true });
        resetKeyPressCount("a");
      });

      expect(useKeyPressedStore.getState().getKeyPressCount("a")).toBe(0);
      expect(useKeyPressedStore.getState().getKeyPressCount("b")).toBe(1);
    });

    it("resets all key press counts", () => {
      const { setKeysPressed, resetKeyPressCount } =
        useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ a: true, b: true });
        resetKeyPressCount();
      });

      expect(useKeyPressedStore.getState().getKeyPressCount("a")).toBe(0);
      expect(useKeyPressedStore.getState().getKeyPressCount("b")).toBe(0);
    });
  });

  describe("isComboPressed", () => {
    it("returns true when combo is pressed", () => {
      const { setKeysPressed } = useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ control: true, s: true });
      });

      expect(useKeyPressedStore.getState().isComboPressed(["control", "s"])).toBe(
        true
      );
    });

    it("returns false when combo is not fully pressed", () => {
      const { setKeysPressed } = useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ control: true });
      });

      expect(useKeyPressedStore.getState().isComboPressed(["control", "s"])).toBe(
        false
      );
    });

    it("normalizes combo keys to lowercase", () => {
      const { setKeysPressed } = useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ control: true, s: true });
      });

      expect(useKeyPressedStore.getState().isComboPressed(["Control", "S"])).toBe(
        true
      );
    });
  });

  describe("pause state", () => {
    it("sets pause state", () => {
      const { setPaused } = useKeyPressedStore.getState();
      act(() => {
        setPaused(true);
      });

      expect(useKeyPressedStore.getState().isPaused).toBe(true);
    });

    it("resumes from paused state", () => {
      const { setPaused } = useKeyPressedStore.getState();
      act(() => {
        setPaused(true);
        setPaused(false);
      });

      expect(useKeyPressedStore.getState().isPaused).toBe(false);
    });
  });

  describe("combo callbacks", () => {
    it("registers combo callback", () => {
      const callback = jest.fn();
      registerComboCallback("control+s", { callback, preventDefault: true });

      const { setKeysPressed } = useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ control: true, s: true });
      });

      expect(callback).toHaveBeenCalled();
      unregisterComboCallback("control+s");
    });

    it("does not execute callback when paused", () => {
      const callback = jest.fn();
      registerComboCallback("control+s", { callback });

      const { setKeysPressed, setPaused } = useKeyPressedStore.getState();
      act(() => {
        setPaused(true);
        setKeysPressed({ control: true, s: true });
      });

      expect(callback).not.toHaveBeenCalled();
      unregisterComboCallback("control+s");
    });

    it("does not execute callback when inactive", () => {
      const callback = jest.fn();
      registerComboCallback("control+s", { callback, active: false });

      const { setKeysPressed } = useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ control: true, s: true });
      });

      expect(callback).not.toHaveBeenCalled();
      unregisterComboCallback("control+s");
    });

    it("unregisters combo callback", () => {
      const callback = jest.fn();
      registerComboCallback("control+s", { callback });
      unregisterComboCallback("control+s");

      const { setKeysPressed } = useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ control: true, s: true });
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it("does not execute copy callback when an input element is focused", () => {
      const callback = jest.fn();
      registerComboCallback("c+control", { callback, preventDefault: false });

      // Create and focus an input element
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      const { setKeysPressed } = useKeyPressedStore.getState();
      const event = new KeyboardEvent("keydown", {
        key: "c",
        ctrlKey: true
      });
      act(() => {
        setKeysPressed({ control: true, c: true }, event);
      });

      // The global copy callback should NOT fire when input is focused
      expect(callback).not.toHaveBeenCalled();

      document.body.removeChild(input);
      unregisterComboCallback("c+control");
    });

    it("does not execute copy callback when a textarea is focused", () => {
      const callback = jest.fn();
      registerComboCallback("c+meta", { callback, preventDefault: false });

      // Create and focus a textarea element
      const textarea = document.createElement("textarea");
      document.body.appendChild(textarea);
      textarea.focus();

      const { setKeysPressed } = useKeyPressedStore.getState();
      const event = new KeyboardEvent("keydown", {
        key: "c",
        metaKey: true
      });
      act(() => {
        setKeysPressed({ meta: true, c: true }, event);
      });

      // The global copy callback should NOT fire when textarea is focused
      expect(callback).not.toHaveBeenCalled();

      document.body.removeChild(textarea);
      unregisterComboCallback("c+meta");
    });

    it("executes copy callback when no input is focused", () => {
      const callback = jest.fn();
      registerComboCallback("c+control", { callback, preventDefault: false });

      // Ensure no input is focused (focus body)
      (document.body as HTMLElement).focus();

      const { setKeysPressed } = useKeyPressedStore.getState();
      const event = new KeyboardEvent("keydown", {
        key: "c",
        ctrlKey: true
      });
      act(() => {
        setKeysPressed({ control: true, c: true }, event);
      });

      // The global copy callback SHOULD fire when no input is focused
      expect(callback).toHaveBeenCalled();

      unregisterComboCallback("c+control");
    });

    it("allows escape callback when input is focused", () => {
      const callback = jest.fn();
      registerComboCallback("escape", { callback, preventDefault: true });

      // Create and focus an input element
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      const { setKeysPressed } = useKeyPressedStore.getState();
      const event = new KeyboardEvent("keydown", { key: "Escape" });
      act(() => {
        setKeysPressed({ escape: true }, event);
      });

      // Escape should still work even when input is focused
      expect(callback).toHaveBeenCalled();

      document.body.removeChild(input);
      unregisterComboCallback("escape");
    });

    it("allows delete callback when input is focused", () => {
      const callback = jest.fn();
      registerComboCallback("delete", { callback, preventDefault: true });

      // Create and focus an input element
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      const { setKeysPressed } = useKeyPressedStore.getState();
      const event = new KeyboardEvent("keydown", { key: "Delete" });
      act(() => {
        setKeysPressed({ delete: true }, event);
      });

      // Delete should still work even when input is focused
      expect(callback).toHaveBeenCalled();

      document.body.removeChild(input);
      unregisterComboCallback("delete");
    });

    it("allows backspace callback when input is focused", () => {
      const callback = jest.fn();
      registerComboCallback("backspace", { callback, preventDefault: true });

      // Create and focus an input element
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      const { setKeysPressed } = useKeyPressedStore.getState();
      const event = new KeyboardEvent("keydown", { key: "Backspace" });
      act(() => {
        setKeysPressed({ backspace: true }, event);
      });

      // Backspace should still work even when input is focused
      expect(callback).toHaveBeenCalled();

      document.body.removeChild(input);
      unregisterComboCallback("backspace");
    });
  });

  describe("helper functions", () => {
    it("isKeyPressed returns correct value", () => {
      const { setKeysPressed, isKeyPressed } = useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ a: true });
      });

      expect(isKeyPressed("a")).toBe(true);
      expect(isKeyPressed("b")).toBe(false);
    });

    it("isAnyKeyPressed returns true when keys are pressed", () => {
      const { setKeysPressed, isAnyKeyPressed } = useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ a: true });
      });

      expect(isAnyKeyPressed()).toBe(true);
    });

    it("isAnyKeyPressed returns false when no keys are pressed", () => {
      const { isAnyKeyPressed } = useKeyPressedStore.getState();
      expect(isAnyKeyPressed()).toBe(false);
    });

    it("getPressedKeys returns all pressed keys", () => {
      const { setKeysPressed, getPressedKeys } = useKeyPressedStore.getState();
      act(() => {
        setKeysPressed({ a: true, b: true, c: true });
      });

      const pressedKeys = getPressedKeys();
      expect(pressedKeys).toHaveLength(3);
      expect(pressedKeys).toContain("a");
      expect(pressedKeys).toContain("b");
      expect(pressedKeys).toContain("c");
    });
  });
});
