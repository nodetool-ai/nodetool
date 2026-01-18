import { useContext, useEffect } from "react";
import { MenuContext } from "../providers/MenuProvider";

/**
 * Hook for registering menu event handlers.
 * 
 * Registers a callback to handle menu events from the MenuProvider.
 * The handler is automatically unregistered on unmount or when dependencies change.
 * 
 * @param handler - Function to handle menu events
 * @throws Error if used outside of MenuProvider
 * 
 * @example
 * ```typescript
 * useMenuHandler((data) => {
 *   console.log("Menu event:", data);
 *   // Handle menu action based on data
 * });
 * ```
 */
type MenuEventHandler = (data: any) => void;

export const useMenuHandler = (handler: MenuEventHandler) => {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error("useMenuHandler must be used within a MenuProvider");
  }

  useEffect(() => {
    context.registerHandler(handler);
    return () => {
      context.unregisterHandler(handler);
    };
  }, [handler, context]);
};
