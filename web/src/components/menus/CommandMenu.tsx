/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Command, CommandInput } from "cmdk";
import {
  Workflow,
  WorkflowGraph,
  WorkflowList,
  WorkflowRequest
} from "../../stores/ApiTypes";
import { useCallback, useEffect, useState, useRef, memo } from "react";
import { Dialog } from "../ui_primitives";
import { getMousePosition } from "../../utils/MousePosition";
import useAlignNodes from "../../hooks/useAlignNodes";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../stores/NotificationStore";
import isEqual from "../../utils/isEqual";
import React from "react";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  exportWorkflowBundle,
  importWorkflowBundle
} from "../../utils/workflowBundle";
import {
  exportApplicationBundle,
  importApplicationBundle
} from "../../utils/applicationBundle";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useWorkflowShareDialogStore } from "../../stores/WorkflowShareDialogStore";
import { useNodes } from "../../contexts/NodeContext";
import { create } from "zustand";
import { shallow } from "zustand/shallow";
import { useMiniMapStore } from "../../stores/MiniMapStore";
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import { useDuplicateNodes } from "../../hooks/useDuplicate";
import { useSurroundWithGroup } from "../../hooks/nodes/useSurroundWithGroup";
import { useFitView } from "../../hooks/useFitView";
import { useReactFlow } from "@xyflow/react";
import { useSelectionActions } from "../../hooks/useSelectionActions";
import { workflowListQueryKey } from "../../serverState/workflowQueryKeys";
import { useFindInWorkflowStore } from "../../stores/FindInWorkflowStore";
import { useRightPanelStore } from "../../stores/RightPanelStore";
import { areNodesEqualIgnoringPosition } from "../../utils/nodeEquality";
import { usePanelStore } from "../../stores/PanelStore";
import { useCanvasChatDockStore } from "../../stores/CanvasChatDockStore";
import { useAutoFocusEnabled } from "../../hooks/useAutoFocusEnabled";

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

// Icons — Panels
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import PermMediaRoundedIcon from "@mui/icons-material/PermMediaRounded";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";

// Icons — Nodes & Workflows list
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import {
  isBoolean,
  isNumber,
  isObjectLike,
  isString
} from "../../utils/typePredicates";

type CommandMenuProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  undo: (steps?: number | undefined) => void;
  redo: (steps?: number | undefined) => void;
  reactFlowWrapper: React.RefObject<HTMLDivElement | null>;
};

