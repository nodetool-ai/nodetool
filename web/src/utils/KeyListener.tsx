import { useEffect, useCallback, useRef, useState } from "react";

const useKeyListener = (keyCombo: string, callback: () => void) => {
  const callbackRef = useRef(callback);
  const [keyActive, setKeyActive] = useState(false);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      const keys = keyCombo.split("+").map((k) => k.trim());
      const keyCheck = (key: string) => {
        switch (key) {
          case "Control":
            return e.ctrlKey;
          case "Shift":
            return e.shiftKey;
          case "Alt":
            return e.altKey;
          case "Meta":
            return e.metaKey; // Command key on macOS
          case "Space":
            return e.key === " ";
          case "Enter":
            return e.key === "Enter";
          default:
            return e.key ? e.key.toLowerCase() === key.toLowerCase() : false;
        }
      };

      const isExactCombo =
        keys.every(keyCheck) &&
        e.ctrlKey === keys.includes("Control") &&
        e.shiftKey === keys.includes("Shift") &&
        e.altKey === keys.includes("Alt") &&
        e.metaKey === keys.includes("Meta");

      if (isExactCombo && !keyActive) {
        callbackRef.current();
        setKeyActive(true);
      }
    },
    [keyCombo, keyActive]
  );

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    setKeyActive(false);
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return null;
};

export default useKeyListener;
