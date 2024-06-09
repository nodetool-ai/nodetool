/** @jsxImportSource @emotion/react */
import { useMemo } from "react";
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

const styles = css({
  ".MuiTooltip-tooltip": {
    backgroundColor: "#000",
    color: "#fff"
  }
});

const NodeOutput = ({ id, output }: NodeOutputProps) => {
  const connectType = useConnectionStore((state) => state.connectType);
  const connectDirection = useConnectionStore(
    (state) => state.connectDirection
  );
  const connectNodeId = useConnectionStore((state) => state.connectNodeId);
  const { openContextMenu } = useContextMenuStore();
  const outputContextMenu = (event: any, id: string, output: OutputSlot) => {
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
  };

  const classConnectable = useMemo(() => {
    const outputType = output.type;

    return connectType !== null &&
      isConnectable(connectType, outputType) &&
      connectNodeId !== id &&
      connectDirection === "target"
      ? "is-connectable"
      : "not-connectable";
  }, [output.type, connectType, connectNodeId, id, connectDirection]);

  return (
    <Tooltip
      componentsProps={{
        tooltip: {
          sx: {
            backgroundColor: "transparent !important"
          }
        }
      }}
      title={
        <span
          style={{
            backgroundColor: colorForType(output.type.type),
            color: textColorForType(output.type.type),
            borderRadius: ".5em",
            fontSize: ThemeNodetool.fontSizeSmall
          }}
        // className={Slugify(output.type.type)}
        >
          {output.name} :
          {typeToString(output.type)}
        </span>
      }
      enterDelay={TOOLTIP_ENTER_DELAY}
      leaveDelay={TOOLTIP_LEAVE_DELAY}
      enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
      placement="right"
      TransitionComponent={Zoom}
      className={classConnectable + " " + Slugify(output.type.type)}
      css={styles}
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
};

export default NodeOutput;
