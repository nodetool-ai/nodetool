import { createContext, useContext, useEffect, type ReactNode } from "react";
import { initKeyListeners } from "../stores/KeyPressedStore";

export const KeyboardContext = createContext<boolean>(false);

interface KeyboardProviderProps {
  children: ReactNode;
  active?: boolean;
}

export const KeyboardProvider = ({ children }: KeyboardProviderProps) => {
  useEffect(() => {
    const cleanup = initKeyListeners();
    return () => cleanup();
  }, []);

  return (
    <KeyboardContext.Provider value={true}>
      {children}
    </KeyboardContext.Provider>
  );
};

export default KeyboardProvider;
