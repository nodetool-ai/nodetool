import React, { useCallback, useEffect, useRef, memo } from "react";
import { useTranslation } from "react-i18next";
import { Command } from "cmdk";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { shallow } from "zustand/shallow";
import { useReactFlow } from "@xyflow/react";
import { runCommandAndClose, useCommandMenuStore } from "../../stores/CommandMenuStore";
import useAlignNodes from "../../hooks/useAlignNodes";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../stores/NotificationStore";
import isEqual from "../../utils/isEqual";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useWorkspaceDocumentClose } from "../../hooks/useWorkspaceDocumentClose";
import {
  exportWorkflowBundle,
  importWorkflowBundle
} from "../../utils/workflowBundle";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { useWorkflowShareDialogStore } from "../../stores/WorkflowShareDialogStore";
import { useNodes } from "../../contexts/NodeContext";
import { useMiniMapStore } from "../../stores/MiniMapStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import { useDuplicateNodes } from "../../hooks/useDuplicate";
import { useSurroundWithGroup } from "../../hooks/nodes/useSurroundWithGroup";
import { useFitView } from "../../hooks/useFitView";
import { useSelectionActions } from "../../hooks/useSelectionActions";
import { useFindInWorkflowStore } from "../../stores/FindInWorkflowStore";
import { useRightPanelStore } from "../../stores/RightPanelStore";
import { areNodesEqualIgnoringPosition } from "../../utils/nodeEquality";
import { usePanelStore } from "../../stores/PanelStore";
import { useCanvasChatDockStore } from "../../stores/CanvasChatDockStore";
import { useFloatingToolbarActions } from "../../hooks/useFloatingToolbarActions";
import CommandPalette from "./CommandPalette";

// Icons — Workflow
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import FileUploadRoundedIcon from "@mui/icons-material/FileUploadRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import AutoFixHighRoundedIcon from "@mui/icons-material/AutoFixHighRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import FolderZipRoundedIcon from "@mui/icons-material/FolderZipRounded";

// Icons — Edit
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import RedoRoundedIcon from "@mui/icons-material/RedoRounded";
import ContentCutRoundedIcon from "@mui/icons-material/ContentCutRounded";
import ContentPasteRoundedIcon from "@mui/icons-material/ContentPasteRounded";
import FileCopyRoundedIcon from "@mui/icons-material/FileCopyRounded";
import SelectAllRoundedIcon from "@mui/icons-material/SelectAllRounded";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import GroupWorkRoundedIcon from "@mui/icons-material/GroupWorkRounded";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";

// Icons — Layout & Alignment
import AlignVerticalCenterRoundedIcon from "@mui/icons-material/AlignVerticalCenterRounded";
import SpaceBarRoundedIcon from "@mui/icons-material/SpaceBarRounded";
import AlignHorizontalLeftRoundedIcon from "@mui/icons-material/AlignHorizontalLeftRounded";
import AlignHorizontalCenterRoundedIcon from "@mui/icons-material/AlignHorizontalCenterRounded";
import AlignHorizontalRightRoundedIcon from "@mui/icons-material/AlignHorizontalRightRounded";
import VerticalAlignTopRoundedIcon from "@mui/icons-material/VerticalAlignTopRounded";
import VerticalAlignCenterRoundedIcon from "@mui/icons-material/VerticalAlignCenterRounded";
import VerticalAlignBottomRoundedIcon from "@mui/icons-material/VerticalAlignBottomRounded";
import ViewColumnRoundedIcon from "@mui/icons-material/ViewColumnRounded";

// Icons — View
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import FitScreenRoundedIcon from "@mui/icons-material/FitScreenRounded";
import ZoomInRoundedIcon from "@mui/icons-material/ZoomInRounded";
import ZoomOutRoundedIcon from "@mui/icons-material/ZoomOutRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import GridOnRoundedIcon from "@mui/icons-material/GridOnRounded";
import GridOffRoundedIcon from "@mui/icons-material/GridOffRounded";

// Icons — Panels
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import PermMediaRoundedIcon from "@mui/icons-material/PermMediaRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";

import { readImportedWorkflow } from "../../utils/readImportedWorkflow";

type CommandMenuProps = {
  undo: (steps?: number | undefined) => void;
  redo: (steps?: number | undefined) => void;
};

