/**
 * ListGroup & ListItemRow Components
 *
 * Semantic list primitives wrapping MUI List/ListItem/ListItemText/ListItemButton.
 * Provides a simplified API for common list patterns.
 */

import React, { memo } from "react";
import {
  List,
  ListProps,
  ListItem,
  ListItemProps,
  ListItemText,
  ListItemButton,
  ListItemIcon
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { SxProps, Theme } from "@mui/material";
import { focusRing, selectableRowStyles, selectedRowStyles } from "./selectionStyles";
import { TYPOGRAPHY } from "./tokens";

// --- ListGroup ---

export interface ListGroupProps extends Omit<ListProps, "dense"> {
  /** Compact spacing between items */
  compact?: boolean;
  /** Remove default padding */
  flush?: boolean;
}

/**
 * ListGroup - A semantic list container
 *
 * @example
 * // Basic list
 * <ListGroup>
 *   <ListItemRow primary="Item 1" />
 *   <ListItemRow primary="Item 2" />
 * </ListGroup>
 *
 * @example
 * // Compact flush list
 * <ListGroup compact flush>
 *   <ListItemRow primary="Dense item" secondary="Details" />
 * </ListGroup>
 */
const ListGroupInternal: React.FC<ListGroupProps> = ({
  compact = false,
  flush = false,
  sx,
  children,
  ...props
}) => {
  return (
    <List
      dense={compact}
      disablePadding={flush}
      sx={sx}
      {...props}
    >
      {children}
    </List>
  );
};

export const ListGroup = memo(ListGroupInternal);

// --- ListItemRow ---

export interface ListItemRowProps extends Omit<ListItemProps, "button"> {
  /** Primary text content */
  primary?: React.ReactNode;
  /** Secondary text content */
  secondary?: React.ReactNode;
  /** Icon to show at the start */
  icon?: React.ReactNode;
  /** Make the item clickable */
  onClick?: () => void;
  /** Selected state for clickable items */
  selected?: boolean;
  /** Disables a clickable item */
  disabled?: boolean;
  /** Additional sx for the text element */
  textSx?: SxProps<Theme>;
  /** Layout overrides for the button of a clickable item (padding, gap) */
  buttonSx?: SxProps<Theme>;
}

/**
 * ListItemRow - A single list item with optional icon, text, and click behavior
 *
 * @example
 * // Simple text item
 * <ListItemRow primary="Settings" secondary="Configure your preferences" />
 *
 * @example
 * // Clickable item with icon
 * <ListItemRow
 *   icon={<FolderIcon />}
 *   primary="Documents"
 *   secondary="12 files"
 *   onClick={handleOpen}
 *   selected={isSelected}
 * />
 *
 * @example
 * // Custom children (no primary/secondary)
 * <ListItemRow>
 *   <CustomContent />
 * </ListItemRow>
 */
const ListItemRowInternal: React.FC<ListItemRowProps> = ({
  primary,
  secondary,
  icon,
  onClick,
  selected = false,
  disabled = false,
  textSx,
  buttonSx,
  children,
  sx,
  ...props
}) => {
  const theme = useTheme();

  const content = (
    <>
      {icon && <ListItemIcon sx={{ minWidth: 36 }}>{icon}</ListItemIcon>}
      {(primary || secondary) && (
        <ListItemText
          primary={primary}
          secondary={secondary}
          sx={textSx}
          slotProps={{
            primary: { sx: TYPOGRAPHY.sans.label },
            secondary: {
              sx: {
                ...TYPOGRAPHY.sans.caption,
                color: theme.vars.palette.text.secondary
              }
            }
          }}
        />
      )}
      {children}
    </>
  );

  if (onClick) {
    return (
      <ListItem disablePadding sx={sx} {...props}>
        <ListItemButton
          onClick={onClick}
          selected={selected}
          disabled={disabled}
          sx={[
            {
              ...selectableRowStyles(theme, { selected }),
              "&.Mui-selected": selectedRowStyles(theme),
              "&.Mui-focusVisible": focusRing(theme)
            },
            ...(Array.isArray(buttonSx) ? buttonSx : buttonSx ? [buttonSx] : [])
          ]}
        >
          {content}
        </ListItemButton>
      </ListItem>
    );
  }

  return (
    <ListItem sx={sx} {...props}>
      {content}
    </ListItem>
  );
};

export const ListItemRow = memo(ListItemRowInternal);
