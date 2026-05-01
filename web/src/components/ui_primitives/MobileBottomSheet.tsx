/**
 * MobileBottomSheet
 *
 * A bottom-anchored sheet for mobile viewports. Slides up from the bottom
 * edge, has rounded top corners, a drag-handle affordance, and an optional
 * header with a close button. Used to replace fixed side panels on small
 * screens where horizontal space is at a premium.
 */

import React, { memo } from "react";
import { SwipeableDrawer } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import { CloseButton } from "./CloseButton";
import { Text } from "./Text";
import { FlexRow } from "./FlexRow";

export interface MobileBottomSheetProps {
  /** Whether the sheet is open */
  open: boolean;
  /** Close handler — invoked when the user taps the scrim, swipes down, or hits the close button */
  onClose: () => void;
  /** Open handler — required by SwipeableDrawer for swipe-to-open; we disable discovery swipe below, so this is effectively a no-op */
  onOpen?: () => void;
  /** Optional title shown in the header row. If omitted, no header is rendered (sheet has just the drag handle and content). */
  title?: React.ReactNode;
  /** Optional secondary row under the title (e.g. a tab rail) */
  headerExtras?: React.ReactNode;
  /** Max height of the sheet. Accepts any CSS size value. */
  maxHeight?: string;
  /** Content rendered in the scrollable body area. */
  children: React.ReactNode;
  /** Set to false to hide the drag handle at the top */
  showDragHandle?: boolean;
  /** Set to false to hide the close button in the header row */
  showClose?: boolean;
  /** Optional ARIA label applied to the sheet container for screen readers */
  ariaLabel?: string;
}

const getSx = (theme: Theme, maxHeight: string): SxProps<Theme> => ({
  "& .MuiDrawer-paper": {
    maxHeight,
    height: "auto",
    borderTopLeftRadius: "16px",
    borderTopRightRadius: "16px",
    backgroundColor: theme.vars.palette.background.default,
    backgroundImage: "none",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.25)"
  },
  "& .sheet-drag-handle": {
    display: "flex",
    justifyContent: "center",
    padding: "8px 0 4px 0",
    flexShrink: 0,
    "&::after": {
      content: '""',
      display: "block",
      width: "40px",
      height: "4px",
      borderRadius: theme.rounded.xs,
      backgroundColor: theme.vars.palette.grey[600]
    }
  },
  "& .sheet-header": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px 8px 20px",
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    flexShrink: 0
  },
  "& .sheet-header-extras": {
    flexShrink: 0,
    borderBottom: `1px solid ${theme.vars.palette.divider}`
  },
  "& .sheet-body": {
    flex: 1,
    overflow: "auto",
    WebkitOverflowScrolling: "touch"
  }
});

const MobileBottomSheetInternal: React.FC<MobileBottomSheetProps> = ({
  open,
  onClose,
  onOpen,
  title,
  headerExtras,
  maxHeight = "80vh",
  children,
  showDragHandle = true,
  showClose = true,
  ariaLabel
}) => {
  const theme = useTheme();

  const handleOpen = React.useCallback(() => {
    onOpen?.();
  }, [onOpen]);

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={handleOpen}
      // Disable edge-swipe to open so it doesn't conflict with canvas gestures.
      disableSwipeToOpen
      disableDiscovery
      ModalProps={{ keepMounted: false }}
      sx={getSx(theme, maxHeight)}
      aria-label={ariaLabel}
    >
      {showDragHandle && (
        <div
          className="sheet-drag-handle"
          role="presentation"
          aria-hidden="true"
        />
      )}
      {title && (
        <FlexRow className="sheet-header" align="center">
          <Text size="big" weight={600} sx={{ lineHeight: 1.2 }}>
            {title}
          </Text>
          {showClose && (
            <CloseButton onClick={onClose} buttonSize="small" tooltip="Close" />
          )}
        </FlexRow>
      )}
      {headerExtras && <div className="sheet-header-extras">{headerExtras}</div>}
      <div className="sheet-body">{children}</div>
    </SwipeableDrawer>
  );
};

export const MobileBottomSheet = memo(MobileBottomSheetInternal);
