import { createContext, useEffect, type ReactNode } from "react";
import { initKeyListeners } from "../stores/KeyPressedStore";

export const KeyboardContext = createContext<boolean>(false);

interface KeyboardProviderProps {
  children: ReactNode;
  active?: boolean;
}

export const KeyboardProvider = ({ children, active = true }: KeyboardProviderProps) => {
  useEffect(() => {
    if (!active) {
      return;
    }
    const cleanup = initKeyListeners();
    return () => cleanup();
  }, [active]);

  return (
    <KeyboardContext.Provider value={active}>
      {children}
    </KeyboardContext.Provider>
  );
};

export default KeyboardProvider;
