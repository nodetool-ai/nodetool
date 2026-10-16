/**
 * CodeBlock
 *
 * A block of preformatted text: tool arguments, a stack trace, a JSON result,
 * a script body. Mono type on the default background with a hairline border,
 * wrapping long lines and scrolling past `maxHeight`. An optional header
 * carries the language and a copy button.
 *
 * Plain text only. Syntax highlighting, SVG preview and "insert into editor"
 * stay in the chat markdown renderer (`chat/message/markdown_elements`), which
 * is a separate, richer component.
 *
 * @example
 * <CodeBlock>{JSON.stringify(args, null, 2)}</CodeBlock>
 * <CodeBlock language="js" copyable tone="error">{stack}</CodeBlock>
 */

import { forwardRef, memo } from "react";
import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { CopyButton } from "./CopyButton";
import { FlexRow } from "./FlexRow";
import { SPACING } from "./spacing";
import { BORDER_RADIUS, TYPOGRAPHY } from "./tokens";

export interface CodeBlockProps {
  /** The text to show, verbatim. */
  children: string;
  /** Shown in the header, lowercase. */
  language?: string;
  /** Adds a copy button to the header. */
  copyable?: boolean;
  /** `error` tints the text for a failure message. */
  tone?: "default" | "error";
  /** Scroll past this height. Any CSS length, e.g. `"20rem"`. */
  maxHeight?: string;
  /** Wrap long lines (default). Off keeps lines intact and scrolls sideways. */
  wrap?: boolean;
  className?: string;
  sx?: SxProps<Theme>;
}

const CodeBlockInternal = forwardRef<HTMLDivElement, CodeBlockProps>(
  function CodeBlock(
    {
      children,
      language,
      copyable = false,
      tone = "default",
      maxHeight = "20rem",
      wrap = true,
      className,
      sx
    },
    ref
  ) {
    const hasHeader = Boolean(language) || copyable;
    return (
      <Box
        ref={ref}
        className={className}
        sx={[
          (theme) => ({
            minWidth: 0,
            maxWidth: "100%",
            border: `1px solid ${theme.vars.palette.divider}`,
            borderRadius: BORDER_RADIUS.sm,
            backgroundColor: theme.vars.palette.background.default,
            overflow: "hidden"
          }),
          ...(Array.isArray(sx) ? sx : [sx])
        ]}
      >
        {hasHeader && (
          <FlexRow
            align="center"
            justify="space-between"
            gap={SPACING.md}
            sx={(theme) => ({
              px: SPACING.md,
              py: SPACING.xs,
              borderBottom: `1px solid ${theme.vars.palette.divider}`,
              color: theme.vars.palette.text.secondary,
              ...TYPOGRAPHY.mono.caption,
              textTransform: "lowercase"
            })}
          >
            <span>{language ?? ""}</span>
            {copyable && <CopyButton value={children} />}
          </FlexRow>
        )}
        <Box
          component="pre"
          sx={(theme) => ({
            ...TYPOGRAPHY.mono.code,
            margin: 0,
            padding: theme.spacing(SPACING.md, SPACING.lg),
            boxSizing: "border-box",
            color:
              tone === "error"
                ? theme.vars.palette.error.main
                : theme.vars.palette.text.primary,
            whiteSpace: wrap ? "pre-wrap" : "pre",
            wordBreak: wrap ? "break-word" : "normal",
            maxHeight,
            overflow: "auto",
            tabSize: 2
          })}
        >
          {children}
        </Box>
      </Box>
    );
  }
);

export const CodeBlock = memo(CodeBlockInternal);
CodeBlock.displayName = "CodeBlock";
