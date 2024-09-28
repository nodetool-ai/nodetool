/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import ThemeNodetool from "../themes/ThemeNodetool";

import { memo, useCallback, useEffect, useRef } from "react";
import {
  Node,
  NodeProps,
  NodeResizeControl,
  NodeResizer,
  ResizeDragEvent
} from "@xyflow/react";
import SouthEastIcon from "@mui/icons-material/SouthEast";

// components
import { NodeHeader } from "./NodeHeader";

// utils
import { getMousePosition } from "../../utils/MousePosition";

// hooks
import { useMetadata } from "../../serverState/useMetadata";

// store
import { NodeStore, useNodeStore } from "../../stores/NodeStore";
import { NodeData } from "../../stores/NodeData";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";

const styles = (theme: any) =>
  css({
    "&": {
      boxShadow: "none",
      minWidth: "400px",
      minHeight: "250px"
    },
    "&.hovered.space-pressed": {
      border: "2px dashed black !important"
    },
    height: "100%",
    display: "flex",
    borderRadius: "5px",
    border: `1px solid ${theme.palette.c_gray2}`,
    backgroundColor: theme.palette.c_bg_group,
    h6: {
      display: "block",
      position: "absolute",
      marginTop: "10px",
      left: "10px",
      top: "0px",
      color: theme.palette.c_black
    },

    ".node-header": {
      height: "3em",
      backgroundColor: "rgba(0,0,0,0.1)"
    },
    ".info": {
      position: "absolute",
      top: ".5em",
      right: "0",
      left: "0",
      width: "100%",
      textAlign: "center",
      padding: ".5em",
      backgroundColor: "transparent",
      color: theme.palette.c_black,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal
    },
    // resizer
    ".tools .react-flow__resize-control.handle.bottom.right": {
      opacity: 1,
      right: "-8px",
      bottom: "-8px",
      margin: 0,
      borderRadius: "0 0 5px 0",
      width: "1.5em",
      height: "1.5em",
      background: "#222 !important"
    },
    ".node-resizer .react-flow__resize-control.handle": {
      opacity: 0
    },
    ".node-resizer .react-flow__resize-control.line": {
      opacity: 0,
      borderWidth: "1px",
      borderColor: theme.palette.c_gray2,
      transition: "all 0.15s ease-in-out"
    },
    ".node-resizer .react-flow__resize-control.line:hover": {
      opacity: 1
    }
  });

const GroupNode = (props: NodeProps<Node<NodeData>>) => {
  const { data: metadata } = useMetadata();
  const nodeRef = useRef<HTMLDivElement>(null);
  const updateNode = useNodeStore((state: NodeStore) => state.updateNode);
  const { controlKeyPressed, shiftKeyPressed, spaceKeyPressed } =
    useKeyPressedStore((state) => ({
      controlKeyPressed: state.isKeyPressed("Control"),
      shiftKeyPressed: state.isKeyPressed("Shift"),
      spaceKeyPressed: state.isKeyPressed(" ")
    }));
  const updateNodeData = useNodeStore((state) => state.updateNodeData);
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const nodeHovered = useNodeStore((state) =>
    state.hoveredNodes.includes(props.id)
  );

  const handleResize = useCallback(
    (event: ResizeDragEvent) => {
      const newWidth = event.x;
      const newHeight = event.y;
      updateNodeData(props.id, {
        ...props.data,
        size: { width: newWidth, height: newHeight }
      });
    },
    [props.id, props.data, updateNodeData]
  );

  const handleOpenNodeMenu = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      openNodeMenu(getMousePosition().x, getMousePosition().y, false, "", "");
    },
    [openNodeMenu]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      const clickedElement = e.target as HTMLElement;
      if (clickedElement.classList.contains("node-header")) {
        updateNodeData(id, { collapsed: !props.data.collapsed });
      } else {
        handleOpenNodeMenu();
      }
    },
    [props.data.collapsed, updateNodeData, handleOpenNodeMenu]
  );

  useEffect(() => {
    // Selectable group nodes when spacekey is pressed
    // (enables the use of the selection rectangle inside group nodes)
    if (spaceKeyPressed) {
      updateNode(props.id, { selectable: true });
    } else {
      updateNode(props.id, { selectable: false });
    }
  }, [
    controlKeyPressed,
    shiftKeyPressed,
    updateNode,
    props.id,
    spaceKeyPressed
  ]);

  if (!metadata) {
    return <div>Loading...</div>;
  }

  return (
    <div
      css={styles}
      ref={nodeRef}
      className={`group-node ${nodeHovered ? "hovered" : ""} ${
        spaceKeyPressed ? "space-pressed" : ""
      } ${props.data.collapsed ? "collapsed" : ""}`}
      onDoubleClick={(e) => {
        handleDoubleClick(e, props.id);
      }}
      style={
        nodeHovered
          ? { border: `2px solid ${ThemeNodetool.palette.c_hl1}` }
          : {}
      }
    >
      <NodeHeader id={props.id} nodeTitle={"Group"} />
      {/* {nodeHovered && (
        <div className="info">
          Hold SPACE key to move nodes out of the group
        </div>
      )} */}
      <div className="tools">
        <NodeResizeControl
          style={{ background: "transparent", border: "none" }}
          minWidth={400}
          minHeight={250}
          onResize={handleResize}
        >
          <SouthEastIcon />
        </NodeResizeControl>
      </div>
      <div className="node-resizer">
        <NodeResizer minWidth={400} minHeight={250} />
      </div>
    </div>
  );
};

export default memo(GroupNode);
