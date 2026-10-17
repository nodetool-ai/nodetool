/** @jsxImportSource @emotion/react */
import { memo, type KeyboardEvent, type ReactNode } from "react";
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";

import { CollapsibleSection } from "./CollapsibleSection";
import { FlexColumn } from "./FlexColumn";
import { Tooltip } from "./Tooltip";
import { SPACING, getSpacingPx } from "./spacing";
import { BORDER_RADIUS, CONTROL, EYEBROW, FONT_SIZE_SANS, MOTION, TYPOGRAPHY } from "./tokens";

export interface InspectorSectionAction {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface InspectorSectionTitleProps {
  title: string;
  icon?: ReactNode;
  /**
   * Activation checkbox before the title: checking it toggles the section's
   * effect without expanding the fold. The title dims while unchecked.
   */
  checked?: boolean;
  onCheckedChange?: (next: boolean) => void;
  checkboxDisabled?: boolean;
  /**
   * Passive trailing readout, such as the current value the section edits
   * (a hex colour). Drawn in mono caption, not uppercased, before `action`.
   */
  meta?: ReactNode;
  /** Trailing action, such as reset to defaults. Half strength until hovered. */
  action?: InspectorSectionAction;
}

const titleStyles = (theme: Theme, dimmed: boolean) =>
  css({
    display: "flex",
    alignItems: "center",
    width: "100%",
    minWidth: 0,
    minHeight: CONTROL.height.xs,
    gap: getSpacingPx(SPACING.sm),
    ...EYEBROW,
    color: dimmed ? theme.vars.palette.text.disabled : theme.vars.palette.text.secondary,
    transition: `color ${MOTION.fast}`,
    "& .inspector-section-action": {
      opacity: 0.5,
      transition: `opacity ${MOTION.fast}`
    },
    "&:hover .inspector-section-action, & .inspector-section-action:focus-visible": {
      opacity: 1
    },
    "@media (hover: none)": {
      "& .inspector-section-action": { opacity: 1 }
    }
  });

const iconStyles = (theme: Theme) =>
  css({
    color: theme.vars.palette.text.secondary,
    display: "inline-flex",
    "& svg": { fontSize: FONT_SIZE_SANS.label }
  });

const metaStyles = (theme: Theme) =>
  css({
    ...TYPOGRAPHY.mono.caption,
    flexShrink: 0,
    textTransform: "none",
    letterSpacing: "normal",
    color: theme.vars.palette.text.secondary
  });

const textStyles = css({
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
});

/**
 * The checkbox keeps a small visual box (drawn by `::before`) inside a 24px
 * button, so the hit target meets the minimum without the header growing.
 * Negative margins stop the larger box from shifting the title.
 */
const CHECKBOX_BOX = 13;
const CHECKBOX_INSET = (CONTROL.height.xs - CHECKBOX_BOX) / 2;

const checkboxStyles = (theme: Theme, checked: boolean) =>
  css({
    position: "relative",
    width: CONTROL.height.xs,
    height: CONTROL.height.xs,
    margin: -CHECKBOX_INSET,
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    cursor: "pointer",
    border: "none",
    background: "transparent",
    color: theme.vars.palette.primary.contrastText,
    "&::before": {
      content: '""',
      position: "absolute",
      inset: CHECKBOX_INSET,
      boxSizing: "border-box",
      borderRadius: BORDER_RADIUS.xs,
      border: `1px solid ${checked ? theme.vars.palette.primary.main : theme.vars.palette.c_overlay_strong}`,
      backgroundColor: checked ? theme.vars.palette.primary.main : "transparent",
      transition: `background-color ${MOTION.fast}, border-color ${MOTION.fast}`
    },
    "&:hover::before": { borderColor: theme.vars.palette.primary.main },
    "&:focus-visible": { outline: "none" },
    "&:focus-visible::before": {
      boxShadow: `0 0 0 2px rgba(${theme.vars.palette.primary.mainChannel} / 0.35)`
    },
    "& svg": { position: "relative", fontSize: FONT_SIZE_SANS.caption }
  });

const actionStyles = (theme: Theme) =>
  css({
    width: CONTROL.height.xs,
    height: CONTROL.height.xs,
    flexShrink: 0,
    background: "transparent",
    border: "1px solid transparent",
    color: theme.vars.palette.text.secondary,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BORDER_RADIUS.sm,
    transition: `background-color ${MOTION.fast}, color ${MOTION.fast}`,
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      color: theme.vars.palette.text.primary
    },
    "&:focus-visible": { outline: "none", borderColor: theme.vars.palette.primary.main },
    "&:disabled": { opacity: 0.4, cursor: "default" },
    "& svg": { fontSize: FONT_SIZE_SANS.label }
  });

