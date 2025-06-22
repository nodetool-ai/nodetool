/** @jsxImportSource @emotion/react */
import React, { useMemo, useCallback, memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Tooltip } from "@mui/material";
import Zoom from "@mui/material/Zoom";
import useConnectionStore from "../../stores/ConnectionStore";
import { Slugify, isConnectable, typeToString } from "../../utils/TypeHandler";
import { css } from "@emotion/react";

import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_LEAVE_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { OutputSlot } from "../../stores/ApiTypes";
import { colorForType, textColorForType } from "../../config/data_types";
import useContextMenuStore from "../../stores/ContextMenuStore";
import ThemeNodetool from "../themes/ThemeNodetool";
import { isEqual } from "lodash";
import { isConnectableCached } from "../node_menu/typeFilterUtils";

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

  const tooltipTitle = useMemo(
    () => (
      <div
        css={css`
          background-color: ${colorForType(output.type.type)};
          color: ${textColorForType(output.type.type)};
          border-radius: 0.5em;
          font-size: ${ThemeNodetool.fontSizeBig};
          padding: 0.4em;
        `}
      >
        <div
          css={css`
            font-weight: bold;
            border: 0;
            padding: 0;
            line-height: 1;
            // margin-bottom: 0.2em;
          `}
        >
          {output.name}
        </div>
        <div
          css={css`
            font-size: 0.8em;
            opacity: 0.8;
            border: 0;
            text-align: center;
            padding: 0;
            line-height: 1;
          `}
        >
          {typeToString(output.type)}
        </div>
      </div>
    ),
    [output.name, output.type]
  );

  return (
    <Tooltip
      TransitionComponent={Zoom}
      slotProps={{
        tooltip: {
          className: "tooltip-handle",
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
    >
      <Handle
        type="source"
        id={output.name}
        position={Position.Right}
        isConnectable={true}
        onContextMenu={(e) => outputContextMenu(e, id, output)}
        className={`${classConnectable} ${Slugify(output.type.type)}`}
      />
    </Tooltip>
  );
};

export default memo(NodeOutput, isEqual);
