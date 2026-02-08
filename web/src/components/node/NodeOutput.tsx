import React, { useCallback, memo } from "react";
import { Handle, Position } from "@xyflow/react";
import useConnectionStore from "../../stores/ConnectionStore";
import { Slugify } from "../../utils/TypeHandler";
import { OutputSlot } from "../../stores/ApiTypes";
import useContextMenuStore from "../../stores/ContextMenuStore";
import isEqual from "lodash/isEqual";
import { isConnectableCached } from "../node_menu/typeFilterUtils";
import HandleTooltip from "../HandleTooltip";

export type NodeOutputProps = {
  id: string;
  output: OutputSlot;
  isDynamic?: boolean;
  isStreamingOutput?: boolean;
};

const NodeOutput: React.FC<NodeOutputProps> = ({ id, output, isStreamingOutput }) => {
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);

  const connectionSelector = useCallback(
    (state: ReturnType<typeof useConnectionStore.getState>) => {
      const {
        connectType,
        connectDirection,
        connectNodeId,
        connectHandleId
      } = state;

      // When dragging from an output (source), we want to dim other outputs ("not-connectable")
      // but keep the current one active.
      if (connectDirection === "source") {
        const isDraggingThis = connectNodeId === id && connectHandleId === output.name;
        return {
          isConnectable: true, // Matches original behavior (source handles remain interactable/valid)
          classConnectable: isDraggingThis ? "is-connectable" : "not-connectable"
        };
      }

      // When dragging from an input (target), we check compatibility
      if (connectDirection === "target" && connectType) {
        const isCompatible =
          isConnectableCached(output.type, connectType) && connectNodeId !== id;

        return {
          isConnectable: isCompatible,
          classConnectable: isCompatible ? "is-connectable" : "not-connectable"
        };
      }

      // Default state (not connecting, or fallback if type missing)
      return {
        isConnectable: true,
        classConnectable: "is-connectable"
      };
    },
    [id, output.name, output.type]
  );

  const { isConnectable, classConnectable } = useConnectionStore(
    connectionSelector,
    isEqual
  );

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
    </div>
  );
};

export default memo(NodeOutput, isEqual);
