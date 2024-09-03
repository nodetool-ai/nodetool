/** @jsxImportSource @emotion/react */
import React, { useMemo, useCallback } from "react";
import { Handle, Position } from "reactflow";
import { Tooltip } from "@mui/material";
import Zoom from "@mui/material/Zoom";
import useConnectionStore from "../../stores/ConnectionStore";
import { Slugify, isConnectable, typeToString } from "../../utils/TypeHandler";
import { css } from "@emotion/react";

import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_LEAVE_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "./BaseNode";
import { OutputSlot } from "../../stores/ApiTypes";
import { colorForType, textColorForType } from "../../config/data_types";
import useContextMenuStore from "../../stores/ContextMenuStore";
import ThemeNodetool from "../themes/ThemeNodetool";

export type NodeOutputProps = {
  id: string;
  output: OutputSlot;
};

const tooltipStyles = css({
  ".MuiTooltip-tooltip": {
    backgroundColor: "#000",
    color: "#fff"
  }
});

const NodeOutput = React.memo(({ id, output }: NodeOutputProps) => {
  const connectType = useConnectionStore((state) => state.connectType);
  const connectDirection = useConnectionStore((state) => state.connectDirection);
  const connectNodeId = useConnectionStore((state) => state.connectNodeId);
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);

  const outputContextMenu = useCallback((event: React.MouseEvent, id: string, output: OutputSlot) => {
    event.preventDefault();
    setTimeout(() => {
      openContextMenu(
        "output-context-menu",
        id,
        event.clientX + 25,
        event.clientY - 50,
        "react-flow__pane",
        output.type.type,
        output.name
      );
    }, 0);
  }, [openContextMenu]);

  const classConnectable = useMemo(() => {
    return connectType !== null &&
      isConnectable(connectType, output.type) &&
      connectNodeId !== id &&
      connectDirection === "target"
      ? "is-connectable"
      : "not-connectable";
  }, [output.type, connectType, connectNodeId, id, connectDirection]);

  const tooltipTitle = useMemo(() => (
    <span
      style={{
        backgroundColor: colorForType(output.type.type),
        color: textColorForType(output.type.type),
        borderRadius: ".5em",
        fontSize: ThemeNodetool.fontSizeSmall
      }}
    >
      {output.name} :{typeToString(output.type)}
    </span>
  ), [output.name, output.type]);

  return (
    <Tooltip
      componentsProps={{
        tooltip: {
          sx: {
            backgroundColor: "transparent !important"
          }
        }
      }}
      title={tooltipTitle}
      enterDelay={TOOLTIP_ENTER_DELAY}
      leaveDelay={TOOLTIP_LEAVE_DELAY}
      enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
      placement="right"
      TransitionComponent={Zoom}
      className={`${classConnectable} ${Slugify(output.type.type)}`}
      css={tooltipStyles}
    >
      <Handle
        type="source"
        id={output.name}
        position={Position.Right}
        isConnectable={true}
        onContextMenu={(e) => outputContextMenu(e, id, output)}
      />
    </Tooltip>
  );
});

NodeOutput.displayName = "NodeOutput";

export default NodeOutput;
