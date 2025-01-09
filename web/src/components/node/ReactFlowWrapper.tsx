/** @jsxImportSource @emotion/react */
import { useCallback, useRef, useEffect, useMemo, memo, useState } from "react";
import {
  useReactFlow,
  Node,
  Background,
  BackgroundVariant,
  FitViewOptions,
  ReactFlow,
  Connection,
  SelectionMode,
  ConnectionMode
} from "@xyflow/react";

// store
import { useNodeStore, useTemporalStore } from "../../stores/NodeStore";
import { HistoryManager } from "../../HistoryManager";
// store
import useConnectionStore from "../../stores/ConnectionStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useContextMenuStore from "../../stores/ContextMenuStore";
// components
import NodeContextMenu from "../context_menus/NodeContextMenu";
import PaneContextMenu from "../context_menus/PaneContextMenu";
import SelectionContextMenu from "../context_menus/SelectionContextMenu";
import PropertyContextMenu from "../context_menus/PropertyContextMenu";
import OutputContextMenu from "../context_menus/OutputContextMenu";
import InputContextMenu from "../context_menus/InputContextMenu";
import CommentNode from "../node/CommentNode";
import PreviewNode from "../node/PreviewNode";
import PlaceholderNode from "../node_types/PlaceholderNode";
import LoopNode from "../node/LoopNode";
//utils

//hooks
import { useNodeTypes } from "../../serverState/useMetadata";
import { useDropHandler } from "../../hooks/handlers/useDropHandler";
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import { useDuplicateNodes } from "../../hooks/useDuplicate";
import useConnectionHandlers from "../../hooks/handlers/useConnectionHandlers";
import useEdgeHandlers from "../../hooks/handlers/useEdgeHandlers";
import useDragHandlers from "../../hooks/handlers/useDragHandlers";
// constants
import { MAX_ZOOM, MIN_ZOOM } from "../../config/constants";
import HuggingFaceDownloadDialog from "../hugging_face/HuggingFaceDownloadDialog";
import GroupNode from "../node/GroupNode";
import { useSurroundWithGroup } from "../../hooks/nodes/useSurroundWithGroup";
import { isEqual } from "lodash";
import ThemeNodes from "../themes/ThemeNodes";
import { useRenderLogger } from "../../hooks/useRenderLogger";
import AxisMarker from "../node_editor/AxisMarker";
import ConnectionLine from "../node_editor/ConnectionLine";
import NodeTitleEditor from "./NodeTitleEditor";
import useSelect from "../../hooks/nodes/useSelect";

declare global {
  interface Window {
    __beforeUnloadListenerAdded?: boolean;
  }
}

// FIT SCREEN
const fitViewOptions = {
  maxZoom: MAX_ZOOM,
  minZoom: MIN_ZOOM,
  padding: 0.6
};

interface ReactFlowWrapperProps {
  isMinZoom?: boolean;
  reactFlowWrapper: React.RefObject<HTMLDivElement>;
}