// The CollapsibleSection header toggles the fold on click and on Enter or
// Space, so controls inside the title stop those events from bubbling.
const stopKeyToggle = (event: KeyboardEvent) => {
  if (event.key === "Enter" || event.key === " ") {
    event.stopPropagation();
  }
};

/** Group label for a collapsible section in a properties panel. */
export const InspectorSectionTitle = memo(function InspectorSectionTitle({
  title, icon, checked, onCheckedChange, checkboxDisabled, meta, action
}: InspectorSectionTitleProps) {
  const theme = useTheme();
  const hasCheckbox = onCheckedChange !== undefined;
  return (
    <span css={titleStyles(theme, hasCheckbox && !checked)}>
      {hasCheckbox && (
        <button
          type="button"
          role="checkbox"
          aria-checked={!!checked}
          aria-label={`${title} enabled`}
          disabled={checkboxDisabled}
          css={checkboxStyles(theme, !!checked)}
          onClick={(event) => {
            event.stopPropagation();
            onCheckedChange(!checked);
          }}
          onKeyDown={stopKeyToggle}
        >
          {checked && <CheckRoundedIcon />}
        </button>
      )}
      {icon && <span css={iconStyles(theme)}>{icon}</span>}
      <span css={textStyles}>{title}</span>
      <span css={{ flex: "1 1 auto" }} />
      {meta !== undefined && meta !== null && (
        <span className="inspector-section-meta" css={metaStyles(theme)}>{meta}</span>
      )}
      {action && (
        <Tooltip title={action.label}>
          {/* The span keeps the tooltip working while the button is disabled. */}
          <span css={{ display: "inline-flex" }}>
            <button
              type="button"
              className="inspector-section-action"
              css={actionStyles(theme)}
              aria-label={action.label}
              disabled={action.disabled}
              onClick={(event) => {
                event.stopPropagation();
                action.onClick();
              }}
              onKeyDown={stopKeyToggle}
            >
              {action.icon}
            </button>
          </span>
        </Tooltip>
      )}
    </span>
  );
});

export interface InspectorSectionProps extends InspectorSectionTitleProps {
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  unmountOnExit?: boolean;
  /** Draw the divider above the section. Off for the first section in a panel. */
  divider?: boolean;
  className?: string;
}

/**
 * Collapsible group of rows in a properties panel: a divider, the shared
 * group label, and a body of rows aligned with the label.
 */
export const InspectorSection = memo(function InspectorSection({
  children, open, defaultOpen = true, onToggle, unmountOnExit, divider = true, className, ...titleProps
}: InspectorSectionProps) {
  return (
    <CollapsibleSection
      className={className}
      title={<InspectorSectionTitle {...titleProps} />}
      open={open}
      defaultOpen={defaultOpen}
      onToggle={onToggle}
      unmountOnExit={unmountOnExit}
      compact
      sx={{ width: "100%", minWidth: 0, borderTop: divider ? 1 : 0, borderColor: "divider", pt: SPACING.xs }}
    >
      <FlexColumn fullWidth gap={SPACING.xs} sx={{ minWidth: 0, pt: SPACING.micro, pb: SPACING.md }}>
        {children}
      </FlexColumn>
    </CollapsibleSection>
  );
});
