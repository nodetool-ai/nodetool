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

export type NodeOutputProps = {
  id: string;
  output: OutputSlot;
};

const NodeOutput: React.FC<NodeOutputProps> = ({ id, output }) => {
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

  const classConnectable = useMemo(() => {
    return connectType !== null &&
      isConnectableCached(connectType, output.type) &&
      connectNodeId !== id &&
      connectDirection === "target"
      ? "is-connectable"
      : "not-connectable";
  }, [output.type, connectType, connectNodeId, id, connectDirection]);

  return (
    <HandleTooltip
      type={output.type.type}
      paramName={output.name}
      className={classConnectable}
      handlePosition="right"
    >
      <Handle
        type="source"
        id={output.name}
        position={Position.Right}
        isConnectable={true}
        onContextMenu={(e) => outputContextMenu(e, id, output)}
        className={`${classConnectable} ${Slugify(output.type.type)}`}
      />
    </HandleTooltip>
  );
};

export default memo(NodeOutput, isEqual);
