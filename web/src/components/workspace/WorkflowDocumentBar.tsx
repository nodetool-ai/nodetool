/**
 * The document bar of a workflow tab's canvas: save status, Undo/Redo over
 * the graph history, the Graph/Chain switch, the chat, mini map and inspector
 * toggles,
 * and ⋮ with the app and the exports. Run stays in the floating dock beside
 * the composer that starts a run.
 */

import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import MapIcon from "@mui/icons-material/Map";
import DownloadIcon from "@mui/icons-material/Download";
import LinearScaleIcon from "@mui/icons-material/LinearScale";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import DashboardCustomizeOutlinedIcon from "@mui/icons-material/DashboardCustomizeOutlined";
import DataObjectOutlinedIcon from "@mui/icons-material/DataObjectOutlined";
import TerminalIcon from "@mui/icons-material/Terminal";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";

import { useNodes, useTemporalNodes } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useWorkflowDirty } from "../../hooks/useWorkflowDirty";
import { useWorkflowApp } from "../../hooks/useWorkflowApp";
import { useWorkflowScriptExport } from "../../hooks/useWorkflowScriptExport";
import { useCanvasConversation } from "../../hooks/useCanvasConversation";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useMiniMapStore } from "../../stores/MiniMapStore";
import { useRightPanelStore } from "../../stores/RightPanelStore";
import useCanvasChatDockStore from "../../stores/CanvasChatDockStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import type { WorkspaceTab } from "../../stores/WorkspaceTabsStore";
import {
  CountBadge,
  MenuItemPrimitive,
  ModeSwitch,
  SaveStatus,
  ToolbarIconButton,
  UndoRedoButtons
} from "../ui_primitives";
import type { SaveStatusValue } from "../ui_primitives";
import WorkspaceDocumentBar from "./WorkspaceDocumentBar";
import { DocumentMoreMenu } from "./documentBarParts";

type EditorViewMode = "graph" | "chain";

/** The workflow's save readout: autosaved, so it has no Save button. */
const useWorkflowSaveStatus = (workflowId: string) => {
  const dirty = useWorkflowDirty(workflowId);
  const saveState = useWorkflowManager(
    (state) => state.workflowSaveStates?.[workflowId]
  );
  const getWorkflow = useWorkflowManager((state) => state.getWorkflow);
  const saveWorkflow = useWorkflowManager((state) => state.saveWorkflow);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const status: SaveStatusValue =
    saveState === "saving"
      ? "saving"
      : dirty && saveState === "error"
        ? "error"
        : dirty
          ? "dirty"
          : "saved";
  const retry = useCallback(() => {
    const workflow = getWorkflow(workflowId);
    if (!workflow) return;
    saveWorkflow(workflow).catch((error: unknown) => {
      addNotification({
        type: "error",
        alert: true,
        content: `Failed to save workflow: ${
          error instanceof Error ? error.message : "Server unreachable"
        }`
      });
    });
  }, [addNotification, getWorkflow, saveWorkflow, workflowId]);
  return { status, retry };
};

interface WorkflowDocumentBarProps {
  tab: WorkspaceTab;
}

