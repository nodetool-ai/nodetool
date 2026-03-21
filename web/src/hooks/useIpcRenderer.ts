import { useContext, useEffect } from "react";
import { MenuContext } from "../providers/MenuProvider";
import type { MenuEventData } from "../window.d";

type MenuEventHandler = (data: MenuEventData) => void;

export const useMenuHandler = (handler: MenuEventHandler) => {
  const context = useContext(MenuContext);

  useEffect(() => {
    if (!context) {
      return;
    }
    context.registerHandler(handler);
    return () => {
      context.unregisterHandler(handler);
    };
  }, [handler, context]);
};
