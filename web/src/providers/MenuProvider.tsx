import {
  createContext,
  ReactNode,
  useRef,
  useCallback,
  useEffect,
  useMemo
} from "react";
import type { MenuEventData } from "../window";

// MenuProvider exposes a simple pub/sub mechanism for Electron menu events.
// Components can register handlers to respond to menu actions emitted from the
// main process via `window.api`.

type MenuEventHandler = (data: MenuEventData) => void;

interface MenuContextType {
  registerHandler: (handler: MenuEventHandler) => void;
  unregisterHandler: (handler: MenuEventHandler) => void;
}

export const MenuContext = createContext<MenuContextType | null>(null);

export const MenuProvider = ({ children }: { children: ReactNode }) => {
  const handlers = useRef<Set<MenuEventHandler>>(new Set());

  const globalHandler = useCallback((data: MenuEventData) => {
    handlers.current.forEach((handler) => handler(data));
  }, []);

  useEffect(() => {
    if (window.api) {
      window.api.onMenuEvent(globalHandler);
      return () => window.api.unregisterMenuEvent(globalHandler);
    }
  }, [globalHandler]);

  const registerHandler = useCallback((handler: MenuEventHandler) => {
    handlers.current.add(handler);
  }, []);

  const unregisterHandler = useCallback((handler: MenuEventHandler) => {
    handlers.current.delete(handler);
  }, []);

  const contextValue = useMemo(
    () => ({ registerHandler, unregisterHandler }),
    [registerHandler, unregisterHandler]
  );

  return (
    <MenuContext.Provider value={contextValue}>
      {children}
    </MenuContext.Provider>
  );
};
