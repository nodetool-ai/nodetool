/** @jsxImportSource @emotion/react */
import React, { useMemo, useCallback, memo } from "react";
import { Handle, Position } from "@xyflow/react";
import useConnectionStore from "../../stores/ConnectionStore";
import { Slugify } from "../../utils/TypeHandler";
import { OutputSlot, TypeMetadata } from "../../stores/ApiTypes";
import useContextMenuStore from "../../stores/ContextMenuStore";
import isEqual from "lodash/isEqual";
import { isConnectableCached } from "../node_menu/typeFilterUtils";
import HandleTooltip from "../HandleTooltip";
import { css } from "@emotion/react";
import { useNodes } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import { findInputHandle } from "../../utils/handleUtils";

export type NodeOutputProps = {
  id: string;
  output: OutputSlot;
  isDynamic?: boolean;
};

const NodeOutput: React.FC<NodeOutputProps> = ({ id, output, isDynamic }) => {
  const connectType = useConnectionStore((state) => state.connectType);
  const connectDirection = useConnectionStore(
    (state) => state.connectDirection
  );
  const connectNodeId = useConnectionStore((state) => state.connectNodeId);
  const connectHandleId = useConnectionStore((state) => state.connectHandleId);
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const findNode = useNodes((state) => state.findNode);
  const getMetadata = useMetadataStore((state) => state.getMetadata);

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
      setTimeout(() => {
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
    <div
      className="output-handle-container"
      css={css`
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        display: block;
        text-align: right;
      `}
    >
      <HandleTooltip
        typeMetadata={output.type}
        paramName={output.name}
        className={classConnectable}
        handlePosition="right"
      >
        <Handle
          type="source"
          id={output.name}
          position={Position.Right}
          isConnectable={isConnectable}
          onContextMenu={(e) => outputContextMenu(e, id, output)}
          className={`${classConnectable} ${Slugify(output.type.type)}`}
        />
      </HandleTooltip>
    </div>
  );
};

export default memo(NodeOutput, isEqual);
