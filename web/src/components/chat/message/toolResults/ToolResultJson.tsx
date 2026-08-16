import React, { useMemo } from "react";
import { isString } from "../../../../utils/typePredicates";

/** Pretty-prints arbitrary tool-result content as JSON. Fallback renderer. */
export const ToolResultJson: React.FC<{ value: unknown }> = React.memo(({ value }) => {
  const text = useMemo(() => {
    try {
      if (isString(value)) {
        return JSON.stringify(JSON.parse(value), null, 2);
      }
      return JSON.stringify(value, null, 2);
    } catch {
      return isString(value) ? value : String(value);
    }
  }, [value]);
  return <pre className="pretty-json">{text}</pre>;
});
ToolResultJson.displayName = "ToolResultJson";
