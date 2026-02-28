/**
 * SettingsButton
 *
 * A standardized settings/config button.
 *
 * @example
 * <SettingsButton onClick={handleSettings} tooltip="Open settings" />
 */

import React, { memo, forwardRef, useCallback } from "react";
import { IconButton, Tooltip } from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import TuneIcon from "@mui/icons-material/Tune";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import { useTheme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

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
  sx?: object;
}

export const SettingsButton = memo(
  forwardRef<HTMLButtonElement, SettingsButtonProps>(
    (
      {
        onClick,
        tooltip = "Settings",
        tooltipPlacement = "bottom",
        buttonSize = "small",
        iconVariant = "settings",
        nodrag = true,
        disabled = false,
        className,
        sx
      },
      ref
    ) => {
      const theme = useTheme();

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
          title={tooltip}
          enterDelay={TOOLTIP_ENTER_DELAY}
          enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
          placement={tooltipPlacement}
        >
          <IconButton
            ref={ref}
            tabIndex={-1}
            className={cn(
              "settings-button",
              nodrag && editorClassNames.nodrag,
              className
            )}
            onClick={handleClick}
            disabled={disabled}
            size={buttonSize}
            aria-label={tooltip}
            sx={{
              color: theme.vars.palette.grey[300],
              "&:hover": {
                color: theme.vars.palette.grey[100],
                backgroundColor: "rgba(255, 255, 255, 0.08)"
              },
              ...sx
            }}
          >
            <Icon fontSize={buttonSize} />
          </IconButton>
        </Tooltip>
      );
    }
  )
);

SettingsButton.displayName = "SettingsButton";
