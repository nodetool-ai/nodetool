import { create } from "zustand";

type KeyPressedState = {
  pressedKeys: Set<string>;
  lastPressedKey: string | null;
  keyPressCount: Record<string, number>;
  setKeyPressed: (key: string, isPressed: boolean) => void;
  isKeyPressed: (key: string) => boolean;
  isAnyKeyPressed: () => boolean;
  getPressedKeys: () => string[];
  getKeyPressCount: (key: string) => number;
  resetKeyPressCount: (key?: string) => void;
};

const useKeyPressedStore = create<KeyPressedState>((set, get) => ({
  pressedKeys: new Set(),
  lastPressedKey: null,
  keyPressCount: {},
  setKeyPressed: (key: string, isPressed: boolean) =>
    set((state) => {
      const newPressedKeys = new Set(state.pressedKeys);
      const normalizedKey = key.toLowerCase();
      if (isPressed) {
        newPressedKeys.add(normalizedKey);
        return {
          pressedKeys: newPressedKeys,
          lastPressedKey: normalizedKey,
          keyPressCount: {
            ...state.keyPressCount,
            [normalizedKey]: (state.keyPressCount[normalizedKey] || 0) + 1
          }
        };
      } else {
        newPressedKeys.delete(normalizedKey);
        return {
          pressedKeys: newPressedKeys,
          lastPressedKey: newPressedKeys.size > 0 ? state.lastPressedKey : null
        };
      }
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
    })
}));

const initKeyListeners = () => {
  let lastKeyDownTime: Record<string, number> = {};

  const handleKeyChange = (event: KeyboardEvent, isPressed: boolean) => {
    const { key, shiftKey, ctrlKey, altKey, metaKey, repeat } = event;
    const normalizedKey = key.toLowerCase();

    // Prevent key repeat events
    if (isPressed && repeat) return;

    // Implement key-repeat throttling
    if (isPressed) {
      const now = Date.now();
      if (now - (lastKeyDownTime[normalizedKey] || 0) < 50) return; // 50ms throttle
      lastKeyDownTime[normalizedKey] = now;
    }

    const { setKeyPressed } = useKeyPressedStore.getState();
    setKeyPressed("shift", shiftKey);
    setKeyPressed("control", ctrlKey);
    setKeyPressed("alt", altKey);
    setKeyPressed("meta", metaKey);
    setKeyPressed(normalizedKey, isPressed);
  };

  const handleKeyDown = (event: KeyboardEvent) => handleKeyChange(event, true);
  const handleKeyUp = (event: KeyboardEvent) => handleKeyChange(event, false);

  const clearAllKeys = () => {
    const { pressedKeys, setKeyPressed } = useKeyPressedStore.getState();
    pressedKeys.forEach((key) => setKeyPressed(key, false));
    lastKeyDownTime = {};
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", clearAllKeys);
  window.addEventListener("focus", clearAllKeys);

  // Return a cleanup function
  return () => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
    window.removeEventListener("blur", clearAllKeys);
    window.removeEventListener("focus", clearAllKeys);
  };
};

export { useKeyPressedStore, initKeyListeners };
