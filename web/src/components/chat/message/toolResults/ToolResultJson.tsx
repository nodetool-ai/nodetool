import React, { useMemo } from "react";

/** Pretty-prints arbitrary tool-result content as JSON. Fallback renderer. */
export const ToolResultJson: React.FC<{ value: unknown }> = React.memo(({ value }) => {
  const text = useMemo(() => {
    try {
      if (typeof value === "string") {
        return JSON.stringify(JSON.parse(value), null, 2);
      }
      return JSON.stringify(value, null, 2);
    } catch {
      return typeof value === "string" ? value : String(value);
    }
  }, [value]);
  return <pre className="pretty-json">{text}</pre>;
});
ToolResultJson.displayName = "ToolResultJson";
