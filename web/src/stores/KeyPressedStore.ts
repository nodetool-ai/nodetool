/**
 * KeyPressedStore manages keyboard state and key combinations for the application.
 *
 * Features:
 * - Tracks currently pressed keys and key press counts
 * - Handles key combinations (combos) with customizable callbacks
 * - Prevents key event handling in form inputs and specific UI elements
 * - Provides hooks for key state management (useKeyPressed, useCombo)
 * - Supports modifier keys (shift, control, alt, meta)
 * - Implements keyboard event cleanup on window blur/focus
 */

import { create } from "zustand";
import { useMemo, useEffect, useContext } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { KeyboardContext } from "../components/KeyboardProvider";

// Allowed key combinations for HTMLTextAreaElement
const ALLOWED_TEXTAREA_COMBOS: Array<{
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}> = [
  { key: "Enter", shiftKey: true }
  // Add other allowed combinations here if needed
];

interface ComboOptions {
  preventDefault?: boolean;
  callback?: () => void;
  active?: boolean;
}

// Module-level variables and functions
const comboCallbacks = new Map<string, ComboOptions>();

const registerComboCallback = (combo: string, options: ComboOptions = {}) => {
  comboCallbacks.set(combo, options);
};

const unregisterComboCallback = (combo: string) => {
  comboCallbacks.delete(combo);
};

const executeComboCallbacks = (
  pressedKeys: Set<string>,
  event: KeyboardEvent | undefined
) => {
  const pressedKeysString = Array.from(pressedKeys).sort().join("+");
  const options = comboCallbacks.get(pressedKeysString);
  if (options?.callback && options.active !== false) {
    if (options.preventDefault && event) {
      event.preventDefault();
    }
    options.callback();
  }
};

type KeyPressedState = {
  pressedKeys: Set<string>;
  lastPressedKey: string | null;
  keyPressCount: Record<string, number>;
  setKeysPressed: (
    keys: { [key: string]: boolean },
    event?: KeyboardEvent
  ) => void;
  isKeyPressed: (key: string) => boolean;
  isAnyKeyPressed: () => boolean;
  getPressedKeys: () => string[];
  getKeyPressCount: (key: string) => number;
  resetKeyPressCount: (key?: string) => void;
  isComboPressed: (combo: string[]) => boolean;
};

const useKeyPressedStore = create<KeyPressedState>()((set, get) => ({
  pressedKeys: new Set(),
  lastPressedKey: null,
  keyPressCount: {},
  setKeysPressed: (keys: { [key: string]: boolean }, event?: KeyboardEvent) =>
    set((state) => {
      const newPressedKeys = new Set(state.pressedKeys);
      const newKeyPressCount = { ...state.keyPressCount };
      let lastPressedKey = state.lastPressedKey;

      Object.entries(keys).forEach(([key, isPressed]) => {
        const normalizedKey = key.toLowerCase();

        if (isPressed) {
          newPressedKeys.add(normalizedKey);
          lastPressedKey = normalizedKey;
          newKeyPressCount[normalizedKey] =
            (newKeyPressCount[normalizedKey] || 0) + 1;
        } else {
          newPressedKeys.delete(normalizedKey);
        }
      });

      executeComboCallbacks(newPressedKeys, event);

      return {
        pressedKeys: newPressedKeys,
        lastPressedKey: newPressedKeys.size > 0 ? lastPressedKey : null,
        keyPressCount: newKeyPressCount
      };
    }),
  isKeyPressed: (key: string) => get().pressedKeys.has(key.toLowerCase()),
  isAnyKeyPressed: () => get().pressedKeys.size > 0,
  getPressedKeys: () => Array.from(get().pressedKeys),
  getKeyPressCount: (key: string) =>
    get().keyPressCount[key.toLowerCase()] || 0,
  resetKeyPressCount: (key?: string) =>
    set((state) => {
      if (key) {
        const { [key.toLowerCase()]: _, ...rest } = state.keyPressCount;
        return { keyPressCount: rest };
      }
      return { keyPressCount: {} };
    }),
  isComboPressed: (combo: string[]) => {
    const { pressedKeys } = get();
    return combo.every((key) => pressedKeys.has(key.toLowerCase()));
  }
}));

// Add this near the top of the file, with other module-level variables
let listenersInitialized = false;

