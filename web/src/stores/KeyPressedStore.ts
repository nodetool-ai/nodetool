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
import { useRightPanelStore } from "./RightPanelStore";

// Allowed key combinations for HTMLTextAreaElement
const ALLOWED_TEXTAREA_COMBOS: Array<{
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}> = [
  { key: "Enter", shiftKey: true },
  { key: "Enter", ctrlKey: true },
  { key: "Enter", metaKey: true },
  { key: "Escape" } // Allow Escape to close modals/editors
];

interface ComboOptions {
  preventDefault?: boolean;
  callback?: () => void;
  active?: boolean;
}

// Module-level variables and functions
const comboCallbacks = new Map<string, ComboOptions>();

const registerComboCallback = (combo: string, options: ComboOptions = {}) => {
  // Normalize 'ctrl' to 'control' for consistency
  const normalizedCombo = combo.replace(/\bctrl\b/g, "control");
  comboCallbacks.set(normalizedCombo, options);
};

const unregisterComboCallback = (combo: string) => {
  const normalizedCombo = combo.replace(/\bctrl\b/g, "control");
  comboCallbacks.delete(normalizedCombo);
};

const executeComboCallbacks = (
  pressedKeys: Set<string>,
  event: KeyboardEvent | undefined
) => {
  if (useKeyPressedStore.getState().isPaused) {
    return;
  }
  const pressedKeysString = Array.from(pressedKeys).sort().join("+");
  const activeElement = document.activeElement;
  const options = comboCallbacks.get(pressedKeysString);

  if (!options?.callback || options.active === false) {
    // No active callback for this combo, or combo is inactive.
    // Default browser behavior (e.g., typing a character) will occur.
    return;
  }

  // An active callback exists for the pressed keys.
  // Now, check if we should suppress it due to input focus.
  const isInputFocused =
    (activeElement &&
      (activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.closest('[data-slate-editor="true"]') ||
        activeElement.closest(".text-editor-container") ||
        activeElement.closest(".monaco-editor") ||
        activeElement.closest(".editor-input"))) ||
    (event?.target instanceof HTMLElement &&
      (event.target.tagName === "INPUT" ||
        event.target.tagName === "TEXTAREA" ||
        event.target.closest(".MuiInputBase-input") ||
        event.target.closest(".MuiTextField-root")));

  if (isInputFocused) {
    // --- Input Focus Handling ---

    // 1. Always allow "shift+enter", "control+enter", and "meta+enter" to proceed to execution.
    //    These are commonly used for multiline input and running actions.
    //    (Add other universally allowed input combos here if needed)
    if (
      pressedKeysString === "shift+enter" ||
      pressedKeysString === "control+enter" ||
      pressedKeysString === "enter+meta"
    ) {
      // This combo is allowed, so we don't return early.
      // It will be handled by the execution logic below.
    } else {
      // 2. For any other combo, if it's a simple character key press,
      //    suppress the global combo to allow typing.
      const isSimpleTypingKey =
        event &&
        event.key.length === 1 && // e.g., "a", "F", " ", ","
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey; // Allows Shift+key for capitals/symbols.

      if (isSimpleTypingKey) {
        // This is a character like 'a', 'f', 'space', etc., intended for typing.
        // We return here, preventing the global combo's preventDefault and callback.
        // This allows the character to be typed into the input field.
        return;
      }

      // 3. For other combos that are not simple typing keys (e.g., Ctrl+S, function keys, Escape)
      //    or not explicitly allowed like "shift+enter":
      //    Generally, suppress these in inputs to avoid conflicts, especially in Slate.
      //    Slate editor handles its own shortcuts like Ctrl+B, Ctrl+I locally.
      //    If a global combo (e.g., a global Ctrl+F) is not handled by Slate internally,
      //    this logic will prevent it from firing when Slate (or other inputs) are focused.
      
      // Suppress global combos (including copy/cut/paste) when inputs are focused.
      // The browser's native clipboard handling will take care of text copy/cut/paste.
      // Allow Escape to proceed to close modals/editors.
      // Allow Delete and Backspace to proceed for deleting selected nodes.
      if (
        pressedKeysString !== "escape" &&
        pressedKeysString !== "delete" &&
        pressedKeysString !== "backspace"
      ) {
        return;
      }
    }
    // If we reach here while isInputFocused is true, it means the combo is "shift+enter",
    // "control+enter", "meta+enter" (or another combo explicitly designated to run in inputs).
  }

  // --- Execute The Combo ---
  // This part runs if:
  // - Not in an input field, OR
  // - In an input field AND it's an explicitly allowed combo (e.g., "shift+enter").
  if (options.preventDefault && event) {
    event.preventDefault();
  }
  
  // Execute the callback
  options.callback();
  
  // After executing a combo, clear non-modifier keys to prevent stuck keys
  // This is important because keyup events may not fire reliably, especially on macOS
  // when preventDefault is called or when system shortcuts are involved
  if (event) {
    const nonModifierKeys = Array.from(pressedKeys).filter(
      (key) => !["shift", "control", "alt", "meta"].includes(key)
    );
    if (nonModifierKeys.length > 0) {
      // Clear non-modifier keys after a short delay to allow the combo to complete
      setTimeout(() => {
        const keysToClear: Record<string, boolean> = {};
        nonModifierKeys.forEach((key) => {
          keysToClear[key] = false;
        });
        const { setKeysPressed } = useKeyPressedStore.getState();
        setKeysPressed(keysToClear);
      }, 50);
    }
  }
};

