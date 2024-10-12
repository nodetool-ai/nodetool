import { create } from "zustand";
import { useCallback, useMemo } from "react";

type Callback = () => void;

// Module-level variables and functions
const comboCallbacks = new Map<string, Callback>();

const registerComboCallback = (combo: string, callback: Callback) => {
  comboCallbacks.set(combo, callback);
};

const unregisterComboCallback = (combo: string) => {
  comboCallbacks.delete(combo);
};

const executeComboCallbacks = (
  pressedKeys: Set<string>,
  event: KeyboardEvent | undefined
) => {
  // console.log("pressedKeys", pressedKeys);
  const pressedKeysString = Array.from(pressedKeys).sort().join("+");
  comboCallbacks.forEach((callback, combo) => {
    if (pressedKeysString.includes(combo)) {
      callback();
      if (event) {
        event.preventDefault();
      }
    }
  });
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

const useKeyPressedStore = create<KeyPressedState>((set, get) => ({
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
    console.warn("Key listeners have already been initialized.");
    return () => {}; // Return a no-op cleanup function
  }

  const handleKeyChange = (event: KeyboardEvent, isPressed: boolean) => {
    const { key, shiftKey, ctrlKey, altKey, metaKey, repeat } = event;
    const normalizedKey = key.toLowerCase();

    // Prevent key repeat events
    if (isPressed && repeat) return;

    const { setKeysPressed, pressedKeys } = useKeyPressedStore.getState();

    // Create a new object with all currently pressed keys set to false
    const keysToUpdate = Array.from(pressedKeys).reduce((acc, key) => {
      acc[key] = false;
      return acc;
    }, {} as Record<string, boolean>);

    // Update the key that triggered this event
    keysToUpdate[normalizedKey] = isPressed;

    // Always update modifier keys based on their current state
    keysToUpdate["shift"] = shiftKey;
    keysToUpdate["control"] = ctrlKey;
    keysToUpdate["alt"] = altKey;
    keysToUpdate["meta"] = metaKey;

    setKeysPressed(keysToUpdate, event);

    // Execute combo callbacks and potentially prevent default
    if (isPressed) {
      const updatedPressedKeys = new Set(pressedKeys);
      updatedPressedKeys.add(normalizedKey);
      executeComboCallbacks(updatedPressedKeys, event);
    }
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
    // Reset the flag when cleaning up
    listenersInitialized = false;
  };
};

// Modify the useCombo hook to use useCallback and useMemo
const useCombo = (combo: string[], callback: () => void) => {
  const memoizedCallback = useCallback(() => {
    callback();
  }, [callback]);

  const memoizedCombo = useMemo(
    () =>
      combo
        .map((key) => key.toLowerCase())
        .sort()
        .join("+"),
    [combo]
  );

  useMemo(() => {
    registerComboCallback(memoizedCombo, memoizedCallback);
    return () => unregisterComboCallback(memoizedCombo);
  }, [memoizedCombo, memoizedCallback]);
};

export { useKeyPressedStore, initKeyListeners, useCombo };