const initKeyListeners = () => {
  // Check if listeners are already initialized
  if (listenersInitialized) {
    return () => {}; // Return a no-op cleanup function
  }

  const handleKeyChange = (event: KeyboardEvent, isPressed: boolean) => {
    const { key, shiftKey, ctrlKey, altKey, metaKey, repeat } = event;
    const normalizedKey = key.toLowerCase();

    // Existing checks for input elements and Slate editor
    if (
      event &&
      (event.target instanceof HTMLInputElement ||
        (event.target as HTMLElement)?.classList?.contains("select-header"))
    ) {
      return;
    }
    if (
      event.target instanceof HTMLElement &&
      event.target.closest('[data-slate-editor="true"]')
    ) {
      return;
    }

    // New logic for HTMLTextAreaElement
    if (event.target instanceof HTMLTextAreaElement) {
      const isEventKeyAModifier = ["shift", "control", "alt", "meta"].includes(
        normalizedKey
      );

      if (isEventKeyAModifier) {
        // Always process modifier key events from textareas to update their state in the store
        // console.log(
        //   "TextArea (Modifier Key Event):",
        //   normalizedKey,
        //   "Pressed:",
        //   isPressed,
        //   "Shift Held:",
        //   shiftKey
        // );
      } else {
        // For non-modifier keys (e.g., 'Enter', 'a'), check against allowed combos
        const isCombinationAllowed = ALLOWED_TEXTAREA_COMBOS.some(
          (combo) =>
            event.key === combo.key && // Check the main key
            event.shiftKey === (combo.shiftKey || false) && // Check shift (default to false if not specified in combo)
            event.ctrlKey === (combo.ctrlKey || false) && // Future: Check ctrl
            event.altKey === (combo.altKey || false) && // Future: Check alt
            event.metaKey === (combo.metaKey || false) // Future: Check meta
        );
        // console.log(
        //   "TextArea (Non-Modifier Key Event):",
        //   "Key:",
        //   event.key,
        //   "Shift Held:",
        //   event.shiftKey,
        //   "Is Combination Allowed:",
        //   isCombinationAllowed
        // );
        if (!isCombinationAllowed) {
          return; // Block if not an allowed combination for textareas
        }
      }
    }

    // Prevent key repeat events for non-modifier keys
    if (
      isPressed &&
      repeat &&
      !["shift", "control", "alt", "meta"].includes(normalizedKey)
    ) {
      // console.log("Repeat event blocked for:", normalizedKey);
      return;
    }

    const { setKeysPressed } = useKeyPressedStore.getState();
    const keysToUpdate: Record<string, boolean> = {};

    // Set the state for the actual key from the event
    keysToUpdate[normalizedKey] = isPressed;

    // Always update the global state of modifier keys based on the event's properties
    keysToUpdate["shift"] = shiftKey;
    keysToUpdate["control"] = ctrlKey;
    keysToUpdate["alt"] = altKey;
    keysToUpdate["meta"] = metaKey;

    // If a modifier key itself is being released, ensure its specific entry is false
    if (
      !isPressed &&
      ["shift", "control", "alt", "meta"].includes(normalizedKey)
    ) {
      keysToUpdate[normalizedKey] = false;
    }

    // console.log(
    //   "Calling setKeysPressed with:",
    //   JSON.stringify(keysToUpdate),
    //   "for event key:",
    //   normalizedKey,
    //   "isPressed:",
    //   isPressed
    // );
    setKeysPressed(keysToUpdate, event);
  };

  const handleKeyDown = (event: KeyboardEvent) => handleKeyChange(event, true);
  const handleKeyUp = (event: KeyboardEvent) => handleKeyChange(event, false);

  const clearAllKeys = () => {
    const { pressedKeys, setKeysPressed } = useKeyPressedStore.getState();
    pressedKeys.forEach((key) => setKeysPressed({ [key]: false }));
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", clearAllKeys);
  window.addEventListener("focus", clearAllKeys);

  // Set the flag to true after adding listeners
  listenersInitialized = true;

  // Return a cleanup function
  return () => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
    window.removeEventListener("blur", clearAllKeys);
    window.removeEventListener("focus", clearAllKeys);
    listenersInitialized = false;
  };
};

export const useKeyPressed = (selector: (state: KeyPressedState) => any) =>
  useStoreWithEqualityFn(useKeyPressedStore, selector, shallow);

// Update useCombo to import KeyboardContext from new location
const useCombo = (
  combo: string[],
  callback: () => void,
  preventDefault: boolean = true,
  active: boolean = true
) => {
  const keyboardActive = useContext(KeyboardContext);
  const memoizedCombo = useMemo(
    () =>
      combo
        .map((key) => key.toLowerCase())
        .sort()
        .join("+"),
    [combo]
  );

  useEffect(() => {
    // Only register if both the keyboard context and the hook's active prop are true
    if (keyboardActive && active) {
      registerComboCallback(memoizedCombo, {
        callback,
        preventDefault,
        active
      });
      return () => unregisterComboCallback(memoizedCombo);
    }
  }, [memoizedCombo, callback, preventDefault, active, keyboardActive]);
};

export { useKeyPressedStore, initKeyListeners, useCombo };
