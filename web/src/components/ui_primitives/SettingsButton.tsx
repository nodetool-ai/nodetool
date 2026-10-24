/**
 * SettingsButton
 *
 * A standardized settings/config button.
 *
 * @example
 * <SettingsButton onClick={handleSettings} tooltip="Open settings" />
 */

import React, { memo, forwardRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@mui/material";
import { Tooltip } from "./Tooltip";
import SettingsIcon from "@mui/icons-material/Settings";
import TuneIcon from "@mui/icons-material/Tune";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import { useTheme, SxProps, Theme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";
import { iconButtonBoxSx } from "./ToolbarIconButton";

export interface SettingsButtonProps {
  /**
   * Click handler
   */
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /**
   * Tooltip text
   * @default "Settings"
   */
  tooltip?: string;
  /**
   * Tooltip placement
   * @default "bottom"
   */
  tooltipPlacement?:
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "bottom-end"
    | "bottom-start"
    | "left-end"
    | "left-start"
    | "right-end"
    | "right-start"
    | "top-end"
    | "top-start";
  /**
   * Button size
   * @default "small"
   */
  buttonSize?: "small" | "medium" | "large";
  /**
   * Icon variant
   * @default "settings"
   */
  iconVariant?: "settings" | "tune" | "moreVert" | "moreHoriz";
  /**
   * Whether to add nodrag class for ReactFlow compatibility
   * @default true
   */
  nodrag?: boolean;
  /**
   * Whether the button is disabled
   */
  disabled?: boolean;
  /**
   * Additional class name
   */
  className?: string;
  /**
   * Additional sx styles
   */
  sx?: SxProps<Theme>;
  /**
   * Tab index for keyboard navigation
   * @default 0
   */
  tabIndex?: number;
}

export const SettingsButton = memo(
  forwardRef<HTMLButtonElement, SettingsButtonProps>(
    (
      {
        onClick,
        tooltip,
        tooltipPlacement = "bottom",
        buttonSize = "small",
        iconVariant = "settings",
        nodrag = true,
        disabled = false,
        className,
        sx,
        tabIndex = 0
      },
      ref
    ) => {
      const theme = useTheme();
      const { t } = useTranslation();
      const resolvedTooltip = tooltip ?? t("i18n-next95.settingsButton.tooltip");

      const handleClick = useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          onClick(e);
        },
        [onClick]
      );

      const Icon =
        iconVariant === "tune"
          ? TuneIcon
          : iconVariant === "moreVert"
            ? MoreVertIcon
            : iconVariant === "moreHoriz"
              ? MoreHorizIcon
              : SettingsIcon;

      return (
        <Tooltip
          title={resolvedTooltip}
          enterDelay={TOOLTIP_ENTER_DELAY}
          enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
          placement={tooltipPlacement}
        >
          <span style={{ display: "inline-flex" }}>
          <IconButton
            ref={ref}
            tabIndex={tabIndex}
            className={cn(
              "settings-button",
              nodrag && editorClassNames.nodrag,
              className
            )}
            onClick={handleClick}
            disabled={disabled}
            size={buttonSize}
            aria-label={resolvedTooltip}
            sx={{
              ...iconButtonBoxSx(buttonSize),
              color: theme.vars.palette.text.secondary,
              "&:hover": {
                color: theme.vars.palette.text.primary,
                backgroundColor: theme.vars.palette.action.hover
              },
              ...sx
            }}
          >
            <Icon fontSize={buttonSize} />
          </IconButton>
          </span>
        </Tooltip>
      );
    }
  )
);

SettingsButton.displayName = "SettingsButton";
