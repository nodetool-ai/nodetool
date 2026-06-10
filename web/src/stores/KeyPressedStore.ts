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
import { useMemo, useEffect, useContext, useRef } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { KeyboardContext } from "../components/KeyboardProvider";
import { isEditableElement } from "../utils/browser";
import { usePanelStore } from "./PanelStore";

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

type ComboScope = "global" | "canvas";

interface ComboOptions {
  preventDefault?: boolean;
  callback?: () => void;
  active?: boolean;
  /**
   * Where the combo should fire.
   * - "canvas" (default): suppressed while typing in inputs/editors.
   * - "global": always fires regardless of focus (for app-wide shortcuts
   *   like the command menu).
   */
  scope?: ComboScope;
}

// Module-level variables and functions
type ComboRegistration = ComboOptions & { token: symbol };

// Each combo maps to a STACK of registrations rather than a single slot.
// Multiple components routinely bind the same combo (e.g. several modals, the
// node menu, and the toolbar all bind "escape"). With a single slot the last
// mount overwrote the earlier binding and the first UNMOUNT deleted the binding
// for everyone — so shortcuts intermittently stopped working. A stack lets the
// most-recently-registered active binding win (a focused modal shadows the
// background editor) while unmounting one binding leaves the others intact.
const comboCallbacks = new Map<string, ComboRegistration[]>();
let lastPointerDownWasCanvas = false;

const isWorkflowEditorElement = (node: Element | null | undefined): boolean =>
  node instanceof HTMLElement &&
  (node.classList.contains("react-flow__pane") ||
    node.closest(".react-flow__renderer") !== null ||
    node.closest("[data-workflow-editor]") !== null);

/**
 * Registers a combo handler and returns a disposer that removes exactly that
 * handler (by identity), regardless of what else registered the same combo in
 * the meantime. Prefer the returned disposer over {@link unregisterComboCallback}.
 */
const registerComboCallback = (
  combo: string,
  options: ComboOptions = {}
): (() => void) => {
  // Normalize 'ctrl' to 'control' for consistency
  const normalizedCombo = combo.replace(/\bctrl\b/g, "control");
  const registration: ComboRegistration = {
    ...options,
    token: Symbol(normalizedCombo)
  };
  const stack = comboCallbacks.get(normalizedCombo);
  if (stack) {
    stack.push(registration);
  } else {
    comboCallbacks.set(normalizedCombo, [registration]);
  }

  return () => {
    const current = comboCallbacks.get(normalizedCombo);
    if (!current) {
      return;
    }
    const index = current.findIndex((r) => r.token === registration.token);
    if (index !== -1) {
      current.splice(index, 1);
    }
    if (current.length === 0) {
      comboCallbacks.delete(normalizedCombo);
    }
  };
};

const unregisterComboCallback = (combo: string) => {
  // Back-compat helper: pops the most-recently-registered binding for the
  // combo. Precise removal should use the disposer from registerComboCallback.
  const normalizedCombo = combo.replace(/\bctrl\b/g, "control");
  const stack = comboCallbacks.get(normalizedCombo);
  if (!stack) {
    return;
  }
  stack.pop();
  if (stack.length === 0) {
    comboCallbacks.delete(normalizedCombo);
  }
};