const ReactFlowWrapper: React.FC<ReactFlowWrapperProps> = ({
  isMinZoom,
  reactFlowWrapper
}) => {
  const {
    nodes,
    edges,
    onConnect,
    onNodesChange,
    onEdgesChange,
    onEdgeUpdate,
    updateNodeData
  } = useNodeStore((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    onConnect: state.onConnect,
    onNodesChange: state.onNodesChange,
    onEdgesChange: state.onEdgesChange,
    onEdgeUpdate: state.onEdgeUpdate,
    updateNodeData: state.updateNodeData
  }));

  const { handleOnConnect, onConnectStart, onConnectEnd } =
    useConnectionHandlers();
  /* OPTIONS */
  const proOptions = {
    //https://reactflow.dev/docs/guides/remove-attribution/
    hideAttribution: true
  };

  const triggerOnConnect = useCallback(
    (connection: Connection) => {
      onConnect(connection);
      handleOnConnect(connection);
    },
    [onConnect, handleOnConnect]
  );

  const connecting = useConnectionStore((state) => state.connecting);

  /* REACTFLOW */
  const ref = useRef<HTMLDivElement | null>(null);
  const reactFlowInstance = useReactFlow();

  /* USE STORE */
  const nodeTypes = useNodeTypes();
  const nodeHistory: HistoryManager = useTemporalStore((state) => state);
  const { shouldFitToScreen, setShouldFitToScreen, setExplicitSave } =
    useNodeStore((state) => ({
      shouldFitToScreen: state.shouldFitToScreen,
      setShouldFitToScreen: state.setShouldFitToScreen,
      setExplicitSave: state.setExplicitSave
    }));
  const { close: closeSelect } = useSelect();

  /* DEFINE NODE TYPES */
  nodeTypes["nodetool.group.Loop"] = LoopNode;
  nodeTypes["nodetool.workflows.base_node.Group"] = GroupNode;
  nodeTypes["nodetool.workflows.base_node.Comment"] = CommentNode;
  nodeTypes["nodetool.workflows.base_node.Preview"] = PreviewNode;
  nodeTypes["default"] = PlaceholderNode;

  /* UTILS */
  const { handleCopy, handlePaste, handleCut } = useCopyPaste();
  const getSelectedNodeIds = useNodeStore((state) => state.getSelectedNodeIds);
  const duplicateNodes = useDuplicateNodes();
  const surroundWithGroup = useSurroundWithGroup();

  /* SETTINGS */
  const settings = useSettingsStore((state) => state.settings);

  /* ON DROP*/
  const { onDrop } = useDropHandler();

  /* HISTORY */
  const history: HistoryManager = useTemporalStore((state) => state);

  // OPEN NODE MENU
  const { openNodeMenu, closeNodeMenu, isMenuOpen } = useNodeMenuStore(
    (state) => ({
      openNodeMenu: state.openNodeMenu,
      closeNodeMenu: state.closeNodeMenu,
      isMenuOpen: state.isMenuOpen,
      selectedNodeType: state.selectedNodeType,
      documentationPosition: state.documentationPosition,
      showDocumentation: state.showDocumentation,
      closeDocumentation: state.closeDocumentation
    })
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const clickedElement = e.target as HTMLElement;
      if (clickedElement.classList.contains("react-flow__pane")) {
        if (isMenuOpen) {
          closeNodeMenu();
        } else {
          openNodeMenu(e.clientX, e.clientY);
        }
      } else {
        closeNodeMenu();
      }
    },
    [closeNodeMenu, isMenuOpen, openNodeMenu]
  );

  // CLOSE NODE MENU
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const clickedElement = e.target as HTMLElement;
      if (clickedElement.classList.contains("react-flow__pane")) {
        if (isMenuOpen) {
          closeNodeMenu();
        }
      }
    },
    [closeNodeMenu, isMenuOpen]
  );

  /* CONTEXT MENUS */
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const openMenuType = useContextMenuStore((state) => state.openMenuType);
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      event.stopPropagation();
      openContextMenu(
        "node-context-menu",
        "",
        event.clientX,
        event.clientY,
        "node-header"
      );
      closeSelect();
    },
    [openContextMenu, closeSelect]
  );

  const handlePaneContextMenu = useCallback(
    (event: any) => {
      event.preventDefault();
      event.stopPropagation();
      requestAnimationFrame(() => {
        openContextMenu(
          "pane-context-menu",
          "",
          event.clientX,
          event.clientY,
          "react-flow__pane"
        );
      });
      closeSelect();
    },
    [openContextMenu, closeSelect]
  );

  const handleSelectionContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      openContextMenu(
        "selection-context-menu",
        "",
        event.clientX,
        event.clientY,
        "react-flow__nodesselection"
      );
      closeSelect();
    },
    [openContextMenu, closeSelect]
  );

  // ON MOVE START | DRAG PANE
  const handleOnMoveStart = useCallback(() => {
    // This also triggers on click, which will mess up the state of isMenuOpen
    closeNodeMenu();
  }, [closeNodeMenu]);

  // ON NODES CHANGE
  const handleNodesChange = useCallback(
    (changes: any) => {
      onNodesChange(changes);
      closeNodeMenu();
    },
    [onNodesChange, closeNodeMenu]
  );

  /* KEY LISTENER */
  // const { spaceKeyPressed } = useKeyPressedStore((state) => ({
  //   spaceKeyPressed: state.isKeyPressed(" ")
  // }));

  // RESUME HISTORY
  const resumeHistoryAndSave = useCallback(() => {
    setExplicitSave(true);
    history.resume();
    setExplicitSave(false);
  }, [history, setExplicitSave]);

  // EDGE HANDLER
  const {
    onEdgeMouseEnter,
    onEdgeMouseLeave,
    onEdgeContextMenu,
    onEdgeUpdateEnd,
    onEdgeUpdateStart
  } = useEdgeHandlers(resumeHistoryAndSave);

  // DRAG HANDLER
  const {
    onSelectionDragStart,
    onSelectionDrag,
    onSelectionDragStop,
    onSelectionStart,
    onSelectionEnd,
    onNodeDragStart,
    onNodeDragStop,
    panOnDrag,
    onNodeDrag,
    onDragOver
  } = useDragHandlers(resumeHistoryAndSave);

  const [editNodeTitle, setEditNodeTitle] = useState<string | undefined>(
    undefined
  );
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const finishNodeTitle = useCallback(() => setEditNodeTitle(undefined), []);

  // DOUBLE CLICK NODE
  const onNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const clickedElement = event.target as HTMLElement;
      if (
        clickedElement.classList.contains("node-title") ||
        clickedElement.classList.contains("title-container")
      ) {
        setEditNodeTitle(node.id);
        setAnchorEl(clickedElement);
        // updateNodeData(node.id, {
        //   properties: node.data.properties ? { ...node.data.properties } : {},
        //   workflow_id: node.data.workflow_id as any,
        //   collapsed: !node.data.collapsed
        // });
      }
    },
    []
  );

  /* VIEWPORT */
  const defaultViewport = useMemo(() => ({ x: 0, y: 0, zoom: 1.5 }), []);

  const fitScreen = useCallback(() => {
    const fitOptions: FitViewOptions = {
      maxZoom: 8,
      minZoom: 0.01,
      padding: 0.6
    };

    if (reactFlowInstance) {
      reactFlowInstance.fitView(fitOptions);
      setShouldFitToScreen(false);
    }
  }, [reactFlowInstance, setShouldFitToScreen]);

  useEffect(() => {
    if (shouldFitToScreen) {
      requestAnimationFrame(() => {
        fitScreen();
      });
    }
  }, [fitScreen, shouldFitToScreen]);

  // INIT
  const handleOnInit = useCallback(() => {
    setTimeout(() => {
      fitScreen();
    }, 10);
  }, [fitScreen]);

  // Use the custom hook to log render triggers
  useRenderLogger("NodeEditor", {
    nodes,
    edges,
    onConnect,
    onNodesChange,
    onEdgesChange,
    onEdgeUpdate,
    updateNodeData,
    handleOnConnect,
    onConnectStart,
    onConnectEnd,
    connecting,
    nodeTypes,
    nodeHistory,
    shouldFitToScreen,
    setShouldFitToScreen,
    settings,
    isMenuOpen,
    openMenuType,
    handleCopy,
    handlePaste,
    handleCut,
    duplicateNodes,
    surroundWithGroup,
    getSelectedNodeIds,
    openNodeMenu,
    closeNodeMenu,
    fitScreen
  });

  return (
    <div className="reactflow-wrapper" ref={reactFlowWrapper}>
      <ReactFlow
        onlyRenderVisibleElements={false}
        ref={ref}
        className={
          isMinZoom ? "zoomed-out" : " " + (connecting ? "is-connecting" : "")
        }
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        zoomOnDoubleClick={false}
        autoPanOnNodeDrag={true}
        autoPanOnConnect={true}
        autoPanSpeed={50}
        fitView
        fitViewOptions={fitViewOptions}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        snapToGrid={true}
        snapGrid={[settings.gridSnap, settings.gridSnap]}
        defaultViewport={defaultViewport}
        panOnDrag={panOnDrag}
        {...(settings.panControls === "RMB" ? { selectionOnDrag: true } : {})}
        elevateEdgesOnSelect={true}
        connectionLineComponent={ConnectionLine}
        connectionRadius={settings.connectionSnap}
        attributionPosition="bottom-left"
        selectNodesOnDrag={settings.selectNodesOnDrag}
        onClick={handleClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeDrag={onNodeDrag}
        onSelectionDragStart={onSelectionDragStart}
        onSelectionDrag={onSelectionDrag}
        onSelectionDragStop={onSelectionDragStop}
        onSelectionStart={onSelectionStart}
        onSelectionContextMenu={handleSelectionContextMenu}
        selectionMode={settings.selectionMode as SelectionMode}
        onEdgesChange={onEdgesChange}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        onEdgeContextMenu={onEdgeContextMenu}
        connectionMode={ConnectionMode.Strict}
        onConnect={triggerOnConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onReconnect={onEdgeUpdate}
        onReconnectStart={onEdgeUpdateStart}
        onReconnectEnd={onEdgeUpdateEnd}
        onNodesChange={handleNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneClick={closeSelect}
        onPaneContextMenu={handlePaneContextMenu}
        onNodeDoubleClick={onNodeDoubleClick}
        onMoveStart={handleOnMoveStart}
        onDoubleClick={handleDoubleClick}
        proOptions={proOptions}
        onInit={handleOnInit}
        // onSelectionChange={onSelectionChange}
        // edgeTypes={edgeTypes}
        // onNodeClick={onNodeClick}
        deleteKeyCode={["Delete", "Backspace"]}
      >
        <Background
          id="1"
          gap={100}
          offset={4}
          size={8}
          color={ThemeNodes.palette.c_editor_grid_color}
          lineWidth={1}
          style={{
            backgroundColor: ThemeNodes.palette.c_editor_bg_color
          }}
          variant={BackgroundVariant.Cross}
        />
        {editNodeTitle && anchorEl && (
          <NodeTitleEditor
            nodeId={editNodeTitle}
            onClose={finishNodeTitle}
            anchorEl={anchorEl}
          />
        )}
        <AxisMarker />
        {openMenuType === "node-context-menu" && <NodeContextMenu />}
        {openMenuType === "pane-context-menu" && <PaneContextMenu />}
        {openMenuType === "property-context-menu" && <PropertyContextMenu />}
        {openMenuType === "selection-context-menu" && <SelectionContextMenu />}
        {openMenuType === "output-context-menu" && <OutputContextMenu />}
        {openMenuType === "input-context-menu" && <InputContextMenu />}
        <HuggingFaceDownloadDialog />
      </ReactFlow>
    </div>
  );
};
export default memo(ReactFlowWrapper, isEqual);
