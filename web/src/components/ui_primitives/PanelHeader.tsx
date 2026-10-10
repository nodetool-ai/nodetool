/**
 * PanelHeader
 *
 * The title strip every docked or floating panel shares: side panels, bottom
 * panel views, editor sidebars and overlays. One height, one title style, one
 * divider, one action slot, so panels read as the same family wherever they
 * appear.
 *
 * Structure: [icon] title [count] [docs link] [controls …]   [actions] [close]
 */

import React, { memo } from "react";
import type { ReactNode } from "react";
import { useTheme } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";

import type { DocsTopic } from "../../config/docsLinks";
import { CloseButton } from "./CloseButton";
import { DocsHelpLink } from "./DocsHelpLink";
import { FlexRow } from "./FlexRow";
import { SPACING, getSpacingPx } from "./spacing";
import { CONTROL, TYPOGRAPHY } from "./tokens";
import { Tooltip } from "./Tooltip";

export interface PanelHeaderProps {
  /**
   * Panel name, in the sanctioned label style (13px / 500). Omit it only when
   * the host already names the panel, such as a tab strip above it.
   */
  title?: ReactNode;
  /** Optional leading icon, sized to the title. */
  icon?: ReactNode;
  /** Item count shown after the title in caption style. */
  count?: ReactNode;
  /** Short explanation shown when the title is hovered. */
  description?: string;
  /** Renders a documentation link beside the title. */
  docsTopic?: DocsTopic;
  /** Filters or other inline controls placed after the title. */
  children?: ReactNode;
  /** Right-aligned action buttons, usually `ToolbarIconButton`s. */
  actions?: ReactNode;
  /** Renders a close button at the far right when provided. */
  onClose?: () => void;
  /** Tooltip and accessible name of the close button. */
  closeLabel?: string;
  /** Draw the bottom divider. Defaults to true. */
  divider?: boolean;
  /** Heading element for the title. Defaults to `h2`. */
  component?: "h2" | "h3" | "h4" | "div" | "span";
  className?: string;
  sx?: SxProps<Theme>;
}

/** Fixed strip height, shared by every panel header. */
export const PANEL_HEADER_HEIGHT = CONTROL.height.lg;

/**
 * PanelHeader - title strip for panels
 *
 * @example
 * <PanelHeader title="Versions" count={12} onClose={close} />
 *
 * @example
 * <PanelHeader
 *   title="Workflows"
 *   docsTopic="workflows"
 *   actions={<ToolbarIconButton icon={<AddIcon />} tooltip="New workflow" />}
 * />
 */
export const PanelHeader: React.FC<PanelHeaderProps> = memo(
  function PanelHeader({
    title,
    icon,
    count,
    description,
    docsTopic,
    children,
    actions,
    onClose,
    closeLabel = "Close",
    divider = true,
    component = "h2",
    className,
    sx
  }) {
    const theme = useTheme();
    const TitleTag = component;
    const titleText = typeof title === "string" ? title : undefined;

    return (
      <FlexRow
        className={className ? `panel-header ${className}` : "panel-header"}
        align="center"
        gap={SPACING.sm}
        fullWidth
        sx={[
          {
            flexShrink: 0,
            minHeight: PANEL_HEADER_HEIGHT,
            boxSizing: "border-box",
            paddingInline: getSpacingPx(SPACING.lg),
            borderBottom: divider
              ? `1px solid ${theme.vars.palette.divider}`
              : "none",
            color: theme.vars.palette.text.secondary,
            userSelect: "none",
            "& .panel-header-icon": {
              display: "inline-flex",
              alignItems: "center",
              flexShrink: 0,
              "& svg": { fontSize: "var(--fontSizeNormal)" }
            },
            "& .panel-header-title": {
              ...TYPOGRAPHY.sans.label,
              margin: 0,
              minWidth: 0,
              color: theme.vars.palette.text.primary,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              cursor: "default"
            },
            "& .panel-header-count": {
              ...TYPOGRAPHY.sans.caption,
              flexShrink: 0,
              fontVariantNumeric: "tabular-nums",
              color: theme.vars.palette.text.secondary
            },
            "& .panel-header-actions": {
              marginLeft: "auto",
              flexShrink: 0
            }
          },
          ...(Array.isArray(sx) ? sx : sx ? [sx] : [])
        ]}
      >
        {icon && <span className="panel-header-icon">{icon}</span>}
        {title !== undefined && title !== null && (
          <Tooltip
            title={description ?? ""}
            disabled={!description}
            placement="bottom-start"
          >
            <TitleTag className="panel-header-title">{title}</TitleTag>
          </Tooltip>
        )}
        {count !== undefined && count !== null && (
          <span className="panel-header-count">{count}</span>
        )}
        {docsTopic && (
          <DocsHelpLink
            topic={docsTopic}
            label={titleText ?? "Help"}
            variant="label"
          />
        )}
        {children}
        {(actions || onClose) && (
          <FlexRow
            className="panel-header-actions"
            align="center"
            gap={SPACING.micro}
          >
            {actions}
            {onClose && (
              <CloseButton
                onClick={onClose}
                tooltip={closeLabel}
                buttonSize="small"
              />
            )}
          </FlexRow>
        )}
      </FlexRow>
    );
  }
);
