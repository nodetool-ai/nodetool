/** @jsxImportSource @emotion/react */
import React, { useMemo, useCallback, memo } from "react";
import { Handle, Position } from "@xyflow/react";
import useConnectionStore from "../../stores/ConnectionStore";
import { Slugify } from "../../utils/TypeHandler";
import { OutputSlot } from "../../stores/ApiTypes";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { isEqual } from "lodash";
import { isConnectableCached } from "../node_menu/typeFilterUtils";
import HandleTooltip from "../HandleTooltip";
import { css } from "@emotion/react";

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
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);

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
    // Output handles should always be draggable to start connections
    if (!connectType || connectDirection !== "target") {
      return true;
    }
    
    // When something is being dragged TO this output (which shouldn't happen for source handles)
    // or when checking compatibility for dynamic outputs
    if (isDynamic) {
      return true;
    }
    
    return isConnectableCached(connectType, output.type) && connectNodeId !== id;
  }, [
    output.type,
    connectType,
    connectNodeId,
    id,
    connectDirection,
    isDynamic
  ]);

  const classConnectable = useMemo(() => {
    if (!connectType || connectDirection !== "target") {
      return "is-connectable";
    }
    
    if (isDynamic) {
      return "is-connectable";
    }
    
    return isConnectableCached(connectType, output.type) && connectNodeId !== id
      ? "is-connectable"
      : "not-connectable";
  }, [
    output.type,
    connectType,
    connectNodeId,
    id,
    connectDirection,
    isDynamic
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
