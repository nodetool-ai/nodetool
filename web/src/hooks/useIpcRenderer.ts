import { useContext, useEffect } from "react";
import { MenuContext } from "../providers/MenuProvider";

/**
 * Type definition for menu event handlers that process IPC messages from the Electron main process.
 */
type MenuEventHandler = (data: any) => void;

/**
 * Hook for registering handlers that respond to menu events from the Electron IPC system.
 * 
 * This hook enables communication between the Electron menu system and the React application.
 * Menu actions triggered in the native application menu are routed through IPC and can be
 * handled by components that register handlers using this hook.
 * 
 * @param handler - Callback function that processes incoming menu event data
 * 
 * @example
 * ```typescript
 * const handleMenuAction = useCallback((data: { action: string }) => {
 *   if (data.action === 'new-workflow') {
 *     createNewWorkflow();
 *   }
 * }, [createNewWorkflow]);
 * 
 * useMenuHandler(handleMenuAction);
 * ```
 * 
 * @see MenuContext - The React context that provides handler registration methods
 * @see https://www.electronjs.org/docs/latest/api/ipc-renderer - Electron IPC documentation
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
