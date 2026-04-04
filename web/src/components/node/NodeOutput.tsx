import React, { useMemo, useCallback, memo, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import useConnectionStore from "../../stores/ConnectionStore";
import { Slugify } from "../../utils/TypeHandler";
import { OutputSlot, TypeMetadata } from "../../stores/ApiTypes";
import useContextMenuStore from "../../stores/ContextMenuStore";
import isEqual from "lodash/isEqual";
import { isConnectableCached } from "../node_menu/typeFilterUtils";
import HandleTooltip from "../HandleTooltip";
import { useNodes } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import { findInputHandle } from "../../utils/handleUtils";
import useConnectableNodes from "../../stores/ConnectableNodesStore";
import AddIcon from "@mui/icons-material/Add";

export type NodeOutputProps = {
  id: string;
  output: OutputSlot;
  isDynamic?: boolean;
  isStreamingOutput?: boolean;
};

const NodeOutput: React.FC<NodeOutputProps> = ({ id, output, isStreamingOutput }) => {
  const connectType = useConnectionStore((state) => state.connectType);
  const connectDirection = useConnectionStore(
    (state) => state.connectDirection
  );
  const connectNodeId = useConnectionStore((state) => state.connectNodeId);
  const connectHandleId = useConnectionStore((state) => state.connectHandleId);
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const findNode = useNodes((state) => state.findNode);
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  // Track timeout to cleanup on unmount
  const contextMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveConnectType = useMemo<TypeMetadata | null>(() => {
    if (
      connectDirection !== "target" ||
      !connectNodeId ||
      !connectHandleId ||
      connectType
    ) {
      return connectType;
    }
    const targetNode = findNode(connectNodeId);
    if (!targetNode) {
      return null;
    }
    const metadata = getMetadata(targetNode.type || "");
    if (!metadata) {
      return null;
    }
    const handle = findInputHandle(targetNode, connectHandleId, metadata);
    return handle?.type ?? null;
  }, [
    connectDirection,
    connectHandleId,
    connectNodeId,
    connectType,
    findNode,
    getMetadata
  ]);

  const outputContextMenu = useCallback(
    (event: React.MouseEvent, id: string, output: OutputSlot) => {
      event.preventDefault();
      // Clear any pending timeout before scheduling a new one
      if (contextMenuTimeoutRef.current) {
        clearTimeout(contextMenuTimeoutRef.current);
      }
      contextMenuTimeoutRef.current = setTimeout(() => {
        openContextMenu(
          "output-context-menu",
          id,
          event.clientX + 25,
          event.clientY - 50,
          "react-flow__pane",
          output.type,
          output.name
        );
      }, 0);
    },
    [openContextMenu]
  );

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (contextMenuTimeoutRef.current) {
        clearTimeout(contextMenuTimeoutRef.current);
      }
    };
  }, []);

  const {
    setNodeId: setConnNodeId,
    setSourceHandle: setConnSourceHandle,
    setTargetHandle: setConnTargetHandle,
    setFilterType: setConnFilterType,
    setTypeMetadata: setConnTypeMetadata,
    showMenu: showConnMenu
  } = useConnectableNodes();

  const handleAddClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      setConnNodeId(id);
      setConnSourceHandle(output.name);
      setConnTargetHandle(null);
      setConnFilterType("input");
      setConnTypeMetadata(output.type);
      showConnMenu({
        x: event.clientX,
        y: event.clientY
      });
    },
    [id, output.name, output.type, setConnNodeId, setConnSourceHandle, setConnTargetHandle, setConnFilterType, setConnTypeMetadata, showConnMenu]
  );

  const isConnectable = useMemo(() => {
    if (!effectiveConnectType || connectDirection !== "target") {
      return true;
    }
    return (
      isConnectableCached(output.type, effectiveConnectType) &&
      connectNodeId !== id
    );
  }, [connectDirection, connectNodeId, effectiveConnectType, id, output.type]);

  const classConnectable = useMemo(() => {
    // Control edges can connect from any Agent node
    if (effectiveConnectType?.type === "control") {
      return "is-connectable";
    }
    if (connectDirection === "source") {
      if (connectNodeId === id && connectHandleId === output.name) {
        return "is-connectable";
      }
      return "not-connectable";
    }
    if (!effectiveConnectType || connectDirection !== "target") {
      return "is-connectable";
    }
    return isConnectableCached(output.type, effectiveConnectType) &&
      connectNodeId !== id
      ? "is-connectable"
      : "not-connectable";
  }, [
    connectDirection,
    connectHandleId,
    connectNodeId,
    effectiveConnectType,
    id,
    output.type,
    output.name
  ]);

  return (
    <div className="output-handle-container">
      <HandleTooltip
        typeMetadata={output.type}
        paramName={output.name}
        className={classConnectable}
        handlePosition="right"
        isStreamingOutput={isStreamingOutput}
      >
        <Handle
          type="source"
          id={output.name}
          position={Position.Right}
          isConnectable={isConnectable}
          onContextMenu={(e) => outputContextMenu(e, id, output)}
          className={`${classConnectable} ${Slugify(output.type.type)}${isStreamingOutput ? " streaming-handle" : ""}`}
        />
      </HandleTooltip>
      <div
        className="output-add-button"
        onClick={handleAddClick}
        title="Add connected node"
      >
        <AddIcon sx={{ fontSize: 16 }} />
      </div>
    </div>
  );
};

export default memo(NodeOutput, isEqual);