type KeyPressedState = {
  pressedKeys: Set<string>;
  lastPressedKey: string | null;
  keyPressCount: Record<string, number>;
  isPaused: boolean;
  setPaused: (paused: boolean) => void;
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
  isPaused: false,
  setPaused: (paused: boolean) => set({ isPaused: paused }),
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
            (newKeyPressCount[normalizedKey] ?? 0) + 1;
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

    const eventTarget = event.target as HTMLElement;
    const targetIsInput = eventTarget instanceof HTMLInputElement;
    const targetIsSelectHeader =
      eventTarget.classList?.contains("select-header");
    const targetIsSlateEditor = eventTarget.closest(
      '[data-slate-editor="true"]'
    );
    const targetIsLexicalEditor = eventTarget.closest(".text-editor-container");
    const targetIsMonacoEditor = eventTarget.closest(".monaco-editor");
    const targetIsTextarea = eventTarget instanceof HTMLTextAreaElement;

    if (
      targetIsInput ||
      targetIsSelectHeader ||
      targetIsSlateEditor ||
      targetIsLexicalEditor ||
      targetIsMonacoEditor ||
      targetIsTextarea
    ) {
      if (isPressed) {
        // KeyDown
        if (targetIsTextarea) {
          const isEventKeyAModifier = [
            "shift",
            "control",
            "alt",
            "meta"
          ].includes(normalizedKey);
          if (!isEventKeyAModifier) {
            // Allow modifier key combos (Ctrl+C, Cmd+V, etc.) to pass through
            // so the browser can handle native clipboard and other system shortcuts.
            const hasModifier = event.ctrlKey || event.metaKey;

            if (!hasModifier) {
              const isCombinationAllowed = ALLOWED_TEXTAREA_COMBOS.some(
                (combo) =>
                  event.key === combo.key &&
                  event.shiftKey === (combo.shiftKey || false) &&
                  event.ctrlKey === (combo.ctrlKey || false) &&
                  event.altKey === (combo.altKey || false) &&
                  event.metaKey === (combo.metaKey || false)
              );
              if (!isCombinationAllowed) {
                return; // Block unallowed keydown in textarea
              }
            }
          }
          // Allow modifier keydowns in textarea to be processed
        }
        // For other input types (HTMLInputElement, select-header, slate),
        // allow keydown to proceed to setKeysPressed.
        // The `executeComboCallbacks` function will be responsible for preventing
        // unwanted *combo execution* if an input is focused.
      }
      // For KeyUp (isPressed === false) from any input-like element,
      // we allow it to proceed to `setKeysPressed` to ensure the key state is cleared.
      // No 'return' here for keyup.
    }

    // Prevent key repeat events to avoid excessive state updates when a key is held down
    // Repeated `keydown` events (event.repeat === true) provide no additional information
    // for our pressed-key tracking, because we already set the key to "pressed" on the
    // first event.  Skipping the subsequent repeats dramatically reduces the number of
    // store updates while keys such as Control are held.
    if (isPressed && repeat) {
      return;
    }

    const { setKeysPressed } = useKeyPressedStore.getState();
    const keysToUpdate: Record<string, boolean> = {};

    // Track the actual key being pressed/released
    keysToUpdate[normalizedKey] = isPressed;

    // Always sync modifier keys from event properties to ensure accuracy
    // This is important because modifier keys can be pressed/released independently
    // and we need to track their actual state from the event
    keysToUpdate["shift"] = shiftKey;
    keysToUpdate["control"] = ctrlKey;
    keysToUpdate["alt"] = altKey;
    keysToUpdate["meta"] = metaKey;

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

const assistantCallback = () => {
  const { handleViewChange } = useRightPanelStore.getState();
  handleViewChange("assistant");
};

// Lower-case 'o'
registerComboCallback("o", {
  preventDefault: false,
  callback: assistantCallback
});

export {
  useKeyPressedStore,
  initKeyListeners,
  useCombo,
  registerComboCallback,
  unregisterComboCallback
};
