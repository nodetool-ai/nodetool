import type { Theme } from "@mui/material/styles";
import { getSpacingPx, SPACING } from "../ui_primitives";

// Returns CSS styles for Lexical code highlighting tokens using the provided theme.
export const codeHighlightTokenStyles = (theme: Theme) => ({
  ".editor-code": {
    backgroundColor: theme.vars.palette.grey[900],
    fontFamily: "JetBrains Mono, Consolas, 'Courier New', monospace",
    display: "block",
    padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.lg)}`,
    lineHeight: "1.53",
    fontSize: "var(--fontSizeSmall)",
    margin: `${getSpacingPx(SPACING.md)} 0`,
    borderRadius: "1em",
    tabSize: 2,
    overflow: "auto"
  },
  /* Minimal token colours (Prism Tomorrow Night) */
  ".token.comment, .token.prolog, .token.doctype, .token.cdata": {
    color: "#6A9955"
  },
  ".token.punctuation": { color: "#D4D4D4" },
  ".token.property, .token.tag, .token.constant, .token.symbol": {
    color: "#569CD6"
  },
  ".token.boolean, .token.number": { color: "#B5CEA8" },
  ".token.string, .token.char, .token.attr-value": {
    color: "#CE9178"
  },
  ".token.operator, .token.entity, .token.url": { color: "#D4D4D4" },
  ".token.keyword": { color: "#569CD6" },
  ".token.function, .token.class-name": { color: "#DCDCAA" },
  ".token.regex": { color: "#D16969" },
  ".token.important": { color: "#D7BA7D" },
  ".token.atrule, .token.attr-name, .token.selector": { color: "#C586C0" }
});
