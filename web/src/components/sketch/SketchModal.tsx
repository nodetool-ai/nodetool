/**
 * SketchModal
 *
 * Fullscreen modal wrapper for the SketchEditor.
 * Rendered as a portal for proper z-index stacking.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGlobalCombo } from "../../stores/KeyPressedStore";
import ReactDOM from "react-dom";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import DrawOutlinedIcon from "@mui/icons-material/DrawOutlined";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import FlipIcon from "@mui/icons-material/Flip";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
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
import { SKETCH_Z_INDEX, settingRowChildrenSx } from "./sketchStyles";
import { displayCombo } from "./shortcuts";
import {
  Caption,
  FlexColumn,
  FlexRow,
  TabGroup,
  TabPanel,
  Text,
  Box,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx,
  ContextMenu,
  MenuItemPrimitive,
  Slider,
  DeleteButton,
  ICON_SIZE,
  ToolbarDivider,
  ToolbarIconButton,
  CloseButton
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
    backgroundColor: theme.vars.palette.background.default,
    "& .sketch-modal-header": {
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      rowGap: getSpacingPx(SPACING.sm),
      columnGap: getSpacingPx(SPACING.md),
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.lg)}`,
      backgroundColor: theme.vars.palette.background.paper,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      minHeight: "36px",
      "& .sketch-modal-pen-inline": {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: getSpacingPx(SPACING.md),
        flexShrink: 0,
        ...settingRowChildrenSx(theme),
      },
    },
    "& .sketch-modal-body": {
      flex: 1,
      overflow: "hidden",
    },
  });

interface SketchModalProps {
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
  title,
  initialDocument,
  onClose,
  onDocumentChange,
  onExportImage,
  onExportMask
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const modalStyles = useMemo(() => styles(theme), [theme]);
  const editorRef = useRef<SketchEditorHandle>(null);
  const exportMenuItems = useCallback(
    (close: () => void) => [
      <MenuItemPrimitive
        key="export-psd"
        label={t("i18n-next4.sketch.exportPsd")}
        icon={<LayersOutlinedIcon fontSize="small" />}
        onClick={() => {
          close();
          editorRef.current?.exportPsd();
        }}
        data-testid="sketch-export-psd"
      />,
      <MenuItemPrimitive
        key="import-psd"
        label={t("i18n-next4.sketch.importPsd")}
        icon={<FileUploadOutlinedIcon fontSize="small" />}
        onClick={() => {
          close();
          editorRef.current?.importPsd();
        }}
        data-testid="sketch-import-psd"
      />
    ],
    [t]
  );
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

  const symmetryLabels = {
    off: t("i18n-next4.sketch.symmetry.off"),
    horizontal: t("i18n-next4.sketch.symmetry.horizontal"),
    vertical: t("i18n-next4.sketch.symmetry.vertical"),
    dual: t("i18n-next4.sketch.symmetry.dualAxis"),
    radial: t("i18n-next4.sketch.symmetry.radial", { count: symmetryRays }),
    mandala: t("i18n-next4.sketch.symmetry.mandala", { count: symmetryRays })
  } satisfies Record<SymmetryMode, string>;
  const symmetryLabel = symmetryLabels[symmetryMode] || t("i18n-next4.sketch.symmetry.off");
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
  }, [shortcutsPaneOpen]);

  // allowInInputs: the old capture-phase listener closed the pane regardless of
  // focus. The store's stack gives this the top binding while the pane is open,
  // so it shadows the editor's own Escape.
  useGlobalCombo("escape", () => setShortcutsPaneOpen(false), {
    active: shortcutsPaneOpen,
    allowInInputs: true,
    preventDefault: false
  });

  // The discard confirmation is modal: shortcuts pause while it is open and
  // Escape cancels it instead of dropping the selection.
  useGlobalCombo("escape", () => setConfirmDiscard(false), {
    active: confirmDiscard,
    allowInInputs: true,
    preventDefault: false
  });

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
      css={modalStyles}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <Box className="sketch-modal-header">
        <Text sx={{ fontWeight: 500, mr: "auto" }}>
          {title ?? t("i18n-next4.sketch.imageEditor")}
        </Text>

        {isPressureSketchTool(activeTool) ? (
          <FlexRow
            className="sketch-modal-pen-inline"
            align="center"
            wrap
            gap={1}
            sx={{
              rowGap: getSpacingPx(SPACING.xs)
            }}
          >
            <ToolbarIconButton
              icon={<DrawOutlinedIcon />}
              tooltip={
                headerPenPressureOn
                  ? t("i18n-next4.sketch.turnOffPenPressure")
                  : t("i18n-next4.sketch.turnOnPenPressure")
              }
              ariaLabel={t("i18n-next4.sketch.togglePenPressure")}
              active={headerPenPressureOn}
              onClick={() =>
                setPenPressure({ pressureSensitivity: !headerPenPressureOn })
              }
              aria-expanded={headerPenPressureOn}
              aria-controls="sketch-modal-pen-pressure-panel"
              nodrag={false}
              sx={{ flexShrink: 0 }}
            />
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
                  borderLeft: `1px solid ${theme.vars.palette.divider}`,
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

        <FlexRow align="center" sx={{ gap: getSpacingPx(SPACING.micro) }}>
          <ToolbarIconButton
            icon={<UndoIcon />}
            tooltip={t("i18n-next4.sketch.undo")}
            shortcut={[displayCombo("undo")]}
            onClick={() => editorRef.current?.undo()}
            disabled={!canUndo}
            nodrag={false}
          />
          <ToolbarIconButton
            icon={<RedoIcon />}
            tooltip={t("i18n-next4.sketch.redo")}
            shortcut={[displayCombo("redo")]}
            onClick={() => editorRef.current?.redo()}
            disabled={!canRedo}
            nodrag={false}
          />

          <ToolbarIconButton
            icon={<KeyboardOutlinedIcon />}
            tooltip={t("i18n-next4.sketch.keyboardShortcuts")}
            ariaLabel={shortcutsPaneOpen ? t("i18n-next4.sketch.hideKeyboardShortcuts") : t("i18n-next4.sketch.showKeyboardShortcuts")}
            active={shortcutsPaneOpen}
            onClick={() => setShortcutsPaneOpen((open) => !open)}
            aria-expanded={shortcutsPaneOpen}
            nodrag={false}
          />

          <ToolbarDivider />

          <ToolbarIconButton
            icon={<FlipIcon />}
            tooltip={t("i18n-next4.sketch.symmetry.tooltip", { mode: symmetryLabel })}
            ariaLabel={t("i18n-next4.sketch.symmetry.menu")}
            active={symmetryActive}
            onClick={(e) => setSymmetryAnchorEl(e.currentTarget)}
            aria-haspopup="true"
            aria-expanded={Boolean(symmetryAnchorEl)}
            nodrag={false}
          />
          <ContextMenu
            anchorEl={symmetryAnchorEl}
            open={Boolean(symmetryAnchorEl)}
            onClose={() => setSymmetryAnchorEl(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
          >
            {(["off", "horizontal", "vertical", "dual", "radial", "mandala"] as SymmetryMode[]).map((mode) => (
              <MenuItemPrimitive
                key={mode}
                label={symmetryLabels[mode]}
                onClick={() => { setSymmetryMode(mode); if (mode !== "radial" && mode !== "mandala") { setSymmetryAnchorEl(null); } }}
                selected={symmetryMode === mode}
              />
            ))}
            {(symmetryMode === "radial" || symmetryMode === "mandala") && (
              <Box sx={{ px: SPACING.lg, py: SPACING.md }}>
                <Caption color="secondary">
                  {t("i18n-next4.sketch.symmetry.rays", { count: symmetryRays })}
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
          </ContextMenu>

          <ToolbarDivider />

          {confirmDiscard ? (
            <>
              <Caption sx={{ color: "warning.main", whiteSpace: "nowrap" }}>
                {t("i18n-next4.sketch.discardChangesQuestion")}
              </Caption>
              <DeleteButton
                iconVariant="outline"
                tooltip={t("i18n-next4.sketch.discardChanges")}
                ariaLabel={t("i18n-next4.sketch.confirmDiscard")}
                onClick={() => { editorRef.current?.discardToInitial(); onClose(); }}
                sx={{ color: "error.main", "& .MuiSvgIcon-root": { fontSize: ICON_SIZE.sm } }}
              />
              <ToolbarIconButton
                icon={<CloseIcon />}
                tooltip={t("i18n-next4.sketch.cancelDiscard")}
                onClick={() => setConfirmDiscard(false)}
                autoFocus
                nodrag={false}
              />
            </>
          ) : (
            <ToolbarIconButton
              icon={<CloseIcon />}
              tooltip={t("i18n-next4.sketch.discardAllAndClose")}
              ariaLabel={t("i18n-next4.sketch.discardChanges")}
              variant="error"
              onClick={() => setConfirmDiscard(true)}
              nodrag={false}
            />
          )}

          <ToolbarIconButton
            icon={<SaveAltIcon />}
            tooltip={t("i18n-next4.sketch.exportImage")}
            onClick={() => editorRef.current?.exportPng()}
            nodrag={false}
          />

          {!confirmDiscard && (
            <ToolbarIconButton
              icon={<CheckIcon />}
              tooltip={t("i18n-next4.sketch.saveAndClose")}
              variant="primary"
              onClick={handleRequestClose}
              nodrag={false}
            />
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
          suspendKeyboardShortcuts={shortcutsPaneOpen || confirmDiscard}
          menuItems={exportMenuItems}
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
                backgroundColor: `rgb(${theme.vars.palette.common.blackChannel} / 0.45)`
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
                borderRadius: BORDER_RADIUS.xs,
                border: `1px solid ${theme.vars.palette.divider}`,
                backgroundColor: theme.vars.palette.background.paper,
                boxShadow: theme.shadows[12],
                overflow: "hidden"
              }}
            >
              <FlexRow
                align="center"
                justify="space-between"
                gap={1}
                sx={{
                  px: getSpacingPx(SPACING.sm),
                  py: getSpacingPx(SPACING.xs),
                  borderBottom: `1px solid ${theme.vars.palette.divider}`,
                  flexShrink: 0
                }}
              >
                <Text id="sketch-shortcuts-heading" sx={{ fontWeight: 600 }}>
                  {t("i18n-next4.sketch.keyboardShortcuts")}
                </Text>
                <CloseButton
                  tooltip={t("i18n-next4.sketch.closeKeyboardShortcuts")}
                  onClick={() => setShortcutsPaneOpen(false)}
                  nodrag={false}
                />
              </FlexRow>
              <FlexColumn
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflow: "hidden"
                }}
              >
                <TabGroup
                  aria-label={t("i18n-next4.sketch.imageEditorShortcuts")}
                  tabs={[
                    { value: "shortcuts", label: t("i18n-next4.sketch.shortcuts") },
                    { value: "keyboard", label: t("i18n-next4.sketch.keyboard") }
                  ]}
                  value={shortcutsSubTab}
                  onChange={(v) =>
                    setShortcutsSubTab(v as "shortcuts" | "keyboard")
                  }
                  size="small"
                  fullWidth
                  sx={{
                    flexShrink: 0,
                    px: getSpacingPx(SPACING.sm),
                    pt: getSpacingPx(SPACING.xs),
                    borderBottom: `1px solid ${theme.vars.palette.divider}`
                  }}
                />
                <FlexColumn
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: "hidden",
                    px: getSpacingPx(SPACING.sm),
                    pb: getSpacingPx(SPACING.sm),
                    pt: getSpacingPx(SPACING.xs)
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
                      searchPlaceholder={t("i18n-next4.sketch.searchShortcuts")}
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
