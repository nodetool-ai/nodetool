import React, { useCallback, useEffect, useRef, memo } from "react";
import { Command } from "cmdk";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { shallow } from "zustand/shallow";
import { useReactFlow } from "@xyflow/react";
import { WorkflowGraph, WorkflowRequest } from "../../stores/ApiTypes";
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
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FolderZipRoundedIcon from "@mui/icons-material/FolderZipRounded";

// Icons — Edit
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import RedoRoundedIcon from "@mui/icons-material/RedoRounded";
import ContentCutRoundedIcon from "@mui/icons-material/ContentCutRounded";
import ContentPasteRoundedIcon from "@mui/icons-material/ContentPasteRounded";
import FileCopyRoundedIcon from "@mui/icons-material/FileCopyRounded";
import SelectAllRoundedIcon from "@mui/icons-material/SelectAllRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
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
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";

import {
  isBoolean,
  isNumber,
  isObjectLike,
  isString
} from "../../utils/typePredicates";

type CommandMenuProps = {
  undo: (steps?: number | undefined) => void;
  redo: (steps?: number | undefined) => void;
};

type WorkflowSettings = NonNullable<WorkflowRequest["settings"]>;

const isSettingsRecord = (value: unknown): value is WorkflowSettings =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every(
    (entry) =>
      entry === null ||
      isString(entry) ||
      isNumber(entry) ||
      isBoolean(entry)
  );

// The file is whatever the user picked, so a field that isn't the shape it
// claims is dropped rather than handed to the server.
const readImportedWorkflow = (
  text: string
): Pick<
  WorkflowRequest,
  "name" | "description" | "graph" | "tags" | "settings" | "run_mode" | "html_app"
> => {
  const parsed: unknown = JSON.parse(text);
  if (!isObjectLike(parsed)) {
    throw new Error("Workflow file must contain a JSON object");
  }
  const source = parsed as Record<string, unknown>;
  const graph = source.graph;
  const isGraph =
    typeof graph === "object" &&
    graph !== null &&
    Array.isArray((graph as WorkflowGraph).nodes) &&
    Array.isArray((graph as WorkflowGraph).edges);

  const asString = (value: unknown): string | undefined =>
    isString(value) ? value : undefined;

  return {
    name: asString(source.name) ?? "",
    description: asString(source.description),
    graph: isGraph ? (graph as WorkflowGraph) : undefined,
    tags: Array.isArray(source.tags)
      ? source.tags.filter((tag): tag is string => typeof tag === "string")
      : undefined,
    settings: isSettingsRecord(source.settings) ? source.settings : undefined,
    run_mode: asString(source.run_mode),
    html_app: asString(source.html_app)
  };
};

