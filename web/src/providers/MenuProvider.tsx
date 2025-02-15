import {
  createContext,
  ReactNode,
  useRef,
  useCallback,
  useEffect
} from "react";

type MenuEventHandler = (data: any) => void;

interface MenuContextType {
  registerHandler: (handler: MenuEventHandler) => void;
  unregisterHandler: (handler: MenuEventHandler) => void;
}

export const MenuContext = createContext<MenuContextType | null>(null);

export const MenuProvider = ({ children }: { children: ReactNode }) => {
  // Create a ref to store all handlers
  const handlers = useRef<Set<MenuEventHandler>>(new Set());

  // Single global event handler that dispatches to all registered handlers
  const globalHandler = useCallback((data: any) => {
    handlers.current.forEach((handler) => handler(data));
  }, []);

  // Set up the global handler on mount
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

  return (
    <MenuContext.Provider value={{ registerHandler, unregisterHandler }}>
      {children}
    </MenuContext.Provider>
  );
};
