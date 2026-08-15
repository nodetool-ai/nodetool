/**
 * ConnectedEditorActions — the trailing action cluster of the tool bar.
 *
 * A Generate button that opens the text-to-image form, a visible assistant
 * toggle, and an overflow menu for fit / hide panels plus any document
 * actions the host surface contributes via `menuItems`.
 *
 * Editor-shell convention: narrow store selectors only; the fit computation
 * reads and writes through getState() so the cluster gains no subscriptions on
 * the document or viewport.
 */

import React, { memo, useCallback, useRef, useState } from "react";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";

import {
  Divider,
  EditorButton,
  EditorMenu,
  EditorMenuItem,
  FlexRow,
  IconButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  BORDER_RADIUS
} from "../../ui_primitives";
import { useSketchStore, SKETCH_ZOOM_MIN, SKETCH_ZOOM_MAX } from "../state";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { ConnectedGeneratePopover } from "./ConnectedGeneratePopover";

export interface ConnectedEditorActionsProps {
  /** Compact buttons rendered inline before the menu (e.g. the asset tab's
   * Save to image / Done). Keep to one or two — everything else belongs in
   * `menuItems`. */
  inlineActions?: React.ReactNode;
  /** Host-supplied menu entries appended to the overflow menu. Receives the
   * menu's close callback so an item can dismiss it (or keep it open while a
   * follow-up popover of its own is anchored inside). Returns an array — MUI's
   * Menu rejects a Fragment child. */
  menuItems?: (close: () => void) => React.ReactNode[];
}

/** Zoom the document to fit the canvas region, with a small margin. */
function fitToViewport(): void {
  const root = globalThis.document;
  const region = root?.querySelector(".sketch-editor__canvas-region");
  if (!region) {
    return;
  }
  const rect = (region as HTMLElement).getBoundingClientRect();
  const store = useSketchStore.getState();
  const { width: docW, height: docH } = store.document.canvas;
  if (rect.width <= 0 || rect.height <= 0 || docW <= 0 || docH <= 0) {
    return;
  }
  const FIT_MARGIN = 0.9;
  const raw = Math.min(rect.width / docW, rect.height / docH) * FIT_MARGIN;
  const scale = Math.max(SKETCH_ZOOM_MIN, Math.min(SKETCH_ZOOM_MAX, raw));
  store.setZoom(scale);
  store.setPan({ x: 0, y: 0 });
}

export const ConnectedEditorActions = memo(function ConnectedEditorActions({
  inlineActions,
  menuItems
}: ConnectedEditorActionsProps) {
  const assistantPanelOpen = useSketchStore((s) => s.assistantPanelOpen);
  const toggleAssistantPanel = useSketchStore((s) => s.toggleAssistantPanel);
  const togglePanelsHidden = useSketchStore((s) => s.togglePanelsHidden);

  const documentId = useSketchSessionStore((s) => s.documentId);

  const generateAnchorRef = useRef<HTMLButtonElement>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  // The form fetches model options and holds the direct-gen job, so it stays
  // unmounted until first opened — then stays mounted so a half-typed prompt
  // survives closing the popover.
  const [generateMounted, setGenerateMounted] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const closeMenu = useCallback(() => setMenuAnchor(null), []);

  const handleAssistant = useCallback(() => {
    closeMenu();
    toggleAssistantPanel();
  }, [closeMenu, toggleAssistantPanel]);

  const handleFit = useCallback(() => {
    closeMenu();
    fitToViewport();
  }, [closeMenu]);

  const handleHidePanels = useCallback(() => {
    closeMenu();
    togglePanelsHidden();
  }, [closeMenu, togglePanelsHidden]);

  return (
    <FlexRow
      align="center"
      gap={0.5}
      className="tool-top-bar__global-actions"
      sx={{ ml: "auto", flexShrink: 0 }}
    >
      {inlineActions}

      {documentId && (
        <>
          <Tooltip title="Generate an image from a prompt">
            <span>
              <EditorButton
                ref={generateAnchorRef}
                variant="text"
                size="small"
                onClick={() => {
                  setGenerateMounted(true);
                  setGenerateOpen(true);
                }}
                startIcon={<AutoAwesomeIcon fontSize="small" />}
                data-testid="sketch-open-generate"
              >
                Generate
              </EditorButton>
            </span>
          </Tooltip>
          {generateMounted && (
            <ConnectedGeneratePopover
              open={generateOpen}
              anchorEl={generateAnchorRef.current}
              onClose={() => setGenerateOpen(false)}
            />
          )}
        </>
      )}

      <Tooltip
        title={assistantPanelOpen ? "Hide Assistant" : "Show Assistant"}
      >
        <IconButton
          size="small"
          onClick={handleAssistant}
          aria-label={
            assistantPanelOpen ? "Hide Assistant" : "Show Assistant"
          }
          aria-pressed={assistantPanelOpen}
          data-testid="sketch-assistant-toggle"
        >
          <SmartToyOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Tooltip title="Editor actions">
        <IconButton
          size="small"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          aria-label="Editor actions"
          aria-haspopup="menu"
          data-testid="sketch-editor-menu"
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <EditorMenu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={closeMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        paperSx={{ borderRadius: BORDER_RADIUS.lg, minWidth: 220 }}
      >
        <EditorMenuItem onClick={handleFit} data-testid="sketch-fit-view">
          <ListItemIcon>
            <FitScreenIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Fit to viewport</ListItemText>
        </EditorMenuItem>

        <EditorMenuItem
          onClick={handleHidePanels}
          data-testid="sketch-hide-panels"
        >
          <ListItemIcon>
            <ViewSidebarOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Hide panels</ListItemText>
        </EditorMenuItem>

        {menuItems ? <Divider key="host-divider" /> : null}
        {menuItems?.(closeMenu)}
      </EditorMenu>
    </FlexRow>
  );
});

export default ConnectedEditorActions;