const styles = () =>
  css({
    ".MuiDialog-paper": {
      maxWidth: "800px",
      width: "40vw",
      background: "transparent",
      boxShadow: "none"
    }
  });

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
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  // Optimization: use shallow equality to prevent the CommandMenu from
  // re-rendering 60 times a second on unrelated node position updates
  const {
    nodes,
    edges,
    currentWorkflow,
    workflowJSON,
    autoLayout
  } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    currentWorkflow: state.workflow,
    workflowJSON: state.workflowJSON,
    autoLayout: state.autoLayout
  }), shallow);
  const run = useWebsocketRunner((state) => state.run);
  const cancel = useWebsocketRunner((state) => state.cancel);
  const { writeClipboard } = useClipboard();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const saveWorkflow = useWorkflowManager((state) => state.saveWorkflow);
  const getCurrentWorkflow = useWorkflowManager((state) => state.getCurrentWorkflow);
  const createNew = useWorkflowManager((state) => state.createNew);
  const removeWorkflow = useWorkflowManager((state) => state.removeWorkflow);
  const openWorkflows = useWorkflowManager((state) => state.openWorkflows);
  const createWorkflow = useWorkflowManager((state) => state.create);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bundleInputRef = useRef<HTMLInputElement>(null);

  const runWorkflow = useCallback(() => {
    run({}, currentWorkflow, nodes, edges);
  }, [run, currentWorkflow, nodes, edges]);

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
    const newWorkflow = await createNew();
    navigate(`/editor/${newWorkflow.id}`);
  }, [createNew, navigate]);

  const handleCloseWorkflow = useCallback(() => {
    const workflow = getCurrentWorkflow();
    if (workflow) {
      removeWorkflow(workflow.id);
      const remaining = openWorkflows.filter((w) => w.id !== workflow.id);
      if (remaining.length > 0) {
        navigate(`/editor/${remaining[remaining.length - 1].id}`);
      } else {
        navigate("/editor");
      }
    }
  }, [removeWorkflow, getCurrentWorkflow, openWorkflows, navigate]);

  const handleImportWorkflow = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
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
      <Command.Item onSelect={() => executeAndClose(runWorkflow)}>
        <PlayArrowRoundedIcon /> Run Workflow
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(handleSave)}>
        <SaveRoundedIcon /> Save Workflow
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(handleNewWorkflow)}>
        <AddRoundedIcon /> New Workflow
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(handleCloseWorkflow)}>
        <CloseRoundedIcon /> Close Workflow
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(downloadWorkflow)}>
        <FileDownloadRoundedIcon /> Download Workflow as JSON
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(handleImportWorkflow)}>
        <FileUploadRoundedIcon /> Import Workflow from JSON
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(exportBundle)}>
        <FolderZipRoundedIcon /> Export Workflow as Bundle (.nodetool)
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(shareWorkflow)}>
        Share Workflow…
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(handleImportBundle)}>
        <FolderZipRoundedIcon /> Import Workflow from Bundle (.nodetool)
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(copyWorkflow)}>
        <ContentCopyRoundedIcon /> Copy Workflow as JSON
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(cancel)}>
        <CancelRoundedIcon /> Cancel Workflow
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(autoLayout)}>
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
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
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
      <Command.Item onSelect={() => executeAndClose(undo)}>
        <UndoRoundedIcon /> Undo
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(redo)}>
        <RedoRoundedIcon /> Redo
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(handleCopy)}>
        <FileCopyRoundedIcon /> Copy
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(handleCut)}>
        <ContentCutRoundedIcon /> Cut
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(handlePaste)}>
        <ContentPasteRoundedIcon /> Paste
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(selectAllNodes)}>
        <SelectAllRoundedIcon /> Select All
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(selectionActions.deleteSelected)}>
        <DeleteRoundedIcon /> Delete Selected
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(duplicateNodes)}>
        <ContentCopyRoundedIcon /> Duplicate
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(duplicateNodesVertical)}>
        <ContentCopyRoundedIcon /> Duplicate Vertical
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(handleGroup)}>
        <GroupWorkRoundedIcon /> Group Selected
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(toggleBypassSelected)}>
        <BlockRoundedIcon /> Bypass Node
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(openFind)}>
        <SearchRoundedIcon /> Find in Workflow
      </Command.Item>
    </Command.Group>
  );
});

const LayoutCommands = memo(function LayoutCommands() {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const alignNodes = useAlignNodes();
  const selectionActions = useSelectionActions();

  return (
    <Command.Group heading="Layout & Alignment">
      <Command.Item
        onSelect={() =>
          executeAndClose(() => alignNodes({ arrangeSpacing: false }))
        }
      >
        <AlignVerticalCenterRoundedIcon /> Align Nodes
      </Command.Item>
      <Command.Item
        onSelect={() =>
          executeAndClose(() => alignNodes({ arrangeSpacing: true }))
        }
      >
        <SpaceBarRoundedIcon /> Align Nodes with Spacing
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(selectionActions.alignLeft)}>
        <AlignHorizontalLeftRoundedIcon /> Align Left
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(selectionActions.alignCenter)}>
        <AlignHorizontalCenterRoundedIcon /> Align Center
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(selectionActions.alignRight)}>
        <AlignHorizontalRightRoundedIcon /> Align Right
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(selectionActions.alignTop)}>
        <VerticalAlignTopRoundedIcon /> Align Top
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(selectionActions.alignMiddle)}>
        <VerticalAlignCenterRoundedIcon /> Align Middle
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(selectionActions.alignBottom)}>
        <VerticalAlignBottomRoundedIcon /> Align Bottom
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(selectionActions.distributeHorizontal)}>
        <ViewColumnRoundedIcon /> Distribute Horizontally
      </Command.Item>
    </Command.Group>
  );
});

