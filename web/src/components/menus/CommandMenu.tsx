/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Command, CommandInput } from "cmdk";
import { Workflow, WorkflowList } from "../../stores/ApiTypes";
import { useCallback, useEffect, useState, useRef, memo } from "react";
import { Dialog } from "../ui_primitives";
import { getMousePosition } from "../../utils/MousePosition";
import useAlignNodes from "../../hooks/useAlignNodes";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../stores/NotificationStore";
import isEqual from "lodash/isEqual";
import React from "react";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useNodes } from "../../contexts/NodeContext";
import { create } from "zustand";
import { shallow } from "zustand/shallow";
import { isDevelopment } from "../../stores/ApiClient";
import { useMiniMapStore } from "../../stores/MiniMapStore";
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import { useDuplicateNodes } from "../../hooks/useDuplicate";
import { useSurroundWithGroup } from "../../hooks/nodes/useSurroundWithGroup";
import { useFitView } from "../../hooks/useFitView";
import { useReactFlow } from "@xyflow/react";
import { useSelectionActions } from "../../hooks/useSelectionActions";
import { useFindInWorkflow } from "../../hooks/useFindInWorkflow";
import { useRightPanelStore } from "../../stores/RightPanelStore";
import { areNodesEqualIgnoringPosition } from "../../utils/nodeEquality";
import { usePanelStore } from "../../stores/PanelStore";

// Icons — Workflow
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import AutoFixHighRoundedIcon from "@mui/icons-material/AutoFixHighRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

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

type CommandMenuProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  undo: (steps?: number | undefined) => void;
  redo: (steps?: number | undefined) => void;
  reactFlowWrapper: React.RefObject<HTMLDivElement>;
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

const WorkflowCommands = memo(function WorkflowCommands() {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
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
  }));
  const run = useWebsocketRunner((state) => state.run);
  const cancel = useWebsocketRunner((state) => state.cancel);
  const { writeClipboard } = useClipboard();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const navigate = useNavigate();

  const saveWorkflow = useWorkflowManager((state) => state.saveWorkflow);
  const saveExample = useWorkflowManager((state) => state.saveExample);
  const getCurrentWorkflow = useWorkflowManager((state) => state.getCurrentWorkflow);
  const createNew = useWorkflowManager((state) => state.createNew);
  const removeWorkflow = useWorkflowManager((state) => state.removeWorkflow);
  const openWorkflows = useWorkflowManager((state) => state.openWorkflows);

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

  return (
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
      <Command.Item onSelect={() => executeAndClose(copyWorkflow)}>
        <ContentCopyRoundedIcon /> Copy Workflow as JSON
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(cancel)}>
        <CancelRoundedIcon /> Cancel Workflow
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(autoLayout)}>
        <AutoFixHighRoundedIcon /> Auto Layout
      </Command.Item>
      {isDevelopment && (
        <Command.Item onSelect={() => executeAndClose(() => saveExample(""))}>
          <SaveRoundedIcon /> Save as Example
        </Command.Item>
      )}
    </Command.Group>
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
    (state) => state.nodes.filter((node) => node.selected),
    areNodesEqualIgnoringPosition
  );
  const surroundWithGroup = useSurroundWithGroup();
  const selectionActions = useSelectionActions();
  const { openFind } = useFindInWorkflow();

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
        onSelect={() => executeAndClose(() => handleFitView({ padding: 0.4 }))}
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

  return (
    <Command.Group heading="Panels">
      <Command.Item
        onSelect={() => executeAndClose(() => rightPanelToggle("inspector"))}
      >
        <InfoRoundedIcon /> Toggle Inspector
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => rightPanelToggle("workflow"))}
      >
        <SettingsRoundedIcon /> Toggle Workflow Settings
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => rightPanelToggle("assistant"))}
      >
        <ChatRoundedIcon /> Toggle Chat
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => leftPanelToggle("assets"))}
      >
        <PermMediaRoundedIcon /> Toggle Assets
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => leftPanelToggle("workflowGrid"))}
      >
        <AccountTreeRoundedIcon /> Toggle Workflows Panel
      </Command.Item>
    </Command.Group>
  );
});

const OpenWorkflowCommands = memo(function OpenWorkflowCommands() {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const navigate = useNavigate();
  const load = useWorkflowManager((state) => state.load);

  const { data: workflows } = useQuery<WorkflowList>({
    queryKey: ["workflows"],
    queryFn: () => load()
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
      {workflows.workflows.map((workflow, idx) => (
        <Command.Item
          key={idx}
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
  reactFlowWrapper: React.RefObject<HTMLDivElement>;
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

  const executeAndClose = useCallback(
    (action: () => void) => {
      action();
      setOpen(false);
    },
    [setOpen]
  );

  // Set up command menu context
  useEffect(() => {
    useCommandMenu.setState({
      executeAndClose,
      reactFlowWrapper
    });
  }, [executeAndClose, reactFlowWrapper]);

  useEffect(() => {
    const focusInput = () => {
      const inputElement = document.querySelector("input[cmdk-input]");
      (inputElement as HTMLInputElement)?.focus();
    };
    if (open) {
      setTimeout(focusInput, 0);
    }
  }, [open]);

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
    >
      <Command label="Command Menu" className="command-menu">
        <CommandInput ref={input} />
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>
          <WorkflowCommands />
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
