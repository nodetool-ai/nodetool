/**
 * ShotHoverToolbar
 *
 * The actions that live on a shot's still and only appear under the pointer
 * (PRD § 7.4). The row sits top left: the drag grip first, then the card's
 * own actions (passed as children), then fullscreen. The rest
 * (render still, render clip, download, send to workflow, duplicate, delete)
 * sit behind one "Shot actions" menu, so a narrow card is not covered by a row of icons. The row
 * swallows clicks and keys before they reach the card and the board grid:
 * the card's click selects the shot, and the grid's arrow keys move between
 * shots, which would otherwise hijack the menu's own keyboard navigation.
 * The fullscreen viewer shows the same controls `inline`, as a group in its
 * own toolbar, for the shot on screen.
 */

import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import LastPageIcon from "@mui/icons-material/LastPage";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import DownloadIcon from "@mui/icons-material/Download";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import MoreVertIcon from "@mui/icons-material/MoreVert";

import { useInStudio } from "../../studio/StudioContext";
import { SendToWorkflowMenu } from "../workflows/SendToWorkflowMenu";
import {
  EditorMenu,
  FlexRow,
  FloatingToolbar,
  MenuItemPrimitive,
  ToolbarIconButton,
  SPACING
} from "../ui_primitives";
import type { WorkflowMediaItem } from "../../hooks/handlers/useGenerationToCanvas";

interface ShotHoverToolbarProps {
  /**
   * Renders the controls as a group inside a toolbar that is always on screen
   * (the fullscreen viewer's), without a surface of its own, rather than as a
   * card's hover row.
   */
  inline?: boolean;
  /** Shown when the card is draggable; the card itself carries the drag. */
  showDragHandle?: boolean;
  /** Opens the fullscreen viewer. Omitted when the shot has no media yet. */
  onFullscreen?: (event: React.SyntheticEvent) => void;
  /** "View clip fullscreen" or "View still fullscreen" — what is on the card. */
  fullscreenLabel?: string;
  /** Opens the still render dialog, where the model is picked. */
  onRenderStill?: () => void;
  /** Opens the clip render dialog, where the model is picked. */
  onRenderClip?: () => void;
  /** Disables both render items while the shot is rendering. */
  renderDisabled?: boolean;
  /** Takes the previous shot's last frame as this shot's still. */
  useLastFrame?: { label: string; disabled: boolean; onSelect: () => void };
  /** Saves the still or clip. Omitted while there is nothing to save. */
  onDownload?: () => void;
  /** What the download saves, for the menu label: "still" or "clip". */
  downloadLabel?: string;
  /** The still and clip a workflow can take. Empty or omitted hides the item. */
  sendToWorkflowItems?: readonly WorkflowMediaItem[];
  onDuplicate?: () => void;
  /**
   * Moves the shot one place within its scene. The menu is where people look
   * for a reorder before they find the drag grip, which a tall card can hold
   * above the window.
   */
  move?: {
    earlierDisabled: boolean;
    laterDisabled: boolean;
    onEarlier: () => void;
    onLater: () => void;
  };
  onDelete?: () => void;
  /** The card's own actions, placed after the drag grip. */
  children?: React.ReactNode;
}

/** Hidden until the card is hovered or focused; always on for touch. */
const rowSx = {
  position: "absolute",
  top: SPACING.xs,
  left: SPACING.xs,
  opacity: 0,
  ".shot-card:hover &": { opacity: 1 },
  "&:focus-within": { opacity: 1 },
  // Touch devices cannot hover; keep the actions reachable.
  "@media (pointer: coarse)": { opacity: 1 }
} as const;

/** A menu anchored to the row must not lose its anchor when the pointer leaves. */
const pinnedRowSx = { ...rowSx, opacity: 1 } as const;

const iconSx = { fontSize: "1em" } as const;

/** Selecting the shot is the card's click. These are their own actions. */
const swallowEvent = (event: React.SyntheticEvent): void => {
  event.stopPropagation();
};

