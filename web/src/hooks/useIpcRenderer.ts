import { useContext, useEffect } from "react";
import { MenuContext } from "../providers/MenuProvider";

type MenuEventHandler = (data: any) => void;

/**
 * Hook for registering menu event handlers within a MenuProvider context.
 * 
 * Allows components to receive menu events from the application menu system.
 * Automatically handles handler registration and cleanup on unmount.
 * 
 * @param handler - Callback function to handle menu events
 * @returns void
 * 
 * @example
 * ```typescript
 * useMenuHandler((data) => {
 *   if (data.action === "save") {
 *     saveWorkflow();
 *   }
 * });
 * ```
 */
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
