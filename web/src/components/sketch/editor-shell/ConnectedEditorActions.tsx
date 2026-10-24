/**
 * ConnectedEditorActions — the trailing action cluster of the tool bar.
 *
 * A Generate button that opens the text-to-image form, the dock's Layout
 * menu on desktop, a visible assistant toggle, and an overflow menu for fit / hide panels, the rulers / guides /
 * snap view toggles, "Transform with workflow", plus any document actions the
 * host surface contributes via `menuItems`.
 *
 * Editor-shell convention: narrow store selectors only; the fit computation
 * reads and writes through getState() so the cluster gains no subscriptions on
 * the document or viewport.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";

import {
  Divider,
  EditorButton,
  EditorMenu,
  FlexRow,
  MenuItemPrimitive,
  Tooltip,
  ToolbarIconButton
} from "../../ui_primitives";
import { useSketchStore, SKETCH_ZOOM_MIN, SKETCH_ZOOM_MAX } from "../state";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useSketchCanvasRefStore } from "../../../stores/sketch/SketchCanvasRefStore";
import { ConnectedGeneratePopover } from "./ConnectedGeneratePopover";
import { getSketchAgentHandler } from "../sketchAgentBridge";
import { TransformWithWorkflowView } from "../../assets/TransformWithWorkflowDialog";
import type {
  TransformApplyAction,
  TransformSource
} from "../../assets/transformWorkflow";
import { displayCombo } from "../shortcuts";
import type { SketchActionId } from "../shortcuts";

interface ViewToggleItemProps {
  label: string;
  checked: boolean;
  actionId: SketchActionId;
  onClick: () => void;
  testId: string;
}

/** A checkable View-menu entry with its keyboard shortcut on the right. */
const ViewToggleItem: React.FC<ViewToggleItemProps> = ({
  label,
  checked,
  actionId,
  onClick,
  testId
}) => {
  return (
    <MenuItemPrimitive
      label={label}
      checkable="checkbox"
      checked={checked}
      shortcut={displayCombo(actionId)}
      onClick={onClick}
      data-testid={testId}
    />
  );
};

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
  /** The dock's Layout menu: built-in and saved panel layouts. */
  layoutMenu?: React.ReactNode;
}

/**
 * Fallback fit when the canvas has not registered its own `fitViewToScreen`
 * (which measures the real viewport and clears the floating tool bar): zoom
 * the document to fit the canvas region, with a small margin.
 */
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

/** The pieces of the action cluster, so a document bar can put them in its
 * View and Actions slots instead of one row. */
export interface EditorActionParts {
  inline?: React.ReactNode;
  generate: React.ReactNode;
  layoutMenu?: React.ReactNode;
  assistant: React.ReactNode;
  more: React.ReactNode;
  /** The Transform with workflow dialog, mounted while open. */
  dialogs: React.ReactNode;
}

