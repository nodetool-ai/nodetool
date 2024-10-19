import { useRef, useMemo } from "react";
import { devLog } from "../utils/DevLog";

// Custom hook for logging render triggers
export const useRenderLogger = (
  name: string,
  dependencies: Record<string, any>
) => {
  const prevDeps = useRef(dependencies);

  return useMemo(() => {
    const changedDeps = Object.entries(dependencies).filter(
      ([key, value]) => prevDeps.current[key] !== value
    );

    if (changedDeps.length > 0) {
      devLog(
        `${name} render triggered by:`,
        changedDeps.map(([key]) => key).join(", ")
      );
    }

    prevDeps.current = dependencies;
  }, [dependencies, name]);
};