const WorkflowCommands = memo(function WorkflowCommands() {
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
      content: "Copied workflow JSON to Clipboard!"
    });
  }, [writeClipboard, workflowJSON, addNotification]);

  const handleSave = useCallback(async () => {
    const workflow = getCurrentWorkflow();
    if (workflow) {
      try {
        await saveWorkflow(workflow);
        addNotification({
          content: `Workflow "${workflow.name}" saved`,
          type: "success",
          alert: true
        });
      } catch (error) {
        addNotification({
          content: `Failed to save workflow: ${error instanceof Error ? error.message : "Unknown error"}`,
          type: "error",
          alert: true
        });
      }
    }
  }, [saveWorkflow, getCurrentWorkflow, addNotification]);

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
          content: `Imported workflow "${imported.name}"`
        });
      } catch {
        addNotification({
          type: "error",
          alert: true,
          content: "Failed to import workflow — invalid JSON file"
        });
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [createWorkflow, navigate, addNotification]
  );

  const exportBundle = useCallback(async () => {
    if (!currentWorkflow?.id) return;
    try {
      await exportWorkflowBundle(currentWorkflow.id, currentWorkflow.name);
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: `Failed to export bundle: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  }, [currentWorkflow, addNotification]);

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
          content: `Imported ${result.workflows.length} workflow(s) from bundle`
        });
      } catch (error) {
        addNotification({
          type: "error",
          alert: true,
          content: `Failed to import bundle: ${error instanceof Error ? error.message : "Unknown error"}`
        });
      }
      if (bundleInputRef.current) bundleInputRef.current.value = "";
    },
    [queryClient, navigate, addNotification]
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        aria-label="Import workflow file"
        style={{ display: "none" }}
        onChange={handleImportFileChange}
      />
      <input
        ref={bundleInputRef}
        type="file"
        accept=".nodetool,application/zip"
        aria-label="Import workflow bundle file"
        style={{ display: "none" }}
        onChange={handleBundleFileChange}
      />
    <Command.Group heading="Workflow">
      <Command.Item onSelect={() => runCommandAndClose(handleRun)}>
        <PlayArrowRoundedIcon /> Run Entire Workflow
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(handleSave)}>
        <SaveRoundedIcon /> Save Workflow
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(handleNewWorkflow)}>
        <AddRoundedIcon /> New Workflow
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(handleCloseWorkflow)}>
        <CloseRoundedIcon /> Close Workflow
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(downloadWorkflow)}>
        <FileDownloadRoundedIcon /> Download Workflow as JSON
      </Command.Item>
      <Command.Item onSelect={handleImportWorkflow}>
        <FileUploadRoundedIcon /> Import Workflow from JSON
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(exportBundle)}>
        <FolderZipRoundedIcon /> Export Workflow as Bundle (.nodetool)
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(shareWorkflow)}>
        Share Workflow…
      </Command.Item>
      <Command.Item onSelect={handleImportBundle}>
        <FolderZipRoundedIcon /> Import Workflow from Bundle (.nodetool)
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(copyWorkflow)}>
        <ContentCopyRoundedIcon /> Copy Workflow as JSON
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(cancel)}>
        <CancelRoundedIcon /> Cancel Workflow
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(autoLayout)}>
        <AutoFixHighRoundedIcon /> Auto Layout
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
    <Command.Group heading="Edit">
      <Command.Item onSelect={() => runCommandAndClose(undo)}>
        <UndoRoundedIcon /> Undo
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(redo)}>
        <RedoRoundedIcon /> Redo
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(handleCopy)}>
        <FileCopyRoundedIcon /> Copy
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(handleCut)}>
        <ContentCutRoundedIcon /> Cut
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(handlePaste)}>
        <ContentPasteRoundedIcon /> Paste
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(selectAllNodes)}>
        <SelectAllRoundedIcon /> Select All
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(selectionActions.deleteSelected)}>
        <DeleteRoundedIcon /> Delete Selected
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(duplicateNodes)}>
        <ContentCopyRoundedIcon /> Duplicate
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(duplicateNodesVertical)}>
        <ContentCopyRoundedIcon /> Duplicate Vertical
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(handleGroup)}>
        <GroupWorkRoundedIcon /> Group Selected
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(toggleBypassSelected)}>
        <BlockRoundedIcon /> Disable Selected Nodes
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(openFind)}>
        <SearchRoundedIcon /> Find in Workflow
      </Command.Item>
    </Command.Group>
  );
});

const LayoutCommands = memo(function LayoutCommands() {
  const alignNodes = useAlignNodes();
  const selectionActions = useSelectionActions();

  return (
    <Command.Group heading="Layout & Alignment">
      <Command.Item
        onSelect={() =>
          runCommandAndClose(() => alignNodes({ arrangeSpacing: false }))
        }
      >
        <AlignVerticalCenterRoundedIcon /> Align Nodes
      </Command.Item>
      <Command.Item
        onSelect={() =>
          runCommandAndClose(() => alignNodes({ arrangeSpacing: true }))
        }
      >
        <SpaceBarRoundedIcon /> Align Nodes with Spacing
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(selectionActions.alignLeft)}>
        <AlignHorizontalLeftRoundedIcon /> Align Left
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(selectionActions.alignCenter)}>
        <AlignHorizontalCenterRoundedIcon /> Align Center
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(selectionActions.alignRight)}>
        <AlignHorizontalRightRoundedIcon /> Align Right
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(selectionActions.alignTop)}>
        <VerticalAlignTopRoundedIcon /> Align Top
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(selectionActions.alignMiddle)}>
        <VerticalAlignCenterRoundedIcon /> Align Middle
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(selectionActions.alignBottom)}>
        <VerticalAlignBottomRoundedIcon /> Align Bottom
      </Command.Item>
      <Command.Item onSelect={() => runCommandAndClose(selectionActions.distributeHorizontal)}>
        <ViewColumnRoundedIcon /> Distribute Horizontally
      </Command.Item>
    </Command.Group>
  );
});

const ViewCommands = memo(function ViewCommands() {
  const visible = useMiniMapStore((state) => state.visible);
  const toggleVisible = useMiniMapStore((state) => state.toggleVisible);
  const handleFitView = useFitView();
  const reactFlow = useReactFlow();
  const snapToGrid = useSettingsStore((state) => state.settings.snapToGrid);
  const setSnapToGrid = useSettingsStore((state) => state.setSnapToGrid);

  return (
    <Command.Group heading="View">
      <Command.Item
        onSelect={() => runCommandAndClose(toggleVisible)}
      >
        {visible ? <MapOutlinedIcon /> : <MapRoundedIcon />}
        {visible ? "Hide Mini Map" : "Show Mini Map"}
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => setSnapToGrid(!snapToGrid))}
      >
        {snapToGrid ? <GridOffRoundedIcon /> : <GridOnRoundedIcon />}
        {snapToGrid ? "Turn Off Snap to Grid" : "Snap to Grid"}
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => handleFitView({ padding: 0.5 }))}
      >
        <FitScreenRoundedIcon /> Fit View
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => reactFlow.zoomIn({ duration: 200 }))}
      >
        <ZoomInRoundedIcon /> Zoom In
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => reactFlow.zoomOut({ duration: 200 }))}
      >
        <ZoomOutRoundedIcon /> Zoom Out
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => reactFlow.zoomTo(0.5, { duration: 200 }))}
      >
        <RestartAltRoundedIcon /> Reset Zoom (50%)
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => reactFlow.zoomTo(1, { duration: 200 }))}
      >
        <ZoomInRoundedIcon /> Zoom to 100%
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => reactFlow.zoomTo(2, { duration: 200 }))}
      >
        <ZoomInRoundedIcon /> Zoom to 200%
      </Command.Item>
    </Command.Group>
  );
});

const PanelCommands = memo(function PanelCommands() {
  const rightPanelToggle = useRightPanelStore((state) => state.toggleInspector);
  const leftPanelToggle = usePanelStore((state) => state.handleViewChange);
  const toggleConversation = useCanvasChatDockStore(
    (state) => state.toggleConversation
  );

  return (
    <Command.Group heading="Panels">
      <Command.Item
        onSelect={() => runCommandAndClose(rightPanelToggle)}
      >
        <InfoRoundedIcon /> Toggle Inspector
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => leftPanelToggle("settings"))}
      >
        <SettingsRoundedIcon /> Toggle Workflow Settings
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => toggleConversation())}
      >
        <ChatRoundedIcon /> Toggle Conversation
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => leftPanelToggle("assets"))}
      >
        <PermMediaRoundedIcon /> Toggle Assets
      </Command.Item>
      <Command.Item
        onSelect={() => runCommandAndClose(() => leftPanelToggle("workflows"))}
      >
        <AccountTreeRoundedIcon /> Toggle Workflows Panel
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
