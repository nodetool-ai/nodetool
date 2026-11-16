/** Styles of the storyboard text editor: what each line and run looks like, by its parsed role. */
import type { Theme } from "@mui/material/styles";

import { EYEBROW, FONT_SIZE_MONO, FONT_WEIGHT, SPACING, TYPOGRAPHY } from "../../ui_primitives";

/** Size of a still's thumbnail under its line, in theme spacing units (16:9). */
export const STILL_THUMB_HEIGHT = 30;
export const STILL_THUMB_WIDTH = 53;

export const textStyles = (theme: Theme) => ({
  "& .sb-text": {
    outline: "none",
    caretColor: theme.vars.palette.primary.main,
    paddingBottom: theme.spacing(SPACING.xxxl),
    ...TYPOGRAPHY.sans.body,
    color: theme.vars.palette.text.primary
  },
  "& .sb-line": {
    position: "relative",
    paddingLeft: theme.spacing(SPACING.xxxl * 2),
    minHeight: "1.5em",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    borderLeft: "2px solid transparent"
  },
  "& .sb-line[data-role='blank']": { minHeight: "0.75em" },
  "& .sb-line[style*='--sb-mk']": { textIndent: "calc(var(--sb-mk) * -1ch - 0.28em)" },
  "& .sb-line[data-role='title']": { ...TYPOGRAPHY.sans.title, paddingBottom: theme.spacing(SPACING.sm) },
  "& .sb-line[data-role='act']": {
    ...TYPOGRAPHY.sans.title,
    marginTop: theme.spacing(SPACING.xl),
    paddingTop: theme.spacing(SPACING.lg),
    borderTop: `1px solid ${theme.vars.palette.divider}`
  },
  "& .sb-line[data-role='scene']": {
    ...EYEBROW,
    fontFamily: "var(--fontFamily2)",
    color: theme.vars.palette.text.secondary,
    marginTop: theme.spacing(SPACING.lg),
    paddingTop: theme.spacing(SPACING.md),
    paddingBottom: theme.spacing(SPACING.xs)
  },
  "& .sb-line[data-role='shot']": {
    fontWeight: FONT_WEIGHT.semibold,
    paddingTop: theme.spacing(SPACING.md),
    paddingBottom: theme.spacing(SPACING.micro)
  },
  "& .sb-line[data-role='shot']::before": {
    content: "attr(data-n)",
    position: "absolute",
    left: theme.spacing(SPACING.sm),
    textIndent: 0,
    fontFamily: "var(--fontFamily2)",
    fontSize: FONT_SIZE_MONO.label,
    color: theme.vars.palette.text.secondary,
    userSelect: "none"
  },
  "& .sb-line[data-role='field']": {
    paddingLeft: theme.spacing(SPACING.xxxl * 2 + SPACING.lg),
    textIndent: theme.spacing(-SPACING.lg)
  },
  "& .sb-line[data-role='cont']": { paddingLeft: theme.spacing(SPACING.xxxl * 2 + SPACING.lg) },
  "& .sb-line[data-key='brief'], & .sb-line[data-key='objective']": { color: theme.vars.palette.text.secondary },
  "& .sb-line[data-role='still'], & .sb-line[data-role='clip'], & .sb-line[data-role='stray']": {
    fontFamily: "var(--fontFamily2)",
    fontSize: FONT_SIZE_MONO.caption,
    color: theme.vars.palette.text.secondary
  },
  "& .sb-line[data-warn]": { borderLeftColor: theme.vars.palette.error.main },
  "& .sb-tk-syntax": { color: "transparent" },
  "& ::highlight(storyboard-assist)": { backgroundColor: theme.vars.palette.action.selected },
  // A still line shows its image (drawn by StoryboardMediaOverlay); its Markdown shows on the active line.
  "& .sb-line[data-role='still']": { paddingBottom: theme.spacing(STILL_THUMB_HEIGHT) },
  "& .sb-line[data-role='still']:not(.sb-active) .sb-tk-syntax": { fontSize: 0 },
  "& .sb-line[data-role='still']::before, & .sb-line[data-role='clip']::before": {
    content: "attr(data-role)",
    position: "absolute",
    left: theme.spacing(SPACING.sm),
    ...EYEBROW,
    fontFamily: "var(--fontFamily2)",
    color: theme.vars.palette.text.disabled,
    userSelect: "none"
  },
  "& .sb-tk-hidden, & .sb-tk-id": { fontSize: 0 },
  "& .sb-line.sb-active .sb-tk-syntax, & .sb-line.sb-active .sb-tk-hidden": { color: theme.vars.palette.text.disabled, fontSize: "inherit" },
  "& .sb-line.sb-active .sb-tk-id": { fontSize: FONT_SIZE_MONO.caption, fontFamily: "var(--fontFamily2)", color: theme.vars.palette.text.disabled },
  "& .sb-tk-label": { ...EYEBROW, fontFamily: "var(--fontFamily2)", color: theme.vars.palette.text.secondary },
  "& .sb-line[data-key='unknown'] .sb-tk-label": { color: theme.vars.palette.error.main },
  "& .sb-tk-bold": { fontWeight: FONT_WEIGHT.semibold },
  "& .sb-tk-italic": { fontStyle: "italic" },
  "& .sb-tk-entity, & .sb-tk-shotref": {
    whiteSpace: "nowrap",
    textIndent: 0,
    fontWeight: FONT_WEIGHT.medium,
    color: theme.vars.palette.primary.main,
    borderBottom: `1px solid ${theme.vars.palette.divider}`
  },
  "& .sb-tk-missing": { color: theme.vars.palette.error.main }
});

