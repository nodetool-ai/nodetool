/** @jsxImportSource @emotion/react */
/**
 * CreateFab
 *
 * An extended Floating Action Button for create/add actions.
 * Used for creating new items like workflows, chats, folders, collections.
 *
 * @example
 * <CreateFab
 *   icon={<AddIcon />}
 *   label="New Workflow"
 *   onClick={handleCreate}
 * />
 */

import React, { forwardRef, memo } from "react";
import { useTranslation } from "react-i18next";
import { Fab, FabProps } from "@mui/material";
import { Tooltip } from "./Tooltip";
import AddIcon from "@mui/icons-material/AddOutlined";
import { useTheme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";
import { SHADOW } from "./tokens";

export interface CreateFabProps extends Omit<FabProps, "children"> {
  /**
   * The icon to display
   * @default <AddIcon />
   */
  icon?: React.ReactNode;
  /**
   * Label for extended variant
   */
  label?: string;
  /**
   * Tooltip text (used when label is not provided or for extended)
   */
  tooltip?: string;
  /**
   * Tooltip placement
   * @default "top"
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
   * Whether to add nodrag class for ReactFlow compatibility
   * @default true
   */
  nodrag?: boolean;
  /**
   * FAB color variant
   * @default "primary"
   */
  fabColor?: "primary" | "secondary" | "default";
}

/**
 * Extended Floating Action Button for create/add actions.
 * Renders as extended FAB when label is provided.
 */
export const CreateFab = memo(
  forwardRef<HTMLButtonElement, CreateFabProps>(
    (
      {
        icon = <AddIcon />,
        label,
        tooltip,
        tooltipPlacement = "top",
        nodrag = true,
        fabColor = "primary",
        className,
        sx,
        ...props
      },
      ref
    ) => {
      const theme = useTheme();
      const { t } = useTranslation();

      const tooltipText = tooltip ?? label ?? t("i18n-next95.createFab.tooltip");

      const getColorStyles = () => {
        switch (fabColor) {
          case "secondary":
            return {
              backgroundColor: theme.vars.palette.secondary.main,
              color: theme.vars.palette.grey[0],
              "&:hover": {
                backgroundColor: theme.vars.palette.secondary.dark
              }
            };
          case "default":
            return {
              backgroundColor: theme.vars.palette.grey[700],
              color: theme.vars.palette.grey[100],
              "&:hover": {
                backgroundColor: theme.vars.palette.grey[600]
              }
            };
          default:
            return {
              backgroundColor: "var(--palette-primary-main)",
              color: theme.vars.palette.grey[0],
              "&:hover": {
                backgroundColor: "var(--palette-primary-dark)"
              }
            };
        }
      };

      const colorStyles = getColorStyles();

      return (
        <Tooltip
          title={tooltipText}
          enterDelay={TOOLTIP_ENTER_DELAY}
          enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
          placement={tooltipPlacement}
        >
          <Fab
            ref={ref}
            className={cn(
              "create-fab",
              nodrag && editorClassNames.nodrag,
              className
            )}
            variant={label ? "extended" : "circular"}
            aria-label={tooltipText}
            sx={{
              ...colorStyles,
              textTransform: "none",
              fontWeight: 500,
              boxShadow: SHADOW(theme).md,
              "&:active": {
                boxShadow: SHADOW(theme).lg
              },
              ...sx
            }}
            {...props}
          >
            {icon}
            {label && (
              <span style={{ marginLeft: 8 }}>{label}</span>
            )}
          </Fab>
        </Tooltip>
      );
    }
  )
);

CreateFab.displayName = "CreateFab";
