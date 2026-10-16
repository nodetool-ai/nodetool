/**
 * Code
 *
 * Inline code: a command, a path, a flag, an identifier or a literal value
 * inside running text. Mono type at the size of the surrounding text, on a
 * quiet tinted chip. Use it instead of a bare `<code>` or a hand-set
 * `fontFamily2`. For several lines use `CodeBlock`.
 *
 * @example
 * <Text>Set <Code>NODETOOL_MCP=1</Code> and restart.</Text>
 */

import { forwardRef, memo } from "react";
import type { ReactNode } from "react";
import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { SPACING } from "./spacing";
import { BORDER_RADIUS, FONT_WEIGHT } from "./tokens";

export interface CodeProps {
  children: ReactNode;
  className?: string;
  /** Escape hatch for one-off layout. Keep type and colour on the defaults. */
  sx?: SxProps<Theme>;
}

const CodeInternal = forwardRef<HTMLElement, CodeProps>(function Code(
  { children, className, sx },
  ref
) {
  return (
    <Box
      ref={ref}
      component="code"
      className={className}
      sx={[
        (theme) => ({
          fontFamily: "var(--fontFamily2)",
          fontSize: "0.92em",
          fontWeight: FONT_WEIGHT.normal,
          color: theme.vars.palette.text.primary,
          backgroundColor: theme.vars.palette.action.hover,
          borderRadius: BORDER_RADIUS.xs,
          padding: `0 ${theme.spacing(SPACING.xs)}`,
          overflowWrap: "anywhere"
        }),
        ...(Array.isArray(sx) ? sx : [sx])
      ]}
    >
      {children}
    </Box>
  );
});

export const Code = memo(CodeInternal);
Code.displayName = "Code";