const ViewCommands = memo(function ViewCommands() {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const visible = useMiniMapStore((state) => state.visible);
  const toggleVisible = useMiniMapStore((state) => state.toggleVisible);
  const handleFitView = useFitView();
  const reactFlow = useReactFlow();

  return (
    <Command.Group heading="View">
      <Command.Item
        onSelect={() => executeAndClose(toggleVisible)}
      >
        {visible ? <MapOutlinedIcon /> : <MapRoundedIcon />}
        {visible ? "Hide Mini Map" : "Show Mini Map"}
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => handleFitView({ padding: 0.5 }))}
      >
        <FitScreenRoundedIcon /> Fit View
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => reactFlow.zoomIn({ duration: 200 }))}
      >
        <ZoomInRoundedIcon /> Zoom In
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => reactFlow.zoomOut({ duration: 200 }))}
      >
        <ZoomOutRoundedIcon /> Zoom Out
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => reactFlow.zoomTo(0.5, { duration: 200 }))}
      >
        <RestartAltRoundedIcon /> Reset Zoom (50%)
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => reactFlow.zoomTo(1, { duration: 200 }))}
      >
        <ZoomInRoundedIcon /> Zoom to 100%
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => reactFlow.zoomTo(2, { duration: 200 }))}
      >
        <ZoomInRoundedIcon /> Zoom to 200%
      </Command.Item>
    </Command.Group>
  );
});

const PanelCommands = memo(function PanelCommands() {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const rightPanelToggle = useRightPanelStore((state) => state.handleViewChange);
  const leftPanelToggle = usePanelStore((state) => state.handleViewChange);
  const toggleConversation = useCanvasChatDockStore(
    (state) => state.toggleConversation
  );

  return (
    <Command.Group heading="Panels">
      <Command.Item
        onSelect={() => executeAndClose(() => rightPanelToggle("inspector"))}
      >
        <InfoRoundedIcon /> Toggle Inspector
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => leftPanelToggle("settings"))}
      >
        <SettingsRoundedIcon /> Toggle Workflow Settings
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => toggleConversation())}
      >
        <ChatRoundedIcon /> Toggle Conversation
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => leftPanelToggle("assets"))}
      >
        <PermMediaRoundedIcon /> Toggle Assets
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => leftPanelToggle("workflows"))}
      >
        <AccountTreeRoundedIcon /> Toggle Workflows Panel
      </Command.Item>
    </Command.Group>
  );
});

/**
 * App bundle commands, mirroring the workflow bundle ones. An app bundle is
 * one JSON file carrying the app plus the graph of every workflow it binds, so
 * export needs an app tab open and import creates both the workflows and the
 * app, then opens it.
 */