const WorkflowCommands = memo(function WorkflowCommands() {
  const { t, i18n } = useTranslation();
  // Optimization: use shallow equality to prevent the CommandMenu from
  // re-rendering 60 times a second on unrelated node position updates
  const {
    currentWorkflow,
    workflowJSON,
    autoLayout
  } = useNodes((state) => ({
    currentWorkflow: state.workflow,
    workflowJSON: state.workflowJSON,
    autoLayout: state.autoLayout
  }), shallow);
  const cancel = useWebsocketRunner((state) => state.cancel);
  const { handleRun } = useFloatingToolbarActions();
  const { writeClipboard } = useClipboard();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const saveWorkflow = useWorkflowManager((state) => state.saveWorkflow);
  const getCurrentWorkflow = useWorkflowManager((state) => state.getCurrentWorkflow);
  const createNew = useWorkflowManager((state) => state.createNew);
  const { closeDocument } = useWorkspaceDocumentClose();
  const openForegroundTab = useWorkspaceTabsStore(
    (state) => state.openForegroundTab
  );
  const createWorkflow = useWorkflowManager((state) => state.create);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bundleInputRef = useRef<HTMLInputElement>(null);

  const downloadWorkflow = useCallback(() => {
    const blob = new Blob([workflowJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${currentWorkflow.name}.json`;
    link.href = url;
    link.click();
    // Defer the revoke past the download; releasing it synchronously can cancel
    // the download, and never revoking leaks the blob URL for the page's life.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [workflowJSON, currentWorkflow]);

  const copyWorkflow = useCallback(() => {
    writeClipboard(workflowJSON(), true, true);
    addNotification({
      type: "info",
      alert: true,
      content: t("screens4_2.commandMenu.notifications.copiedWorkflowJson")
    });
  }, [writeClipboard, workflowJSON, addNotification, t]);

  const handleSave = useCallback(async () => {
    const workflow = getCurrentWorkflow();
    if (workflow) {
      try {
        await saveWorkflow(workflow);
        addNotification({
          content: t("screens4_2.commandMenu.notifications.workflowSaved", {
            name: workflow.name
          }),
          type: "success",
          alert: true
        });
      } catch (error) {
        addNotification({
          content: t("screens4_2.commandMenu.errors.saveWorkflow", {
            error: error instanceof Error
              ? error.message
              : t("screens4_2.commandMenu.errors.unknown")
          }),
          type: "error",
          alert: true
        });
      }
    }
  }, [saveWorkflow, getCurrentWorkflow, addNotification, t]);

  const handleNewWorkflow = useCallback(async () => {
    const projectId = creationProjectId();
    const workflow = await createNew(projectId);
    openForegroundTab({
      type: "workflow",
      ref: workflow.id,
      title: workflow.name,
      mode: "edit",
      projectId
    });
    void queryClient.invalidateQueries({ queryKey: ["workflows"] });
    navigate("/workspace");
  }, [createNew, navigate, openForegroundTab, queryClient]);

  const handleCloseWorkflow = () => {
    const tab = useWorkspaceTabsStore.getState().getActiveTab();
    if (tab?.type === "workflow") {
      closeDocument(tab);
    }
  };

  // The pickers open inside the selection's user activation and keep the
  // menu, and with it their file inputs, mounted until a file is chosen.
  const handleImportWorkflow = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      useCommandMenuStore.getState().setOpen(false);
      try {
        const text = await file.text();
        const parsed = readImportedWorkflow(text);
        const imported = await createWorkflow({
          ...parsed,
          name: parsed.name || file.name.replace(/\.json$/, ""),
          description: parsed.description ?? "",
          access: "private"
        });
        navigate(`/editor/${imported.id}`);
        addNotification({
          type: "success",
          alert: true,
          content: t("screens4_2.commandMenu.notifications.importedWorkflow", {
            name: imported.name
          })
        });
      } catch {
        addNotification({
          type: "error",
          alert: true,
          content: t("screens4_2.commandMenu.errors.importWorkflowInvalidJson")
        });
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [createWorkflow, navigate, addNotification, t]
  );

  const exportBundle = useCallback(async () => {
    if (!currentWorkflow?.id) return;
    try {
      await exportWorkflowBundle(currentWorkflow.id, currentWorkflow.name);
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: t("screens4_2.commandMenu.errors.exportWorkflowBundle", {
          error: error instanceof Error
            ? error.message
            : t("screens4_2.commandMenu.errors.unknown")
        })
      });
    }
  }, [currentWorkflow, addNotification, t]);

  const openShareDialog = useWorkflowShareDialogStore((state) => state.open);
  const shareWorkflow = useCallback(() => {
    if (!currentWorkflow?.id) return;
    openShareDialog({
      workflowId: currentWorkflow.id,
      workflowName: currentWorkflow.name
    });
  }, [currentWorkflow, openShareDialog]);

  const handleImportBundle = useCallback(() => {
    bundleInputRef.current?.click();
  }, []);

  const handleBundleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      useCommandMenuStore.getState().setOpen(false);
      try {
        const result = await importWorkflowBundle(file);
        await queryClient.invalidateQueries({ queryKey: ["workflows"] });
        const first = result.workflows[0];
        if (first) {
          navigate(`/editor/${first.id}`);
        }
        addNotification({
          type: "success",
          alert: true,
          content: t("screens4_2.commandMenu.notifications.importedWorkflowsFromBundle", {
            count: result.workflows.length,
            formattedCount: new Intl.NumberFormat(i18n.language).format(result.workflows.length)
          })
        });
      } catch (error) {
        addNotification({
          type: "error",
          alert: true,
          content: t("screens4_2.commandMenu.errors.importWorkflowBundle", {
            error: error instanceof Error
              ? error.message
              : t("screens4_2.commandMenu.errors.unknown")
          })
        });
      }
      if (bundleInputRef.current) bundleInputRef.current.value = "";
    },
    [queryClient, navigate, addNotification, t, i18n.language]
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        aria-label={t("screens4_2.commandMenu.accessibility.importWorkflowFile")}
        style={{ display: "none" }}
        onChange={handleImportFileChange}
      />
      <input
        ref={bundleInputRef}
        type="file"
        accept=".nodetool,application/zip"
        aria-label={t("screens4_2.commandMenu.accessibility.importWorkflowBundleFile")}
        style={{ display: "none" }}
        onChange={handleBundleFileChange}
      />
    <Command.Group heading={t("screens4_2.commandMenu.groups.workflow")}>
      <Command.Item onSelect={() => runCommandAndClose(handleRun)}>
        <PlayArrowRoundedIcon /> {t("screens4_2.commandMenu.actions.runEntireWorkflow")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(handleSave)}>
        <SaveRoundedIcon /> {t("screens4_2.commandMenu.actions.saveWorkflow")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(handleNewWorkflow)}>
        <AddOutlinedIcon /> {t("screens4_2.commandMenu.actions.newWorkflow")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(handleCloseWorkflow)}>
        <CloseOutlinedIcon /> {t("screens4_2.commandMenu.actions.closeWorkflow")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(downloadWorkflow)}>
        <FileDownloadRoundedIcon /> {t("screens4_2.commandMenu.actions.downloadWorkflowJson")}
      </Command.Item>
      <Command.Item onSelect={handleImportWorkflow}>
        <FileUploadRoundedIcon /> {t("screens4_2.commandMenu.actions.importWorkflowJson")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(exportBundle)}>
        <FolderZipRoundedIcon /> {t("screens4_2.commandMenu.actions.exportWorkflowBundle")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(shareWorkflow)}>
        {t("screens4_2.commandMenu.actions.shareWorkflow")}
      </Command.Item>
      <Command.Item onSelect={handleImportBundle}>
        <FolderZipRoundedIcon /> {t("screens4_2.commandMenu.actions.importWorkflowBundle")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(copyWorkflow)}>
        <ContentCopyRoundedIcon /> {t("screens4_2.commandMenu.actions.copyWorkflowJson")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(cancel)}>
        <CancelRoundedIcon /> {t("screens4_2.commandMenu.actions.cancelWorkflow")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(autoLayout)}>
        <AutoFixHighRoundedIcon /> {t("screens4_2.commandMenu.actions.autoLayout")}
      </Command.Item>
    </Command.Group>
    </>
  );
});

interface HistoryActions {
  undo: () => void;
  redo: () => void;
}

const EditCommands = memo(function EditCommands({
  undo,
  redo
}: HistoryActions) {
  const { t } = useTranslation();
  const { handleCopy, handlePaste, handleCut } = useCopyPaste();
  // Combine multiple useNodes subscriptions into a single selector with shallow equality
  // to reduce unnecessary re-renders when other parts of the node state change
  const { selectAllNodes, toggleBypassSelected } = useNodes(
    (state) => ({
      selectAllNodes: state.selectAllNodes,
      toggleBypassSelected: state.toggleBypassSelected
    }),
    shallow
  );
  const duplicateNodes = useDuplicateNodes();
  const duplicateNodesVertical = useDuplicateNodes(true);
  const selectedNodes = useNodes(
    (state) => state.getSelectedNodes(),
    areNodesEqualIgnoringPosition
  );
  const surroundWithGroup = useSurroundWithGroup();
  const selectionActions = useSelectionActions();
  const openFind = useFindInWorkflowStore((state) => state.openFind);

  const handleGroup = useCallback(() => {
    if (selectedNodes.length) {
      surroundWithGroup({ selectedNodes });
    }
  }, [surroundWithGroup, selectedNodes]);

  return (
    <Command.Group heading={t("screens4_2.commandMenu.groups.edit")}>
      <Command.Item onSelect={() => runCommandAndClose(undo)}>
        <UndoRoundedIcon /> {t("screens4_2.commandMenu.actions.undo")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(redo)}>
        <RedoRoundedIcon /> {t("screens4_2.commandMenu.actions.redo")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(handleCopy)}>
        <FileCopyRoundedIcon /> {t("screens4_2.commandMenu.actions.copy")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(handleCut)}>
        <ContentCutRoundedIcon /> {t("screens4_2.commandMenu.actions.cut")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(handlePaste)}>
        <ContentPasteRoundedIcon /> {t("screens4_2.commandMenu.actions.paste")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(selectAllNodes)}>
        <SelectAllRoundedIcon /> {t("screens4_2.commandMenu.actions.selectAll")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(selectionActions.deleteSelected)}>
        <DeleteOutlineIcon /> {t("screens4_2.commandMenu.actions.deleteSelected")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(duplicateNodes)}>
        <ContentCopyRoundedIcon /> {t("screens4_2.commandMenu.actions.duplicate")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(duplicateNodesVertical)}>
        <ContentCopyRoundedIcon /> {t("screens4_2.commandMenu.actions.duplicateVertical")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(handleGroup)}>
        <GroupWorkRoundedIcon /> {t("screens4_2.commandMenu.actions.groupSelected")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(toggleBypassSelected)}>
        <BlockRoundedIcon /> {t("screens4_2.commandMenu.actions.disableSelectedNodes")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(openFind)}>
        <SearchRoundedIcon /> {t("screens4_2.commandMenu.actions.findInWorkflow")}
      </Command.Item>
    </Command.Group>
  );
});

const LayoutCommands = memo(function LayoutCommands() {
  const { t } = useTranslation();
  const alignNodes = useAlignNodes();
  const selectionActions = useSelectionActions();

  return (
    <Command.Group heading={t("screens4_2.commandMenu.groups.layoutAlignment")}>
      <Command.Item
        onSelect={() =>
          runCommandAndClose(() => alignNodes({ arrangeSpacing: false }))
        }
      >
        <AlignVerticalCenterRoundedIcon /> {t("screens4_2.commandMenu.actions.alignNodes")}
      </Command.Item>
      <Command.Item
        onSelect={() =>
          runCommandAndClose(() => alignNodes({ arrangeSpacing: true }))
        }
      >
        <SpaceBarRoundedIcon /> {t("screens4_2.commandMenu.actions.alignNodesWithSpacing")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(selectionActions.alignLeft)}>
        <AlignHorizontalLeftRoundedIcon /> {t("screens4_2.commandMenu.actions.alignLeft")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(selectionActions.alignCenter)}>
        <AlignHorizontalCenterRoundedIcon /> {t("screens4_2.commandMenu.actions.alignCenter")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(selectionActions.alignRight)}>
        <AlignHorizontalRightRoundedIcon /> {t("screens4_2.commandMenu.actions.alignRight")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(selectionActions.alignTop)}>
        <VerticalAlignTopRoundedIcon /> {t("screens4_2.commandMenu.actions.alignTop")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(selectionActions.alignMiddle)}>
        <VerticalAlignCenterRoundedIcon /> {t("screens4_2.commandMenu.actions.alignMiddle")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(selectionActions.alignBottom)}>
        <VerticalAlignBottomRoundedIcon /> {t("screens4_2.commandMenu.actions.alignBottom")}
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(selectionActions.distributeHorizontal)}>
        <ViewColumnRoundedIcon /> {t("screens4_2.commandMenu.actions.distributeHorizontally")}
      </Command.Item>
    </Command.Group>
  );
});

const ViewCommands = memo(function ViewCommands() {
  const { t, i18n } = useTranslation();
  const visible = useMiniMapStore((state) => state.visible);
  const toggleVisible = useMiniMapStore((state) => state.toggleVisible);
  const handleFitView = useFitView();
  const reactFlow = useReactFlow();
  const snapToGrid = useSettingsStore((state) => state.settings.snapToGrid);
  const setSnapToGrid = useSettingsStore((state) => state.setSnapToGrid);
  const formatPercent = (value: number): string =>
    new Intl.NumberFormat(i18n.language, { style: "percent" }).format(value);

  return (
    <Command.Group heading={t("screens4_2.commandMenu.groups.view")}>
      <Command.Item
        onSelect={() => runCommandAndClose(toggleVisible)}
      >
        {visible ? <MapOutlinedIcon /> : <MapRoundedIcon />}
        {visible
          ? t("screens4_2.commandMenu.actions.hideMiniMap")
          : t("screens4_2.commandMenu.actions.showMiniMap")}
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => setSnapToGrid(!snapToGrid))}
      >
        {snapToGrid ? <GridOffRoundedIcon /> : <GridOnRoundedIcon />}
        {snapToGrid
          ? t("screens4_2.commandMenu.actions.turnOffSnapToGrid")
          : t("screens4_2.commandMenu.actions.snapToGrid")}
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => handleFitView({ padding: 0.5 }))}
      >
        <FitScreenRoundedIcon /> {t("screens4_2.commandMenu.actions.fitView")}
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => reactFlow.zoomIn({ duration: 200 }))}
      >
        <ZoomInRoundedIcon /> {t("screens4_2.commandMenu.actions.zoomIn")}
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => reactFlow.zoomOut({ duration: 200 }))}
      >
        <ZoomOutRoundedIcon /> {t("screens4_2.commandMenu.actions.zoomOut")}
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => reactFlow.zoomTo(0.5, { duration: 200 }))}
      >
        <RestartAltRoundedIcon /> {t("screens4_2.commandMenu.actions.resetZoom", { percent: formatPercent(0.5) })}
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => reactFlow.zoomTo(1, { duration: 200 }))}
      >
        <ZoomInRoundedIcon /> {t("screens4_2.commandMenu.actions.zoomToPercent", { percent: formatPercent(1) })}
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => reactFlow.zoomTo(2, { duration: 200 }))}
      >
        <ZoomInRoundedIcon /> {t("screens4_2.commandMenu.actions.zoomToPercent", { percent: formatPercent(2) })}
      </Command.Item>
    </Command.Group>
  );
});

const PanelCommands = memo(function PanelCommands() {
  const { t } = useTranslation();
  const rightPanelToggle = useRightPanelStore((state) => state.toggleInspector);
  const leftPanelToggle = usePanelStore((state) => state.handleViewChange);
  const toggleConversation = useCanvasChatDockStore(
    (state) => state.toggleConversation
  );

  return (
    <Command.Group heading={t("screens4_2.commandMenu.groups.panels")}>
      <Command.Item
        onSelect={() => runCommandAndClose(rightPanelToggle)}
      >
        <InfoOutlinedIcon /> {t("screens4_2.commandMenu.actions.toggleInspector")}
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => leftPanelToggle("settings"))}
      >
        <SettingsRoundedIcon /> {t("screens4_2.commandMenu.actions.toggleWorkflowSettings")}
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => toggleConversation())}
      >
        <ChatRoundedIcon /> {t("screens4_2.commandMenu.actions.toggleConversation")}
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => leftPanelToggle("assets"))}
      >
        <PermMediaRoundedIcon /> {t("screens4_2.commandMenu.actions.toggleAssets")}
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => leftPanelToggle("workflows"))}
      >
        <AccountTreeRoundedIcon /> {t("screens4_2.commandMenu.actions.toggleWorkflowsPanel")}
      </Command.Item>
    </Command.Group>
  );
});

/**
 * The command menu as the node editor renders it: the palette every view
 * shows, plus the workflow, edit, layout, canvas, and panel commands that need
 * this editor's NodeContext and ReactFlow provider. Mounted only while the
 * editor is active, and claims the menu from the app-root host for that time.
 */
const CommandMenu: React.FC<CommandMenuProps> = ({ undo, redo }) => {
  const claimForEditor = useCommandMenuStore((state) => state.claimForEditor);
  useEffect(() => claimForEditor(), [claimForEditor]);

  return (
    <CommandPalette>
      <WorkflowCommands />
      <EditCommands undo={undo} redo={redo} />
      <LayoutCommands />
      <ViewCommands />
      <PanelCommands />
    </CommandPalette>
  );
};

export default React.memo(CommandMenu, isEqual);
