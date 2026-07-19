/**
 * Deliberate zero-opinion pass-through, not a styled primitive: Box is the
 * import-policy shim that lets app code stay off `@mui/material` (the
 * primitives-first rule) while keeping MUI's layout workhorse. Prefer
 * FlexRow/FlexColumn when their shorthand props fit.
 */
export { Box } from "@mui/material";
export type { BoxProps } from "@mui/material";