const AppCommands = memo(function AppCommands() {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const queryClient = useQueryClient();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const applicationId = useWorkspaceTabsStore((state) => {
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    return tab?.type === "application" ? tab.ref : null;
  });
  const applicationName = useWorkspaceTabsStore((state) => {
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    return tab?.type === "application" ? tab.title : "";
  });
  const appBundleInputRef = useRef<HTMLInputElement>(null);

  const exportApp = useCallback(async () => {
    if (!applicationId) return;
    try {
      await exportApplicationBundle(applicationId, applicationName || "app");
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: `Failed to export app bundle: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  }, [applicationId, applicationName, addNotification]);

  const pickAppBundle = useCallback(() => {
    appBundleInputRef.current?.click();
  }, []);

  const handleAppBundleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const app = await importApplicationBundle(file);
        await queryClient.invalidateQueries({ queryKey: ["applications"] });
        await queryClient.invalidateQueries({ queryKey: ["workflows"] });
        openTab({ type: "application", ref: app.id, title: app.name });
        addNotification({
          type: "success",
          alert: true,
          content: `Imported app "${app.name}"`
        });
      } catch (error) {
        addNotification({
          type: "error",
          alert: true,
          content: `Failed to import app bundle: ${error instanceof Error ? error.message : "Unknown error"}`
        });
      }
      if (appBundleInputRef.current) appBundleInputRef.current.value = "";
    },
    [queryClient, openTab, addNotification]
  );

  return (
    <>
      <input
        ref={appBundleInputRef}
        type="file"
        accept=".json,application/json"
        aria-label="Import app bundle file"
        style={{ display: "none" }}
        onChange={handleAppBundleFileChange}
      />
      <Command.Group heading="App">
        {applicationId && (
          <Command.Item onSelect={() => executeAndClose(exportApp)}>
            <FolderZipRoundedIcon /> Export App as Bundle (.app.json)
          </Command.Item>
        )}
        <Command.Item onSelect={() => executeAndClose(pickAppBundle)}>
          <FolderZipRoundedIcon /> Import App from Bundle (.app.json)
        </Command.Item>
      </Command.Group>
    </>
  );
});

/** Matches the default page size of `WorkflowManagerStore.load`. */
const COMMAND_MENU_WORKFLOW_LIMIT = 100;

const OpenWorkflowCommands = memo(function OpenWorkflowCommands() {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const navigate = useNavigate();
  const load = useWorkflowManager((state) => state.load);

  const { data: workflows } = useQuery<WorkflowList>({
    queryKey: workflowListQueryKey(COMMAND_MENU_WORKFLOW_LIMIT),
    queryFn: () => load("", COMMAND_MENU_WORKFLOW_LIMIT)
  });

  const openWorkflow = useCallback(
    (workflow: Workflow) => {
      navigate("/editor/" + workflow.id);
    },
    [navigate]
  );

  if (!workflows) { return null; }

  return (
    <Command.Group heading="Workflows">
      {workflows.workflows.map((workflow) => (
        <Command.Item
          key={workflow.id}
          onSelect={() => executeAndClose(() => openWorkflow(workflow))}
        >
          <FolderOpenRoundedIcon /> {workflow.name}
        </Command.Item>
      ))}
    </Command.Group>
  );
});

// Create a context/store for command menu state
const useCommandMenu = create<{
  executeAndClose: (action: () => void) => void;
  reactFlowWrapper: React.RefObject<HTMLDivElement | null>;
}>((_set) => ({
  executeAndClose: () => { },
  reactFlowWrapper: { current: null }
}));

const CommandMenu: React.FC<CommandMenuProps> = ({
  open,
  setOpen,
  undo,
  redo,
  reactFlowWrapper
}) => {
  const [pastePosition, setPastePosition] = useState({ x: 0, y: 0 });
  const input = useRef<HTMLInputElement>(null);
  const autoFocusEnabled = useAutoFocusEnabled();
  const focusInputTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeAndClose = useCallback(
    (action: () => void) => {
      action();
      setOpen(false);
    },
    [setOpen]
  );

  useEffect(() => {
    useCommandMenu.setState({
      executeAndClose,
      reactFlowWrapper
    });
  }, [executeAndClose, reactFlowWrapper]);

  // Skipped on touch, where the virtual keyboard would cover the command list.
  useEffect(() => {
    if (open && autoFocusEnabled) {
      if (focusInputTimeoutRef.current) {
        clearTimeout(focusInputTimeoutRef.current);
      }
      focusInputTimeoutRef.current = setTimeout(() => input.current?.focus(), 0);
    }

    return () => {
      if (focusInputTimeoutRef.current) {
        clearTimeout(focusInputTimeoutRef.current);
      }
    };
  }, [open, autoFocusEnabled]);

  useEffect(() => {
    return () => {
      if (focusInputTimeoutRef.current) {
        clearTimeout(focusInputTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (open) {
      setPastePosition(getMousePosition());
    }
  }, [open, pastePosition]);

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      className="command-menu-dialog"
      css={styles()}
      aria-label="Command menu"
    >
      <Command label="Command Menu" className="command-menu">
        <CommandInput
          ref={input}
          placeholder="Type a command or search…"
          aria-label="Command menu search"
        />
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>
          <WorkflowCommands />
          <AppCommands />
          <EditCommands undo={undo} redo={redo} />
          <LayoutCommands />
          <ViewCommands />
          <PanelCommands />
          <OpenWorkflowCommands />
        </Command.List>
      </Command>
    </Dialog>
  );
};

export default React.memo(CommandMenu, isEqual);
