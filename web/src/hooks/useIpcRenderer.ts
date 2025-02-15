import { useContext, useEffect } from "react";
import { MenuContext } from "../providers/MenuProvider";

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
