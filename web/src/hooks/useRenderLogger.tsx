import { useRef, useMemo } from "react";
import { DEBUG_RENDER_LOGGING } from "../config/constants";
import { devLog } from "../utils/DevLog";

// Custom hook for logging render triggers
export const useRenderLogger = (
  name: string,
  dependencies: Record<string, any>
) => {
  const prevDeps = useRef(dependencies);

  return useMemo(() => {
    if (DEBUG_RENDER_LOGGING) {
      const changedDeps = Object.entries(dependencies).filter(
        ([key, value]) => prevDeps.current[key] !== value
      );

      if (changedDeps.length > 0) {
        devLog(
          `${name} render triggered by:`,
          changedDeps.map(([key]) => key).join(", ")
        );

        console.log(
          `${name} render triggered by:`,
          changedDeps.map(([key]) => key).join(", ")
        );

        // Update the ref after logging changes
        prevDeps.current = dependencies;
      }
    }
  }, [dependencies, name]);
};