export const ShotHoverToolbar: React.FC<ShotHoverToolbarProps> = ({
  inline,
  showDragHandle,
  onFullscreen,
  fullscreenLabel,
  onRenderStill,
  onRenderClip,
  renderDisabled,
  useLastFrame,
  onDownload,
  downloadLabel,
  sendToWorkflowItems,
  onDuplicate,
  move,
  onDelete,
  children
}) => {
  const { t } = useTranslation();
  const inStudio = useInStudio();
  const [moreButton, setMoreButton] = useState<HTMLButtonElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeSend = useCallback(() => setSendOpen(false), []);
  const runAndClose = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };
  const openSend = useCallback(() => {
    setMenuOpen(false);
    setSendOpen(true);
  }, []);

  const sendItems =
    !inStudio && sendToWorkflowItems?.length ? sendToWorkflowItems : null;
  const hasRender = Boolean(onRenderStill || onRenderClip || useLastFrame);
  const hasMenu = Boolean(
    hasRender || onDownload || sendItems || onDuplicate || move || onDelete
  );
  // A row with nothing in it would still catch the eye as a scrim on hover.
  if (!showDragHandle && !children && !onFullscreen && !hasMenu) {
    return null;
  }
  const what =
    downloadLabel === "clip"
      ? t("screens4_17.storyboard.shotHoverToolbar.media.clip")
      : t("screens4_17.storyboard.shotHoverToolbar.media.still");
  const translatedFullscreenLabel = fullscreenLabel
    ?.toLowerCase()
    .includes("clip")
    ? t("screens4_17.storyboard.shotHoverToolbar.viewClipFullscreen")
    : fullscreenLabel?.toLowerCase().includes("still")
      ? t("screens4_17.storyboard.shotHoverToolbar.viewStillFullscreen")
      : fullscreenLabel;
  const rowProps = {
    onClick: swallowEvent,
    onKeyDown: swallowEvent,
    "data-testid": "shot-hover-toolbar"
  };
  const content = (
    <>
      {showDragHandle && (
        // A grip, not a control: the drag lives on the card, so a button here
        // would be a tab stop that does nothing.
        <FlexRow
          align="center"
          aria-hidden
          data-testid="shot-drag-handle"
          sx={{ cursor: "grab", color: "text.secondary" }}
        >
          <DragIndicatorIcon sx={iconSx} />
        </FlexRow>
      )}
      {children}
      {onFullscreen && (
        <ToolbarIconButton
          icon={<FullscreenIcon sx={iconSx} />}
          tooltip={t(
            "screens4_17.storyboard.shotHoverToolbar.viewFullscreenTooltip"
          )}
          ariaLabel={translatedFullscreenLabel}
          onClick={onFullscreen}
        />
      )}
      {hasMenu && (
        <ToolbarIconButton
          ref={setMoreButton}
          icon={<MoreVertIcon sx={iconSx} />}
          tooltip={t("screens4_17.storyboard.shotHoverToolbar.actions")}
          ariaLabel={t("screens4_17.storyboard.shotHoverToolbar.actions")}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={openMenu}
        />
      )}
      <EditorMenu
        anchorEl={moreButton}
        open={menuOpen}
        onClose={closeMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          list: {
            "aria-label": t("screens4_17.storyboard.shotHoverToolbar.actions")
          }
        }}
      >
        {onRenderStill && (
          <MenuItemPrimitive
            label={t("screens4_17.storyboard.shotHoverToolbar.renderStill")}
            icon={<ImageOutlinedIcon fontSize="small" />}
            disabled={renderDisabled}
            onClick={runAndClose(onRenderStill)}
          />
        )}
        {onRenderClip && (
          <MenuItemPrimitive
            label={t("screens4_17.storyboard.shotHoverToolbar.renderClip")}
            icon={<MovieOutlinedIcon fontSize="small" />}
            disabled={renderDisabled}
            onClick={runAndClose(onRenderClip)}
          />
        )}
        {useLastFrame && (
          <MenuItemPrimitive
            label={useLastFrame.label}
            icon={<LastPageIcon fontSize="small" />}
            disabled={useLastFrame.disabled}
            onClick={runAndClose(useLastFrame.onSelect)}
          />
        )}
        {onDownload && (
          <MenuItemPrimitive
            dividerBefore={hasRender}
            label={t("screens4_17.storyboard.shotHoverToolbar.download", {
              media: what
            })}
            icon={<DownloadIcon fontSize="small" />}
            onClick={runAndClose(onDownload)}
          />
        )}
        {sendItems && (
          <MenuItemPrimitive
            dividerBefore={hasRender && !onDownload}
            label={t("screens4_17.storyboard.shotHoverToolbar.sendToWorkflow")}
            icon={<AccountTreeOutlinedIcon fontSize="small" />}
            onClick={openSend}
          />
        )}
        {onDuplicate && (
          <MenuItemPrimitive
            dividerBefore={hasRender && !onDownload && !sendItems}
            label={t("screens4_17.storyboard.shotHoverToolbar.duplicateShot")}
            icon={<ContentCopyIcon fontSize="small" />}
            onClick={runAndClose(onDuplicate)}
          />
        )}
        {move && (
          <MenuItemPrimitive
            dividerBefore={
              (hasRender || Boolean(onDownload || sendItems)) && !onDuplicate
            }
            label={t("screens4_17.storyboard.shotHoverToolbar.moveEarlier")}
            icon={<ArrowBackIcon fontSize="small" />}
            disabled={move.earlierDisabled}
            onClick={runAndClose(move.onEarlier)}
          />
        )}
        {move && (
          <MenuItemPrimitive
            label={t("screens4_17.storyboard.shotHoverToolbar.moveLater")}
            icon={<ArrowForwardIcon fontSize="small" />}
            disabled={move.laterDisabled}
            onClick={runAndClose(move.onLater)}
          />
        )}
        {onDelete && (
          <MenuItemPrimitive
            color="error"
            dividerBefore={Boolean(
              hasRender || onDownload || sendItems || onDuplicate || move
            )}
            label={t("screens4_17.storyboard.shotHoverToolbar.deleteShot")}
            icon={<DeleteOutlineIcon fontSize="small" />}
            onClick={runAndClose(onDelete)}
          />
        )}
      </EditorMenu>
      {sendOpen && sendItems && (
        <SendToWorkflowMenu
          items={sendItems}
          anchorEl={moreButton}
          onClose={closeSend}
        />
      )}
    </>
  );
  // The viewer's toolbar is the surface; a second one inside it would read as
  // a separate bar.
  return inline ? (
    <FlexRow
      {...rowProps}
      role="group"
      aria-label={t("screens4_17.storyboard.shotHoverToolbar.actions")}
      align="center"
      gap={SPACING.xs}
      sx={{ flexShrink: 0 }}
    >
      {content}
    </FlexRow>
  ) : (
    <FloatingToolbar
      {...rowProps}
      sx={menuOpen || sendOpen ? pinnedRowSx : rowSx}
    >
      {content}
    </FloatingToolbar>
  );
};

export default ShotHoverToolbar;