export const useEditorActionParts = ({
  inlineActions,
  menuItems,
  layoutMenu
}: ConnectedEditorActionsProps): EditorActionParts => {
  const { t } = useTranslation();
  const assistantPanelOpen = useSketchStore((s) => s.assistantPanelOpen);
  const toggleAssistantPanel = useSketchStore((s) => s.toggleAssistantPanel);
  const togglePanelsHidden = useSketchStore((s) => s.togglePanelsHidden);
  const rulersVisible = useSketchStore((s) => s.rulersVisible);
  const guidesVisible = useSketchStore((s) => s.guidesVisible);
  const snapEnabled = useSketchStore((s) => s.snapEnabled);
  const hasGuides = useSketchStore((s) => (s.document.guides?.length ?? 0) > 0);

  const documentId = useSketchSessionStore((s) => s.documentId);
  const fitViewToScreen = useSketchCanvasRefStore((s) => s.fitViewToScreen);
  const canFlatten = useSketchCanvasRefStore(
    (s) => s.flattenToDataUrl !== null
  );

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
    if (fitViewToScreen) {
      fitViewToScreen();
    } else {
      fitToViewport();
    }
  }, [closeMenu, fitViewToScreen]);

  const handleHidePanels = useCallback(() => {
    closeMenu();
    togglePanelsHidden();
  }, [closeMenu, togglePanelsHidden]);

  // The visible composite goes to the workflow; an image it returns lands on
  // a new layer, placed through the same path the agent's placeImage uses.
  const [transformSource, setTransformSource] =
    useState<TransformSource | null>(null);
  const handleTransform = useCallback(() => {
    closeMenu();
    const uri = useSketchCanvasRefStore.getState().flattenToDataUrl?.();
    if (!uri) {
      return;
    }
    setTransformSource({
      kind: "image",
      name:
        useSketchSessionStore.getState().name ||
        t("transformWithWorkflow.sketchName"),
      uri
    });
  }, [closeMenu, t]);
  const transformApply = useMemo<TransformApplyAction | undefined>(
    () =>
      documentId
        ? {
            label: t("transformWithWorkflow.apply.addAsLayer"),
            kinds: ["image"],
            onApply: async (result) => {
              await getSketchAgentHandler(documentId).placeImage({
                image: result.uri,
                name: result.name
              });
            }
          }
        : undefined,
    [documentId, t]
  );

  const generate = documentId ? (
    <>
      <Tooltip
        title={t("i18n-next13.sketch.editorActions.generatePromptTooltip")}
      >
        <span>
          <EditorButton
            ref={generateAnchorRef}
            variant="text"
            size="small"
            onClick={() => {
              setGenerateMounted(true);
              setGenerateOpen(true);
            }}
            startIcon={<AutoAwesomeIcon />}
            aria-label={t("i18n-next13.sketch.editorActions.generateImage")}
            sx={{
              "@container sketch-workspace (max-width: 400px)": {
                minWidth: 44,
                "& .sketch-generate-label": { display: "none" },
                "& .MuiButton-startIcon": { margin: 0 }
              }
            }}
            data-testid="sketch-open-generate"
          >
            <span className="sketch-generate-label">
              {t("i18n-next13.sketch.editorActions.generate")}
            </span>
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
  ) : null;

  const assistant = (
    <ToolbarIconButton
      icon={<SmartToyOutlinedIcon />}
      tooltip={
        assistantPanelOpen
          ? t("i18n-next13.sketch.editorActions.hideAssistant")
          : t("i18n-next13.sketch.editorActions.showAssistant")
      }
      active={assistantPanelOpen}
      onClick={handleAssistant}
      aria-pressed={assistantPanelOpen}
      data-testid="sketch-assistant-toggle"
      nodrag={false}
    />
  );

  const more = (
    <>
      <ToolbarIconButton
        icon={<MoreVertIcon />}
        tooltip={t("i18n-next13.sketch.editorActions.editorActions")}
        onClick={(e) => setMenuAnchor(e.currentTarget)}
        aria-haspopup="menu"
        data-testid="sketch-editor-menu"
        nodrag={false}
      />

      <EditorMenu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={closeMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        paperSx={{ minWidth: 220 }}
      >
        <MenuItemPrimitive
          label={t("i18n-next13.sketch.editorActions.fitToViewport")}
          icon={<FitScreenIcon fontSize="small" />}
          onClick={handleFit}
          data-testid="sketch-fit-view"
        />
        <MenuItemPrimitive
          label={t("i18n-next13.sketch.editorActions.hidePanels")}
          icon={<ViewSidebarOutlinedIcon fontSize="small" />}
          onClick={handleHidePanels}
          data-testid="sketch-hide-panels"
        />

        <Divider key="view-divider" />
        <ViewToggleItem
          label={t("i18n-next119.sketch.rulers")}
          checked={rulersVisible}
          actionId="toggle-rulers"
          onClick={() => {
            closeMenu();
            useSketchStore.getState().toggleRulersVisible();
          }}
          testId="sketch-toggle-rulers"
        />
        <ViewToggleItem
          label={t("i18n-next119.sketch.guides")}
          checked={guidesVisible}
          actionId="toggle-guides"
          onClick={() => {
            closeMenu();
            useSketchStore.getState().toggleGuidesVisible();
          }}
          testId="sketch-toggle-guides"
        />
        <ViewToggleItem
          label={t("i18n-next119.sketch.snap")}
          checked={snapEnabled}
          actionId="toggle-snap"
          onClick={() => {
            closeMenu();
            useSketchStore.getState().toggleSnapEnabled();
          }}
          testId="sketch-toggle-snap"
        />
        <MenuItemPrimitive
          label={t("i18n-next13.sketch.editorActions.clearGuides")}
          onClick={() => {
            closeMenu();
            useSketchStore.getState().clearGuides();
          }}
          disabled={!hasGuides}
          data-testid="sketch-clear-guides"
        />

        <Divider key="transform-divider" />
        <MenuItemPrimitive
          label={t("transformWithWorkflow.open")}
          icon={<AutoFixHighOutlinedIcon fontSize="small" />}
          onClick={handleTransform}
          disabled={!canFlatten}
          data-testid="sketch-transform-with-workflow"
        />

        {menuItems ? <Divider key="host-divider" /> : null}
        {menuItems?.(closeMenu)}
      </EditorMenu>
    </>
  );

  const dialogs = transformSource ? (
    <TransformWithWorkflowView
      source={transformSource}
      onClose={() => setTransformSource(null)}
      apply={transformApply}
      aboveFloating
    />
  ) : null;

  return {
    inline: inlineActions,
    generate,
    layoutMenu,
    assistant,
    more,
    dialogs
  };
};

export const ConnectedEditorActions = memo(function ConnectedEditorActions(
  props: ConnectedEditorActionsProps
) {
  const parts = useEditorActionParts(props);
  return (
    <FlexRow
      align="center"
      gap={0.5}
      className="tool-top-bar__global-actions"
      sx={{ ml: "auto", flexShrink: 0 }}
    >
      {parts.inline}
      {parts.generate}
      {parts.layoutMenu}
      {parts.assistant}
      {parts.more}
      {parts.dialogs}
    </FlexRow>
  );
});

export default ConnectedEditorActions;
