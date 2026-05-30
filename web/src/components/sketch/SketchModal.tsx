/**
 * SketchModal
 *
 * Fullscreen modal wrapper for the SketchEditor.
 * Rendered as a portal for proper z-index stacking.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { alpha, useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Slider
} from "@mui/material";
import DrawOutlinedIcon from "@mui/icons-material/DrawOutlined";
import CloseIcon from "@mui/icons-material/Close";
import TrashIconSvg from "../../icons/trash.svg?react";
const TrashIcon = TrashIconSvg as React.FC<React.SVGProps<SVGSVGElement>>;
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import FlipIcon from "@mui/icons-material/Flip";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import CheckIcon from "@mui/icons-material/Check";
import KeyboardOutlinedIcon from "@mui/icons-material/KeyboardOutlined";
import SketchEditor, { SketchEditorHandle } from "./SketchEditor";
import { SKETCH_KEYBOARD_SHORTCUTS } from "./sketchKeyboardShortcuts";
import { PenPressureSettingsPanel } from "./ToolSettingsPanels";
import KeyboardShortcutsView from "../content/Help/KeyboardShortcutsView";
import { ShortcutsSearchableList } from "../content/Help/ShortcutsSearchableList";
import { useSketchStore } from "./state";
import {
  SketchDocument,
  SymmetryMode,
  SYMMETRY_MIN_RAYS,
  SYMMETRY_MAX_RAYS,
  DEFAULT_PEN_PRESSURE
} from "./types";
import type { SketchTool } from "./types";
import {
  SKETCH_SPACING,
  SKETCH_SIZE,
  SKETCH_Z_INDEX,
  SKETCH_TOOLTIP_DELAY_MS,
  settingRowChildrenSx
} from "./sketchStyles";
import { displayCombo } from "./shortcuts";
import {
  Caption,
  Divider,
  FlexColumn,
  FlexRow,
  TabGroup,
  TabPanel,
  Text,
  Tooltip,
  Box
} from "../ui_primitives";

function isPressureSketchTool(tool: SketchTool): boolean {
  return tool === "brush" || tool === "pencil" || tool === "eraser";
}

const styles = (theme: Theme) =>
  css({
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: SKETCH_Z_INDEX.modal,
    display: "flex",
    flexDirection: "column",
    backgroundColor: theme.vars.palette.grey[900],
    "& .sketch-modal-header": {
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      rowGap: SKETCH_SPACING.md,
      columnGap: SKETCH_SPACING.lg,
      padding: `${SKETCH_SPACING.sm} ${SKETCH_SPACING.xl}`,
      backgroundColor: theme.vars.palette.grey[800],
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
      minHeight: "36px",
      "& .MuiIconButton-root": {
        padding: SKETCH_SIZE.iconButtonPad,
      },
      "& .sketch-modal-pen-inline": {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: SKETCH_SPACING.lg,
        flexShrink: 0,
        ...settingRowChildrenSx(theme),
      },
    },
    "& .sketch-modal-body": {
      flex: 1,
      overflow: "hidden",
    },
  });

export interface SketchModalProps {
  open: boolean;
  title?: string;
  initialDocument?: SketchDocument;
  onClose: () => void;
  onDocumentChange?: (doc: SketchDocument) => void;
  onExportImage?: (dataUrl: string) => void;
  onExportMask?: (dataUrl: string | null) => void;
}

const SketchModal: React.FC<SketchModalProps> = ({
  open,
  title = "Image Editor",
  initialDocument,
  onClose,
  onDocumentChange,
  onExportImage,
  onExportMask
}) => {
  const theme = useTheme();
  const editorRef = useRef<SketchEditorHandle>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [symmetryAnchorEl, setSymmetryAnchorEl] = useState<HTMLElement | null>(null);
  const [shortcutsPaneOpen, setShortcutsPaneOpen] = useState(false);
  const [shortcutsSubTab, setShortcutsSubTab] = useState<
    "shortcuts" | "keyboard"
  >("shortcuts");

  const symmetryMode = useSketchStore((s) => s.symmetryMode);
  const symmetryRays = useSketchStore((s) => s.symmetryRays);
  const setSymmetryMode = useSketchStore((s) => s.setSymmetryMode);
  const setSymmetryRays = useSketchStore((s) => s.setSymmetryRays);
  const canUndo = useSketchStore((s) => s.canUndo());
  const canRedo = useSketchStore((s) => s.canRedo());
  const activeTool = useSketchStore((s) => s.activeTool);
  const rawPenPressure = useSketchStore((s) => s.toolSettings?.penPressure);
  const setPenPressure = useSketchStore((s) => s.setPenPressure);
  const penPressure = useMemo(
    () => ({
      ...DEFAULT_PEN_PRESSURE,
      ...rawPenPressure
    }),
    [rawPenPressure]
  );
  const headerPenPressureOn = penPressure.pressureSensitivity !== false;

  // Derive label from mode
  const symmetryLabels: Record<SymmetryMode, string> = {
    off: "Off",
    horizontal: "Horizontal",
    vertical: "Vertical",
    dual: "Dual Axis",
    radial: `Radial (${symmetryRays})`,
    mandala: `Mandala (${symmetryRays})`
  };
  const symmetryLabel = symmetryLabels[symmetryMode] || "Off";
  const symmetryActive = symmetryMode !== "off";

  useEffect(() => {
    if (!open) {
      setConfirmDiscard(false);
      setShortcutsPaneOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!shortcutsPaneOpen) {
      setShortcutsSubTab("shortcuts");
      return;
    }
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShortcutsPaneOpen(false);
      }
    };
    window.addEventListener("keydown", onWindowKeyDown, true);
    return () => window.removeEventListener("keydown", onWindowKeyDown, true);
  }, [shortcutsPaneOpen]);

  const handleRequestClose = useCallback(() => {
    editorRef.current?.flushPendingChanges();
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Esc never closes the editor — it's reserved for tool / selection
      // cancel (see `cancel-or-deselect` shortcut). We only intercept it
      // here to dismiss modal-local overlays (shortcuts help, discard
      // confirmation) before falling through to the global handler.
      if (e.key === "Escape") {
        if (shortcutsPaneOpen) {
          setShortcutsPaneOpen(false);
        } else if (confirmDiscard) {
          setConfirmDiscard(false);
        }
      }
    },
    [confirmDiscard, shortcutsPaneOpen]
  );

  if (!open) {
    return null;
  }

  return ReactDOM.createPortal(
    <Box
      className="sketch-modal"
      css={styles(theme)}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <Box className="sketch-modal-header">
        <Text sx={{ fontWeight: 500, mr: "auto" }}>
          {title}
        </Text>

        {isPressureSketchTool(activeTool) ? (
          <FlexRow
            className="sketch-modal-pen-inline"
            align="center"
            wrap
            gap={0.75}
            sx={{
              rowGap: "4px"
            }}
          >
            <Tooltip
              title={
                headerPenPressureOn
                  ? "Turn off pen pressure"
                  : "Turn on pen pressure"
              }
              enterDelay={SKETCH_TOOLTIP_DELAY_MS}
              enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}
            >
              <IconButton
                size="small"
                onClick={() =>
                  setPenPressure({ pressureSensitivity: !headerPenPressureOn })
                }
                color={headerPenPressureOn ? "primary" : "default"}
                aria-label="Toggle pen pressure"
                aria-expanded={headerPenPressureOn}
                aria-controls="sketch-modal-pen-pressure-panel"
                sx={{
                  color: headerPenPressureOn ? undefined : "grey.300",
                  flexShrink: 0
                }}
              >
                <DrawOutlinedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            {headerPenPressureOn ? (
              <FlexRow
                id="sketch-modal-pen-pressure-panel"
                align="center"
                wrap
                sx={{
                  columnGap: 8,
                  rowGap: 4,
                  py: 0.5,
                  pl: 1,
                  ml: 0.5,
                  borderLeft: `1px solid ${theme.vars.palette.grey[700]}`,
                  minWidth: 0
                }}
              >
                <PenPressureSettingsPanel
                  settings={penPressure}
                  onChange={setPenPressure}
                  omitSensitivitySwitch
                  inlineRow
                />
              </FlexRow>
            ) : null}
          </FlexRow>
        ) : null}

        {/* ── Actions (right-aligned) ── */}
        <FlexRow align="center" sx={{ gap: "2px" }}>
          <Tooltip title={`Undo (${displayCombo("undo")})`} enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
            <span style={{ display: 'inline-flex' }}>
              <IconButton size="small" aria-label="Undo" onClick={() => editorRef.current?.undo()} disabled={!canUndo}>
                <UndoIcon sx={{ fontSize: "18px" }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={`Redo (${displayCombo("redo")})`} enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
            <span style={{ display: 'inline-flex' }}>
              <IconButton size="small" aria-label="Redo" onClick={() => editorRef.current?.redo()} disabled={!canRedo}>
                <RedoIcon sx={{ fontSize: "18px" }} />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="Keyboard shortcuts" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
            <IconButton
              size="small"
              onClick={() => setShortcutsPaneOpen((open) => !open)}
              aria-label={shortcutsPaneOpen ? "Hide keyboard shortcuts" : "Show keyboard shortcuts"}
              aria-expanded={shortcutsPaneOpen}
              color={shortcutsPaneOpen ? "primary" : "default"}
            >
              <KeyboardOutlinedIcon sx={{ fontSize: "18px" }} />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: "4px" }} />

          <Tooltip title={`Symmetry: ${symmetryLabel}`} enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
            <IconButton
              size="small"
              aria-label="Symmetry menu"
              aria-haspopup="true"
              aria-expanded={Boolean(symmetryAnchorEl)}
              onClick={(e) => setSymmetryAnchorEl(e.currentTarget)}
              color={symmetryActive ? "primary" : "default"}
            >
              <FlipIcon sx={{ fontSize: "18px" }} />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={symmetryAnchorEl}
            open={Boolean(symmetryAnchorEl)}
            onClose={() => setSymmetryAnchorEl(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            slotProps={{ paper: { sx: { minWidth: 180 } } }}
          >
            {(["off", "horizontal", "vertical", "dual", "radial", "mandala"] as SymmetryMode[]).map((mode) => (
              <MenuItem
                key={mode}
                onClick={() => { setSymmetryMode(mode); if (mode !== "radial" && mode !== "mandala") { setSymmetryAnchorEl(null); } }}
                selected={symmetryMode === mode}
              >
                {symmetryMode === mode && <ListItemIcon><CheckIcon fontSize="small" /></ListItemIcon>}
                <ListItemText inset={symmetryMode !== mode}>{symmetryLabels[mode]}</ListItemText>
              </MenuItem>
            ))}
            {(symmetryMode === "radial" || symmetryMode === "mandala") && (
              <Box sx={{ px: 2, py: 1, minWidth: 160 }}>
                <Caption sx={{ color: "grey.500" }}>
                  Rays: {symmetryRays}
                </Caption>
                <Slider
                  value={symmetryRays}
                  min={SYMMETRY_MIN_RAYS}
                  max={SYMMETRY_MAX_RAYS}
                  step={1}
                  marks
                  size="small"
                  onChange={(_, v) => setSymmetryRays(v as number)}
                  sx={{ mt: 0.5 }}
                />
              </Box>
            )}
          </Menu>

          <Divider orientation="vertical" flexItem sx={{ mx: "4px" }} />

          {confirmDiscard ? (
            <>
              <Caption sx={{ color: "warning.main", whiteSpace: "nowrap" }}>
                Discard changes?
              </Caption>
              <IconButton size="small" aria-label="Confirm discard" color="error" onClick={() => { editorRef.current?.discardToInitial(); onClose(); }}>
                <TrashIcon width={16} height={16} />
              </IconButton>
              <IconButton size="small" aria-label="Cancel discard" onClick={() => setConfirmDiscard(false)}>
                <CloseIcon sx={{ fontSize: "15px" }} />
              </IconButton>
            </>
          ) : (
            <Tooltip title="Discard all changes and close" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
              <IconButton size="small" aria-label="Discard changes" onClick={() => setConfirmDiscard(true)} sx={{ color: "error.light" }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          <Tooltip title={`Export Image (${displayCombo("export-png")})`} enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
            <IconButton size="small" aria-label="Export Image" onClick={() => editorRef.current?.exportPng()}>
              <SaveAltIcon sx={{ fontSize: "18px" }} />
            </IconButton>
          </Tooltip>

          {!confirmDiscard && (
            <Tooltip title="Save & Close" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
              <IconButton size="small" aria-label="Save and close" onClick={handleRequestClose} sx={{ color: "success.light" }}>
                <CheckIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </FlexRow>
      </Box>
      <FlexColumn
        className="sketch-modal-body"
        sx={{
          flex: 1,
          position: "relative",
          minHeight: 0,
          overflow: "hidden"
        }}
      >
        <SketchEditor
          ref={editorRef}
          initialDocument={initialDocument}
          onDocumentChange={onDocumentChange}
          onExportImage={onExportImage}
          onExportMask={onExportMask}
          suspendKeyboardShortcuts={shortcutsPaneOpen}
        />
        {shortcutsPaneOpen ? (
          <>
            <Box
              aria-hidden
              onClick={() => setShortcutsPaneOpen(false)}
              sx={{
                position: "absolute",
                inset: 0,
                zIndex: SKETCH_Z_INDEX.overlay,
                backgroundColor: alpha(theme.palette.common.black, 0.45)
              }}
            />
            <FlexColumn
              component="section"
              role="dialog"
              aria-modal="true"
              aria-labelledby="sketch-shortcuts-heading"
              onClick={(e) => e.stopPropagation()}
              sx={{
                position: "absolute",
                top: "max(48px, 9vh)",
                left: "50%",
                transform: "translateX(-50%)",
                width: "min(920px, calc(100% - 24px))",
                height: "80vh",
                maxHeight: "80vh",
                zIndex: SKETCH_Z_INDEX.popover,
                borderRadius: 2,
                border: `1px solid ${theme.vars.palette.grey[700]}`,
                backgroundColor: theme.vars.palette.grey[800],
                boxShadow: theme.shadows[12],
                overflow: "hidden"
              }}
            >
              <FlexRow
                align="center"
                justify="space-between"
                gap={1}
                sx={{
                  px: SKETCH_SPACING.md,
                  py: SKETCH_SPACING.sm,
                  borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
                  flexShrink: 0
                }}
              >
                <Text id="sketch-shortcuts-heading" sx={{ fontWeight: 600 }}>
                  Keyboard shortcuts
                </Text>
                <Tooltip title="Close" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
                  <IconButton
                    size="small"
                    onClick={() => setShortcutsPaneOpen(false)}
                    aria-label="Close keyboard shortcuts"
                  >
                    <CloseIcon sx={{ fontSize: "18px" }} />
                  </IconButton>
                </Tooltip>
              </FlexRow>
              <FlexColumn
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflow: "hidden"
                }}
              >
                <TabGroup
                  aria-label="Image editor shortcuts"
                  tabs={[
                    { value: "shortcuts", label: "Shortcuts" },
                    { value: "keyboard", label: "Keyboard" }
                  ]}
                  value={shortcutsSubTab}
                  onChange={(v) =>
                    setShortcutsSubTab(v as "shortcuts" | "keyboard")
                  }
                  size="small"
                  fullWidth
                  sx={{
                    flexShrink: 0,
                    px: SKETCH_SPACING.md,
                    pt: SKETCH_SPACING.sm,
                    borderBottom: `1px solid ${theme.vars.palette.grey[700]}`
                  }}
                />
                <FlexColumn
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: "hidden",
                    px: SKETCH_SPACING.md,
                    pb: SKETCH_SPACING.md,
                    pt: SKETCH_SPACING.sm
                  }}
                >
                  <TabPanel
                    value="shortcuts"
                    activeValue={shortcutsSubTab}
                    sx={{
                      flex: 1,
                      minHeight: 0,
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                      py: 0
                    }}
                  >
                    <ShortcutsSearchableList
                      shortcuts={SKETCH_KEYBOARD_SHORTCUTS}
                      searchPlaceholder="Search shortcuts"
                      rootSx={{ flex: 1, minHeight: 0 }}
                      scrollSx={{ flex: 1, minHeight: 0 }}
                    />
                  </TabPanel>
                  <TabPanel
                    value="keyboard"
                    activeValue={shortcutsSubTab}
                    sx={{
                      flex: 1,
                      minHeight: 0,
                      overflow: "auto",
                      py: 0
                    }}
                  >
                    <KeyboardShortcutsView
                      shortcuts={SKETCH_KEYBOARD_SHORTCUTS}
                      listenToPhysicalKeyboard
                      imageEditorShortcuts
                    />
                  </TabPanel>
                </FlexColumn>
              </FlexColumn>
            </FlexColumn>
          </>
        ) : null}
      </FlexColumn>
    </Box>,
    window.document.body
  );
};

export default memo(SketchModal);