const WorkflowDocumentBar = ({ tab }: WorkflowDocumentBarProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  // A phone keeps the bar to one row: no history pair, an icon-only switch.
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const workflowId = tab.ref;
  const { status, retry } = useWorkflowSaveStatus(workflowId);

  const undo = useTemporalNodes((state) => state.undo);
  const redo = useTemporalNodes((state) => state.redo);
  const canUndo = useTemporalNodes((state) => state.pastStates.length > 0);
  const canRedo = useTemporalNodes((state) => state.futureStates.length > 0);

  const { editorViewMode, setEditorViewMode } = useSettingsStore(
    useShallow((state) => ({
      editorViewMode: state.settings.editorViewMode,
      setEditorViewMode: state.setEditorViewMode
    }))
  );
  const { miniMapVisible, toggleMiniMap } = useMiniMapStore(
    useShallow((state) => ({
      miniMapVisible: state.visible,
      toggleMiniMap: state.toggleVisible
    }))
  );
  const { conversationCollapsed, toggleConversation } = useCanvasChatDockStore(
    useShallow((state) => ({
      conversationCollapsed: state.conversationCollapsed,
      toggleConversation: state.toggleConversation
    }))
  );
  const { inspectorVisible, toggleInspector } = useRightPanelStore(
    useShallow((state) => ({
      inspectorVisible: state.panel.isVisible,
      toggleInspector: state.toggleInspector
    }))
  );
  const { conversationCount } = useCanvasConversation(workflowId);
  const conversationOpen = !conversationCollapsed;

  const workflowJSON = useNodes((state) => state.workflowJSON);
  const workflowName = useNodes((state) => state.workflow?.name);
  const { openWorkflowApp, hasApp, isPending: isAppPending } = useWorkflowApp();
  const { convertToJsScript, downloadNodeScript, isExporting } =
    useWorkflowScriptExport();

  const downloadJson = useCallback(() => {
    const blob = new Blob([workflowJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${workflowName || "workflow"}.json`;
    link.href = url;
    link.click();
    // Defer the revoke past the download; releasing it synchronously can
    // cancel the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [workflowJSON, workflowName]);

  const modeOptions = [
    {
      value: "graph" as const,
      label: t("i18n-cont-panels-12.toolbar.graph"),
      icon: <AccountTreeIcon />
    },
    {
      value: "chain" as const,
      label: t("i18n-cont-panels-12.toolbar.chain"),
      icon: <LinearScaleIcon />
    }
  ];

  const appLabel = hasApp
    ? t("i18n-cont-panels-12.toolbar.openApp")
    : t("i18n-cont-panels-12.toolbar.makeApp");

  return (
    <WorkspaceDocumentBar
      tab={tab}
      status={<SaveStatus state={status} onRetry={retry} />}
      history={
        !isMobile && (
          <UndoRedoButtons
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={() => undo()}
            onRedo={() => redo()}
          />
        )
      }
      mode={
        <ModeSwitch<EditorViewMode>
          ariaLabel={t("i18n-cont-panels-12.toolbar.viewMode")}
          iconOnly={isMobile}
          options={modeOptions}
          value={editorViewMode}
          onChange={setEditorViewMode}
        />
      }
      view={
        <>
          <ToolbarIconButton
            icon={
              <CountBadge
                count={conversationCount}
                size="small"
                color="primary"
              >
                <ForumOutlinedIcon />
              </CountBadge>
            }
            tooltip={
              conversationOpen
                ? t("i18n-cont-panels-12.toolbar.hideConversation")
                : t("i18n-cont-panels-12.toolbar.showConversation")
            }
            ariaLabel={t("i18n-cont-panels-12.toolbar.toggleConversation")}
            active={conversationOpen}
            onClick={toggleConversation}
          />
          {editorViewMode === "graph" && (
            <ToolbarIconButton
              icon={<MapIcon />}
              tooltip={t("i18n-cont-panels-12.toolbar.miniMap")}
              active={miniMapVisible}
              onClick={toggleMiniMap}
            />
          )}
          <ToolbarIconButton
            icon={<TuneOutlinedIcon />}
            tooltip={
              inspectorVisible
                ? t("i18n-cont-panels-12.toolbar.hideInspector")
                : t("i18n-cont-panels-12.toolbar.showInspector")
            }
            ariaLabel={t("i18n-cont-panels-12.toolbar.toggleInspector")}
            active={inspectorVisible}
            onClick={toggleInspector}
          />
        </>
      }
      actions={
        <DocumentMoreMenu
          items={(close) => [
            <MenuItemPrimitive
              key="app"
              label={appLabel}
              icon={<DashboardCustomizeOutlinedIcon fontSize="small" />}
              disabled={isAppPending}
              onClick={() => {
                close();
                void openWorkflowApp();
              }}
            />,
            <MenuItemPrimitive
              key="json"
              label={t("i18n-cont-panels-12.toolbar.downloadJson")}
              icon={<DownloadIcon fontSize="small" />}
              onClick={() => {
                close();
                downloadJson();
              }}
            />,
            <MenuItemPrimitive
              key="js"
              label={t("i18n-cont-panels-12.toolbar.convertToJsScript")}
              icon={<DataObjectOutlinedIcon fontSize="small" />}
              disabled={isExporting}
              onClick={() => {
                close();
                void convertToJsScript();
              }}
            />,
            <MenuItemPrimitive
              key="node"
              label={t("i18n-cont-panels-12.toolbar.downloadNodeScript")}
              icon={<TerminalIcon fontSize="small" />}
              disabled={isExporting}
              onClick={() => {
                close();
                void downloadNodeScript();
              }}
            />
          ]}
        />
      }
    />
  );
};

export default memo(WorkflowDocumentBar);
