import { useRef, useMemo } from "react";

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
      console.log(
        `${name} render triggered by:`,
        changedDeps.map(([key]) => key).join(", ")
      );
    }

    prevDeps.current = dependencies;
  }, [dependencies, name]);
};