// Resolve which binding handles a combo: the topmost (most recently registered)
// registration that is active and has a callback. Returns undefined when no
// binding should fire, letting default browser behavior proceed.
const resolveComboRegistration = (
  combo: string
): ComboRegistration | undefined => {
  const stack = comboCallbacks.get(combo);
  if (!stack) {
    return undefined;
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    const registration = stack[i];
    if (registration.callback && registration.active !== false) {
      return registration;
    }
  }
  return undefined;
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
  const options = resolveComboRegistration(pressedKeysString);

  if (!options) {
    // No active callback for this combo, or combo is inactive.
    // Default browser behavior (e.g., typing a character) will occur.
    return;
  }

  // An active callback exists for the pressed keys.
  // Now, check if we should suppress it due to input focus.
  
  const isInputFocused =
    isEditableElement(activeElement) ||
    (event?.target instanceof Element && isEditableElement(event.target));

  // Canvas focus = focus is somewhere inside the workflow editor *and not*
  // inside an editable child. Without the input-focus exclusion, a Lexical
  // editor (or any contentEditable) inside a node would still match
  // `.react-flow__renderer` via `closest()` and re-enable Backspace-to-delete
  // while the user is typing.
  const isCanvasFocused =
    !isInputFocused &&
    (lastPointerDownWasCanvas ||
      isWorkflowEditorElement(activeElement) ||
      (event?.target instanceof Element &&
        isWorkflowEditorElement(event.target)));

  if (isInputFocused && options.scope !== "global") {
    // --- Input Focus Handling ---
    // Combos registered with scope: "global" bypass this entirely and fire
    // regardless of focus. Everything else falls through the existing rules.

    // 1. Always allow "shift+enter", "control+enter", and "meta+enter" to proceed to execution.
    //    These are commonly used for multiline input and running actions.
    //    Note: pressedKeysString is sorted alphabetically, so the literals
    //    below must be in sorted form (e.g. "enter+shift", not "shift+enter").
    if (
      pressedKeysString === "enter+shift" ||
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
      // Allow Delete and Backspace ONLY if the canvas/editor is focused (not text inputs).
      const isDeleteOrBackspace =
        pressedKeysString === "delete" || pressedKeysString === "backspace";
      
      if (isDeleteOrBackspace && isCanvasFocused) {
        // Allow delete/backspace when canvas is focused to delete selected nodes
      } else if (pressedKeysString !== "escape") {
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
  options.callback?.();
  
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

      let anyKeyPressed = false;
      Object.entries(keys).forEach(([key, isPressed]) => {
        const normalizedKey = key.toLowerCase();

        if (isPressed) {
          anyKeyPressed = true;
          newPressedKeys.add(normalizedKey);
          lastPressedKey = normalizedKey;
          newKeyPressCount[normalizedKey] =
            (newKeyPressCount[normalizedKey] ?? 0) + 1;
        } else {
          newPressedKeys.delete(normalizedKey);
        }
      });

      // Only fire combo callbacks on key-down transitions. Otherwise releasing
      // a modifier while a non-modifier is still held (e.g. releasing Cmd
      // while "1" is held after Cmd+1) would shrink pressedKeys to {"1"} and
      // wrongly trigger the single-key "1" shortcut.
      if (anyKeyPressed) {
        executeComboCallbacks(newPressedKeys, event);
      }

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

// Ref-counted global key listeners. Multiple consumers call initKeyListeners
// (app bootstrap + every KeyboardProvider). A plain boolean guard let whichever
// consumer happened to "own" the listeners tear them down on unmount while other
// live consumers still needed them — globally killing keyboard handling. Ref-
// counting attaches on the first consumer and detaches only once the last one
// releases.
let listenerRefCount = 0;
let detachKeyListeners: (() => void) | null = null;

const releaseKeyListeners = () => {
  listenerRefCount = Math.max(0, listenerRefCount - 1);
  if (listenerRefCount === 0 && detachKeyListeners) {
    detachKeyListeners();
    detachKeyListeners = null;
  }
};

const initKeyListeners = () => {
  listenerRefCount += 1;
  // Listeners already attached for an earlier consumer — just hold a reference.
  if (detachKeyListeners) {
    return releaseKeyListeners;
  }

  const handleKeyChange = (event: KeyboardEvent, isPressed: boolean) => {
    const { key, shiftKey, ctrlKey, altKey, metaKey, repeat } = event;
    const normalizedKey = key.toLowerCase();

    const eventTarget =
      event.target instanceof Element ? event.target : null;
    const targetIsTextarea = eventTarget instanceof HTMLTextAreaElement;
    const targetIsMonaco =
      eventTarget instanceof HTMLElement &&
      eventTarget.closest(".monaco-editor") !== null;

    // For textareas and Monaco, block unallowed keydowns at the source so they
    // never reach setKeysPressed (and thus never fire any combo). This
    // preserves typing without polluting the global pressed-keys state. Other
    // editable targets (input, contentEditable) fall through; suppression is
    // handled inside executeComboCallbacks via isEditableElement().
    if (isPressed && (targetIsTextarea || targetIsMonaco)) {
      const isEventKeyAModifier = [
        "shift",
        "control",
        "alt",
        "meta"
      ].includes(normalizedKey);
      if (!isEventKeyAModifier) {
        // Allow modifier combos (Ctrl+C, Cmd+V, etc.) to pass through so the
        // browser can handle native clipboard and other system shortcuts.
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

  const handlePointerDown = (event: PointerEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const targetIsEditable = isEditableElement(target);
    lastPointerDownWasCanvas = !targetIsEditable && isWorkflowEditorElement(target);

    if (lastPointerDownWasCanvas && isEditableElement(document.activeElement)) {
      document.activeElement.blur();
    }
  };

  const clearAllKeys = () => {
    // Single atomic update: previously this iterated the snapshot and
    // issued one setKeysPressed per key, which fired combo callbacks
    // mid-clear and could leave modifiers "stuck" if the user released
    // them while the window had no focus.
    useKeyPressedStore.setState((state) => ({
      ...state,
      pressedKeys: new Set(),
      lastPressedKey: null
    }));
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("pointerdown", handlePointerDown, true);
  window.addEventListener("blur", clearAllKeys);
  window.addEventListener("focus", clearAllKeys);

  detachKeyListeners = () => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
    window.removeEventListener("pointerdown", handlePointerDown, true);
    window.removeEventListener("blur", clearAllKeys);
    window.removeEventListener("focus", clearAllKeys);
    lastPointerDownWasCanvas = false;
  };

  // Return a cleanup function that releases this consumer's reference.
  return releaseKeyListeners;
};

export const useKeyPressed = <T>(selector: (state: KeyPressedState) => T) =>
  useStoreWithEqualityFn(useKeyPressedStore, selector, shallow);

// Update useCombo to import KeyboardContext from new location
const useCombo = (
  combo: string[],
  callback: () => void,
  preventDefault: boolean = true,
  active: boolean = true,
  options?: { scope?: ComboScope }
) => {
  const keyboardActive = useContext(KeyboardContext);
  const scope = options?.scope;
  const memoizedCombo = useMemo(
    () =>
      combo
        .map((key) => key.toLowerCase())
        .sort()
        .join("+"),
    [combo]
  );

  // Keep the latest callback in a ref so an unstable (inline) callback does not
  // force re-registration on every render. The effect below registers once per
  // combo/active/scope change and always invokes the current callback.
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    // Only register if both the keyboard context and the hook's active prop are true
    if (!(keyboardActive && active)) {
      return;
    }
    return registerComboCallback(memoizedCombo, {
      callback: () => callbackRef.current(),
      preventDefault,
      active,
      scope
    });
  }, [memoizedCombo, preventDefault, active, keyboardActive, scope]);
};

const agentCallback = () => {
  const { handleViewChange } = usePanelStore.getState();
  handleViewChange("agent");
};

// Lower-case 'o' — toggles the left-panel Agent view.
registerComboCallback("o", {
  preventDefault: false,
  callback: agentCallback
});

export {
  useKeyPressedStore,
  initKeyListeners,
  useCombo,
  registerComboCallback,
  unregisterComboCallback
};
