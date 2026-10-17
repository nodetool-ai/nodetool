import { memo } from "react";

import { Box } from "./Box";
import { TYPOGRAPHY } from "./tokens";

/** Widest a read-only value runs before it ellipsizes (the full text is the tooltip). */
const STATIC_VALUE_MAX_WIDTH = 160;

export interface InspectorStaticValueProps {
  /** The value shown; also its native tooltip, since long values truncate. */
  value: string;
}

/**
 * Read-only mono value for an `InspectorFieldRow` that displays but does not
 * edit, such as a type or an id.
 *
 * @example
 * <InspectorFieldRow label="Type"><InspectorStaticValue value="video" /></InspectorFieldRow>
 */
export const InspectorStaticValue = memo(function InspectorStaticValue({
  value
}: InspectorStaticValueProps) {
  return (
    <Box
      component="span"
      className="inspector-static-value"
      title={value}
      sx={{
        ...TYPOGRAPHY.mono.code,
        color: "text.secondary",
        maxWidth: STATIC_VALUE_MAX_WIDTH,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }}
    >
      {value}
    </Box>
  );
});
