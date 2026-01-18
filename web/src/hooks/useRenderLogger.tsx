import { useRef, useMemo } from "react";
import { DEBUG_RENDER_LOGGING } from "../config/constants";
import log from "loglevel";

/**
 * Hook for debugging component re-renders during development.
 * 
 * Logs which dependencies triggered a re-render when DEBUG_RENDER_LOGGING
 * is enabled in config/constants.ts. Useful for performance optimization.
 * 
 * @param name - Identifier for the component being logged
 * @param dependencies - Object containing values to monitor for changes
 * 
 * @example
 * ```typescript
 * useRenderLogger("MyComponent", { 
 *   propA, 
 *   propB, 
 *   storeValue 
 * });
 * 
 * // Console output when propA changes:
 * // "MyComponent render triggered by: propA"
 * ```
 */
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
        log.info(
          `${name} render triggered by:`,
          changedDeps.map(([key]) => key).join(", ")
        );

        // Update the ref after logging changes
        prevDeps.current = dependencies;
      }
    }
  }, [dependencies, name]);
};
